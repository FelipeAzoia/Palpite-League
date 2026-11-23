import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { defaultPoolClosingIntervalMs } from '../../src/backend/app.js'
import { createSimulatedPaymentsProvider } from '../../src/backend/adapters/simulated-payments-provider.js'
import { createSimulatedSportsProvider } from '../../src/backend/adapters/simulated-sports-provider.js'
import { closingActions, periodEndMs } from '../../src/backend/modules/pools-participations/index.js'
import { expectCommonFormat, withHttpApp } from './support/app-harness.js'

// SPEC-025 — encerramento automático e determinação do vencedor. Provedores simulados e relógio
// controlado, sem rede externa e sem credenciais (CA-19, RNF18).

function withClosing(callback) {
  const sports = createSimulatedSportsProvider()
  const payments = createSimulatedPaymentsProvider()
  return withHttpApp((context) => callback({ ...context, sports, payments }), { sportsProvider: sports, paymentsProvider: payments })
}

const endsOn = '2026-12-31'
const periodEnd = periodEndMs(endsOn)

function providerId(context, matchId) {
  return context.database.prepare('SELECT provider_id FROM sports_matches WHERE id = ?').get(matchId).provider_id
}

// Publica resultados oficiais pelo provedor e pontua, como as tarefas das SPEC-013 e 014.
async function publish(context, results, { score = true } = {}) {
  for (const [matchId] of results) context.startMatch(matchId, { status: 'scheduled' })
  context.sports.setResults({
    matches: results.map(([matchId, status, home = null, away = null]) => ({
      id: providerId(context, matchId), status, homeScore: home, awayScore: away,
    })),
  })
  await context.app.locals.tasks.syncResults()
  if (score) await context.app.locals.tasks.scorePredictions()
}

async function predict(context, user, poolId, matchId, homeGoals, awayGoals) {
  const response = await context.call('PUT', `/pools/${poolId}/matches/${matchId}/prediction`, {
    token: user.token, body: { type: 'exact_score', homeGoals, awayGoals },
  })
  assert.equal(response.status, 200, response.text)
}

const close = (context) => context.app.locals.tasks.closePools()
const finalResult = (context, user, poolId) => context.call('GET', `/pools/${poolId}/final-result`, { token: user.token })
const pool = (context, poolId) => context.database.prepare('SELECT status, ended_at FROM pools WHERE id = ?').get(poolId)

// Bolão sem taxa com duas partidas: Ana administra, Bruno e Caio participam.
async function setup(context, overrides = {}) {
  const admin = await context.signUp('Ana')
  const bruno = await context.signUp('Bruno')
  const caio = await context.signUp('Caio')
  const created = await context.createPool(admin, { matchCount: 2, endsOn, ...overrides })
  await context.joinPool(admin, bruno, created.poolId)
  await context.joinPool(admin, caio, created.poolId)
  const [first, second] = created.matches
  return { admin, bruno, caio, poolId: created.poolId, first, second }
}

// Bruno acerta os dois placares (10), Caio acerta um resultado (2), Ana não palpita (0).
async function playAndFinish(context, setupResult) {
  const { bruno, caio, poolId, first, second } = setupResult
  await predict(context, bruno, poolId, first.id, 2, 1)
  await predict(context, bruno, poolId, second.id, 0, 0)
  const result = await context.call('PUT', `/pools/${poolId}/matches/${first.id}/prediction`, {
    token: caio.token, body: { type: 'result', outcome: 'home' },
  })
  assert.equal(result.status, 200, result.text)
  await predict(context, caio, poolId, second.id, 3, 1)
  await publish(context, [[first.id, 'finished', 2, 1], [second.id, 'finished', 0, 0]])
}

