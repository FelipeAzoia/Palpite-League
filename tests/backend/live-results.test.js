import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { defaultLiveResultsIntervalMs } from '../../src/backend/app.js'
import { createApiFootballSportsProvider } from '../../src/backend/adapters/api-football-sports-provider.js'
import { createSimulatedSportsProvider, SportsProviderError } from '../../src/backend/adapters/simulated-sports-provider.js'
import { billingPolicyVersion } from '../../src/backend/modules/payments-subscriptions/index.js'
import { validateLiveReading } from '../../src/backend/modules/matches-results/index.js'
import { expectCommonFormat, hour, withHttpApp } from './support/app-harness.js'

// SPEC-021 — resultados ao vivo em bolões Premium. Toda a suíte usa o provedor simulado, sem
// credenciais nem rede externa (CA-16, RNF18).

function withLive(callback) {
  const provider = createSimulatedSportsProvider()
  return withHttpApp((context) => callback({ ...context, provider }), { sportsProvider: provider })
}

// Ativa o Premium pelo fluxo real da SPEC-019 com o simulador de pagamentos.
async function becomePremium(context, user) {
  const created = await context.call('POST', '/account/premium/subscription', {
    token: user.token, body: { confirm: true, billingPolicyVersion },
  })
  assert.equal(created.status, 201, created.text)
  const movementId = created.json.subscription.movementId
  const decided = await context.call('POST', `/payments/simulated-checkout/${movementId}/decision`, {
    token: user.token, body: { decision: 'approve' },
  })
  assert.equal(decided.status, 200, decided.text)
  const checked = await context.call('POST', '/account/premium/subscription/check', { token: user.token })
  assert.equal(checked.json.subscription.status, 'active', checked.text)
}

// Bolão Premium (com o recurso) e bolão Gratuito (sem o recurso) com as mesmas partidas.
async function setup(context) {
  const admin = await context.signUp('Ana')
  const member = await context.signUp('Bruno')
  const freeAdmin = await context.signUp('Carla')
  const freePool = await context.createPool(freeAdmin)
  await becomePremium(context, admin)
  const live = await context.createPool(admin)
  await context.joinPool(admin, member, live.poolId)
  await context.joinPool(freeAdmin, member, freePool.poolId)
  const [first, second, third] = live.matches
  return { admin, member, freeAdmin, live, freePool, first, second, third }
}

const refresh = (context) => context.app.locals.tasks.refreshLiveScores()

function providerId(context, matchId) {
  return context.database.prepare('SELECT provider_id FROM sports_matches WHERE id = ?').get(matchId).provider_id
}

function reading(context, matchId, status, homeScore = null, awayScore = null, observedAt) {
  context.provider.setLiveReading(providerId(context, matchId), {
    id: providerId(context, matchId), status, homeScore, awayScore, ...(observedAt ? { observedAt } : {}),
  })
}

function liveRow(context, matchId) {
  return context.database.prepare('SELECT status, home_score, away_score, observed_at, source FROM sports_live_scores WHERE match_id = ?').get(matchId)
}

function officialRow(context, matchId) {
  return context.database.prepare('SELECT status, home_score, away_score, result_version FROM sports_matches WHERE id = ?').get(matchId)
}

const getLive = (context, user, poolId) => context.call('GET', `/pools/${poolId}/live`, { token: user.token })

function iso(context, offsetMs = 0) {
  return new Date(context.clock.current + offsetMs).toISOString()
}

test('CT-01: partida em andamento de bolão com o recurso recebe status e placar parcial com instante UTC', async () => {
  await withLive(async (context) => {
    const { first } = await setup(context)
    context.startMatch(first.id)
    reading(context, first.id, 'in_progress', 1, 0)

    const result = await refresh(context)

    assert.deepEqual(result, { ok: true, queried: 1, updated: 1, discarded: 0, failures: 0 })
    assert.deepEqual(liveRow(context, first.id), {
      status: 'in_progress', home_score: 1, away_score: 0, observed_at: iso(context), source: 'simulated',
    })
  })
})

