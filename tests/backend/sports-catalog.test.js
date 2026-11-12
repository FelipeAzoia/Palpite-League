import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { createApiFootballSportsProvider } from '../../src/backend/adapters/api-football-sports-provider.js'
import { createSimulatedSportsProvider } from '../../src/backend/adapters/simulated-sports-provider.js'
import { createApp } from '../../src/backend/app.js'
import { createSportsCatalogService } from '../../src/backend/modules/matches-results/index.js'
import { SportsProviderError } from '../../src/backend/modules/matches-results/sports-provider.js'
import { createDatabase } from '../../src/backend/shared/database.js'
import { createLogger } from '../../src/backend/shared/logger.js'
import { runMigrations } from '../../src/backend/shared/migrations.js'

const password = 'senha-segura-123'

async function withHttpApp({ provider = createSimulatedSportsProvider(), now = Date.now, ttlMs = 6 * 60 * 60 * 1000 } = {}, callback) {
  const database = createDatabase(':memory:')
  runMigrations(database)
  const events = []
  const logger = createLogger((event) => events.push(event))
  const server = createServer(createApp(database, {
    logger,
    now,
    sportsProvider: provider,
    sportsCatalogTtlMs: ttlMs,
  }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`

  async function call(route, token, options = {}) {
    const response = await fetch(`${origin}${route}`, {
      ...options,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
    return { status: response.status, headers: response.headers, text: await response.text() }
  }

  async function signUp() {
    const registration = await call('/auth/register', null, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ana', email: 'ana@example.com', password }),
    })
    assert.equal(registration.status, 201)
    const login = await call('/auth/login', null, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ana@example.com', password }),
    })
    return JSON.parse(login.text).token
  }

  try {
    await callback({ call, signUp, database, events, provider })
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    database.close()
  }
}

function getCatalogRows(database) {
  return {
    teams: database.prepare('SELECT id, provider_id, name, crest FROM sports_teams ORDER BY provider_id').all(),
    rounds: database.prepare('SELECT id, provider_id, number, starts_on, ends_on FROM sports_rounds ORDER BY number').all(),
    matches: database.prepare('SELECT id, provider_id, round_id, home_team_id, away_team_id, starts_at, status FROM sports_matches ORDER BY provider_id').all(),
  }
}

test('TC-01/18: primeira consulta persiste 20 times, 38 rodadas e 380 partidas simuladas', async () => {
  await withHttpApp({}, async ({ call, signUp, database, provider }) => {
    const token = await signUp()
    const response = await call('/catalog/rounds', token)
    const body = JSON.parse(response.text)

    assert.equal(response.status, 200)
    assert.equal(body.rounds.length, 38)
    assert.equal(body.rounds.reduce((total, round) => total + round.matchCount, 0), 380)
    assert.equal(body.source, 'simulated')
    assert.equal(body.lastAttemptFailed, false)
    assert.ok(body.lastUpdatedAt)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM sports_teams').get().count, 20)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM sports_rounds').get().count, 38)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM sports_matches').get().count, 380)
    assert.equal(provider.getCallCount(), 1)

    const roundOne = JSON.parse((await call('/catalog/rounds/1/matches', token)).text)
    assert.equal(roundOne.matches.length, 10)
    assert.equal(roundOne.matches.find(({ status }) => status === 'postponed').startsAt, null)
    assert.equal(roundOne.matches[0].home.name.startsWith('Clube Simulado '), true)
    const cancelled = JSON.parse((await call('/catalog/rounds/20/matches?status=cancelled', token)).text)
    assert.equal(cancelled.matches.length, 1)
    assert.equal(cancelled.matches[0].status, 'cancelled')
    assert.match(database.prepare("SELECT starts_at FROM sports_matches WHERE status = 'scheduled' LIMIT 1").get().starts_at, /Z$/)
  })
})

test('TC-02/12/14: consultas autenticadas filtram status e retornam erros comuns', async () => {
  await withHttpApp({}, async ({ call, signUp, provider }) => {
    const token = await signUp()
    const anonymous = await call('/catalog/rounds')
    assert.equal(anonymous.status, 401)
    assert.equal(JSON.parse(anonymous.text).type, 'session_rejected')
    assert.equal(provider.getCallCount(), 0)

    const scheduled = await call('/catalog/rounds/1/matches?status=scheduled', token)
    assert.equal(scheduled.status, 200)
    assert.equal(JSON.parse(scheduled.text).matches.length, 9)

    const invalidStatus = await call('/catalog/rounds/1/matches?status=unknown', token)
    assert.equal(invalidStatus.status, 400)
    assert.equal(JSON.parse(invalidStatus.text).type, 'validation_error')
    const missingRound = await call('/catalog/rounds/99/matches', token)
    assert.equal(missingRound.status, 404)
    assert.equal(JSON.parse(missingRound.text).type, 'not_found')
  })
})

test('TC-03/04/05: janela de validade, atualização idempotente e identificadores estáveis', async () => {
  let currentTime = Date.UTC(2026, 10, 12, 12)
  await withHttpApp({ now: () => currentTime, ttlMs: 1000 }, async ({ call, signUp, database, provider }) => {
    const token = await signUp()
    await call('/catalog/rounds', token)
    const initial = getCatalogRows(database)
    await call('/catalog/rounds', token)
    assert.equal(provider.getCallCount(), 1)
    assert.deepEqual(getCatalogRows(database), initial)

    currentTime += 1001
    await call('/catalog/rounds', token)
    assert.equal(provider.getCallCount(), 2)
    assert.deepEqual(getCatalogRows(database), initial)
  })
})

test('metadados distinguem o início da tentativa do momento de sucesso', async () => {
  let currentTime = Date.UTC(2026, 10, 12, 12)
  const fixtureProvider = createSimulatedSportsProvider()
  const provider = {
    source: 'simulated',
    async fetchCatalog(season) {
      const catalog = await fixtureProvider.fetchCatalog(season)
      currentTime += 5000
      return catalog
    },
  }

  await withHttpApp({ provider, now: () => currentTime }, async ({ call, signUp }) => {
    const token = await signUp()
    const body = JSON.parse((await call('/catalog/rounds', token)).text)
    assert.equal(Date.parse(body.lastUpdatedAt) - Date.parse(body.lastAttemptAt), 5000)
  })
})

test('TC-06/19/20: atualiza partidas remarcáveis sem alterar partidas em andamento ou encerradas', async () => {
  let currentTime = Date.UTC(2026, 10, 12, 12)
  const provider = createSimulatedSportsProvider()
  await withHttpApp({ provider, now: () => currentTime, ttlMs: 1000 }, async ({ call, signUp, database }) => {
    const token = await signUp()
    await call('/catalog/rounds', token)
    const before = provider.getCallCount()
    const catalog = await provider.fetchCatalog(2026)
    const changed = structuredClone(catalog)
    const rescheduled = changed.matches.find(({ id, roundId, status }) => id !== catalog.matches[0].id && roundId === 'sim-round-1' && status === 'scheduled')
    const newStart = new Date(Date.parse(rescheduled.startsAt) + 60 * 60 * 1000).toISOString()
    rescheduled.startsAt = newStart
    const delayed = changed.matches.find(({ id, roundId, status }) => id !== catalog.matches[0].id && id !== rescheduled.id && roundId === 'sim-round-1' && status === 'scheduled')
    delayed.startsAt = null
    delayed.status = 'postponed'

    const protectedMatch = changed.matches.find(({ id, roundId, status }) => roundId === 'sim-round-1' && status === 'scheduled' && id !== rescheduled.id && id !== delayed.id)
    database.prepare("UPDATE sports_matches SET status = 'in_progress' WHERE provider_id = ?").run(protectedMatch.id)
    const protectedStart = database.prepare('SELECT starts_at FROM sports_matches WHERE provider_id = ?').get(protectedMatch.id).starts_at
    const cancelable = changed.matches.find(({ id, roundId, status }) => roundId === 'sim-round-1' && status === 'scheduled' && id !== rescheduled.id && id !== delayed.id && id !== protectedMatch.id)
    cancelable.status = 'cancelled'

    provider.setCatalog(changed)
    currentTime += 1001
    const response = await call('/catalog/rounds', token)
    assert.equal(response.status, 200)
    assert.equal(provider.getCallCount(), before + 2)

    const updated = database.prepare('SELECT starts_at, status FROM sports_matches WHERE provider_id = ?').get(rescheduled.id)
    assert.deepEqual(updated, { starts_at: newStart, status: 'scheduled' })
    const postponed = database.prepare('SELECT starts_at, status FROM sports_matches WHERE provider_id = ?').get(delayed.id)
    assert.deepEqual(postponed, { starts_at: null, status: 'postponed' })
    const unchanged = database.prepare('SELECT starts_at, status FROM sports_matches WHERE provider_id = ?').get(protectedMatch.id)
    assert.deepEqual(unchanged, { starts_at: protectedStart, status: 'in_progress' })
    assert.equal(database.prepare('SELECT status FROM sports_matches WHERE provider_id = ?').get(cancelable.id).status, 'cancelled')
    assert.equal(newStart > catalog.matches[1].startsAt, true)
  })
})

test('TC-07/08/10/17: falha externa preserva catálogo, registra falha segura e permite nova tentativa', async () => {
  const secret = 'api-key-super-secreta'
  let currentTime = Date.UTC(2026, 10, 12, 12)
  const provider = createSimulatedSportsProvider()
  await withHttpApp({ provider, now: () => currentTime, ttlMs: 1000 }, async ({ call, signUp, database, events }) => {
    const token = await signUp()
    await call('/catalog/rounds', token)
    const before = getCatalogRows(database)
    provider.setFailure(new SportsProviderError('timeout'))
    currentTime += 1001

    const stale = await call('/catalog/rounds', token)
    const staleBody = JSON.parse(stale.text)
    assert.equal(stale.status, 200)
    assert.equal(staleBody.lastAttemptFailed, true)
    assert.deepEqual(getCatalogRows(database), before)
    assert.ok(events.some(({ component, result }) => component === 'sports-provider' && result === 'timeout'))
    assert.equal(JSON.stringify(events).includes(secret), false)

    provider.setFailure(null)
    const recovered = await call('/catalog/rounds', token)
    assert.equal(recovered.status, 200)
    assert.equal(JSON.parse(recovered.text).lastAttemptFailed, false)
  })
})

test('TC-08/09: fonte indisponível sem catálogo devolve 503 e rejeita respostas inválidas por inteiro', async () => {
  const provider = createSimulatedSportsProvider({ failure: new SportsProviderError('response_error') })
  await withHttpApp({ provider }, async ({ call, signUp, database, events }) => {
    const token = await signUp()
    const unavailable = await call('/catalog/rounds', token)
    assert.equal(unavailable.status, 503)
    assert.equal(JSON.parse(unavailable.text).type, 'sports_source_unavailable')
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM sports_matches').get().count, 0)

    provider.setFailure(null)
    const invalidCatalog = await provider.fetchCatalog(2026)
    invalidCatalog.matches[4].awayTeamId = invalidCatalog.matches[4].homeTeamId
    provider.setCatalog(invalidCatalog)
    const invalid = await call('/catalog/rounds', token)
    assert.equal(invalid.status, 503)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM sports_teams').get().count, 0)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM sports_rounds').get().count, 0)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM sports_matches').get().count, 0)
    assert.equal(events.some(({ component, result }) => component === 'sports-provider' && result === 'invalid_response'), true)
  })
})

test('TC-13: consultas simultâneas com catálogo vazio compartilham uma atualização', async () => {
  const sourceProvider = createSimulatedSportsProvider()
  const catalog = await sourceProvider.fetchCatalog(2026)
  let calls = 0
  let finish
  const provider = {
    source: 'simulated',
    fetchCatalog: async () => {
      calls += 1
      await new Promise((resolve) => { finish = resolve })
      return catalog
    },
  }

  await withHttpApp({ provider }, async ({ call, signUp }) => {
    const token = await signUp()
    const first = call('/catalog/rounds', token)
    const second = call('/catalog/rounds', token)
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(calls, 1)
    finish()
    const responses = await Promise.all([first, second])
    assert.deepEqual(responses.map(({ status }) => status), [200, 200])
  })
})

test('TC-15/17: adaptador API-Football normaliza os dados sem expor a chave', async () => {
  const secret = 'football-secret-key'
  let requestUrl
  let requestHeaders
  const provider = createApiFootballSportsProvider({
    apiKey: secret,
    fetcher: async (url, options) => {
      requestUrl = url
      requestHeaders = options.headers
      return {
        ok: true,
        json: async () => ({
          response: [{
            fixture: { id: 501, date: '2026-11-20T19:00:00+00:00', status: { short: 'NS' } },
            league: { round: 'Regular Season - 1' },
            teams: {
              home: { id: 1, name: 'Mandante', logo: 'https://example.test/home.svg' },
              away: { id: 2, name: 'Visitante', logo: null },
            },
          }],
        }),
      }
    },
  })

  const catalog = await provider.fetchCatalog(2026)
  assert.equal(requestUrl.searchParams.get('league'), '71')
  assert.equal(requestUrl.searchParams.get('season'), '2026')
  assert.equal(requestHeaders['x-apisports-key'], secret)
  assert.deepEqual(catalog.rounds, [{ id: '1', number: 1 }])
  assert.equal(catalog.matches[0].status, 'scheduled')
  assert.equal(JSON.stringify(catalog).includes(secret), false)
})

test('TC-08: adaptador real classifica respostas desconhecidas e timeouts sem detalhes do fornecedor', async () => {
  const fixture = {
    fixture: { id: 501, date: '2026-11-20T19:00:00Z', status: { short: 'UNKNOWN' } },
    league: { round: 'Regular Season - 1' },
    teams: {
      home: { id: 1, name: 'Mandante' },
      away: { id: 2, name: 'Visitante' },
    },
  }
  const provider = createApiFootballSportsProvider({
    apiKey: 'secret',
    fetcher: async () => ({ ok: true, json: async () => ({ response: [fixture] }) }),
  })
  await assert.rejects(provider.fetchCatalog(2026), (error) => error.code === 'invalid_response')

  const timedOut = createApiFootballSportsProvider({
    apiKey: 'secret',
    fetcher: async () => { throw Object.assign(new Error('secret failure'), { name: 'TimeoutError' }) },
  })
  await assert.rejects(timedOut.fetchCatalog(2026), (error) => error.code === 'timeout')
})

test('data inválida é rejeitada antes de qualquer gravação', async () => {
  const provider = createSimulatedSportsProvider()
  await withHttpApp({ provider }, async ({ call, signUp, database }) => {
    const token = await signUp()
    const invalidCatalog = await provider.fetchCatalog(2026)
    invalidCatalog.matches[1].startsAt = '2026-02-31T19:00:00Z'
    provider.setCatalog(invalidCatalog)

    const response = await call('/catalog/rounds', token)

    assert.equal(response.status, 503)
    assert.equal(JSON.parse(response.text).type, 'sports_source_unavailable')
    assert.deepEqual(getCatalogRows(database), { teams: [], rounds: [], matches: [] })
  })
})

test('falha ao carregar outra temporada não devolve catálogo de temporada anterior', async () => {
  const database = createDatabase(':memory:')
  runMigrations(database)
  const provider = createSimulatedSportsProvider()
  try {
    const currentSeason = createSportsCatalogService(database, provider, { season: 2026 })
    await currentSeason.listRounds()
    const saved = getCatalogRows(database)
    provider.setFailure(new SportsProviderError('timeout'))
    const nextSeason = createSportsCatalogService(database, provider, { season: 2027 })
    await assert.rejects(nextSeason.listRounds(), (error) => error.status === 503)
    assert.deepEqual(getCatalogRows(database), saved)
  } finally {
    database.close()
  }
})
