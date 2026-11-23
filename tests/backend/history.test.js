import assert from 'node:assert/strict'
import test from 'node:test'
import { createSimulatedSportsProvider } from '../../src/backend/adapters/simulated-sports-provider.js'
import { periodEndMs } from '../../src/backend/modules/pools-participations/index.js'
import { expectCommonFormat, hour, withHttpApp } from './support/app-harness.js'

// SPEC-028 — histórico do bolão, com provedor esportivo simulado e relógio controlado.

function withHistory(callback) {
  const sports = createSimulatedSportsProvider()
  return withHttpApp((context) => callback({ ...context, sports }), { sportsProvider: sports })
}

const endsOn = '2026-12-31'
const history = (context, user, poolId, query = '') => context.call('GET', `/pools/${poolId}/history${query}`, { token: user.token })

function providerId(context, matchId) {
  return context.database.prepare('SELECT provider_id FROM sports_matches WHERE id = ?').get(matchId).provider_id
}

// Publica resultados oficiais e pontua (SPEC-013 e 014).
async function publish(context, items) {
  context.sports.setResults({
    matches: items.map(([matchId, status, homeScore = null, awayScore = null]) => ({ id: providerId(context, matchId), status, homeScore, awayScore })),
  })
  await context.app.locals.tasks.syncResults()
  await context.app.locals.tasks.scorePredictions()
}

async function predict(context, user, poolId, matchId, body) {
  const response = await context.call('PUT', `/pools/${poolId}/matches/${matchId}/prediction`, { token: user.token, body })
  assert.equal(response.status, 200, response.text)
}

const exact = (homeGoals, awayGoals) => ({ type: 'exact_score', homeGoals, awayGoals })

// Bolão com duas partidas da rodada 2 (a, b) e duas da rodada 3 (c, d). Ana administra; Bruno e Caio participam.
async function setup(context) {
  const admin = await context.signUp('Ana')
  const bruno = await context.signUp('Bruno')
  const caio = await context.signUp('Caio')
  const fetchRound = async (round) => (await context.call('GET', `/catalog/rounds/${round}/matches?status=scheduled`, { token: admin.token })).json.matches
  const [a, b] = (await fetchRound(2)).slice(0, 2)
  const [c, d] = (await fetchRound(3)).slice(0, 2)
  const created = await context.call('POST', '/pools', {
    token: admin.token,
    body: {
      name: 'Bolão dos Amigos', startsOn: '2026-11-14', endsOn, entryFee: 0, prizeModel: 'winner_takes_all',
      tiebreaker: 'exact_scores', selection: { matchIds: [a.id, b.id, c.id, d.id] },
    },
  })
  assert.equal(created.status, 201, created.text)
  const poolId = created.json.pool.id
  await context.joinPool(admin, bruno, poolId)
  await context.joinPool(admin, caio, poolId)
  // As partidas "começam" uma hora antes do relógio (startMatch): avança para depois das entradas.
  context.clock.current += 2 * hour
  return { admin, bruno, caio, poolId, a, b, c, d }
}

// Rodada 2 jogada: Bruno acerta o placar de a (5) e o resultado de b (2); Caio acerta só b (5).
async function playRoundTwo(context, users) {
  const { bruno, caio, poolId, a, b } = users
  await predict(context, bruno, poolId, a.id, exact(2, 1))
  await predict(context, bruno, poolId, b.id, { type: 'result', outcome: 'draw' })
  await predict(context, caio, poolId, b.id, exact(0, 0))
  context.startMatch(a.id, { status: 'scheduled' })
  context.startMatch(b.id, { status: 'scheduled' })
  await publish(context, [[a.id, 'finished', 2, 1], [b.id, 'finished', 0, 0]])
}