test('CT-02: participante confirmado vê placar parcial marcado como não oficial e o instante da leitura', async () => {
  await withLive(async (context) => {
    const { member, live, first, second } = await setup(context)
    context.startMatch(first.id)
    reading(context, first.id, 'in_progress', 2, 1)
    await refresh(context)

    const response = await getLive(context, member, live.poolId)

    assert.equal(response.status, 200, response.text)
    assert.equal(response.json.available, true)
    assert.deepEqual(response.json.matches, [
      { id: first.id, status: 'in_progress', score: { home: 2, away: 1 }, official: false, hasData: true, updatedAt: iso(context) },
    ])
    // Partida ainda não iniciada não aparece.
    assert.equal(response.json.matches.some(({ id }) => id === second.id), false)
  })
})

test('CT-03: bolão sem o recurso não grava nem retorna dado parcial e informa indisponibilidade', async () => {
  await withLive(async (context) => {
    const { member } = await setup(context)
    // Bolão Gratuito com partidas de outra rodada, que nenhum bolão Premium seleciona.
    const otherAdmin = await context.signUp('Davi')
    const freePool = await context.createPool(otherAdmin, { round: 3 })
    await context.joinPool(otherAdmin, member, freePool.poolId)
    const [freeMatch] = freePool.matches
    context.startMatch(freeMatch.id)
    reading(context, freeMatch.id, 'in_progress', 1, 1)

    const result = await refresh(context)
    assert.equal(result.queried, 0)
    assert.equal(liveRow(context, freeMatch.id), undefined)

    const response = await getLive(context, member, freePool.poolId)
    assert.equal(response.status, 200)
    assert.deepEqual(response.json, {
      pool: { id: freePool.poolId, name: 'Bolão dos Amigos', status: 'active' },
      available: false,
      reason: 'not_enabled',
      matches: [],
    })
  })
})

test('CT-03b: partida compartilhada com bolão Premium não vaza dado parcial no bolão Gratuito', async () => {
  await withLive(async (context) => {
    const { member, freePool, first } = await setup(context)
    context.startMatch(first.id)
    reading(context, first.id, 'in_progress', 3, 0)
    await refresh(context)

    assert.equal(liveRow(context, first.id).home_score, 3)
    const response = await getLive(context, member, freePool.poolId)
    assert.equal(response.json.available, false)
    assert.deepEqual(response.json.matches, [])
    assert.equal(response.text.includes('"home":3'), false)
  })
})

test('CT-04: dado ao vivo não altera resultado oficial, pontos, ranking, medalhas nem encerramento', async () => {
  await withLive(async (context) => {
    const { live, first } = await setup(context)
    context.startMatch(first.id)
    reading(context, first.id, 'finished', 4, 2)
    const count = (table) => context.database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n
    const before = {
      official: officialRow(context, first.id),
      audits: count('audit_records'),
      pool: context.database.prepare('SELECT status, live_results FROM pools WHERE id = ?').get(live.poolId),
    }

    await refresh(context)
    await context.app.locals.tasks.scorePredictions()
    await context.app.locals.tasks.reconcileMedals()

    assert.deepEqual(officialRow(context, first.id), before.official)
    assert.equal(before.official.result_version, 0)
    // Atualizações ao vivo não são auditadas (OPEN-104).
    assert.equal(count('audit_records'), before.audits)
    assert.deepEqual(context.database.prepare('SELECT status, live_results FROM pools WHERE id = ?').get(live.poolId), before.pool)
    assert.equal(context.app.locals.results.findResultsAfter(0).length, 0)
  })
})

