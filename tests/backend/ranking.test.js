import assert from 'node:assert/strict'
import test from 'node:test'
import { createSimulatedSportsProvider } from '../../src/backend/adapters/simulated-sports-provider.js'
import { classify } from '../../src/backend/modules/predictions-scoring/index.js'
import { expectCommonFormat, withHttpApp } from './support/app-harness.js'

function participant(id, name, totalPoints, { exactScores = 0, correctResults = 0, lastRoundPoints = 0 } = {}) {
  return { id, name, totalPoints, exactScores, correctResults, lastRoundPoints }
}

const summary = (rows) => rows.map(({ name, position }) => [name, position])

test('TC-01: ordena por pontuação acumulada decrescente', () => {
  const rows = classify([participant('a', 'Ana', 12), participant('b', 'Bruno', 9), participant('c', 'Carla', 15)], 'exact_scores')
  assert.deepEqual(summary(rows), [['Carla', 1], ['Ana', 2], ['Bruno', 3]])
})

test('TC-02, TC-03 e TC-04 (regra): desempata por placares exatos, resultados corretos ou última rodada', () => {
  const ana = participant('a', 'Ana', 10, { exactScores: 1, correctResults: 4, lastRoundPoints: 2 })
  const bruno = participant('b', 'Bruno', 10, { exactScores: 2, correctResults: 2, lastRoundPoints: 0 })
  const carla = participant('c', 'Carla', 10, { exactScores: 0, correctResults: 3, lastRoundPoints: 7 })

  assert.deepEqual(summary(classify([ana, bruno, carla], 'exact_scores')), [['Bruno', 1], ['Ana', 2], ['Carla', 3]])
  assert.deepEqual(summary(classify([ana, bruno, carla], 'correct_results')), [['Ana', 1], ['Carla', 2], ['Bruno', 3]])
  assert.deepEqual(summary(classify([ana, bruno, carla], 'last_round_points')), [['Carla', 1], ['Ana', 2], ['Bruno', 3]])
  assert.equal(classify([ana], 'correct_results')[0].tiebreakValue, 4)
})

test('TC-05 e TC-13 (regra): empate não resolvido dá posições iguais com salto e ordem estável por nome e id', () => {
  const rows = classify([
    participant('z', 'Diego', 4),
    participant('c2', 'Carla', 8, { exactScores: 1 }),
    participant('c1', 'carla', 8, { exactScores: 1 }),
    participant('a', 'Ana', 8, { exactScores: 1 }),
  ], 'exact_scores')
  assert.deepEqual(rows.map(({ id, position }) => [id, position]), [['a', 1], ['c1', 1], ['c2', 1], ['z', 4]])
  assert.deepEqual(classify([...rows].reverse(), 'exact_scores').map(({ id }) => id), rows.map(({ id }) => id))
})

// Fluxo completo: palpite (SPEC-012) → resultado (SPEC-013) → pontuação (SPEC-014) → ranking.
function withRanking(callback) {
  const provider = createSimulatedSportsProvider()
  return withHttpApp(async (context) => {
    const reported = new Map()
    const providerId = (matchId) => context.database.prepare('SELECT provider_id FROM sports_matches WHERE id = ?').get(matchId).provider_id

    async function predict(user, poolId, matchId, body) {
      const response = await context.call('PUT', `/pools/${poolId}/matches/${matchId}/prediction`, { token: user.token, body })
      assert.equal(response.status, 200, response.text)
    }

    async function finish(entries) {
      for (const [matchId, status, home = null, away = null] of entries) {
        const match = context.database.prepare('SELECT status, starts_at FROM sports_matches WHERE id = ?').get(matchId)
        if (match.status === 'scheduled' && Date.parse(match.starts_at) > context.clock.current) context.startMatch(matchId, { status: 'scheduled' })
        reported.set(matchId, { id: providerId(matchId), status, homeScore: home, awayScore: away })
      }
      provider.setResults({ matches: [...reported.values()] })
      assert.equal((await context.app.locals.tasks.syncResults()).ok, true)
      context.app.locals.tasks.scorePredictions()
    }

    async function get(route, user) {
      const response = await context.call('GET', route, { token: user.token })
      assert.equal(response.status, 200, response.text)
      return response.json
    }

    await callback({ ...context, predict, finish, get })
  }, { sportsProvider: provider })
}