test('CT-01 a CT-04 e CT-14: partidas por rodada, próprio palpite, pontos, acumulado e posição', async () => {
  await withHistory(async (context) => {
    const users = await setup(context)
    await playRoundTwo(context, users)
    const response = await history(context, users.bruno, users.poolId)
    assert.equal(response.status, 200, response.text)
    const body = response.json
    assert.deepEqual(body.rounds.map(({ number }) => number), [2, 3])

    const [two, three] = body.rounds
    assert.equal(two.points, 7)
    assert.equal(two.cumulativePoints, 7)
    assert.equal(two.position, 1)
    assert.equal(two.participants, 3)
    assert.equal(two.closed, true)
    assert.deepEqual(two.matches.map(({ id, result, prediction, points }) => ({ id, result, prediction, points })), [
      { id: users.a.id, result: { home: 2, away: 1 }, prediction: { type: 'exact_score', homeGoals: 2, awayGoals: 1 }, points: 5 },
      { id: users.b.id, result: { home: 0, away: 0 }, prediction: { type: 'result', outcome: 'draw' }, points: 2 },
    ].sort((first, second) => two.matches.findIndex(({ id }) => id === first.id) - two.matches.findIndex(({ id }) => id === second.id)))
    // Ordem determinística: início e depois identificador.
    for (let index = 1; index < two.matches.length; index += 1) {
      const previous = two.matches[index - 1]
      const current = two.matches[index]
      assert.ok(previous.startsAt < current.startsAt || (previous.startsAt === current.startsAt && previous.id < current.id))
    }
    // Rodada 3 ainda não jogada: sem resultado e sem pontos.
    assert.equal(three.points, 0)
    assert.equal(three.cumulativePoints, 7)
    assert.equal(three.closed, false)
    assert.equal(three.matches.every(({ result, points }) => result === null && points === null), true)

    // Consistência com as SPEC-014 e 015 (CT-03).
    const ranking = (await context.call('GET', `/pools/${users.poolId}/ranking`, { token: users.bruno.token })).json
    const own = ranking.participants.find(({ isRequester }) => isRequester)
    assert.equal(body.summary.totalPoints, own.totalPoints)
    assert.equal(body.summary.position, own.position)
    assert.equal(body.totalPoints, body.rounds.reduce((total, round) => total + round.points, 0))

    // Caio não palpitou em a: aparece sem palpite, com zero ponto (CT-04).
    const caioRound = (await history(context, users.caio, users.poolId)).json.rounds[0]
    const noPrediction = caioRound.matches.find(({ id }) => id === users.a.id)
    assert.equal(noPrediction.prediction, null)
    assert.equal(noPrediction.points, 0)
    assert.equal(caioRound.position, 2)
  })
})

test('CT-05 e CT-06: adiada, cancelada e em andamento aparecem só com o status, sem placar parcial', async () => {
  await withHistory(async (context) => {
    const users = await setup(context)
    const { bruno, poolId, a, b, c } = users
    await predict(context, bruno, poolId, a.id, exact(1, 0))
    for (const match of [a, b, c]) context.startMatch(match.id, { status: 'scheduled' })
    await publish(context, [[a.id, 'in_progress'], [b.id, 'cancelled'], [c.id, 'postponed']])
    context.database.prepare("INSERT INTO sports_live_scores VALUES (?, 'in_progress', 3, 3, ?, 'simulated')").run(a.id, new Date(context.clock.current).toISOString())

    const matches = (await history(context, bruno, poolId)).json.rounds.flatMap((round) => round.matches)
    const byId = Object.fromEntries(matches.map((match) => [match.id, match]))
    assert.deepEqual([byId[a.id].status, byId[a.id].result, byId[a.id].points], ['in_progress', null, null])
    assert.deepEqual([byId[b.id].status, byId[b.id].result, byId[b.id].points], ['cancelled', null, null])
    assert.deepEqual([byId[c.id].status, byId[c.id].result, byId[c.id].points], ['postponed', null, null])
    assert.equal(JSON.stringify(matches).includes('"home":3'), false)
  })
})

