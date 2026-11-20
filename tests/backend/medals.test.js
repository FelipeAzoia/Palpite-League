import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultMedalsIntervalMs } from '../../src/backend/app.js'
import { createSimulatedSportsProvider, SportsProviderError } from '../../src/backend/adapters/simulated-sports-provider.js'
import { roundWinners } from '../../src/backend/modules/predictions-scoring/index.js'
import { createScheduler } from '../../src/backend/shared/scheduler.js'
import { expectCommonFormat, withHttpApp } from './support/app-harness.js'

test('regra: todos os empatados na maior pontuação positiva; nenhuma medalha sem pontos', () => {
  assert.deepEqual(roundWinners([{ participationId: 'a', points: 5 }, { participationId: 'b', points: 2 }]), ['a'])
  assert.deepEqual(roundWinners([{ participationId: 'a', points: 7 }, { participationId: 'b', points: 7 }, { participationId: 'c', points: 2 }]), ['a', 'b'])
  assert.deepEqual(roundWinners([{ participationId: 'a', points: 0 }, { participationId: 'b', points: 0 }]), [])
  assert.deepEqual(roundWinners([]), [])
})

// Fluxo completo: palpite (SPEC-012) → resultado (SPEC-013) → pontuação (SPEC-014) → medalhas.
function withMedals(callback) {
  const provider = createSimulatedSportsProvider()
  return withHttpApp(async (context) => {
    const reported = new Map()
    const providerId = (matchId) => context.database.prepare('SELECT provider_id FROM sports_matches WHERE id = ?').get(matchId).provider_id

    async function predict(user, poolId, matchId, body) {
      const response = await context.call('PUT', `/pools/${poolId}/matches/${matchId}/prediction`, { token: user.token, body })
      assert.equal(response.status, 200, response.text)
    }

    async function finish(entries, { score = true } = {}) {
      for (const [matchId, status, home = null, away = null] of entries) {
        const match = context.database.prepare('SELECT status, starts_at FROM sports_matches WHERE id = ?').get(matchId)
        if (match.status === 'scheduled' && Date.parse(match.starts_at) > context.clock.current) context.startMatch(matchId, { status: 'scheduled' })
        reported.set(matchId, { id: providerId(matchId), status, homeScore: home, awayScore: away })
      }
      provider.setResults({ matches: [...reported.values()] })
      assert.equal((await context.app.locals.tasks.syncResults()).ok, true)
      if (score) context.app.locals.tasks.scorePredictions()
    }

    async function get(route, user) {
      const response = await context.call('GET', route, { token: user.token })
      assert.equal(response.status, 200, response.text)
      return response.json
    }

    const reconcile = () => context.app.locals.tasks.reconcileMedals()
    const stored = (poolId) => context.database.prepare(`
      SELECT u.name, medal.round_number AS round, medal.awarded_at
      FROM pool_medals medal JOIN pool_participations part ON part.id = medal.participation_id JOIN users u ON u.id = part.user_id
      WHERE medal.pool_id = ? ORDER BY medal.round_number, u.name
    `).all(poolId)
    const names = (poolId) => stored(poolId).map(({ name, round }) => [round, name])

    await callback({ ...context, provider, predict, finish, get, reconcile, stored, names })
  }, { sportsProvider: provider })
}

const result = (outcome) => ({ type: 'result', outcome })
const exact = (homeGoals, awayGoals) => ({ type: 'exact_score', homeGoals, awayGoals })
const changes = ({ awarded, revoked, failedRounds }) => (assert.deepEqual(failedRounds, []), { awarded, revoked })

// Bolão com 2 partidas da rodada 2 e 1 da rodada 3; Ana e Bruno confirmados.
async function setup(context, { adminName = 'Admin', round2Slice = [0, 2] } = {}) {
  const admin = await context.signUp(adminName)
  const round2 = (await context.call('GET', '/catalog/rounds/2/matches?status=scheduled', { token: admin.token })).json.matches.slice(...round2Slice)
  const round3 = (await context.call('GET', '/catalog/rounds/3/matches?status=scheduled', { token: admin.token })).json.matches.slice(0, 1)
  const pool = await context.createPool(admin, { selection: { matchIds: [...round2, ...round3].map(({ id }) => id) } })
  return { admin, poolId: pool.poolId, round2, round3 }
}