test('CT-01 e CT-06: encerra no instante exato do fim do período e registra o vencedor único', async () => {
  await withClosing(async (context) => {
    const users = await setup(context)
    await playAndFinish(context, users)

    context.clock.current = periodEnd - 1
    assert.equal((await close(context)).closed, 0)
    assert.equal(pool(context, users.poolId).status, 'active')

    context.clock.current = periodEnd
    assert.deepEqual(await close(context), { checked: 1, closed: 1, waiting: 0, failed: 0 })
    const ended = pool(context, users.poolId)
    assert.equal(ended.status, 'ended')
    assert.equal(ended.ended_at, '2027-01-01T00:00:00.000Z')

    const response = await finalResult(context, users.caio, users.poolId)
    assert.equal(response.status, 200, response.text)
    assert.equal(response.json.endedAt, '2027-01-01T00:00:00.000Z')
    assert.equal(response.json.hasWinner, true)
    assert.deepEqual(response.json.standings.map(({ name, position, totalPoints, winner }) => ({ name, position, totalPoints, winner })), [
      { name: 'Bruno', position: 1, totalPoints: 10, winner: true },
      { name: 'Caio', position: 2, totalPoints: 2, winner: false },
      { name: 'Ana', position: 3, totalPoints: 0, winner: false },
    ])
    assert.equal(response.json.standings.find(({ name }) => name === 'Caio').isRequester, true)

    const [endedAudit] = context.database.prepare('SELECT * FROM audit_records WHERE action = ?').all(closingActions.ended)
    assert.equal(endedAudit.actor_type, 'system')
    assert.deepEqual(JSON.parse(endedAudit.details_json), { eligibleCount: 3, winnerCount: 1 })
    assert.equal(context.database.prepare('SELECT COUNT(*) AS n FROM audit_records WHERE action = ?').get(closingActions.winnersRecorded).n, 1)
  })
})

test('CT-02: antes do fim do período o bolão permanece ativo', async () => {
  await withClosing(async (context) => {
    const users = await setup(context)
    await playAndFinish(context, users)
    assert.deepEqual(await close(context), { checked: 0, closed: 0, waiting: 0, failed: 0 })
    assert.equal(pool(context, users.poolId).status, 'active')
  })
})

test('CT-03: partida adiada, em andamento ou encerrada sem placar mantém o bolão ativo', async () => {
  for (const status of ['postponed', 'in_progress', 'scheduled']) {
    await withClosing(async (context) => {
      const { poolId, first, second } = await setup(context)
      await publish(context, [[first.id, 'finished', 1, 0], [second.id, status]])
      context.clock.current = periodEnd
      assert.deepEqual(await close(context), { checked: 1, closed: 0, waiting: 1, failed: 0 }, status)
      assert.equal(pool(context, poolId).status, 'active')
    })
  }
})

test('CT-04: resultado oficial ainda não pontuado impede o encerramento', async () => {
  await withClosing(async (context) => {
    const { poolId, first, second } = await setup(context)
    await publish(context, [[first.id, 'finished', 1, 0], [second.id, 'finished', 2, 2]], { score: false })
    context.clock.current = periodEnd
    assert.equal((await close(context)).waiting, 1)
    await context.app.locals.tasks.scorePredictions()
    assert.equal((await close(context)).closed, 1)
    assert.equal(pool(context, poolId).status, 'ended')
  })
})

test('CT-05 e CT-07: desempate do bolão decide; empate residual gera co-vencedores', async () => {
  await withClosing(async (context) => {
    // Bruno e Caio somam 5; o critério "placares exatos" não separa (1 a 1): co-vencedores.
    const { bruno, caio, poolId, first, second } = await setup(context, { tiebreaker: 'exact_scores' })
    await predict(context, bruno, poolId, first.id, 2, 1)
    await predict(context, caio, poolId, second.id, 0, 0)
    await publish(context, [[first.id, 'finished', 2, 1], [second.id, 'finished', 0, 0]])
    context.clock.current = periodEnd
    await close(context)
    const { standings } = (await finalResult(context, bruno, poolId)).json
    assert.deepEqual(standings.filter(({ winner }) => winner).map(({ name }) => name).sort(), ['Bruno', 'Caio'])
    assert.deepEqual(standings.filter(({ winner }) => winner).map(({ position }) => position), [1, 1])
  })

  await withClosing(async (context) => {
    // Os dois somam 2 pontos, mas o critério "acertos de resultado" não muda; "última rodada" sim:
    // só Caio pontuou na rodada mais recente do bolão. Partidas de rodadas diferentes.
    const admin = await context.signUp('Ana')
    const bruno = await context.signUp('Bruno')
    const caio = await context.signUp('Caio')
    const roundTwo = (await context.call('GET', '/catalog/rounds/2/matches?status=scheduled', { token: admin.token })).json.matches[0]
    const roundThree = (await context.call('GET', '/catalog/rounds/3/matches?status=scheduled', { token: admin.token })).json.matches[0]
    const created = await context.call('POST', '/pools', {
      token: admin.token,
      body: {
        name: 'Bolão', startsOn: '2026-11-14', endsOn, entryFee: 0, prizeModel: 'winner_takes_all',
        tiebreaker: 'last_round_points', selection: { matchIds: [roundTwo.id, roundThree.id] },
      },
    })
    assert.equal(created.status, 201, created.text)
    const poolId = created.json.pool.id
    await context.joinPool(admin, bruno, poolId)
    await context.joinPool(admin, caio, poolId)
    await context.call('PUT', `/pools/${poolId}/matches/${roundTwo.id}/prediction`, { token: bruno.token, body: { type: 'result', outcome: 'home' } })
    await context.call('PUT', `/pools/${poolId}/matches/${roundThree.id}/prediction`, { token: caio.token, body: { type: 'result', outcome: 'home' } })
    await publish(context, [[roundTwo.id, 'finished', 1, 0], [roundThree.id, 'finished', 1, 0]])
    context.clock.current = periodEnd
    await close(context)
    const { standings, tiebreaker } = (await finalResult(context, caio, poolId)).json
    assert.equal(tiebreaker, 'last_round_points')
    assert.deepEqual(standings.slice(0, 2).map(({ name, position, winner }) => ({ name, position, winner })), [
      { name: 'Caio', position: 1, winner: true },
      { name: 'Bruno', position: 2, winner: false },
    ])
  })
})

