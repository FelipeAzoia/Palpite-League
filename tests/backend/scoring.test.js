import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultScoringIntervalMs } from '../../src/backend/app.js'
import { createSimulatedSportsProvider, SportsProviderError } from '../../src/backend/adapters/simulated-sports-provider.js'
import { scorePrediction } from '../../src/backend/modules/predictions-scoring/index.js'
import { createScheduler } from '../../src/backend/shared/scheduler.js'
import { expectCommonFormat, withHttpApp } from './support/app-harness.js'

// Provedor simulado com resultados controlados (RNF18) e atalhos do fluxo completo:
// palpite (SPEC-012) → resultado oficial (SPEC-013) → pontuação (SPEC-014).
function withScoring(callback) {
  const provider = createSimulatedSportsProvider()
  return withHttpApp(async (context) => {
    const reported = new Map()
    const providerId = (matchId) => context.database.prepare('SELECT provider_id FROM sports_matches WHERE id = ?').get(matchId).provider_id

    async function predict(user, poolId, matchId, body) {
      const response = await context.call('PUT', `/pools/${poolId}/matches/${matchId}/prediction`, { token: user.token, body })
      assert.equal(response.status, 200, response.text)
    }

    // Começa as partidas e faz o provedor informar o estado; a SPEC-013 registra o resultado.
    async function report(entries) {
      for (const [matchId, status, home = null, away = null] of entries) {
        const row = context.database.prepare('SELECT status, starts_at FROM sports_matches WHERE id = ?').get(matchId)
        if (row.status === 'scheduled' && Date.parse(row.starts_at) > context.clock.current) context.startMatch(matchId, { status: 'scheduled' })
        reported.set(matchId, { id: providerId(matchId), status, homeScore: home, awayScore: away })
      }
      provider.setResults({ matches: [...reported.values()] })
      const result = await context.app.locals.tasks.syncResults()
      assert.equal(result.ok, true, JSON.stringify(result))
    }

    const score = () => context.app.locals.tasks.scorePredictions()
    const points = (predictionOwner, matchId) => context.database.prepare(`
      SELECT pr.points FROM predictions pr JOIN pool_participations part ON part.id = pr.participation_id
      WHERE part.user_id = ? AND pr.match_id = ? AND part.pool_id = ?
    `).get(predictionOwner.user.id, matchId, predictionOwner.poolId)?.points
    const total = (owner) => context.database.prepare('SELECT total_points FROM pool_participations WHERE user_id = ? AND pool_id = ?')
      .get(owner.user.id, owner.poolId).total_points
    const scoredVersion = (matchId) => context.database.prepare('SELECT scored_version, result_version FROM sports_matches WHERE id = ?').get(matchId)

    await callback({ ...context, provider, predict, report, score, points, total, scoredVersion })
  }, { sportsProvider: provider })
}

async function setup(context) {
  const admin = await context.signUp('Ana')
  const bruno = await context.signUp('Bruno')
  const pool = await context.createPool(admin)
  await context.joinPool(admin, bruno, pool.poolId)
  const [first, second, third] = pool.matches
  return {
    admin: { user: admin, poolId: pool.poolId },
    bruno: { user: bruno, poolId: pool.poolId },
    first, second, third, ...pool,
  }
}

const result = (outcome) => ({ type: 'result', outcome })
const exact = (homeGoals, awayGoals) => ({ type: 'exact_score', homeGoals, awayGoals })

test('TC-01: tabela de verdade do palpite de resultado (2 ou 0)', () => {
  const cases = [
    ['home', [2, 1], 2], ['draw', [1, 1], 2], ['away', [0, 3], 2],
    ['draw', [2, 1], 0], ['away', [2, 1], 0], ['home', [0, 0], 0], ['home', [1, 2], 0], ['draw', [0, 0], 2],
  ]
  for (const [outcome, [home, away], expected] of cases) {
    assert.equal(scorePrediction(result(outcome), { home, away }), expected, `${outcome} em ${home}-${away}`)
  }
})

