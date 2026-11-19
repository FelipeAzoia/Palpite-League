import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { createApp } from '../../src/backend/app.js'
import { createAuditStore } from '../../src/backend/modules/notifications-audit/index.js'
import { closedOpportunities } from '../../src/backend/modules/pools-participations/participation-requests.js'
import { createDatabase } from '../../src/backend/shared/database.js'
import { createLogger } from '../../src/backend/shared/logger.js'
import { runMigrations } from '../../src/backend/shared/migrations.js'

const password = 'senha-segura-123'
const baseUrl = 'http://localhost:5173'
const startOfTests = Date.UTC(2026, 10, 14, 15, 0, 0)
const hour = 60 * 60 * 1000

async function withHttpApp(callback) {
  const database = createDatabase(':memory:')
  runMigrations(database)
  const events = []
  const logger = createLogger((event) => events.push(event))
  const clock = { current: startOfTests }
  const now = () => clock.current
  const server = createServer(createApp(database, { logger, now, interfaceBaseUrl: baseUrl }))
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
    let json = null
    try { json = JSON.parse(text) } catch { json = null }
    return { status: response.status, headers: response.headers, text, json }
  }

  async function signUp(name, email) {
    await call('POST', '/auth/register', { body: { name, email, password } })
    const token = (await call('POST', '/auth/login', { body: { email, password } })).json.token
    const id = database.prepare('SELECT id FROM users WHERE normalized_email = ?').get(email).id
    return { token, id, email }
  }

  async function createPool(owner, { matchCount = 3, ...overrides } = {}) {
    const matches = (await call('GET', '/catalog/rounds/2/matches?status=scheduled', { token: owner.token })).json.matches
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
    assert.equal(response.status, 201)
    return { poolId: response.json.pool.id, matches: response.json.pool.matches }
  }

  async function inviteCode(owner, poolId) {
    const response = await call('POST', `/pools/${poolId}/invites`, { token: owner.token })
    assert.equal(response.status, 201)
    return new URL(response.json.invite.link).hash.replace('#invite=', '')
  }

  // Coloca uma partida selecionada no passado, como se já tivesse começado.
  function startMatch(matchId, { offsetMs = hour, status = 'in_progress' } = {}) {
    database.prepare('UPDATE sports_matches SET starts_at = ?, status = ? WHERE id = ?')
      .run(new Date(clock.current - offsetMs).toISOString(), status, matchId)
  }

  const participations = (poolId, userId) => database.prepare(
    'SELECT * FROM pool_participations WHERE pool_id = ? AND user_id = ?',
  ).all(poolId, userId)

  try {
    await callback({ call, signUp, createPool, inviteCode, startMatch, participations, database, events, responses, clock, auditStore })
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    database.close()
  }
}

function expectCommonFormat(response, status, type) {
  assert.equal(response.status, status)
  assert.equal(response.json.type, type)
  assert.equal(response.json.correlationId, response.headers.get('x-correlation-id'))
  assert.equal(/falha simulada|SQLITE|stack| at /.test(response.text), false)
}

async function setup(context) {
  const admin = await context.signUp('Ana', 'ana@example.com')
  const guest = await context.signUp('Bruno', 'bruno@example.com')
  const pool = await context.createPool(admin)
  const code = await context.inviteCode(admin, pool.poolId)
  return { admin, guest, code, ...pool }
}

test('TC-01: abrir convite ativo vincula o convite, devolve regras e situação, sem criar participação', async () => {
  await withHttpApp(async (context) => {
    const { guest, code, poolId } = await setup(context)

    const response = await context.call('POST', '/invites/open', { token: guest.token, body: { code } })

    assert.equal(response.status, 200)
    assert.equal(response.json.pool.id, poolId)
    assert.equal(response.json.pool.name, 'Bolão dos Amigos')
    assert.equal(response.json.situation.status, 'none')
    assert.equal(response.json.lateEntry.acknowledgementRequired, false)
    assert.deepEqual(response.json.lateEntry.closedMatches, [])
    const invite = context.database.prepare('SELECT status, used_by FROM pool_invites').get()
    assert.equal(invite.status, 'used')
    assert.equal(invite.used_by, guest.id)
    assert.equal(context.participations(poolId, guest.id).length, 0)
  })
})