const result = (outcome) => ({ type: 'result', outcome })
const exact = (homeGoals, awayGoals) => ({ type: 'exact_score', homeGoals, awayGoals })
const row = ({ name, position, totalPoints, tiebreakValue }) => [name, position, totalPoints, tiebreakValue]

// Recalcula os totais de forma independente, direto dos pontos dos palpites (RNF03).
function independentTotals(database, poolId) {
  return Object.fromEntries(database.prepare(`
    SELECT u.name, COALESCE(SUM(pr.points), 0) AS total
    FROM pool_participations part JOIN users u ON u.id = part.user_id
    LEFT JOIN predictions pr ON pr.participation_id = part.id
    WHERE part.pool_id = ? AND part.status = 'confirmed'
    GROUP BY part.id
  `).all(poolId).map(({ name, total }) => [name, total]))
}

// Cenário: 4 partidas da rodada 2 (todas 1 a 0) e 2 da rodada 3 (2 a 2 e uma em andamento).
//   Ana:   placar exato 1-0 na 1ª partida e 2-2 na rodada 3 → 10 pontos; 2 exatos; 2 corretos; última rodada 5.
//   Bruno: mandante nas 4 da rodada 2 e empate na rodada 3 → 10 pontos; 0 exatos; 5 corretos; última rodada 2.
async function scenario(context, tiebreaker) {
  const admin = await context.signUp(`Admin ${tiebreaker}`)
  const round2 = (await context.call('GET', '/catalog/rounds/2/matches?status=scheduled', { token: admin.token })).json.matches.slice(0, 4)
  const round3 = (await context.call('GET', '/catalog/rounds/3/matches?status=scheduled', { token: admin.token })).json.matches.slice(0, 2)
  const pool = await context.createPool(admin, { tiebreaker, selection: { matchIds: [...round2, ...round3].map(({ id }) => id) } })
  return { admin, poolId: pool.poolId, round2, round3 }
}

async function playScenario(context, { ana, bruno }, pools) {
  for (const { poolId, round2, round3 } of pools) {
    await context.predict(ana, poolId, round2[0].id, exact(1, 0))
    await context.predict(ana, poolId, round3[0].id, exact(2, 2))
    for (const match of round2) await context.predict(bruno, poolId, match.id, result('home'))
    await context.predict(bruno, poolId, round3[0].id, result('draw'))
  }
  const [{ round2, round3 }] = pools
  await context.finish([...round2.map(({ id }) => [id, 'finished', 1, 0]), [round3[0].id, 'finished', 2, 2], [round3[1].id, 'in_progress']])
}

async function joinAll(context, pools, users) {
  for (const pool of pools) for (const user of users) await context.joinPool(pool.admin, user, pool.poolId)
}

async function standardSetup(context) {
  const ana = await context.signUp('Ana')
  const bruno = await context.signUp('Bruno')
  const pool = await scenario(context, 'exact_scores')
  await joinAll(context, [pool], [ana, bruno])
  return { ana, bruno, pool }
}