test('CT-05: com resultado oficial, a partida sai da visão ao vivo e o oficial prevalece', async () => {
  await withLive(async (context) => {
    const { member, live, first } = await setup(context)
    context.startMatch(first.id)
    reading(context, first.id, 'in_progress', 1, 1)
    await refresh(context)

    context.provider.setResults({ matches: [{ id: providerId(context, first.id), status: 'finished', homeScore: 2, awayScore: 1 }] })
    await context.app.locals.tasks.syncResults()

    const liveView = await getLive(context, member, live.poolId)
    assert.deepEqual(liveView.json.matches, [])
    const results = await context.call('GET', `/pools/${live.poolId}/results`, { token: member.token })
    const official = results.json.rounds.flatMap(({ matches }) => matches).find(({ id }) => id === first.id)
    assert.deepEqual(official.score, { home: 2, away: 1 })
    // Com o oficial registrado, a partida deixa de ser consultada ao vivo.
    const calls = context.provider.getLiveCalls().length
    await refresh(context)
    assert.equal(context.provider.getLiveCalls().length, calls)
  })
})

test('CT-06: falha, tempo esgotado e resposta inválida mantêm o último dado válido e vão ao log técnico', async () => {
  await withLive(async (context) => {
    const { first } = await setup(context)
    context.startMatch(first.id)
    reading(context, first.id, 'in_progress', 1, 0)
    await refresh(context)
    const kept = liveRow(context, first.id)

    for (const code of ['response_error', 'timeout']) {
      context.clock.current += 60 * 1000
      context.provider.setLiveFailure(new SportsProviderError(code))
      const result = await refresh(context)
      assert.deepEqual(result, { ok: false, queried: 1, updated: 0, discarded: 0, failures: 1 })
      assert.deepEqual(liveRow(context, first.id), kept)
      assert.equal(context.events.some((event) => event.component === 'live-results' && event.result === code), true)
    }

    context.provider.setLiveFailure(null)
    context.clock.current += 60 * 1000
    reading(context, first.id, 'in_progress', -1, 0)
    assert.equal((await refresh(context)).failures, 1)
    assert.deepEqual(liveRow(context, first.id), kept)
    assert.equal(context.events.some((event) => event.component === 'live-results' && event.result === 'invalid_response'), true)
  })
})

test('CT-07: partida em andamento sem leitura válida aparece sem placar e com indicação de ausência', async () => {
  await withLive(async (context) => {
    const { member, live, first } = await setup(context)
    context.startMatch(first.id)
    context.provider.setLiveFailure(new SportsProviderError('timeout'))
    await refresh(context)

    const response = await getLive(context, member, live.poolId)
    assert.deepEqual(response.json.matches, [
      { id: first.id, status: 'in_progress', score: null, official: false, hasData: false, updatedAt: null },
    ])
  })
})

test('CT-08: partida em vários bolões elegíveis é consultada uma única vez por ciclo', async () => {
  await withLive(async (context) => {
    const { admin, first, second } = await setup(context)
    await context.createPool(admin)
    await context.createPool(admin)
    context.startMatch(first.id)
    context.startMatch(second.id)
    reading(context, first.id, 'in_progress', 0, 0)
    reading(context, second.id, 'in_progress', 0, 1)

    await refresh(context)

    const calls = context.provider.getLiveCalls()
    assert.equal(calls.filter((id) => id === providerId(context, first.id)).length, 1)
    assert.equal(calls.filter((id) => id === providerId(context, second.id)).length, 1)
    assert.equal(calls.length, 2)
  })
})

test('CT-09: sem partida elegível, o provedor não é consultado', async () => {
  await withLive(async (context) => {
    await setup(context)
    const result = await refresh(context)
    assert.deepEqual(result, { ok: true, queried: 0, updated: 0, discarded: 0, failures: 0 })
    assert.equal(context.provider.getLiveCalls().length, 0)
  })
})

test('CT-10: partida em andamento fora da seleção do bolão não recebe dado ao vivo', async () => {
  await withLive(async (context) => {
    const { member, live } = await setup(context)
    const outside = context.database.prepare(`
      SELECT id FROM sports_matches WHERE id NOT IN (SELECT match_id FROM pool_matches) AND status = 'scheduled' LIMIT 1
    `).get().id
    context.startMatch(outside)
    reading(context, outside, 'in_progress', 1, 0)

    assert.equal((await refresh(context)).queried, 0)
    assert.equal(liveRow(context, outside), undefined)
    assert.equal((await getLive(context, member, live.poolId)).json.matches.some(({ id }) => id === outside), false)
  })
})