async function players(context, pool, names = ['Ana', 'Bruno']) {
  const users = []
  for (const name of names) {
    const user = await context.signUp(name)
    await context.joinPool(pool.admin, user, pool.poolId)
    users.push(user)
  }
  return users
}

test('TC-01 e TC-05: o líder de uma rodada encerrada e pontuada recebe a medalha; rodada parcial conta só as partidas do bolão', async () => {
  await withMedals(async (context) => {
    const pool = await setup(context)
    const [ana, bruno] = await players(context, pool)
    const [m1, m2] = pool.round2
    await context.predict(ana, pool.poolId, m1.id, exact(1, 0))
    await context.predict(bruno, pool.poolId, m1.id, result('home'))
    await context.finish([[m1.id, 'finished', 1, 0], [m2.id, 'finished', 0, 0], [pool.round3[0].id, 'in_progress']])
    // As outras partidas da rodada 2 continuam agendadas: o bolão só selecionou duas.
    assert.ok(context.database.prepare("SELECT COUNT(*) AS count FROM sports_matches m JOIN sports_rounds r ON r.id = m.round_id WHERE r.number = 2 AND m.status = 'scheduled'").get().count > 0)

    const summary = context.reconcile()
    assert.deepEqual(summary, { processedRounds: 1, awarded: 1, revoked: 0, failedRounds: [] })
    assert.deepEqual(context.names(pool.poolId), [[2, 'Ana']])

    const body = await context.get(`/pools/${pool.poolId}/medals`, bruno)
    assert.deepEqual(body.rounds.map(({ number, winners }) => [number, winners.map(({ name, points }) => [name, points])]), [[2, [['Ana', 5]]]])
    assert.equal(body.rounds[0].winners[0].awardedAt, new Date(context.clock.current).toISOString())
    assert.deepEqual(body.participants.map(({ name, count, medalRounds }) => [name, count, medalRounds]), [['Ana', 1, [2]]])
    const ranking = await context.get(`/pools/${pool.poolId}/ranking`, bruno)
    assert.deepEqual(ranking.participants.map(({ name, medals }) => [name, medals]), [['Ana', 1], ['Bruno', 0], ['Admin', 0]])
  })
})

test('TC-02: empatados na maior pontuação recebem a medalha', async () => {
  await withMedals(async (context) => {
    const pool = await setup(context)
    const [ana, bruno, carla] = await players(context, pool, ['Ana', 'Bruno', 'Carla'])
    const [m1, m2] = pool.round2
    await context.predict(ana, pool.poolId, m1.id, exact(2, 1))
    await context.predict(bruno, pool.poolId, m1.id, exact(2, 1))
    await context.predict(carla, pool.poolId, m1.id, result('home'))
    await context.finish([[m1.id, 'finished', 2, 1], [m2.id, 'cancelled'], [pool.round3[0].id, 'in_progress']])

    context.reconcile()
    assert.deepEqual(context.names(pool.poolId), [[2, 'Ana'], [2, 'Bruno']])
  })
})

test('TC-03: rodada com partida pendente ou com resultado ainda não pontuado não recebe medalha', async () => {
  await withMedals(async (context) => {
    const pool = await setup(context)
    const [ana] = await players(context, pool)
    const [m1, m2] = pool.round2
    await context.predict(ana, pool.poolId, m1.id, exact(1, 0))
    await context.finish([[m1.id, 'finished', 1, 0], [m2.id, 'in_progress']])
    assert.equal(context.reconcile().processedRounds, 0)

    await context.finish([[m2.id, 'finished', 0, 0], [pool.round3[0].id, 'in_progress']], { score: false })
    assert.equal(context.reconcile().processedRounds, 0, 'resultado encerrado ainda não pontuado')
    assert.deepEqual(context.names(pool.poolId), [])

    context.app.locals.tasks.scorePredictions()
    context.reconcile()
    assert.deepEqual(context.names(pool.poolId), [[2, 'Ana']])
  })
})