test('TC-02, TC-03, TC-04 e TC-07: empate em 10 pontos resolvido pelo critério de cada bolão, com última rodada incompleta', async () => {
  await withRanking(async (context) => {
    const ana = await context.signUp('Ana')
    const bruno = await context.signUp('Bruno')
    const pools = [
      await scenario(context, 'exact_scores'),
      await scenario(context, 'correct_results'),
      await scenario(context, 'last_round_points'),
    ]
    await joinAll(context, pools, [ana, bruno])
    await playScenario(context, { ana, bruno }, pools)

    const [byExact, byCorrect, byLastRound] = await Promise.all(pools.map(({ poolId }) => context.get(`/pools/${poolId}/ranking`, ana)))
    assert.deepEqual(byExact.participants.slice(0, 2).map(row), [['Ana', 1, 10, 2], ['Bruno', 2, 10, 0]])
    assert.deepEqual(byCorrect.participants.slice(0, 2).map(row), [['Bruno', 1, 10, 5], ['Ana', 2, 10, 2]])
    assert.deepEqual(byLastRound.participants.slice(0, 2).map(row), [['Ana', 1, 10, 5], ['Bruno', 2, 10, 2]])
    assert.deepEqual([byExact.tiebreaker, byCorrect.tiebreaker, byLastRound.tiebreaker], ['exact_scores', 'correct_results', 'last_round_points'])
    assert.deepEqual(byLastRound.rounds, [{ number: 2, closed: true }, { number: 3, closed: false }])
    assert.deepEqual(byExact.participants.find(({ name }) => name === 'Bruno').roundPoints, [{ round: 2, points: 8 }, { round: 3, points: 2 }])
  })
})

test('TC-08 e TC-09: o ranking reflete correções sem etapa manual, bate com o cálculo independente e não altera dados', async () => {
  await withRanking(async (context) => {
    const { ana, bruno, pool } = await standardSetup(context)
    await playScenario(context, { ana, bruno }, [pool])

    const snapshot = () => JSON.stringify([
      context.database.prepare('SELECT * FROM predictions ORDER BY id').all(),
      context.database.prepare('SELECT * FROM pool_participations ORDER BY id').all(),
      context.database.prepare('SELECT * FROM pools ORDER BY id').all(),
    ])
    const before = snapshot()
    const first = await context.get(`/pools/${pool.poolId}/ranking`, bruno)
    await context.get(`/pools/${pool.poolId}/performance`, bruno)
    assert.equal(snapshot(), before, 'consultas são somente leitura')
    const totals = (body) => Object.fromEntries(body.participants.map(({ name, totalPoints }) => [name, totalPoints]))
    assert.deepEqual(totals(first), independentTotals(context.database, pool.poolId))

    // Correção do 2 a 2 para 2 a 1: Ana perde o exato (5) e Bruno o empate (2).
    await context.finish([[pool.round3[0].id, 'finished', 2, 1]])
    const corrected = await context.get(`/pools/${pool.poolId}/ranking`, bruno)
    assert.deepEqual(corrected.participants.slice(0, 2).map(row), [['Bruno', 1, 8, 0], ['Ana', 2, 5, 1]])
    assert.deepEqual(totals(corrected), independentTotals(context.database, pool.poolId))
  })
})

test('TC-10: desempenho por rodada considera só as partidas selecionadas e indica rodada encerrada', async () => {
  await withRanking(async (context) => {
    const { ana, bruno, pool } = await standardSetup(context)
    await playScenario(context, { ana, bruno }, [pool])

    const roundsOf = async (user) => (await context.get(`/pools/${pool.poolId}/performance`, user)).rounds
    assert.deepEqual(await roundsOf(bruno), [
      { number: 2, points: 8, hits: 4, predictions: 4, finishedMatches: 4, totalMatches: 4, closed: true },
      { number: 3, points: 2, hits: 1, predictions: 1, finishedMatches: 1, totalMatches: 2, closed: false },
    ])
    assert.deepEqual(await roundsOf(ana), [
      { number: 2, points: 5, hits: 1, predictions: 1, finishedMatches: 4, totalMatches: 4, closed: true },
      { number: 3, points: 5, hits: 1, predictions: 1, finishedMatches: 1, totalMatches: 2, closed: false },
    ])
  })
})

