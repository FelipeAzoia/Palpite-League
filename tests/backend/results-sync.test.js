import assert from 'node:assert/strict'
import test from 'node:test'
import { auditDetailSchemas, defaultResultsSyncIntervalMs } from '../../src/backend/app.js'
import { createApiFootballSportsProvider } from '../../src/backend/adapters/api-football-sports-provider.js'
import { createSimulatedSportsProvider, SportsProviderError } from '../../src/backend/adapters/simulated-sports-provider.js'
import { createResultsSyncService } from '../../src/backend/modules/matches-results/index.js'
import { createAuditStore } from '../../src/backend/modules/notifications-audit/index.js'
import { createScheduler } from '../../src/backend/shared/scheduler.js'
import { expectCommonFormat, hour, withHttpApp } from './support/app-harness.js'

// Provedor simulado com respostas de resultados controladas por teste (RNF18).
function withResults(callback) {
  const provider = createSimulatedSportsProvider()
  return withHttpApp((context) => callback({ ...context, provider }), { sportsProvider: provider })
}

async function setup(context) {
  const admin = await context.signUp('Ana')
  const member = await context.signUp('Bruno')
  const pool = await context.createPool(admin)
  await context.joinPool(admin, member, pool.poolId)
  const [first, second, third] = pool.matches
  return { admin, member, first, second, third, ...pool }
}

const sync = (context) => context.app.locals.tasks.syncResults()

function providerId(context, matchId) {
  return context.database.prepare('SELECT provider_id FROM sports_matches WHERE id = ?').get(matchId).provider_id
}

function stored(context, matchId) {
  return context.database.prepare(`
    SELECT status, home_score, away_score, result_version FROM sports_matches WHERE id = ?
  `).get(matchId)
}

// Começa a partida (início no passado), mantendo-a agendada como o catálogo a deixaria.
function kickOff(context, ...matchIds) {
  for (const id of matchIds) context.startMatch(id, { status: 'scheduled' })
}

function report(context, items) {
  context.provider.setResults({
    matches: items.map(([matchId, status, homeScore = null, awayScore = null]) => ({
      id: providerId(context, matchId), status, homeScore, awayScore,
    })),
  })
}

function audits(context, action) {
  return context.database.prepare('SELECT * FROM audit_records WHERE action = ? ORDER BY id').all(action)
    .map((row) => ({ ...row, details: row.details_json === null ? null : JSON.parse(row.details_json) }))
}

function matchAudits(context) {
  return context.database.prepare("SELECT COUNT(*) AS count FROM audit_records WHERE action LIKE 'match.%'").get().count
}

test('TC-01: partida encerrada recebe placar oficial, versão e auditoria com o sistema como ator, em UTC', async () => {
  await withResults(async (context) => {
    const { first } = await setup(context)
    kickOff(context, first.id)
    report(context, [[first.id, 'finished', 2, 1]])

    const result = await sync(context)

    assert.deepEqual(result, { ok: true, queried: true, statusChanges: 0, recorded: 1, corrected: 0, divergences: 0 })
    assert.deepEqual(stored(context, first.id), { status: 'finished', home_score: 2, away_score: 1, result_version: 1 })
    const [record] = audits(context, 'match.result_recorded')
    assert.equal(record.result, 'success')
    assert.equal(record.actor_type, 'system')
    assert.equal(record.actor_id, null)
    assert.equal(record.object_type, 'match')
    assert.equal(record.object_id, first.id)
    assert.deepEqual(record.details, { previousStatus: 'scheduled', newStatus: 'finished', newScore: '2-1' })
    assert.equal(new Date(record.occurred_at).toISOString(), record.occurred_at)
  })
})

test('TC-02: em andamento não grava placar parcial; encerrada sem placar mantém os dados', async () => {
  await withResults(async (context) => {
    const { first, second } = await setup(context)
    kickOff(context, first.id, second.id)
    report(context, [[first.id, 'in_progress', 1, 0], [second.id, 'finished']])

    await sync(context)

    assert.deepEqual(stored(context, first.id), { status: 'in_progress', home_score: null, away_score: null, result_version: 0 })
    assert.deepEqual(stored(context, second.id), { status: 'scheduled', home_score: null, away_score: null, result_version: 0 })
    assert.deepEqual(audits(context, 'match.status_synced').map(({ details }) => details), [{ previousStatus: 'scheduled', newStatus: 'in_progress' }])
  })
})