test('TC-03: convites indisponíveis recebem a mesma resposta 404 e a sessão é exigida', async () => {
  await withHttpApp(async (context) => {
    const { admin, guest, code, poolId } = await setup(context)
    const other = await context.signUp('Carla', 'carla@example.com')

    const expired = await context.inviteCode(admin, poolId)
    context.database.prepare('UPDATE pool_invites SET created_at = ?, expires_at = ? WHERE rowid = (SELECT MAX(rowid) FROM pool_invites)')
      .run(startOfTests - 8 * 24 * hour, startOfTests - 1)
    const revoked = await context.inviteCode(admin, poolId)
    const revokedId = context.database.prepare('SELECT id FROM pool_invites ORDER BY rowid DESC LIMIT 1').get().id
    assert.equal((await context.call('DELETE', `/pools/${poolId}/invites/${revokedId}`, { token: admin.token })).status, 200)
    await context.call('POST', '/invites/open', { token: other.token, body: { code } })

    const bodies = []
    for (const candidate of ['inexistente', expired, revoked, code]) {
      const response = await context.call('POST', '/invites/open', { token: guest.token, body: { code: candidate } })
      expectCommonFormat(response, 404, 'invite_unavailable')
      bodies.push(response.json.message)
      const request = await context.call('POST', '/invites/requests', { token: guest.token, body: { code: candidate, rulesAccepted: true } })
      expectCommonFormat(request, 404, 'invite_unavailable')
    }
    assert.equal(new Set(bodies).size, 1)

    const endedAdmin = await context.signUp('Diego', 'diego@example.com')
    const endedPool = await context.createPool(endedAdmin, { name: 'Bolão encerrado' })
    const endedCode = await context.inviteCode(endedAdmin, endedPool.poolId)
    context.database.prepare("UPDATE pools SET status = 'ended' WHERE id = ?").run(endedPool.poolId)
    expectCommonFormat(await context.call('POST', '/invites/open', { token: guest.token, body: { code: endedCode } }), 404, 'invite_unavailable')
    expectCommonFormat(await context.call('POST', '/invites/requests', { token: guest.token, body: { code: endedCode, rulesAccepted: true } }), 404, 'invite_unavailable')

    expectCommonFormat(await context.call('POST', '/invites/open', { body: { code } }), 401, 'session_rejected')
    expectCommonFormat(await context.call('POST', '/invites/requests', { token: 'invalido', body: { code } }), 401, 'session_rejected')
    assert.equal(context.database.prepare("SELECT COUNT(*) AS count FROM pool_participations WHERE role = 'participant'").get().count, 0)
  })
})

test('TC-04: solicitação sem entrada tardia cria participação solicitada e dois registros de auditoria', async () => {
  await withHttpApp(async (context) => {
    const { guest, code, poolId } = await setup(context)
    await context.call('POST', '/invites/open', { token: guest.token, body: { code } })

    const response = await context.call('POST', '/invites/requests', { token: guest.token, body: { code, rulesAccepted: true } })

    assert.equal(response.status, 201)
    const { participation } = response.json
    assert.equal(participation.status, 'requested')
    assert.equal(participation.role, 'participant')
    assert.equal(participation.paymentConfirmed, false)
    assert.equal(participation.rulesAcceptedAt, new Date(startOfTests).toISOString())
    const [row] = context.participations(poolId, guest.id)
    assert.equal(row.status, 'requested')
    assert.equal(row.role, 'participant')
    assert.equal(row.payment_confirmed, 0)
    assert.equal(row.joined_at, null)
    assert.equal(row.rules_accepted_at, participation.rulesAcceptedAt)

    const records = context.auditStore.findByObject({ type: 'participation', id: participation.id })
    assert.deepEqual(records.map(({ action, result }) => [action, result]), [
      ['participation.rules_accepted', 'success'],
      ['participation.requested', 'success'],
    ])
    for (const record of records) {
      assert.deepEqual(record.details, { lateEntryAcknowledged: false, closedMatchCount: 0 })
      assert.equal(record.actor.id, guest.id)
    }
  })
})

test('TC-05 e TC-17: sem aceite explícito a solicitação é rejeitada e nada é registrado', async () => {
  await withHttpApp(async (context) => {
    const { guest, code, poolId } = await setup(context)

    for (const body of [{ code }, { code, rulesAccepted: false }, { code, rulesAccepted: 'true' }]) {
      const response = await context.call('POST', '/invites/requests', { token: guest.token, body })
      expectCommonFormat(response, 400, 'validation_error')
      assert.ok(response.json.fields.rulesAccepted)
    }
    assert.equal(context.participations(poolId, guest.id).length, 0)
    const audit = context.database.prepare("SELECT COUNT(*) AS count FROM audit_records WHERE action LIKE 'participation.%'").get()
    assert.equal(audit.count, 0)
  })
})