test('CT-07: resultado corrigido aparece com os pontos atuais', async () => {
  await withHistory(async (context) => {
    const users = await setup(context)
    await playRoundTwo(context, users)
    // Partida da rodada 3 em andamento mantém a sincronização consultando o provedor.
    context.startMatch(users.c.id, { status: 'scheduled' })
    await publish(context, [[users.a.id, 'finished', 0, 2], [users.b.id, 'finished', 0, 0], [users.c.id, 'in_progress']])
    const [two] = (await history(context, users.bruno, users.poolId)).json.rounds
    const match = two.matches.find(({ id }) => id === users.a.id)
    assert.deepEqual(match.result, { home: 0, away: 2 })
    assert.equal(match.points, 0)
    assert.equal(two.points, 2)
    assert.equal(two.position, 2)
  })
})

test('CT-08: bolão encerrado mostra o resultado final congelado', async () => {
  await withHistory(async (context) => {
    const users = await setup(context)
    await playRoundTwo(context, users)
    for (const match of [users.c, users.d]) context.startMatch(match.id, { status: 'scheduled' })
    await publish(context, [[users.c.id, 'finished', 1, 1], [users.d.id, 'cancelled']])
    context.clock.current = periodEndMs(endsOn)
    assert.equal((await context.app.locals.tasks.closePools()).closed, 1)

    const body = (await history(context, users.bruno, users.poolId)).json
    assert.equal(body.summary.final, true)
    assert.equal(body.summary.position, 1)
    assert.equal(body.summary.winner, true)
    assert.equal(body.summary.endedAt, '2027-01-01T00:00:00.000Z')
    assert.equal(body.participation.readOnly, true)
    const frozen = context.database.prepare('SELECT total_points FROM pool_final_standings WHERE participation_id = (SELECT id FROM pool_participations WHERE user_id = ?)').get(users.bruno.id)
    assert.equal(body.summary.totalPoints, frozen.total_points)
  })
})

test('CT-09: quem saiu vê só o período em que participou, em somente leitura', async () => {
  await withHistory(async (context) => {
    const users = await setup(context)
    await playRoundTwo(context, users)
    context.clock.current += hour
    assert.equal((await context.call('POST', `/pools/${users.poolId}/exit`, { token: users.caio.token, body: { confirm: true } })).status, 200)
    const leftAt = context.database.prepare('SELECT left_at FROM pool_participations WHERE user_id = ?').get(users.caio.id).left_at
    assert.equal(leftAt, new Date(context.clock.current).toISOString())

    const body = (await history(context, users.caio, users.poolId)).json
    assert.equal(body.participation.status, 'left')
    assert.equal(body.participation.readOnly, true)
    // Só a rodada 2, jogada antes da saída; a rodada 3 começa depois.
    assert.deepEqual(body.rounds.map(({ number }) => number), [2])
    assert.equal(body.rounds[0].points, 5)
    assert.equal(body.summary.position, null)
    assert.deepEqual((await context.call('GET', '/account/left-pools', { token: users.caio.token })).json.pools.map(({ id }) => id), [users.poolId])
    expectCommonFormat(await context.call('GET', `/pools/${users.poolId}`, { token: users.caio.token }), 404, 'not_found')
  })
})

test('CT-10 e CT-11: aprovado sem confirmação, sem vínculo e sem sessão não acessam', async () => {
  await withHistory(async (context) => {
    const users = await setup(context)
    const outsider = await context.signUp('Duda')
    const fabio = await context.signUp('Fábio')
    const payer = await context.signUp('Edu')
    const paid = await context.createPool(fabio, { entryFee: 10 })
    const participationId = await context.joinPool(fabio, payer, paid.poolId)
    assert.equal(context.participation(participationId).status, 'approved_awaiting_payment')
    expectCommonFormat(await history(context, payer, paid.poolId), 404, 'not_found')

    const own = await history(context, outsider, users.poolId)
    expectCommonFormat(own, 404, 'not_found')
    assert.equal((await history(context, outsider, '00000000-0000-4000-8000-000000000000')).json.message, own.json.message)
    expectCommonFormat(await context.call('GET', `/pools/${users.poolId}/history`), 401, 'session_rejected')
  })
})