test('TC-03: adiada e cancelada são gravadas; encerrada não regride quando o provedor informa em andamento', async () => {
  await withResults(async (context) => {
    const { first, second, third } = await setup(context)
    kickOff(context, first.id, second.id, third.id)
    report(context, [[first.id, 'postponed'], [second.id, 'cancelled'], [third.id, 'finished', 1, 1]])
    await sync(context)
    assert.equal(stored(context, first.id).status, 'postponed')
    assert.equal(stored(context, second.id).status, 'cancelled')
    assert.equal(stored(context, third.id).status, 'finished')

    report(context, [[first.id, 'postponed'], [third.id, 'in_progress']])
    await sync(context)
    assert.deepEqual(stored(context, third.id), { status: 'finished', home_score: 1, away_score: 1, result_version: 1 })
  })
})

test('TC-04: tempo esgotado, erro e resposta inválida preservam os dados, indicam a falha e a execução seguinte recupera', async () => {
  await withResults(async (context) => {
    const { member, first, poolId } = await setup(context)
    kickOff(context, first.id)
    report(context, [[first.id, 'finished', 3, 0]])

    const failures = [
      ['timeout', () => context.provider.setResultsFailure(new SportsProviderError('timeout'))],
      ['response_error', () => context.provider.setResultsFailure(new Error('conexão recusada'))],
      ['invalid_response', () => { context.provider.setResultsFailure(null); context.provider.setResults({ matches: 'quebrado' }) }],
    ]
    for (const [code, inject] of failures) {
      inject()
      assert.deepEqual(await sync(context), { ok: false, failure: code })
      assert.deepEqual(stored(context, first.id), { status: 'scheduled', home_score: null, away_score: null, result_version: 0 })
      assert.ok(context.events.some((event) => event.component === 'results-sync' && event.result === code && event.level === 'error'))
      const results = await context.call('GET', `/pools/${poolId}/results`, { token: member.token })
      assert.equal(results.json.sync.lastAttemptFailed, true)
    }
    assert.deepEqual(audits(context, 'results.sync_failed').map(({ result, actor_type: actor, details }) => [result, actor, details.reason]), [
      ['failure', 'system', 'timeout'],
      ['failure', 'system', 'response_error'],
      ['failure', 'system', 'invalid_response'],
    ])

    report(context, [[first.id, 'finished', 3, 0]])
    assert.equal((await sync(context)).recorded, 1)
    assert.equal(stored(context, first.id).status, 'finished')
    const results = await context.call('GET', `/pools/${poolId}/results`, { token: member.token })
    assert.equal(results.json.sync.lastAttemptFailed, false)
  })
})

test('TC-05: repetir a sincronização com os mesmos dados não altera partidas, versões nem auditoria', async () => {
  await withResults(async (context) => {
    const { first, second } = await setup(context)
    kickOff(context, first.id, second.id)
    report(context, [[first.id, 'finished', 2, 2], [second.id, 'in_progress']])
    await sync(context)
    const before = [stored(context, first.id), stored(context, second.id), matchAudits(context)]

    const again = await sync(context)

    assert.deepEqual(again, { ok: true, queried: true, statusChanges: 0, recorded: 0, corrected: 0, divergences: 0 })
    assert.deepEqual([stored(context, first.id), stored(context, second.id), matchAudits(context)], before)
  })
})

test('TC-06: com o intervalo padrão de 10 minutos, o resultado é refletido em até 15 minutos', async () => {
  await withResults(async (context) => {
    const { first } = await setup(context)
    kickOff(context, first.id)
    const timers = []
    const scheduler = createScheduler({ setTimer: (callback, delay) => { timers.push({ callback, delay }); return timers.length }, clearTimer() {} })
    scheduler.register('results-sync', defaultResultsSyncIntervalMs, context.app.locals.tasks.syncResults)

    report(context, [[first.id, 'in_progress']])
    await scheduler.start()
    // O resultado final fica disponível no provedor logo após a execução inicial.
    report(context, [[first.id, 'finished', 1, 0]])
    const availableAt = context.clock.current
    assert.equal(timers.at(-1).delay, 10 * 60 * 1000)
    context.clock.current += timers.at(-1).delay
    await timers.at(-1).callback()

    assert.equal(stored(context, first.id).status, 'finished')
    assert.ok(context.clock.current - availableAt <= 15 * 60 * 1000)
    scheduler.stop()
  })
})