test('TC-06, TC-11 e TC-13: só confirmadas entram (inclusive o administrador); sem pontos todos em 1º; bolão encerrado consultável; função interna igual à consulta', async () => {
  await withRanking(async (context) => {
    const { ana, bruno, pool } = await standardSetup(context)
    for (const [name, status] of [['Diego', 'requested'], ['Elisa', 'rejected'], ['Fábio', 'approved_awaiting_payment'], ['Gabi', 'left']]) {
      const id = await context.requestEntry(pool.admin, await context.signUp(name), pool.poolId)
      context.database.prepare('UPDATE pool_participations SET status = ? WHERE id = ?').run(status, id)
    }

    const empty = await context.get(`/pools/${pool.poolId}/ranking`, bruno)
    assert.deepEqual(empty.participants.map(({ name, position, totalPoints }) => [name, position, totalPoints]), [
      ['Admin exact_scores', 1, 0], ['Ana', 1, 0], ['Bruno', 1, 0],
    ])
    assert.deepEqual(empty.participants.map(({ isRequester }) => isRequester), [false, false, true])

    await playScenario(context, { ana, bruno }, [pool])
    const consulted = await context.get(`/pools/${pool.poolId}/ranking`, bruno)
    const internal = context.app.locals.ranking.computeRanking(pool.poolId).ranking
    assert.deepEqual(internal.map(({ id, position, totalPoints }) => [id, position, totalPoints]),
      consulted.participants.map(({ id, position, totalPoints }) => [id, position, totalPoints]))

    context.database.prepare("UPDATE pools SET status = 'ended' WHERE id = ?").run(pool.poolId)
    const ended = await context.get(`/pools/${pool.poolId}/ranking`, ana)
    assert.equal(ended.pool.status, 'ended')
    assert.deepEqual(ended.participants.map(({ id, position }) => [id, position]), consulted.participants.map(({ id, position }) => [id, position]))
  })
})

test('TC-12 e TC-14: acesso restrito, resposta sem e-mail nem palpites alheios, e formato comum dos erros', async () => {
  await withRanking(async (context) => {
    const { ana, bruno, pool } = await standardSetup(context)
    await playScenario(context, { ana, bruno }, [pool])
    const awaiting = await context.signUp('Fábio')
    const awaitingId = await context.requestEntry(pool.admin, awaiting, pool.poolId)
    context.database.prepare("UPDATE pool_participations SET status = 'approved_awaiting_payment' WHERE id = ?").run(awaitingId)
    const leaver = await context.signUp('Gabi')
    const leaverId = await context.joinPool(pool.admin, leaver, pool.poolId)
    context.database.prepare("UPDATE pool_participations SET status = 'left' WHERE id = ?").run(leaverId)

    const response = await context.call('GET', `/pools/${pool.poolId}/ranking`, { token: ana.token })
    assert.equal(/@example\.com|email|homeGoals|outcome|"type"/.test(response.text), false, response.text)

    for (const route of [`/pools/${pool.poolId}/ranking`, `/pools/${pool.poolId}/performance`]) {
      expectCommonFormat(await context.call('GET', route, { token: awaiting.token }), 409, 'participation_not_confirmed')
      expectCommonFormat(await context.call('GET', route, { token: leaver.token }), 404, 'not_found')
      expectCommonFormat(await context.call('GET', route, { token: (await context.signUp()).token }), 404, 'not_found')
      expectCommonFormat(await context.call('GET', route), 401, 'session_rejected')
    }
    expectCommonFormat(await context.call('GET', '/pools/inexistente/ranking', { token: ana.token }), 404, 'not_found')

    context.database.exec('ALTER TABLE predictions RENAME TO predictions_indisponivel')
    expectCommonFormat(await context.call('GET', `/pools/${pool.poolId}/ranking`, { token: ana.token }), 500, 'internal_error')
    context.database.exec('ALTER TABLE predictions_indisponivel RENAME TO predictions')
  })
})