test('CT-12 e CT-13: nenhum palpite alheio é exposto e a consulta não altera dados', async () => {
  await withHistory(async (context) => {
    const users = await setup(context)
    await playRoundTwo(context, users)
    const snapshot = () => JSON.stringify(['predictions', 'pool_participations', 'sports_matches', 'pools', 'audit_records']
      .map((table) => context.database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))
    const before = snapshot()
    const body = (await history(context, users.bruno, users.poolId)).json
    assert.equal(snapshot(), before)
    // Caio palpitou 0 a 0 em b; Bruno palpitou empate (resultado). Nada de Caio aparece para Bruno.
    const b = body.rounds[0].matches.find(({ id }) => id === users.b.id)
    assert.deepEqual(b.prediction, { type: 'result', outcome: 'draw' })
    assert.equal(JSON.stringify(body).includes('"name":"Caio"'), false)
  })
})

test('CT-15: paginação e filtro por rodada mantêm os totais', async () => {
  await withHistory(async (context) => {
    const users = await setup(context)
    await playRoundTwo(context, users)
    const page1 = (await history(context, users.bruno, users.poolId, '?pageSize=1')).json
    const page2 = (await history(context, users.bruno, users.poolId, '?pageSize=1&page=2')).json
    assert.deepEqual([page1.rounds[0].number, page2.rounds[0].number], [2, 3])
    assert.equal(page1.totalRounds, 2)
    assert.equal(page2.rounds[0].cumulativePoints, 7)
    const filtered = (await history(context, users.bruno, users.poolId, '?round=3')).json
    assert.deepEqual(filtered.rounds.map(({ number }) => number), [3])
    assert.equal(filtered.rounds[0].cumulativePoints, 7)
    assert.equal(filtered.totalPoints, 7)
    expectCommonFormat(await history(context, users.bruno, users.poolId, '?pageSize=999'), 400, 'validation_error')
    expectCommonFormat(await history(context, users.bruno, users.poolId, '?round=abc'), 400, 'validation_error')
  })
})

test('CT-16: entrada tardia não lista as partidas iniciadas antes da confirmação', async () => {
  await withHistory(async (context) => {
    const users = await setup(context)
    // Partida a começa; Duda entra depois.
    context.startMatch(users.a.id, { status: 'in_progress' })
    const duda = await context.signUp('Duda')
    await context.joinPool(users.admin, duda, users.poolId)
    const ids = (await history(context, duda, users.poolId)).json.rounds.flatMap(({ matches }) => matches.map(({ id }) => id))
    assert.equal(ids.includes(users.a.id), false)
    assert.ok(ids.includes(users.b.id))
  })
})

test('CT-17: volume realista responde rápido', async () => {
  await withHistory(async (context) => {
    const admin = await context.signUp('Ana')
    const matchIds = []
    for (let round = 1; round <= 38; round += 1) {
      const matches = (await context.call('GET', `/catalog/rounds/${round}/matches`, { token: admin.token })).json.matches
      matchIds.push(...matches.filter(({ status }) => status === 'scheduled').map(({ id }) => id))
    }
    const created = await context.call('POST', '/pools', {
      token: admin.token,
      body: { name: 'Temporada', startsOn: '2026-11-14', endsOn: '2027-12-31', entryFee: 0, prizeModel: 'winner_takes_all', tiebreaker: 'exact_scores', selection: { matchIds } },
    })
    assert.equal(created.status, 201, created.text)
    const started = performance.now()
    const response = await history(context, admin, created.json.pool.id, '?pageSize=50')
    const elapsed = performance.now() - started
    assert.equal(response.status, 200)
    assert.ok(response.json.totalRounds >= 30)
    assert.ok(elapsed < 1000, `${elapsed} ms`)
  })
})