test('TC-07 e TC-15: correção com bolão ativo atualiza o placar e a versão; o gatilho lê só as partidas novas', async () => {
  await withResults(async (context) => {
    const { first, second, third } = await setup(context)
    kickOff(context, first.id, second.id, third.id)
    report(context, [[first.id, 'finished', 2, 1], [second.id, 'finished', 0, 0], [third.id, 'in_progress']])
    await sync(context)
    const results = context.app.locals.results
    assert.equal(results.findResultsAfter(0).length, 2)
    const processed = Math.max(...results.findResultsAfter(0).map(({ resultVersion }) => resultVersion))

    report(context, [[first.id, 'finished', 3, 1], [second.id, 'finished', 0, 0], [third.id, 'in_progress']])
    const corrected = await sync(context)

    assert.equal(corrected.corrected, 1)
    assert.deepEqual(stored(context, first.id), { status: 'finished', home_score: 3, away_score: 1, result_version: processed + 1 })
    assert.deepEqual(audits(context, 'match.result_corrected').map(({ details }) => details), [{ previousScore: '2-1', newScore: '3-1' }])
    assert.deepEqual(results.findResultsAfter(processed), [{
      matchId: first.id, homeScore: 3, awayScore: 1, resultVersion: processed + 1, recordedAt: new Date(context.clock.current).toISOString(),
    }])
  })
})

test('TC-08: correção de partida só de bolões encerrados não muda o placar e audita a divergência uma vez', async () => {
  await withResults(async (context) => {
    const { first } = await setup(context)
    // Outro bolão ativo mantém partidas a acompanhar, para que o provedor seja consultado.
    const other = await context.signUp('Carla')
    const otherPool = await context.createPool(other, { round: 3 })
    kickOff(context, first.id, otherPool.matches[0].id)
    report(context, [[first.id, 'finished', 2, 1]])
    await sync(context)
    context.database.prepare("UPDATE pools SET status = 'ended' WHERE id = (SELECT pool_id FROM pool_matches WHERE match_id = ?)").run(first.id)

    report(context, [[first.id, 'finished', 0, 1], [otherPool.matches[0].id, 'in_progress']])
    assert.equal((await sync(context)).divergences, 1)
    assert.equal((await sync(context)).divergences, 0)

    assert.deepEqual(stored(context, first.id), { status: 'finished', home_score: 2, away_score: 1, result_version: 1 })
    assert.deepEqual(audits(context, 'match.result_divergence').map(({ details }) => details), [{ receivedScore: '0-1', keptScore: '2-1' }])
  })
})

test('TC-09: sem partidas a acompanhar não consulta o provedor; com várias, consulta uma vez; ignora partidas fora de bolão ativo', async () => {
  await withResults(async (context) => {
    const { first, second, admin } = await setup(context)
    const before = context.provider.getResultCallCount()
    assert.deepEqual(await sync(context), { ok: true, queried: false, statusChanges: 0, recorded: 0, corrected: 0, divergences: 0 })
    assert.equal(context.provider.getResultCallCount(), before)

    const outside = (await context.call('GET', '/catalog/rounds/5/matches', { token: admin.token })).json.matches[0]
    kickOff(context, first.id, second.id, outside.id)
    report(context, [[first.id, 'in_progress'], [second.id, 'in_progress'], [outside.id, 'finished', 4, 4]])
    await sync(context)

    assert.equal(context.provider.getResultCallCount(), before + 1)
    assert.equal(stored(context, first.id).status, 'in_progress')
    assert.deepEqual(stored(context, outside.id), { status: 'scheduled', home_score: null, away_score: null, result_version: 0 })
  })
})

test('TC-10: nenhuma operação exposta escreve resultado e tentativas diretas do administrador não têm efeito', async () => {
  await withResults(async (context) => {
    const { admin, first, poolId } = await setup(context)
    const router = context.app.router ?? context.app._router
    const writes = router.stack.filter((layer) => layer.route)
      .flatMap((layer) => Object.keys(layer.route.methods).filter((method) => method !== 'get').map((method) => `${method} ${layer.route.path}`))
    assert.equal(writes.some((route) => /result|score|status|catalog|sports/.test(route)), false, writes.join('\n'))
    assert.deepEqual(writes.filter((route) => route.includes('/matches')), ['put /pools/:poolId/matches/:matchId/prediction'])

    const before = stored(context, first.id)
    const body = { status: 'finished', homeScore: 9, awayScore: 0 }
    for (const [method, route] of [
      ['PUT', `/pools/${poolId}/matches/${first.id}/result`],
      ['PATCH', `/pools/${poolId}/matches/${first.id}`],
      ['POST', `/pools/${poolId}/results`],
      ['PATCH', `/catalog/rounds/2/matches/${first.id}`],
    ]) {
      expectCommonFormat(await context.call(method, route, { token: admin.token, body }), 404, 'not_found')
    }
    assert.deepEqual(stored(context, first.id), before)
  })
})