test('TC-02: tabela de verdade do placar exato (5 ou 0), inclusive resultado certo com placar errado', () => {
  const cases = [
    [[2, 1], [2, 1], 5], [[0, 0], [0, 0], 5], [[3, 1], [2, 1], 0], [[0, 2], [2, 1], 0], [[1, 0], [2, 1], 0], [[1, 2], [2, 1], 0],
  ]
  for (const [[homeGoals, awayGoals], [home, away], expected] of cases) {
    assert.equal(scorePrediction(exact(homeGoals, awayGoals), { home, away }), expected, `${homeGoals}-${awayGoals} em ${home}-${away}`)
  }
})

test('TC-03: partidas não encerradas, adiadas e canceladas não pontuam e os pontos ficam vazios', async () => {
  await withScoring(async (context) => {
    const { bruno, first, second, third } = await setup(context)
    for (const match of [first, second, third]) await context.predict(bruno.user, bruno.poolId, match.id, result('home'))

    await context.report([[first.id, 'in_progress'], [second.id, 'postponed'], [third.id, 'cancelled']])
    assert.deepEqual(context.score(), { processedMatches: 0, updatedPredictions: 0, failedMatches: [] })

    for (const match of [first, second, third]) assert.equal(context.points(bruno, match.id), null)
    assert.equal(context.total(bruno), 0)
  })
})

test('TC-04 e TC-09: o resultado registrado pela SPEC-013 é pontuado automaticamente e só pontos e totais mudam', async () => {
  await withScoring(async (context) => {
    const { admin, bruno, first, second } = await setup(context)
    await context.predict(bruno.user, bruno.poolId, first.id, result('home'))
    await context.predict(bruno.user, bruno.poolId, second.id, exact(1, 1))
    await context.predict(admin.user, admin.poolId, first.id, exact(2, 1))
    await context.report([[first.id, 'finished', 2, 1], [second.id, 'finished', 1, 1]])

    const snapshot = () => ({
      predictions: context.database.prepare('SELECT id, participation_id, match_id, type, predicted_outcome, home_goals, away_goals, submitted_at FROM predictions ORDER BY id').all(),
      matches: context.database.prepare('SELECT id, status, starts_at, home_score, away_score, result_version, result_recorded_at FROM sports_matches ORDER BY id').all(),
      participations: context.database.prepare('SELECT id, pool_id, user_id, role, status, joined_at FROM pool_participations ORDER BY id').all(),
    })
    const before = snapshot()
    assert.deepEqual(context.score(), { processedMatches: 2, updatedPredictions: 3, failedMatches: [] })
    assert.deepEqual(snapshot(), before)

    assert.equal(context.points(bruno, first.id), 2)
    assert.equal(context.points(bruno, second.id), 5)
    assert.equal(context.points(admin, first.id), 5)
    assert.equal(context.total(bruno), 7)
    assert.equal(context.total(admin), 5)
    assert.deepEqual(context.scoredVersion(first.id).scored_version, context.scoredVersion(first.id).result_version)
    assert.ok(context.events.some((event) => event.component === 'scoring' && event.result === 'match_scored'))

    const router = context.app.router ?? context.app._router
    const writes = router.stack.filter((layer) => layer.route)
      .flatMap((layer) => Object.keys(layer.route.methods).filter((method) => method !== 'get').map((method) => `${method} ${layer.route.path}`))
    assert.equal(writes.some((route) => /point|score|ranking/.test(route)), false, writes.join('\n'))
    for (const method of ['PUT', 'PATCH', 'POST']) {
      expectCommonFormat(await context.call(method, `/pools/${bruno.poolId}/points`, { token: admin.user.token, body: { points: 99 } }), 404, 'not_found')
    }
    assert.equal(context.total(bruno), 7)
  })
})

test('TC-05: executar a tarefa de novo com a mesma versão não processa a partida nem muda pontos', async () => {
  await withScoring(async (context) => {
    const { bruno, first } = await setup(context)
    await context.predict(bruno.user, bruno.poolId, first.id, exact(0, 0))
    await context.report([[first.id, 'finished', 0, 0]])
    context.score()

    assert.deepEqual(context.score(), { processedMatches: 0, updatedPredictions: 0, failedMatches: [] })
    assert.equal(context.points(bruno, first.id), 5)
    assert.equal(context.total(bruno), 5)
  })
})