test('TC-06: entrada tardia lista as partidas iniciadas sem as canceladas, em ordem cronológica', async () => {
  await withHttpApp(async (context) => {
    const { guest, code, matches } = await setup(context)
    const [first, second, third] = matches
    context.startMatch(third.id, { offsetMs: 3 * hour, status: 'finished' })
    context.startMatch(first.id, { offsetMs: hour })
    context.startMatch(second.id, { offsetMs: 2 * hour, status: 'cancelled' })

    const response = await context.call('POST', '/invites/open', { token: guest.token, body: { code } })

    assert.equal(response.status, 200)
    assert.equal(response.json.lateEntry.acknowledgementRequired, true)
    assert.deepEqual(response.json.lateEntry.closedMatches.map(({ id }) => id), [third.id, first.id])
  })
})

test('TC-07: com aceite e ciência a solicitação é registrada e a auditoria traz a ciência e a contagem', async () => {
  await withHttpApp(async (context) => {
    const { guest, code, matches } = await setup(context)
    context.startMatch(matches[0].id)
    context.startMatch(matches[1].id, { status: 'finished' })

    const response = await context.call('POST', '/invites/requests', {
      token: guest.token,
      body: { code, rulesAccepted: true, lateEntryAcknowledged: true },
    })

    assert.equal(response.status, 201)
    const records = context.auditStore.findByObject({ type: 'participation', id: response.json.participation.id })
    assert.equal(records.length, 2)
    for (const record of records) assert.deepEqual(record.details, { lateEntryAcknowledged: true, closedMatchCount: 2 })
  })
})

test('TC-08: sem a ciência exigida, e quando uma partida começa entre a abertura e o envio, a solicitação é rejeitada', async () => {
  await withHttpApp(async (context) => {
    const { guest, code, poolId, matches } = await setup(context)
    const opened = await context.call('POST', '/invites/open', { token: guest.token, body: { code } })
    assert.equal(opened.json.lateEntry.acknowledgementRequired, false)

    // A partida começa depois da abertura: o backend recalcula a exigência no envio (CA-09).
    context.startMatch(matches[0].id)
    const response = await context.call('POST', '/invites/requests', { token: guest.token, body: { code, rulesAccepted: true } })

    expectCommonFormat(response, 400, 'validation_error')
    assert.ok(response.json.fields.lateEntryAcknowledged)
    assert.equal(response.json.fields.rulesAccepted, undefined)
    assert.equal(context.participations(poolId, guest.id).length, 0)
  })
})

test('TC-09 e TC-14: participação existente em qualquer status recebe 409 e a reabertura mostra a situação', async () => {
  for (const status of ['requested', 'approved_awaiting_payment', 'confirmed', 'rejected', 'left']) {
    await withHttpApp(async (context) => {
      const { guest, code, poolId } = await setup(context)
      const first = await context.call('POST', '/invites/requests', { token: guest.token, body: { code, rulesAccepted: true } })
      assert.equal(first.status, 201)
      context.database.prepare('UPDATE pool_participations SET status = ? WHERE pool_id = ? AND user_id = ?').run(status, poolId, guest.id)

      const reopened = await context.call('POST', '/invites/open', { token: guest.token, body: { code } })
      assert.equal(reopened.status, 200)
      assert.equal(reopened.json.situation.status, status)

      const again = await context.call('POST', '/invites/requests', { token: guest.token, body: { code, rulesAccepted: true } })
      expectCommonFormat(again, 409, 'participation_exists')
      assert.equal(again.json.details.status, status)
      assert.equal(context.participations(poolId, guest.id).length, 1)
    })
  }
})

test('TC-10: solicitações simultâneas criam uma só participação e a solicitação não dá acesso de membro', async () => {
  await withHttpApp(async (context) => {
    const { guest, code, poolId } = await setup(context)

    const responses = await Promise.all(Array.from({ length: 4 }, () => context.call('POST', '/invites/requests', {
      token: guest.token,
      body: { code, rulesAccepted: true },
    })))

    assert.deepEqual(responses.map(({ status }) => status).sort(), [201, 409, 409, 409])
    assert.equal(context.participations(poolId, guest.id).length, 1)
    const rules = await context.call('GET', `/pools/${poolId}`, { token: guest.token })
    expectCommonFormat(rules, 404, 'not_found')
    const list = await context.call('GET', '/pools', { token: guest.token })
    assert.deepEqual(list.json.pools, [])
  })
})