test('TC-11 e TC-12: o agendador roda ao iniciar, não sobrepõe execuções e continua depois de uma falha', async () => {
  const timers = []
  const events = []
  const scheduler = createScheduler({
    logger: { error: (component, result) => events.push([component, result]) },
    setTimer: (callback, delay) => { timers.push({ callback, delay }); return timers.length },
    clearTimer() {},
  })
  let runs = 0
  let release
  let failNext = false
  scheduler.register('lenta', 1000, async () => {
    runs += 1
    if (failNext) {
      failNext = false
      throw new Error('falha da execução')
    }
    await new Promise((resolve) => { release = resolve })
    return runs
  })

  const initial = scheduler.start()
  assert.equal(runs, 1, 'executa logo ao iniciar')
  const concurrent = scheduler.runNow('lenta')
  assert.equal(runs, 1, 'não sobrepõe a execução em andamento')
  assert.equal(timers.length, 0, 'o próximo disparo só é agendado quando a execução termina')
  release()
  assert.deepEqual(await initial, [1])
  assert.equal(await concurrent, 1)
  assert.deepEqual(timers.map(({ delay }) => delay), [1000])

  failNext = true
  await timers[0].callback()
  assert.deepEqual(events, [['scheduler', 'task_failed']])
  assert.equal(timers.length, 2, 'a falha não impede o agendamento seguinte')

  const next = timers[1].callback()
  release()
  await next
  assert.equal(runs, 3)
  scheduler.stop()
})

test('TC-13: falha na gravação ou na auditoria não altera partidas e a execução é tratada como falha', async () => {
  await withResults(async (context) => {
    const { first, second } = await setup(context)
    kickOff(context, first.id, second.id)
    report(context, [[first.id, 'finished', 1, 0], [second.id, 'in_progress']])

    context.database.exec(`
      CREATE TRIGGER fail_result_audit BEFORE INSERT ON audit_records
      WHEN NEW.action LIKE 'match.%' AND NEW.result = 'success'
      BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;
    `)
    assert.deepEqual(await sync(context), { ok: false, failure: 'persistence_error' })
    context.database.exec('DROP TRIGGER fail_result_audit')

    context.database.exec(`
      CREATE TRIGGER fail_result_write BEFORE UPDATE OF home_score ON sports_matches
      BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;
    `)
    assert.deepEqual(await sync(context), { ok: false, failure: 'persistence_error' })

    for (const id of [first.id, second.id]) {
      assert.deepEqual(stored(context, id), { status: 'scheduled', home_score: null, away_score: null, result_version: 0 })
    }
    assert.equal(context.database.prepare("SELECT COUNT(*) AS count FROM audit_records WHERE action LIKE 'match.%' AND result = 'success'").get().count, 0)
    assert.equal(audits(context, 'results.sync_failed').length, 2)
  })
})

test('TC-14: item inválido de partida acompanhada rejeita a resposta inteira; de partida não acompanhada é ignorado', async () => {
  await withResults(async (context) => {
    const { first, second } = await setup(context)
    kickOff(context, first.id, second.id)

    for (const invalid of [
      { id: providerId(context, second.id), status: 'desconhecido' },
      { id: providerId(context, second.id), status: 'finished', homeScore: -1, awayScore: 0 },
      { id: providerId(context, second.id), status: 'finished', homeScore: 2, awayScore: null },
      { id: providerId(context, second.id), status: 'finished', homeScore: 1.5, awayScore: 0 },
    ]) {
      context.provider.setResults({ matches: [{ id: providerId(context, first.id), status: 'finished', homeScore: 1, awayScore: 0 }, invalid] })
      assert.deepEqual(await sync(context), { ok: false, failure: 'invalid_response' })
      assert.equal(stored(context, first.id).status, 'scheduled')
    }

    context.provider.setResults({ matches: [
      { id: providerId(context, first.id), status: 'finished', homeScore: 1, awayScore: 0 },
      { id: 'partida-desconhecida', status: 'desconhecido', homeScore: 'x' },
      { status: 'finished' },
    ] })
    assert.equal((await sync(context)).recorded, 1)
    assert.equal(stored(context, first.id).status, 'finished')
  })
})