test('TC-06 e TC-08: correção recalcula sem acumular, o total acompanha e outras partidas não mudam', async () => {
  await withScoring(async (context) => {
    const { bruno, first, second, third } = await setup(context)
    await context.predict(bruno.user, bruno.poolId, first.id, exact(2, 1))
    await context.predict(bruno.user, bruno.poolId, second.id, result('draw'))
    await context.report([[first.id, 'finished', 2, 1], [second.id, 'finished', 0, 0], [third.id, 'in_progress']])
    context.score()
    assert.equal(context.total(bruno), 7)

    await context.report([[first.id, 'finished', 3, 1]])
    assert.deepEqual(context.score(), { processedMatches: 1, updatedPredictions: 1, failedMatches: [] })
    assert.equal(context.points(bruno, first.id), 0)
    assert.equal(context.points(bruno, second.id), 2)
    assert.equal(context.total(bruno), 2)

    await context.report([[first.id, 'finished', 2, 1]])
    context.score()
    context.score()
    assert.equal(context.points(bruno, first.id), 5)
    assert.equal(context.total(bruno), 7)
  })
})

test('TC-07: correção depois do encerramento de um bolão recalcula só o bolão ativo', async () => {
  await withScoring(async (context) => {
    const active = await setup(context)
    const carla = await context.signUp('Carla')
    const endedPool = await context.createPool(carla)
    const carlaOwner = { user: carla, poolId: endedPool.poolId }
    await context.predict(active.bruno.user, active.poolId, active.first.id, exact(2, 1))
    await context.predict(carla, endedPool.poolId, active.first.id, exact(2, 1))
    await context.report([[active.first.id, 'finished', 2, 1], [active.second.id, 'in_progress']])
    context.score()
    assert.deepEqual([context.points(active.bruno, active.first.id), context.points(carlaOwner, active.first.id)], [5, 5])

    context.database.prepare("UPDATE pools SET status = 'ended' WHERE id = ?").run(endedPool.poolId)
    await context.report([[active.first.id, 'finished', 0, 0]])
    context.score()

    assert.equal(context.points(active.bruno, active.first.id), 0)
    assert.equal(context.total(active.bruno), 0)
    assert.equal(context.points(carlaOwner, active.first.id), 5)
    assert.equal(context.total(carlaOwner), 5)
  })
})

test('TC-10: falha no meio do processamento desfaz pontos, totais e versão pontuada da partida', async () => {
  await withScoring(async (context) => {
    const { bruno, first } = await setup(context)
    await context.predict(bruno.user, bruno.poolId, first.id, result('home'))
    await context.report([[first.id, 'finished', 1, 0]])
    context.database.exec(`
      CREATE TRIGGER fail_total BEFORE UPDATE OF total_points ON pool_participations
      BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;
    `)

    assert.deepEqual(context.score(), { processedMatches: 0, updatedPredictions: 0, failedMatches: [first.id] })
    assert.equal(context.points(bruno, first.id), null)
    assert.equal(context.total(bruno), 0)
    assert.equal(context.scoredVersion(first.id).scored_version, 0)
    assert.ok(context.events.some((event) => event.component === 'scoring' && event.result === 'match_failed'))
  })
})

test('TC-11: com duas partidas pendentes e falha em uma, a outra é processada e a falhada é tentada de novo', async () => {
  await withScoring(async (context) => {
    const { bruno, first, second } = await setup(context)
    await context.predict(bruno.user, bruno.poolId, first.id, result('home'))
    await context.predict(bruno.user, bruno.poolId, second.id, result('away'))
    await context.report([[first.id, 'finished', 1, 0], [second.id, 'finished', 0, 1]])
    context.database.exec(`
      CREATE TRIGGER fail_first BEFORE UPDATE OF points ON predictions
      WHEN NEW.match_id = '${first.id}'
      BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;
    `)

    assert.deepEqual(context.score(), { processedMatches: 1, updatedPredictions: 1, failedMatches: [first.id] })
    assert.deepEqual([context.points(bruno, first.id), context.points(bruno, second.id), context.total(bruno)], [null, 2, 2])

    context.database.exec('DROP TRIGGER fail_first')
    assert.deepEqual(context.score(), { processedMatches: 1, updatedPredictions: 1, failedMatches: [] })
    assert.deepEqual([context.points(bruno, first.id), context.total(bruno)], [2, 4])
  })
})