test('TC-04: rodada sem palpites e rodada com todos em 0 ponto não concedem medalha', async () => {
  await withMedals(async (context) => {
    const pool = await setup(context)
    const [ana, bruno] = await players(context, pool)
    const [m1, m2] = pool.round2
    await context.predict(ana, pool.poolId, m1.id, result('away'))
    await context.predict(bruno, pool.poolId, m1.id, exact(3, 3))
    await context.finish([[m1.id, 'finished', 1, 0], [m2.id, 'finished', 1, 1], [pool.round3[0].id, 'finished', 2, 2]])

    assert.deepEqual(context.reconcile(), { processedRounds: 2, awarded: 0, revoked: 0, failedRounds: [] })
    assert.deepEqual(context.names(pool.poolId), [])
    const body = await context.get(`/pools/${pool.poolId}/medals`, ana)
    assert.deepEqual(body.rounds, [{ number: 2, winners: [] }, { number: 3, winners: [] }])
  })
})

test('TC-06: correção que muda o líder concede e retira medalhas, preserva a data de quem continua e não afeta a competição', async () => {
  await withMedals(async (context) => {
    const pool = await setup(context)
    const [ana, bruno, carla] = await players(context, pool, ['Ana', 'Bruno', 'Carla'])
    // Outro bolão ativo com partida em andamento mantém o provedor consultado (SPEC-013, INV-007),
    // para que as correções cheguem depois que todas as partidas deste bolão terminaram.
    const other = await setup(context, { adminName: 'Outro', round2Slice: [2, 3] })
    const [m1, m2] = pool.round2
    await context.predict(ana, pool.poolId, m1.id, exact(1, 0))
    await context.predict(bruno, pool.poolId, m1.id, result('home'))
    await context.predict(carla, pool.poolId, m2.id, exact(0, 0))
    await context.predict(ana, pool.poolId, pool.round3[0].id, result('draw'))
    await context.finish([
      [m1.id, 'finished', 1, 0], [m2.id, 'finished', 0, 0], [pool.round3[0].id, 'finished', 1, 1],
      [other.round2[0].id, 'in_progress'],
    ])

    const rankingOf = async () => (await context.get(`/pools/${pool.poolId}/ranking`, ana)).participants
      .map(({ name, position, totalPoints, tiebreakValue, roundPoints }) => ({ name, position, totalPoints, tiebreakValue, roundPoints }))
    const before = await rankingOf()
    context.reconcile()
    assert.deepEqual(await rankingOf(), before, 'medalhas não alteram a classificação')
    assert.deepEqual(context.names(pool.poolId), [[2, 'Ana'], [2, 'Carla'], [3, 'Ana']])
    const carlaDate = context.stored(pool.poolId).find(({ name }) => name === 'Carla').awarded_at

    // Sem mudança de pontos, nada muda e as datas são preservadas.
    context.clock.current += 60_000
    assert.deepEqual(changes(context.reconcile()), { awarded: 0, revoked: 0 })

    // Correção do 1 a 0 para 2 a 0: Ana perde o exato (5 → 0) e Bruno mantém o resultado (2).
    // Rodada 2: Carla 5, Bruno 2, Ana 0 → só Carla mantém a medalha.
    await context.finish([[m1.id, 'finished', 2, 0]])
    assert.deepEqual(changes(context.reconcile()), { awarded: 0, revoked: 1 })
    assert.deepEqual(context.names(pool.poolId), [[2, 'Carla'], [3, 'Ana']])
    assert.equal(context.stored(pool.poolId).find(({ name }) => name === 'Carla').awarded_at, carlaDate)

    // Correção do 0 a 0 da Carla para 0 a 1: rodada 2 passa a ser do Bruno (2).
    await context.finish([[m2.id, 'finished', 0, 1]])
    assert.deepEqual(changes(context.reconcile()), { awarded: 1, revoked: 1 })
    assert.deepEqual(context.names(pool.poolId), [[2, 'Bruno'], [3, 'Ana']])
  })
})

test('TC-07: depois do encerramento do bolão as medalhas não são recalculadas', async () => {
  await withMedals(async (context) => {
    const pool = await setup(context)
    const [ana, bruno] = await players(context, pool)
    // Outro bolão ativo mantém a partida da rodada 3 acompanhada, para a correção chegar.
    const other = await setup(context, { adminName: 'Outro', round2Slice: [2, 3] })
    const [m1, m2] = pool.round2
    await context.predict(ana, pool.poolId, m1.id, exact(1, 0))
    await context.predict(bruno, pool.poolId, m1.id, result('away'))
    await context.finish([[m1.id, 'finished', 1, 0], [m2.id, 'finished', 0, 0], [other.round3[0].id, 'in_progress']])
    context.reconcile()
    context.database.prepare("UPDATE pools SET status = 'ended' WHERE id = ?").run(pool.poolId)

    await context.finish([[m1.id, 'finished', 0, 1]])
    context.reconcile()
    assert.deepEqual(context.names(pool.poolId), [[2, 'Ana']])
  })
})