test('TC-16, TC-17 e TC-18: membros consultam status e placar só das encerradas; não membro 404 e sem sessão 401', async () => {
  await withResults(async (context) => {
    const { admin, member, first, second, third, poolId } = await setup(context)
    const awaiting = await context.signUp('Diego')
    const awaitingId = await context.requestEntry(admin, awaiting, poolId)
    context.database.prepare("UPDATE pool_participations SET status = 'approved_awaiting_payment' WHERE id = ?").run(awaitingId)
    kickOff(context, first.id, second.id)
    report(context, [[first.id, 'finished', 2, 0], [second.id, 'in_progress', 1, 1]])
    await sync(context)

    for (const user of [admin, member, awaiting]) {
      const response = await context.call('GET', `/pools/${poolId}/results`, { token: user.token })
      assert.equal(response.status, 200, response.text)
      const byId = Object.fromEntries(response.json.rounds.flatMap(({ matches }) => matches).map((match) => [match.id, match]))
      assert.deepEqual([byId[first.id].status, byId[first.id].score], ['finished', { home: 2, away: 0 }])
      assert.deepEqual([byId[second.id].status, byId[second.id].score], ['in_progress', null])
      assert.deepEqual([byId[third.id].status, byId[third.id].score], ['scheduled', null])
      assert.equal(response.json.sync.lastAttemptFailed, false)
      assert.equal(response.json.sync.lastSuccessAt, new Date(context.clock.current).toISOString())
      // Mesmo estado persistido e mesmo estado no gatilho da pontuação (RNF03).
      const [trigger] = context.app.locals.results.findResultsAfter(0)
      assert.deepEqual({ home: trigger.homeScore, away: trigger.awayScore }, byId[first.id].score)
    }

    expectCommonFormat(await context.call('GET', `/pools/${poolId}/results`, { token: (await context.signUp('Elisa')).token }), 404, 'not_found')
    expectCommonFormat(await context.call('GET', '/pools/inexistente/results', { token: member.token }), 404, 'not_found')
    expectCommonFormat(await context.call('GET', `/pools/${poolId}/results`), 401, 'session_rejected')
  })
})

test('TC-19: a chave do fornecedor não aparece em registros técnicos nem na auditoria, com sucesso ou falha', async () => {
  await withResults(async (context) => {
    const { first, second } = await setup(context)
    kickOff(context, first.id, second.id)
    const secret = 'chave-super-secreta-123'
    let failing = false
    const fetcher = async (_url, options) => {
      assert.equal(options.headers['x-apisports-key'], secret)
      if (failing) throw new Error(`falha com ${secret}`)
      return {
        ok: true,
        json: async () => ({
          errors: [],
          response: [
            { fixture: { id: providerId(context, first.id), status: { short: 'FT' } }, goals: { home: 1, away: 2 } },
            { fixture: { id: providerId(context, second.id), status: { short: '2H' } }, goals: { home: 0, away: 0 } },
          ],
        }),
      }
    }
    const provider = createApiFootballSportsProvider({ apiKey: secret, fetcher })
    const auditStore = createAuditStore(context.database, { logger: context.logger, detailSchemasByAction: auditDetailSchemas })
    const service = createResultsSyncService(context.database, provider, { auditStore, logger: context.logger, now: () => context.clock.current })

    assert.equal((await service.syncResults()).recorded, 1)
    assert.deepEqual(stored(context, first.id), { status: 'finished', home_score: 1, away_score: 2, result_version: 1 })
    assert.equal(stored(context, second.id).status, 'in_progress')
    failing = true
    assert.deepEqual(await service.syncResults(), { ok: false, failure: 'response_error' })

    const auditText = JSON.stringify(context.database.prepare('SELECT * FROM audit_records').all())
    assert.equal(auditText.includes(secret), false)
    assert.equal(JSON.stringify(context.events).includes(secret), false)
  })
})

test('provedor simulado padrão encerra partidas pelo relógio, com placar determinístico', async () => {
  let clock = Date.parse('2026-11-23T19:00:00.000Z')
  const provider = createSimulatedSportsProvider({ now: () => clock })
  const catalog = await provider.fetchCatalog(2026)
  const match = catalog.matches.find(({ startsAt }) => startsAt === '2026-11-23T19:00:00.000Z')

  const status = async () => (await provider.fetchResults(2026)).matches.find(({ id }) => id === match.id)
  assert.equal((await status()).status, 'in_progress')
  clock += 2 * hour
  const finished = await status()
  assert.equal(finished.status, 'finished')
  assert.ok(Number.isInteger(finished.homeScore) && Number.isInteger(finished.awayScore))
  assert.deepEqual(await status(), finished)
})