test('CT-11: não autenticado, não participante, aguardando pagamento e quem saiu recebem o mesmo 404', async () => {
  await withLive(async (context) => {
    const { admin, live } = await setup(context)
    const outsider = await context.signUp('Diego')
    const pending = await context.signUp('Eva')
    await context.requestEntry(admin, pending, live.poolId)

    expectCommonFormat(await context.call('GET', `/pools/${live.poolId}/live`), 401, 'session_rejected')
    const outsiderResponse = await getLive(context, outsider, live.poolId)
    expectCommonFormat(outsiderResponse, 404, 'not_found')
    expectCommonFormat(await getLive(context, pending, live.poolId), 404, 'not_found')
    const missing = await getLive(context, outsider, '00000000-0000-4000-8000-000000000000')
    expectCommonFormat(missing, 404, 'not_found')
    assert.equal(missing.json.message, outsiderResponse.json.message)

    // Participação aprovada aguardando pagamento também não vê dado ao vivo.
    const paidAdmin = await context.signUp('Fábio')
    await becomePremium(context, paidAdmin)
    const paidPool = await context.createPool(paidAdmin, { entryFee: 10 })
    const payer = await context.signUp('Gabi')
    const participationId = await context.requestEntry(paidAdmin, payer, paidPool.poolId)
    await context.call('POST', `/pools/${paidPool.poolId}/requests/${participationId}/approve`, { token: paidAdmin.token })
    assert.equal(context.participation(participationId).status, 'approved_awaiting_payment')
    expectCommonFormat(await getLive(context, payer, paidPool.poolId), 404, 'not_found')
  })
})

test('CT-12: leitura mais antiga é descartada e reexecutar o ciclo não duplica dados', async () => {
  await withLive(async (context) => {
    const { first } = await setup(context)
    context.startMatch(first.id)
    reading(context, first.id, 'in_progress', 2, 0, iso(context))
    await refresh(context)
    await refresh(context)
    assert.equal(context.database.prepare('SELECT COUNT(*) AS n FROM sports_live_scores').get().n, 1)

    reading(context, first.id, 'in_progress', 1, 0, iso(context, -60 * 1000))
    const result = await refresh(context)
    assert.equal(result.discarded, 1)
    assert.equal(liveRow(context, first.id).home_score, 2)

    // Queda de placar com instante mais novo é aceita (correção do provedor, OPEN-101).
    reading(context, first.id, 'in_progress', 1, 0, iso(context, 60 * 1000))
    await refresh(context)
    assert.equal(liveRow(context, first.id).home_score, 1)
  })
})

test('CT-13: partida adiada ou cancelada aparece com o status e sem placar', async () => {
  await withLive(async (context) => {
    const { member, live, first, second } = await setup(context)
    context.startMatch(first.id)
    context.startMatch(second.id)
    reading(context, first.id, 'postponed', 1, 1)
    reading(context, second.id, 'cancelled')
    await refresh(context)

    assert.deepEqual(liveRow(context, first.id).home_score, null)
    const { matches } = (await getLive(context, member, live.poolId)).json
    assert.deepEqual(matches.map(({ status, score }) => ({ status, score })), [
      { status: 'postponed', score: null },
      { status: 'cancelled', score: null },
    ])
    // Fechadas ao vivo, deixam de ser consultadas.
    const calls = context.provider.getLiveCalls().length
    await refresh(context)
    assert.equal(context.provider.getLiveCalls().length, calls)
  })
})