test('CT-08 e CT-18: quem saiu e participação não confirmada ficam fora; com taxa, só quem pagou', async () => {
  await withClosing(async (context) => {
    const admin = await context.signUp('Ana')
    const bruno = await context.signUp('Bruno')
    const caio = await context.signUp('Caio')
    const duda = await context.signUp('Duda')
    const created = await context.createPool(admin, { matchCount: 1, endsOn, entryFee: 10 })
    const { poolId } = created
    const [match] = created.matches
    const pay = async (user) => {
      const started = await context.call('POST', `/pools/${poolId}/entry-fee/payment`, { token: user.token })
      context.payments.confirm(context.database.prepare('SELECT operation_key FROM financial_movements WHERE id = ?').get(started.json.payment.id).operation_key)
      await context.call('POST', `/pools/${poolId}/entry-fee/payment/check`, { token: user.token })
    }
    await pay(admin)
    await context.joinPool(admin, bruno, poolId)
    await pay(bruno)
    await context.joinPool(admin, caio, poolId)
    await pay(caio)
    await context.joinPool(admin, duda, poolId) // aprovada, sem pagamento
    await predict(context, bruno, poolId, match.id, 1, 0)
    await predict(context, caio, poolId, match.id, 1, 0)
    assert.equal((await context.call('POST', `/pools/${poolId}/exit`, { token: caio.token, body: { confirm: true } })).status, 200)

    await publish(context, [[match.id, 'finished', 1, 0]])
    context.clock.current = periodEnd
    await close(context)
    const { standings } = (await finalResult(context, bruno, poolId)).json
    assert.deepEqual(standings.map(({ name, winner }) => [name, winner]), [['Bruno', true], ['Ana', false]])
    expectCommonFormat(await finalResult(context, caio, poolId), 404, 'not_found')
    expectCommonFormat(await finalResult(context, duda, poolId), 404, 'not_found')

    // CT-17: o pagamento de Duda confirmado depois do encerramento não confirma a participação.
    const started = await context.call('POST', `/pools/${poolId}/entry-fee/payment`, { token: duda.token })
    expectCommonFormat(started, 409, 'pool_ended')
    assert.equal(context.database.prepare('SELECT status FROM pool_participations WHERE user_id = ?').get(duda.id).status, 'approved_awaiting_payment')
  })
})

test('CT-17: pagamento iniciado antes e confirmado depois do encerramento fica sinalizado, sem confirmar', async () => {
  await withClosing(async (context) => {
    const admin = await context.signUp('Ana')
    const duda = await context.signUp('Duda')
    const created = await context.createPool(admin, { matchCount: 1, endsOn, entryFee: 10 })
    const { poolId } = created
    await context.joinPool(admin, duda, poolId)
    const started = await context.call('POST', `/pools/${poolId}/entry-fee/payment`, { token: duda.token })
    await publish(context, [[created.matches[0].id, 'finished', 1, 0]])
    context.clock.current = periodEnd
    await close(context)

    context.payments.confirm(context.database.prepare('SELECT operation_key FROM financial_movements WHERE id = ?').get(started.json.payment.id).operation_key)
    await context.app.locals.tasks.reconcilePayments()
    assert.equal(context.database.prepare('SELECT status FROM pool_participations WHERE user_id = ?').get(duda.id).status, 'approved_awaiting_payment')
    assert.equal(context.database.prepare('SELECT reason FROM entry_fee_late_payments').get().reason, 'pool_ended')
    assert.equal(context.database.prepare('SELECT COUNT(*) AS n FROM pool_final_standings WHERE pool_id = ?').get(poolId).n, 0)
  })
})