test('TC-08: só confirmados concorrem (inclusive o administrador); medalha de quem saiu fica gravada e oculta; bolões isolados', async () => {
  await withMedals(async (context) => {
    const pool = await setup(context)
    const [ana, bruno] = await players(context, pool)
    const [m1, m2] = pool.round2
    for (const [name, status] of [['Diego', 'requested'], ['Elisa', 'rejected'], ['Fábio', 'approved_awaiting_payment']]) {
      const id = await context.requestEntry(pool.admin, await context.signUp(name), pool.poolId)
      context.database.prepare('UPDATE pool_participations SET status = ? WHERE id = ?').run(status, id)
    }
    // Outro bolão com partidas diferentes da mesma rodada oficial.
    const other = await setup(context, { adminName: 'Outro', round2Slice: [2, 4] })
    await context.joinPool(other.admin, ana, other.poolId)

    await context.predict(bruno, pool.poolId, m1.id, exact(1, 0))
    await context.predict(pool.admin, pool.poolId, m2.id, exact(2, 2))
    await context.predict(ana, other.poolId, other.round2[0].id, exact(3, 0))
    await context.finish([
      [m1.id, 'finished', 1, 0], [m2.id, 'finished', 2, 2], [pool.round3[0].id, 'in_progress'],
      [other.round2[0].id, 'finished', 3, 0], [other.round2[1].id, 'finished', 0, 0],
    ])
    context.reconcile()
    assert.deepEqual(context.names(pool.poolId), [[2, 'Admin'], [2, 'Bruno']])
    assert.deepEqual(context.names(other.poolId), [[2, 'Ana']])

    // Bruno sai: a medalha fica gravada, não é exibida e não é retirada pela reconciliação.
    const brunoId = context.database.prepare('SELECT id FROM pool_participations WHERE user_id = ? AND pool_id = ?').get(bruno.id, pool.poolId).id
    context.database.prepare("UPDATE pool_participations SET status = 'left' WHERE id = ?").run(brunoId)
    context.reconcile()
    assert.deepEqual(context.names(pool.poolId), [[2, 'Admin'], [2, 'Bruno']])
    const body = await context.get(`/pools/${pool.poolId}/medals`, ana)
    assert.deepEqual(body.rounds[0].winners.map(({ name }) => name), ['Admin'])
    assert.deepEqual(body.participants.map(({ name }) => name), ['Admin'])
  })
})

test('TC-08 (continuação): quem saiu antes do cálculo não recebe medalha e o melhor confirmado recebe', async () => {
  await withMedals(async (context) => {
    const pool = await setup(context)
    const [ana, bruno] = await players(context, pool)
    const [m1, m2] = pool.round2
    await context.predict(bruno, pool.poolId, m1.id, exact(1, 0))
    await context.predict(ana, pool.poolId, m1.id, result('home'))
    await context.finish([[m1.id, 'in_progress']])
    context.database.prepare("UPDATE pool_participations SET status = 'left' WHERE user_id = ? AND pool_id = ?").run(bruno.id, pool.poolId)
    await context.finish([[m1.id, 'finished', 1, 0], [m2.id, 'finished', 0, 0], [pool.round3[0].id, 'in_progress']])

    context.reconcile()
    assert.deepEqual(context.names(pool.poolId), [[2, 'Ana']])
  })
})