test('CT-14: o atributo do recurso ao vivo do bolão permanece inalterado', async () => {
  await withLive(async (context) => {
    const { live, freePool, first } = await setup(context)
    context.startMatch(first.id)
    reading(context, first.id, 'in_progress', 1, 0)
    await refresh(context)
    const flags = context.database.prepare('SELECT id, live_results FROM pools ORDER BY id').all()
    assert.deepEqual(Object.fromEntries(flags.map(({ id, live_results: value }) => [id, value])), {
      [live.poolId]: 1,
      [freePool.poolId]: 0,
    })
  })
})

test('CT-15: a porta ao vivo do API-Football é testada com um fetch falso, sem rede', async () => {
  const requested = []
  const provider = createApiFootballSportsProvider({
    apiKey: 'chave-de-teste',
    fetcher: async (url) => {
      requested.push(String(url))
      return {
        ok: true,
        json: async () => ({ response: [{ fixture: { id: 77, status: { short: '2H' } }, goals: { home: 2, away: 0 } }] }),
      }
    },
  })
  const result = await provider.fetchLiveScore('77')
  assert.equal(requested[0], 'https://v3.football.api-sports.io/fixtures?id=77')
  assert.equal(result.id, '77')
  assert.equal(result.status, 'in_progress')
  assert.deepEqual([result.homeScore, result.awayScore], [2, 0])
  assert.ok(validateLiveReading(result, '77', new Date().toISOString()))
  assert.equal(validateLiveReading({ ...result, id: '78' }, '77', result.observedAt), null)
  assert.equal(validateLiveReading({ ...result, status: 'suspenso' }, '77', result.observedAt), null)
  assert.equal(validateLiveReading({ ...result, homeScore: 1.5 }, '77', result.observedAt), null)
  assert.equal(validateLiveReading({ ...result, homeScore: null }, '77', result.observedAt), null)
})

test('CT-16: logs técnicos do ciclo não contêm credenciais nem placares', async () => {
  await withLive(async (context) => {
    const { first } = await setup(context)
    context.startMatch(first.id)
    context.provider.setLiveFailure(new SportsProviderError('response_error'))
    await refresh(context)
    const logged = JSON.stringify(context.events.filter(({ component }) => component === 'live-results'))
    assert.ok(logged.length > 2)
    assert.equal(/apisports|chave|token|key|secret/i.test(logged), false)
  })
})

test('ciclo com bolão encerrado: só o resultado oficial é exibido (OPEN-102)', async () => {
  await withLive(async (context) => {
    const { member, live, first } = await setup(context)
    context.startMatch(first.id)
    reading(context, first.id, 'in_progress', 1, 0)
    await refresh(context)
    context.database.prepare("UPDATE pools SET status = 'ended' WHERE id = ?").run(live.poolId)
    const response = await getLive(context, member, live.poolId)
    assert.equal(response.json.available, false)
    assert.equal(response.json.reason, 'pool_closed')
    assert.deepEqual(response.json.matches, [])
  })
})

test('intervalo padrão de 1 minuto e tarefa registrada no agendador do processo (OPEN-99)', () => {
  assert.equal(defaultLiveResultsIntervalMs, 60 * 1000)
  const entry = fs.readFileSync(new URL('../../src/backend/index.js', import.meta.url), 'utf8')
  assert.match(entry, /'live-results'/)
  assert.match(entry, /LIVE_RESULTS_INTERVAL_MS/)
})

test('simulador ao vivo: placar parcial cresce durante o jogo e termina no placar final', async () => {
  const start = Date.UTC(2026, 10, 20, 19)
  let clock = start - hour
  const provider = createSimulatedSportsProvider({ now: () => clock })
  const id = 'sim-match-1-4'
  assert.equal((await provider.fetchLiveScore(id)).status, 'scheduled')
  clock = start + 30 * 60 * 1000
  const during = await provider.fetchLiveScore(id)
  assert.equal(during.status, 'in_progress')
  clock = start + 3 * hour
  const after = await provider.fetchLiveScore(id)
  assert.equal(after.status, 'finished')
  assert.ok(during.homeScore <= after.homeScore && during.awayScore <= after.awayScore)
  await assert.rejects(provider.fetchLiveScore('desconhecida'), SportsProviderError)
})