test('CT-09 e CT-19: maior pontuação zero e todas as partidas canceladas geram ausência de vencedor', async () => {
  await withClosing(async (context) => {
    const { admin, poolId, first, second } = await setup(context)
    await publish(context, [[first.id, 'cancelled'], [second.id, 'cancelled']])
    context.clock.current = periodEnd
    assert.equal((await close(context)).closed, 1)
    const result = (await finalResult(context, admin, poolId)).json
    assert.equal(result.hasWinner, false)
    assert.equal(result.noWinnerReason, 'zero_points')
    assert.equal(result.standings.every(({ winner }) => !winner), true)
    const [audit] = context.database.prepare('SELECT details_json FROM audit_records WHERE action = ?').all(closingActions.ended)
    assert.deepEqual(JSON.parse(audit.details_json), { eligibleCount: 3, winnerCount: 0, noWinnerReason: 'zero_points' })
    assert.equal(context.database.prepare('SELECT COUNT(*) AS n FROM audit_records WHERE action = ?').get(closingActions.winnersRecorded).n, 0)
  })
})

test('CT-09: sem nenhum elegível, a ausência de vencedor é registrada', async () => {
  await withClosing(async (context) => {
    const admin = await context.signUp('Ana')
    const created = await context.createPool(admin, { matchCount: 1, endsOn, entryFee: 10 })
    await publish(context, [[created.matches[0].id, 'finished', 1, 0]])
    context.clock.current = periodEnd
    await close(context)
    const row = context.database.prepare('SELECT * FROM pool_final_results WHERE pool_id = ?').get(created.poolId)
    assert.equal(row.no_winner_reason, 'no_eligible')
    assert.equal(row.eligible_count, 0)
    assert.equal(pool(context, created.poolId).status, 'ended')
  })
})

test('CT-10: falha no meio do encerramento desfaz tudo e o próximo ciclo encerra', async () => {
  await withClosing(async (context) => {
    const users = await setup(context)
    await playAndFinish(context, users)
    context.clock.current = periodEnd
    context.database.exec(`
      CREATE TEMP TRIGGER fail_standings BEFORE INSERT ON pool_final_standings
      BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;
    `)
    assert.equal((await close(context)).failed, 1)
    assert.equal(pool(context, users.poolId).status, 'active')
    assert.equal(pool(context, users.poolId).ended_at, null)
    assert.equal(context.database.prepare('SELECT COUNT(*) AS n FROM pool_final_results').get().n, 0)
    assert.equal(context.database.prepare("SELECT COUNT(*) AS n FROM audit_records WHERE action = ? AND result = 'success'").get(closingActions.ended).n, 0)

    context.database.exec('DROP TRIGGER fail_standings')
    assert.equal((await close(context)).closed, 1)
  })
})

test('CT-11 e CT-14: reexecução não muda nada e nenhuma movimentação financeira é criada', async () => {
  await withClosing(async (context) => {
    const users = await setup(context)
    await playAndFinish(context, users)
    context.clock.current = periodEnd
    await close(context)
    const snapshot = () => JSON.stringify([
      context.database.prepare('SELECT * FROM pool_final_results').all(),
      context.database.prepare('SELECT * FROM pool_final_standings ORDER BY participation_id').all(),
      pool(context, users.poolId),
      context.database.prepare('SELECT COUNT(*) AS n FROM audit_records').get(),
    ])
    const before = snapshot()
    context.clock.current += 60 * 60 * 1000
    assert.deepEqual(await close(context), { checked: 0, closed: 0, waiting: 0, failed: 0 })
    assert.equal(snapshot(), before)
    assert.equal(context.database.prepare('SELECT COUNT(*) AS n FROM financial_movements').get().n, 0)
    assert.throws(() => context.database.prepare("UPDATE pools SET status = 'active' WHERE id = ?").run(users.poolId), /final/)
  })
})

test('CT-12: não existe operação manual de encerramento nem de edição do resultado', async () => {
  await withClosing(async (context) => {
    const users = await setup(context)
    for (const [method, route] of [
      ['POST', `/pools/${users.poolId}/close`],
      ['POST', `/pools/${users.poolId}/end`],
      ['PATCH', `/pools/${users.poolId}`],
      ['PUT', `/pools/${users.poolId}/final-result`],
      ['POST', `/pools/${users.poolId}/final-result`],
      ['PATCH', `/pools/${users.poolId}/final-result`],
    ]) {
      const response = await context.call(method, route, { token: users.admin.token, body: { status: 'ended' } })
      assert.equal(response.status, 404, `${method} ${route}`)
    }
    assert.equal(pool(context, users.poolId).status, 'active')
  })
})