test('TC-12: palpite de participação que saiu, em partida já iniciada, é pontuado normalmente', async () => {
  await withScoring(async (context) => {
    const { bruno, first } = await setup(context)
    await context.predict(bruno.user, bruno.poolId, first.id, exact(3, 2))
    await context.report([[first.id, 'in_progress']])
    context.database.prepare("UPDATE pool_participations SET status = 'left' WHERE user_id = ? AND pool_id = ?").run(bruno.user.id, bruno.poolId)
    await context.report([[first.id, 'finished', 3, 2]])

    context.score()
    assert.equal(context.points(bruno, first.id), 5)
    assert.equal(context.total(bruno), 5)
  })
})

test('TC-13 e TC-17: cada participante consulta só os próprios pontos; não membro 404, sem sessão 401, aguardando pagamento 409', async () => {
  await withScoring(async (context) => {
    const { admin, bruno, first, second, third, poolId } = await setup(context)
    await context.predict(bruno.user, poolId, first.id, result('home'))
    await context.predict(admin.user, poolId, first.id, exact(4, 4))
    await context.report([[first.id, 'finished', 2, 0], [second.id, 'finished', 1, 1], [third.id, 'in_progress']])
    context.score()

    const response = await context.call('GET', `/pools/${poolId}/points`, { token: bruno.user.token })
    assert.equal(response.status, 200, response.text)
    assert.equal(response.json.totalPoints, 2)
    const byId = Object.fromEntries(response.json.matches.map((match) => [match.id, match]))
    assert.deepEqual(Object.keys(byId).sort(), [first.id, second.id].sort(), 'só partidas encerradas')
    assert.deepEqual(byId[first.id].officialScore, { home: 2, away: 0 })
    assert.equal(byId[first.id].prediction.outcome, 'home')
    assert.equal(byId[first.id].points, 2)
    assert.deepEqual([byId[second.id].prediction, byId[second.id].points], [null, null])
    assert.equal(/"homeGoals":4/.test(response.text), false, 'não expõe o palpite da Ana')

    const own = await context.call('GET', `/pools/${poolId}/points`, { token: admin.user.token })
    assert.equal(own.json.totalPoints, 0)
    assert.equal(own.json.matches.find(({ id }) => id === first.id).prediction.homeGoals, 4)

    expectCommonFormat(await context.call('GET', `/pools/${poolId}/points`, { token: (await context.signUp('Diego')).token }), 404, 'not_found')
    expectCommonFormat(await context.call('GET', `/pools/${poolId}/points`), 401, 'session_rejected')
    const payer = await context.signUp('Elisa')
    const paid = await context.createPool(payer, { entryFee: 10 })
    expectCommonFormat(await context.call('GET', `/pools/${paid.poolId}/points`, { token: payer.token }), 409, 'participation_not_confirmed')
  })
})

test('TC-14: pontua com o provedor indisponível, roda ao iniciar e a cada 1 minuto', async () => {
  await withScoring(async (context) => {
    const { bruno, first, second } = await setup(context)
    await context.predict(bruno.user, bruno.poolId, first.id, result('home'))
    await context.predict(bruno.user, bruno.poolId, second.id, result('home'))
    await context.report([[first.id, 'finished', 1, 0], [second.id, 'in_progress']])
    const resultCalls = context.provider.getResultCallCount()
    context.provider.setResultsFailure(new SportsProviderError('timeout'))

    const timers = []
    const scheduler = createScheduler({ setTimer: (callback, delay) => { timers.push({ callback, delay }); return timers.length }, clearTimer() {} })
    scheduler.register('scoring', defaultScoringIntervalMs, context.app.locals.tasks.scorePredictions)
    await scheduler.start()
    assert.equal(context.points(bruno, first.id), 2, 'executa logo ao iniciar')
    assert.equal(timers.at(-1).delay, 60 * 1000)

    context.provider.setResultsFailure(null)
    await context.report([[second.id, 'finished', 2, 2]])
    context.provider.setResultsFailure(new SportsProviderError('timeout'))
    await timers.at(-1).callback()
    assert.equal(context.points(bruno, second.id), 0, 'pontuado na execução seguinte, em até 1 minuto')
    assert.equal(context.provider.getResultCallCount(), resultCalls + 1, 'a pontuação não consulta o provedor')
    scheduler.stop()
  })
})
