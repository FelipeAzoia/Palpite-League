import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createApp } from '../../../src/backend/app.js'
import { createAuditStore } from '../../../src/backend/modules/notifications-audit/index.js'
import { createDatabase } from '../../../src/backend/shared/database.js'
import { createLogger } from '../../../src/backend/shared/logger.js'
import { runMigrations } from '../../../src/backend/shared/migrations.js'

// Harness comum dos testes HTTP das SPECs 010 em diante: banco em memória, relógio controlado,
// servidor real e atalhos para montar bolões e participações.

export const password = 'senha-segura-123'
export const baseUrl = 'http://localhost:5173'
export const startOfTests = Date.UTC(2026, 10, 14, 15, 0, 0)
export const hour = 60 * 60 * 1000

export function expectCommonFormat(response, status, type) {
  assert.equal(response.status, status, response.text)
  assert.equal(response.json.type, type)
  assert.equal(response.json.correlationId, response.headers.get('x-correlation-id'))
  assert.equal(/falha simulada|SQLITE|stack| at /.test(response.text), false)
}

export async function withHttpApp(callback, appOptions = {}) {
  const database = createDatabase(':memory:')
  runMigrations(database)
  const events = []
  const logger = createLogger((event) => events.push(event))
  const clock = { current: startOfTests }
  const now = () => clock.current
  const app = createApp(database, { logger, now, interfaceBaseUrl: baseUrl, ...appOptions })
  const server = createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const responses = []
  const auditStore = createAuditStore(database, { logger })

  async function call(method, route, { token, body } = {}) {
    const response = await fetch(`${origin}${route}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const text = await response.text()
    responses.push(text)
    let json
    try { json = JSON.parse(text) } catch { json = null }
    return { status: response.status, headers: response.headers, text, json }
  }

  let userCounter = 0
  async function signUp(name = `Usuário ${userCounter + 1}`, email) {
    userCounter += 1
    const address = email ?? `usuario${userCounter}@example.com`
    await call('POST', '/auth/register', { body: { name, email: address, password } })
    const login = await call('POST', '/auth/login', { body: { email: address, password } })
    // Mantém a sessão válida mesmo quando o relógio dos testes avança.
    database.prepare('UPDATE auth_sessions SET expires_at = ? WHERE user_id = (SELECT id FROM users WHERE normalized_email = ?)')
      .run(Number.MAX_SAFE_INTEGER, address)
    const id = database.prepare('SELECT id FROM users WHERE normalized_email = ?').get(address).id
    return { token: login.json.token, id, email: address, name }
  }

  async function createPool(owner, { matchCount = 3, round = 2, ...overrides } = {}) {
    const matches = (await call('GET', `/catalog/rounds/${round}/matches?status=scheduled`, { token: owner.token })).json.matches
    const response = await call('POST', '/pools', {
      token: owner.token,
      body: {
        name: 'Bolão dos Amigos',
        startsOn: '2026-11-14',
        endsOn: '2026-12-31',
        entryFee: 0,
        prizeModel: 'winner_takes_all',
        tiebreaker: 'exact_scores',
        selection: { matchIds: matches.slice(0, matchCount).map(({ id }) => id) },
        ...overrides,
      },
    })
    assert.equal(response.status, 201, response.text)
    return { poolId: response.json.pool.id, matches: response.json.pool.matches }
  }

  async function inviteCode(manager, poolId) {
    const response = await call('POST', `/pools/${poolId}/invites`, { token: manager.token })
    assert.equal(response.status, 201, response.text)
    return new URL(response.json.invite.link).hash.replace('#invite=', '')
  }

  // Convida e registra a solicitação de entrada (SPEC-009); devolve o id da participação.
  async function requestEntry(manager, user, poolId) {
    const code = await inviteCode(manager, poolId)
    const response = await call('POST', '/invites/requests', {
      token: user.token,
      body: { code, rulesAccepted: true, lateEntryAcknowledged: true },
    })
    assert.equal(response.status, 201, response.text)
    return response.json.participation.id
  }

  // Convida, solicita e aprova (SPEC-010); em bolão sem taxa a participação fica confirmada.
  async function joinPool(manager, user, poolId) {
    const participationId = await requestEntry(manager, user, poolId)
    const response = await call('POST', `/pools/${poolId}/requests/${participationId}/approve`, { token: manager.token })
    assert.equal(response.status, 200, response.text)
    return participationId
  }

  // Coloca uma partida no passado, como se já tivesse começado.
  function startMatch(matchId, { offsetMs = hour, status = 'in_progress' } = {}) {
    database.prepare('UPDATE sports_matches SET starts_at = ?, status = ? WHERE id = ?')
      .run(new Date(clock.current - offsetMs).toISOString(), status, matchId)
  }

  function participation(participationId) {
    return database.prepare('SELECT * FROM pool_participations WHERE id = ?').get(participationId)
  }

  try {
    await callback({
      call, signUp, createPool, inviteCode, requestEntry, joinPool, startMatch, participation,
      database, events, responses, clock, auditStore, logger, app, origin,
    })
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    database.close()
  }
}