test('TC-09: falha na reconciliação de uma rodada mantém as medalhas dela e as outras rodadas seguem', async () => {
  await withMedals(async (context) => {
    const pool = await setup(context)
    const [ana] = await players(context, pool)
    const [m1, m2] = pool.round2
    await context.predict(ana, pool.poolId, m1.id, exact(1, 0))
    await context.predict(ana, pool.poolId, pool.round3[0].id, exact(0, 0))
    await context.finish([[m1.id, 'finished', 1, 0], [m2.id, 'finished', 0, 0], [pool.round3[0].id, 'finished', 0, 0]])
    context.database.exec(`
      CREATE TRIGGER fail_round_two BEFORE INSERT ON pool_medals
      WHEN NEW.round_number = 2
      BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;
    `)

    assert.deepEqual(context.reconcile(), { processedRounds: 1, awarded: 1, revoked: 0, failedRounds: [{ poolId: pool.poolId, roundNumber: 2 }] })
    assert.deepEqual(context.names(pool.poolId), [[3, 'Ana']])
    assert.ok(context.events.some((event) => event.component === 'medals' && event.result === 'round_failed'))

    context.database.exec('DROP TRIGGER fail_round_two')
    context.reconcile()
    assert.deepEqual(context.names(pool.poolId), [[2, 'Ana'], [3, 'Ana']])
  })
})

test('TC-10 e TC-11: execuções repetidas e simultâneas mantêm uma medalha por rodada; roda ao iniciar e a cada minuto, sem provedor', async () => {
  await withMedals(async (context) => {
    const pool = await setup(context)
    const [ana] = await players(context, pool)
    const [m1, m2] = pool.round2
    await context.predict(ana, pool.poolId, m1.id, exact(1, 0))
    await context.finish([[m1.id, 'finished', 1, 0], [m2.id, 'in_progress'], [pool.round3[0].id, 'in_progress']])
    context.provider.setResultsFailure(new SportsProviderError('timeout'))

    const timers = []
    const scheduler = createScheduler({ setTimer: (callback, delay) => { timers.push({ callback, delay }); return timers.length }, clearTimer() {} })
    scheduler.register('medals', defaultMedalsIntervalMs, context.app.locals.tasks.reconcileMedals)
    await scheduler.start()
    assert.deepEqual(context.names(pool.poolId), [], 'rodada ainda aberta')
    assert.equal(timers.at(-1).delay, 60 * 1000)

    // A rodada fica pronta; a medalha sai na execução seguinte, em até 1 minuto.
    context.provider.setResultsFailure(null)
    await context.finish([[m2.id, 'finished', 0, 0]])
    context.provider.setResultsFailure(new SportsProviderError('timeout'))
    await Promise.all([timers.at(-1).callback(), scheduler.runNow('medals'), context.reconcile()])
    context.reconcile()

    const medals = context.stored(pool.poolId)
    assert.deepEqual(medals.map(({ name, round }) => [round, name]), [[2, 'Ana']])
    assert.equal(new Date(medals[0].awarded_at).toISOString(), medals[0].awarded_at)
    scheduler.stop()
  })
})

test('TC-12 e TC-13: acesso às medalhas restrito, sem e-mail, e erros no formato comum', async () => {
  await withMedals(async (context) => {
    const pool = await setup(context)
    const [ana] = await players(context, pool)
    await context.predict(ana, pool.poolId, pool.round2[0].id, exact(1, 0))
    await context.finish([[pool.round2[0].id, 'finished', 1, 0], [pool.round2[1].id, 'finished', 0, 0], [pool.round3[0].id, 'in_progress']])
    context.reconcile()
    const awaiting = await context.signUp('Fábio')
    const awaitingId = await context.requestEntry(pool.admin, awaiting, pool.poolId)
    context.database.prepare("UPDATE pool_participations SET status = 'approved_awaiting_payment' WHERE id = ?").run(awaitingId)
    const leaver = await context.signUp('Gabi')
    const leaverId = await context.joinPool(pool.admin, leaver, pool.poolId)
    context.database.prepare("UPDATE pool_participations SET status = 'left' WHERE id = ?").run(leaverId)
    const route = `/pools/${pool.poolId}/medals`

    const response = await context.call('GET', route, { token: ana.token })
    assert.equal(response.status, 200)
    assert.equal(/@example\.com|email/.test(response.text), false)
    expectCommonFormat(await context.call('GET', route, { token: awaiting.token }), 409, 'participation_not_confirmed')
    expectCommonFormat(await context.call('GET', route, { token: leaver.token }), 404, 'not_found')
    expectCommonFormat(await context.call('GET', route, { token: (await context.signUp()).token }), 404, 'not_found')
    expectCommonFormat(await context.call('GET', '/pools/inexistente/medals', { token: ana.token }), 404, 'not_found')
    expectCommonFormat(await context.call('GET', route), 401, 'session_rejected')
  })
})