test('CT-13: correção de resultado e saída após o encerramento não alteram o resultado final', async () => {
  await withClosing(async (context) => {
    const users = await setup(context)
    await playAndFinish(context, users)
    context.clock.current = periodEnd
    await close(context)
    const frozen = (await finalResult(context, users.bruno, users.poolId)).json

    // Correção do placar pelo provedor: com o bolão encerrado, nada muda e não há pontuação nova.
    context.sports.setResults({ matches: [{ id: providerId(context, users.first.id), status: 'finished', homeScore: 0, awayScore: 3 }] })
    await context.app.locals.tasks.syncResults()
    await context.app.locals.tasks.scorePredictions()
    expectCommonFormat(await context.call('POST', `/pools/${users.poolId}/exit`, { token: users.caio.token, body: { confirm: true } }), 409, 'pool_ended')
    assert.deepEqual((await finalResult(context, users.bruno, users.poolId)).json, frozen)
    assert.throws(() => context.database.prepare('UPDATE pool_final_standings SET winner = 0').run(), /frozen/)
  })
})

test('CT-15 e CT-16: consulta por participante; sem vínculo recebe 404 e bolão ativo recebe conflito', async () => {
  await withClosing(async (context) => {
    const users = await setup(context)
    const outsider = await context.signUp('Edu')
    expectCommonFormat(await finalResult(context, users.bruno, users.poolId), 409, 'pool_not_ended')
    await playAndFinish(context, users)
    context.clock.current = periodEnd
    await close(context)
    const own = await finalResult(context, outsider, users.poolId)
    expectCommonFormat(own, 404, 'not_found')
    const missing = await finalResult(context, outsider, '00000000-0000-4000-8000-000000000000')
    assert.equal(missing.json.message, own.json.message)
    expectCommonFormat(await context.call('GET', `/pools/${users.poolId}/final-result`), 401, 'session_rejected')
    assert.equal((await finalResult(context, users.admin, users.poolId)).status, 200)
  })
})

test('CT-20: tarefa registrada a cada 1 minuto; instantes em UTC', async () => {
  assert.equal(defaultPoolClosingIntervalMs, 60 * 1000)
  assert.match(fs.readFileSync(new URL('../../src/backend/index.js', import.meta.url), 'utf8'), /'pool-closing'/)
  assert.equal(new Date(periodEndMs('2026-12-31')).toISOString(), '2027-01-01T00:00:00.000Z')
})

test('A4: correção de partida de bolão encerrado vai ao log técnico', async () => {
  await withClosing(async (context) => {
    // Outro bolão ativo com a mesma partida faz a correção ser pontuada; o encerrado não muda.
    const users = await setup(context)
    const other = await context.signUp('Fábio')
    await playAndFinish(context, users)
    context.clock.current = periodEnd
    await close(context)
    context.database.prepare("INSERT INTO pools (id, creator_id, name, starts_on, ends_on, entry_fee_cents, prize_model, tiebreaker, status, live_results, created_at) VALUES ('p-ativo', ?, 'Outro', '2026-11-14', '2027-12-31', 0, 'winner_takes_all', 'exact_scores', 'active', 0, ?)").run(other.id, new Date(context.clock.current).toISOString())
    context.database.prepare("INSERT INTO pool_matches (pool_id, match_id) VALUES ('p-ativo', ?)").run(users.first.id)
    // A sincronização só consulta o provedor quando há partida acompanhada em bolão ativo (SPEC-013).
    const tracked = context.database.prepare("SELECT id FROM sports_matches WHERE status = 'scheduled' AND id NOT IN (SELECT match_id FROM pool_matches) LIMIT 1").get().id
    context.database.prepare("INSERT INTO pool_matches (pool_id, match_id) VALUES ('p-ativo', ?)").run(tracked)
    context.startMatch(tracked, { status: 'scheduled' })
    context.sports.setResults({ matches: [
      { id: providerId(context, users.first.id), status: 'finished', homeScore: 0, awayScore: 3 },
      { id: providerId(context, tracked), status: 'in_progress', homeScore: null, awayScore: null },
    ] })
    await context.app.locals.tasks.syncResults()
    await context.app.locals.tasks.scorePredictions()
    assert.equal(context.events.some((event) => event.component === 'scoring' && event.result === 'correction_after_pool_ended'), true)
    assert.equal((await finalResult(context, users.bruno, users.poolId)).json.standings[0].totalPoints, 10)
  })
})