// O plano Premium ainda não pode ser gravado (chega na SPEC-019); a regra é verificada com o Gratuito,
// cujo limite de criação (1 bolão ativo) não restringe a participação em vários bolões (RB05).
test('TC-11: o plano não limita a solicitação de entrada em vários bolões', async () => {
  await withHttpApp(async (context) => {
    const guest = await context.signUp('Bruno', 'bruno@example.com')
    const ownPool = await context.createPool(guest, { name: 'Bolão do Bruno' })
    assert.ok(ownPool.poolId)

    for (let index = 0; index < 3; index += 1) {
      const admin = await context.signUp(`Admin ${index}`, `admin${index}@example.com`)
      const { poolId } = await context.createPool(admin, { name: `Bolão ${index}` })
      const code = await context.inviteCode(admin, poolId)
      const response = await context.call('POST', '/invites/requests', { token: guest.token, body: { code, rulesAccepted: true } })
      assert.equal(response.status, 201)
    }
  })
})

test('TC-12: a visão do convidado traz exatamente as regras definidas e nenhuma lista de participantes', async () => {
  await withHttpApp(async (context) => {
    const { guest, code } = await setup(context)

    const { json } = await context.call('POST', '/invites/open', { token: guest.token, body: { code } })

    assert.deepEqual(Object.keys(json).sort(), ['lateEntry', 'participationConditions', 'pool', 'situation'])
    assert.deepEqual(Object.keys(json.pool).sort(), [
      'currency', 'endsOn', 'entryFee', 'id', 'liveResults', 'matches', 'name', 'prizeModel', 'startsOn', 'status', 'tiebreaker',
    ])
    assert.equal(/participants|Ana|ana@example/.test(JSON.stringify(json)), false)
    assert.ok(json.participationConditions.length > 0)
  })
})

test('TC-13: falha ao gravar a participação ou a auditoria não persiste nada', async () => {
  await withHttpApp(async (context) => {
    const { guest, code, poolId } = await setup(context)
    await context.call('POST', '/invites/open', { token: guest.token, body: { code } })
    context.database.exec(`
      CREATE TRIGGER fail_requested_audit BEFORE INSERT ON audit_records
      WHEN NEW.action = 'participation.requested' AND NEW.result = 'success'
      BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;
    `)

    const response = await context.call('POST', '/invites/requests', { token: guest.token, body: { code, rulesAccepted: true } })

    expectCommonFormat(response, 500, 'internal_error')
    assert.equal(context.participations(poolId, guest.id).length, 0)
    const successes = context.database.prepare("SELECT COUNT(*) AS count FROM audit_records WHERE action LIKE 'participation.%' AND result = 'success'").get()
    assert.equal(successes.count, 0)
    // O vínculo do convite, consumido na abertura, permanece (E6).
    assert.equal(context.database.prepare('SELECT used_by FROM pool_invites').get().used_by, guest.id)
  })
})

test('TC-16: o código do convite não aparece em registros técnicos, auditoria ou respostas', async () => {
  await withHttpApp(async (context) => {
    const { guest, code } = await setup(context)
    await context.call('POST', '/invites/open', { token: guest.token, body: { code } })
    await context.call('POST', '/invites/requests', { token: guest.token, body: { code } })
    await context.call('POST', '/invites/requests', { token: guest.token, body: { code, rulesAccepted: true } })
    await context.call('POST', '/invites/requests', { token: guest.token, body: { code, rulesAccepted: true } })

    assert.equal(JSON.stringify(context.events).includes(code), false)
    assert.equal(context.responses.slice(-4).some((text) => text.includes(code)), false)
    const audit = context.database.prepare('SELECT * FROM audit_records').all()
    assert.equal(JSON.stringify(audit).includes(code), false)
  })
})

test('INV-010: oportunidades encerradas ignoram canceladas, adiadas sem data e partidas futuras', () => {
  const nowMs = Date.UTC(2026, 10, 20, 12)
  const matches = [
    { id: 'futura', status: 'scheduled', startsAt: '2026-11-21T12:00:00.000Z' },
    { id: 'tarde', status: 'in_progress', startsAt: '2026-11-20T11:00:00.000Z' },
    { id: 'cancelada', status: 'cancelled', startsAt: '2026-11-19T12:00:00.000Z' },
    { id: 'adiada', status: 'postponed', startsAt: null },
    { id: 'cedo', status: 'finished', startsAt: '2026-11-19T10:00:00.000Z' },
  ]

  assert.deepEqual(closedOpportunities(matches, nowMs).map(({ id }) => id), ['cedo', 'tarde'])
})
