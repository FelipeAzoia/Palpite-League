import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import test from 'node:test'
import { createApp } from '../../src/backend/app.js'
import { createAuditStore } from '../../src/backend/modules/notifications-audit/index.js'
import { createInvitesService } from '../../src/backend/modules/pools-participations/index.js'
import { createDatabase } from '../../src/backend/shared/database.js'
import { createLogger } from '../../src/backend/shared/logger.js'
import { runMigrations } from '../../src/backend/shared/migrations.js'

const password = 'senha-segura-123'
const baseUrl = 'http://localhost:5173'
const startOfTests = Date.UTC(2026, 10, 14, 15, 0, 0)
const sevenDays = 7 * 24 * 60 * 60 * 1000

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
  const invites = createInvitesService(database, { auditStore, now, interfaceBaseUrl: baseUrl })

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

  async function signUp(name, email) {
    await call('POST', '/auth/register', { body: { name, email, password } })
    const token = (await call('POST', '/auth/login', { body: { email, password } })).json.token
    const id = database.prepare('SELECT id FROM users WHERE normalized_email = ?').get(email).id
    return { token, id, email }
  }

  async function createPool(owner, overrides = {}) {
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
        selection: { matchIds: matches.slice(0, 2).map(({ id }) => id) },
        ...overrides,
      },
    })
    assert.equal(response.status, 201)
    return response.json.pool.id
  }

  let memberCounter = 0
  function addMember(poolId, user, role, status) {
    memberCounter += 1
    database.prepare(`
      INSERT INTO pool_participations (id, pool_id, user_id, role, status, payment_confirmed, rules_accepted_at)
      VALUES (?, ?, ?, ?, ?, 0, '2026-11-14T15:00:00.000Z')
    `).run(`member-${memberCounter}`, poolId, user.id, role, status)
  }

  try {
    await callback({ call, signUp, createPool, addMember, database, events, responses, clock, auditStore, invites })
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    database.close()
  }
}

const codeFrom = (link) => new URL(link).hash.replace('#invite=', '')
const hashOf = (code) => createHash('sha256').update(code).digest('hex')
const inviteCount = (database) => database.prepare('SELECT COUNT(*) AS count FROM pool_invites').get().count

function expectCommonFormat(response, status, type) {
  assert.equal(response.status, status)
  assert.equal(response.json.type, type)
  assert.equal(response.json.correlationId, response.headers.get('x-correlation-id'))
  assert.equal(/falha simulada|SQLITE|stack| at /.test(response.text), false)
}

test('TC-01: administrador cria convite com link no fragmento, validade de 7 dias e auditoria de sucesso', async () => {
  await withHttpApp(async ({ call, signUp, createPool, database, auditStore }) => {
    const admin = await signUp('Ana', 'ana@example.com')
    const poolId = await createPool(admin)

    const response = await call('POST', `/pools/${poolId}/invites`, { token: admin.token })

    assert.equal(response.status, 201)
    const { invite } = response.json
    assert.equal(invite.status, 'active')
    assert.ok(invite.link.startsWith(`${baseUrl}/#invite=`))
    assert.equal(new URL(invite.link).search, '')
    assert.equal(Buffer.from(codeFrom(invite.link), 'base64url').length, 16)
    assert.equal(Date.parse(invite.expiresAt) - Date.parse(invite.createdAt), sevenDays)
    assert.equal(Date.parse(invite.createdAt), startOfTests)
    const row = database.prepare('SELECT * FROM pool_invites').get()
    assert.equal(row.status, 'active')
    assert.equal(row.created_by, admin.id)
    assert.equal(row.pool_id, poolId)
    const records = auditStore.findByObject({ type: 'invite', id: invite.id })
    assert.equal(records.length, 1)
    assert.equal(records[0].action, 'invite.created')
    assert.equal(records[0].result, 'success')
    assert.deepEqual(records[0].actor, { type: 'user', id: admin.id })
  })
})

test('TC-02: coadministrador confirmado cria, lista e revoga convites', async () => {
  await withHttpApp(async ({ call, signUp, createPool, addMember }) => {
    const admin = await signUp('Ana', 'ana@example.com')
    const coadmin = await signUp('Bia', 'bia@example.com')
    const poolId = await createPool(admin)
    addMember(poolId, coadmin, 'coadministrator', 'confirmed')

    const created = await call('POST', `/pools/${poolId}/invites`, { token: coadmin.token })
    const listed = await call('GET', `/pools/${poolId}/invites`, { token: coadmin.token })
    const revoked = await call('DELETE', `/pools/${poolId}/invites/${created.json.invite.id}`, { token: coadmin.token })

    assert.equal(created.status, 201)
    assert.equal(listed.status, 200)
    assert.equal(listed.json.invites[0].createdBy, 'Bia')
    assert.equal(revoked.status, 200)
    assert.deepEqual(revoked.json, { invite: { id: created.json.invite.id, status: 'revoked' } })
  })
})

test('TC-03: participante comum recebe 403 em criar, listar e revogar, sem alteração e com auditoria negada', async () => {
  await withHttpApp(async ({ call, signUp, createPool, addMember, database, auditStore }) => {
    const admin = await signUp('Ana', 'ana@example.com')
    const member = await signUp('Caio', 'caio@example.com')
    const poolId = await createPool(admin)
    addMember(poolId, member, 'participant', 'confirmed')
    const existing = (await call('POST', `/pools/${poolId}/invites`, { token: admin.token })).json.invite
    const before = database.prepare('SELECT * FROM pool_invites').all()

    const attempts = [
      await call('POST', `/pools/${poolId}/invites`, { token: member.token }),
      await call('GET', `/pools/${poolId}/invites`, { token: member.token }),
      await call('DELETE', `/pools/${poolId}/invites/${existing.id}`, { token: member.token }),
    ]

    for (const response of attempts) {
      expectCommonFormat(response, 403, 'forbidden')
      assert.equal(/Ana|invites|link/.test(response.text.replace(/forbidden/g, '')), false)
    }
    assert.deepEqual(database.prepare('SELECT * FROM pool_invites').all(), before)
    const denied = auditStore.findByActor({ type: 'user', id: member.id }).filter(({ action }) => action.startsWith('invite.'))
    assert.deepEqual(denied.map(({ action, result }) => [action, result]).sort(), [
      ['invite.created', 'denied'],
      ['invite.listed', 'denied'],
      ['invite.revoked', 'denied'],
    ])
  })
})

test('TC-04: não membro, bolão inexistente, sem sessão e membro que saiu não têm acesso', async () => {
  await withHttpApp(async ({ call, signUp, createPool, addMember, database, auditStore }) => {
    const admin = await signUp('Ana', 'ana@example.com')
    const stranger = await signUp('Dani', 'dani@example.com')
    const former = await signUp('Bia', 'bia@example.com')
    const requested = await signUp('Edu', 'edu@example.com')
    const rejected = await signUp('Fabi', 'fabi@example.com')
    const poolId = await createPool(admin)
    addMember(poolId, former, 'coadministrator', 'left')
    addMember(poolId, requested, 'coadministrator', 'requested')
    addMember(poolId, rejected, 'coadministrator', 'rejected')

    for (const user of [stranger, former, requested, rejected]) {
      for (const [method, route] of [['POST', `/pools/${poolId}/invites`], ['GET', `/pools/${poolId}/invites`]]) {
        expectCommonFormat(await call(method, route, { token: user.token }), 404, 'not_found')
      }
      const denied = auditStore.findByActor({ type: 'user', id: user.id }).filter(({ action }) => action.startsWith('invite.'))
      assert.equal(denied.length, 2)
      assert.ok(denied.every((record) => record.result === 'denied'))
    }
    expectCommonFormat(await call('POST', '/pools/inexistente/invites', { token: stranger.token }), 404, 'not_found')
    expectCommonFormat(await call('POST', `/pools/${'x'.repeat(500)}/invites`, { token: stranger.token }), 404, 'not_found')
    expectCommonFormat(await call('POST', `/pools/${poolId}/invites`), 401, 'session_rejected')
    expectCommonFormat(await call('GET', `/pools/${poolId}/invites`, { token: 'token-invalido' }), 401, 'session_rejected')
    assert.equal(inviteCount(database), 0)
  })
})

test('TC-05: criador com taxa pendente (aprovado aguardando pagamento) pode convidar', async () => {
  await withHttpApp(async ({ call, signUp, createPool, database }) => {
    const admin = await signUp('Ana', 'ana@example.com')
    const poolId = await createPool(admin, { entryFee: 25 })
    assert.equal(database.prepare('SELECT status FROM pool_participations').get().status, 'approved_awaiting_payment')

    const response = await call('POST', `/pools/${poolId}/invites`, { token: admin.token })

    assert.equal(response.status, 201)
  })
})

test('TC-06: bolão encerrado recusa a criação de convite com 409', async () => {
  await withHttpApp(async ({ call, signUp, createPool, database }) => {
    const admin = await signUp('Ana', 'ana@example.com')
    const poolId = await createPool(admin)
    database.prepare("UPDATE pools SET status = 'ended'").run()

    const response = await call('POST', `/pools/${poolId}/invites`, { token: admin.token })

    expectCommonFormat(response, 409, 'pool_ended')
    assert.equal(inviteCount(database), 0)
  })
})

test('TC-07: o código em claro só existe no link devolvido na criação', async () => {
  await withHttpApp(async ({ call, signUp, createPool, database, events, auditStore, invites, responses }) => {
    const admin = await signUp('Ana', 'ana@example.com')
    const other = await signUp('Caio', 'caio@example.com')
    const poolId = await createPool(admin)
    const creation = await call('POST', `/pools/${poolId}/invites`, { token: admin.token })
    const code = codeFrom(creation.json.invite.link)
    const afterCreation = responses.length

    await call('GET', `/pools/${poolId}/invites`, { token: admin.token })
    invites.verifyInvite(code, other.id)
    invites.consumeInvite(code, other.id)
    await call('DELETE', `/pools/${poolId}/invites/${creation.json.invite.id}`, { token: admin.token })

    const outputs = [
      ...responses.slice(afterCreation),
      JSON.stringify(database.prepare('SELECT * FROM pool_invites').all()),
      JSON.stringify(database.prepare('SELECT * FROM audit_records').all()),
      JSON.stringify(events),
      JSON.stringify(auditStore.findByObject({ type: 'invite', id: creation.json.invite.id })),
    ]
    for (const output of outputs) assert.equal(output.includes(code), false)
    assert.match(database.prepare('SELECT code_hash FROM pool_invites').get().code_hash, /^[0-9a-f]{64}$/)
    assert.equal(creation.text.split(code).length - 1, 1, 'o código aparece uma única vez, no link')
  })
})

test('TC-08: listagem mostra só os convites do bolão, sem código e sem a identidade de quem consumiu', async () => {
  await withHttpApp(async ({ call, signUp, createPool, invites, database }) => {
    const ana = await signUp('Ana', 'ana@example.com')
    const bia = await signUp('Bia', 'bia@example.com')
    const caio = await signUp('Caio Consumidor', 'caio@example.com')
    const anaPool = await createPool(ana)
    const biaPool = await createPool(bia, { name: 'Bolão da Bia' })
    const first = (await call('POST', `/pools/${anaPool}/invites`, { token: ana.token })).json.invite
    await call('POST', `/pools/${anaPool}/invites`, { token: ana.token })
    await call('POST', `/pools/${biaPool}/invites`, { token: bia.token })
    invites.consumeInvite(codeFrom(first.link), caio.id)

    const listed = await call('GET', `/pools/${anaPool}/invites`, { token: ana.token })

    assert.equal(listed.json.invites.length, 2)
    for (const invite of listed.json.invites) {
      assert.deepEqual(Object.keys(invite).filter((key) => key !== 'usedAt').sort(), ['createdAt', 'createdBy', 'expiresAt', 'id', 'status'])
      assert.equal(invite.createdBy, 'Ana')
    }
    const used = listed.json.invites.find(({ id }) => id === first.id)
    assert.equal(used.status, 'used')
    assert.ok(used.usedAt)
    assert.equal(/Caio|caio@|link|code/i.test(listed.text), false)
    assert.equal(listed.text.includes(caio.id), false)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM pool_invites WHERE pool_id = ?').get(biaPool).count, 1)
  })
})

test('TC-09: validade de 7 dias, avaliada na consulta e no uso, com relógio controlado', async () => {
  await withHttpApp(async ({ call, signUp, createPool, invites, clock, database }) => {
    const admin = await signUp('Ana', 'ana@example.com')
    const guest = await signUp('Caio', 'caio@example.com')
    const poolId = await createPool(admin)
    const recent = codeFrom((await call('POST', `/pools/${poolId}/invites`, { token: admin.token })).json.invite.link)
    const old = codeFrom((await call('POST', `/pools/${poolId}/invites`, { token: admin.token })).json.invite.link)

    clock.current = startOfTests + sevenDays - 1000
    const verified = invites.verifyInvite(recent, guest.id)
    assert.equal(verified.poolId, poolId)
    assert.equal(verified.alreadyConsumed, false)
    assert.equal(invites.consumeInvite(recent, guest.id).alreadyConsumed, false)

    clock.current = startOfTests + sevenDays
    assert.throws(() => invites.verifyInvite(old, guest.id), (error) => error.status === 404)
    clock.current = startOfTests + sevenDays + 1000
    assert.throws(() => invites.consumeInvite(old, guest.id), (error) => error.status === 404)
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM pool_invites WHERE status = 'used'").get().count, 1)

    // Depois de saltos longos do relógio a sessão HTTP já expirou (8 h); a listagem é lida pelo serviço.
    clock.current = startOfTests + sevenDays - 1000
    assert.deepEqual(invites.listInvites(admin.id, poolId).invites.map(({ status }) => status).sort(), ['active', 'used'])
    clock.current = startOfTests + sevenDays + 1000
    assert.deepEqual(invites.listInvites(admin.id, poolId).invites.map(({ status }) => status).sort(), ['expired', 'used'])
  })
})

test('TC-10: consumo simultâneo do mesmo convite por dois usuários tem um só vencedor', async () => {
  await withHttpApp(async ({ call, signUp, createPool, invites, database }) => {
    const admin = await signUp('Ana', 'ana@example.com')
    const first = await signUp('Caio', 'caio@example.com')
    const second = await signUp('Duda', 'duda@example.com')
    const poolId = await createPool(admin)
    const code = codeFrom((await call('POST', `/pools/${poolId}/invites`, { token: admin.token })).json.invite.link)

    const results = await Promise.allSettled([
      Promise.resolve().then(() => invites.consumeInvite(code, first.id)),
      Promise.resolve().then(() => invites.consumeInvite(code, second.id)),
    ])

    assert.deepEqual(results.map(({ status }) => status).sort(), ['fulfilled', 'rejected'])
    const loser = results.find(({ status }) => status === 'rejected')
    assert.equal(loser.reason.status, 404)
    const winnerId = results.findIndex(({ status }) => status === 'fulfilled') === 0 ? first.id : second.id
    const row = database.prepare('SELECT status, used_by FROM pool_invites').get()
    assert.deepEqual({ ...row }, { status: 'used', used_by: winnerId })
  })
})

test('TC-11: o mesmo usuário repete o consumo, outro usuário não, e o convite usado não expira para quem o consumiu', async () => {
  await withHttpApp(async ({ call, signUp, createPool, invites, clock, database }) => {
    const admin = await signUp('Ana', 'ana@example.com')
    const guest = await signUp('Caio', 'caio@example.com')
    const other = await signUp('Duda', 'duda@example.com')
    const poolId = await createPool(admin)
    const code = codeFrom((await call('POST', `/pools/${poolId}/invites`, { token: admin.token })).json.invite.link)
    invites.consumeInvite(code, guest.id)
    const consumed = database.prepare('SELECT * FROM pool_invites').get()

    assert.equal(invites.consumeInvite(code, guest.id).alreadyConsumed, true)
    assert.deepEqual(database.prepare('SELECT * FROM pool_invites').get(), consumed)
    assert.throws(() => invites.consumeInvite(code, other.id), (error) => error.status === 404)
    assert.throws(() => invites.verifyInvite(code, other.id), (error) => error.status === 404)

    clock.current = startOfTests + 30 * 24 * 60 * 60 * 1000
    assert.equal(invites.verifyInvite(code, guest.id).alreadyConsumed, true)
    assert.equal(invites.consumeInvite(code, guest.id).alreadyConsumed, true)
    assert.throws(() => invites.verifyInvite(code, other.id), (error) => error.status === 404)
  })
})

test('TC-12: só convite ativo é revogado e o convite revogado nunca é consumido', async () => {
  await withHttpApp(async ({ call, signUp, createPool, invites, clock, database }) => {
    const admin = await signUp('Ana', 'ana@example.com')
    const guest = await signUp('Caio', 'caio@example.com')
    const bia = await signUp('Bia', 'bia@example.com')
    const poolId = await createPool(admin)
    const biaPool = await createPool(bia, { name: 'Bolão da Bia' })
    const create = async () => (await call('POST', `/pools/${poolId}/invites`, { token: admin.token })).json.invite
    const revokeMe = await create()
    const keep = await create()
    const used = await create()
    const expiring = await create()
    const foreign = (await call('POST', `/pools/${biaPool}/invites`, { token: bia.token })).json.invite
    invites.consumeInvite(codeFrom(used.link), guest.id)

    const revoked = await call('DELETE', `/pools/${poolId}/invites/${revokeMe.id}`, { token: admin.token })
    assert.equal(revoked.status, 200)
    assert.throws(() => invites.consumeInvite(codeFrom(revokeMe.link), guest.id), (error) => error.status === 404)
    assert.equal(invites.verifyInvite(codeFrom(keep.link), guest.id).poolId, poolId)

    for (const inviteId of [revokeMe.id, used.id]) {
      const response = await call('DELETE', `/pools/${poolId}/invites/${inviteId}`, { token: admin.token })
      assert.equal(response.status, 409)
      assert.equal(response.json.type, 'invite_not_active')
    }
    clock.current = startOfTests + sevenDays + 1000
    assert.throws(() => invites.revokeInvite(admin.id, poolId, expiring.id), (error) => error.status === 409 && error.type === 'invite_not_active')
    clock.current = startOfTests

    assert.equal((await call('DELETE', `/pools/${poolId}/invites/inexistente`, { token: admin.token })).status, 404)
    assert.equal((await call('DELETE', `/pools/${poolId}/invites/${foreign.id}`, { token: admin.token })).status, 404)
    const statuses = Object.fromEntries(database.prepare('SELECT id, status FROM pool_invites').all().map(({ id, status }) => [id, status]))
    assert.equal(statuses[foreign.id], 'active')
    assert.equal(statuses[keep.id], 'active')
    assert.equal(statuses[revokeMe.id], 'revoked')
    assert.equal(statuses[used.id], 'used')
  })
})

test('TC-13: os cinco casos de convite indisponível recebem a mesma resposta na verificação e no consumo', async () => {
  await withHttpApp(async ({ call, signUp, createPool, invites, clock, database }) => {
    const admin = await signUp('Ana', 'ana@example.com')
    const guest = await signUp('Caio', 'caio@example.com')
    const other = await signUp('Duda', 'duda@example.com')
    const poolId = await createPool(admin)
    const bia = await signUp('Bia', 'bia@example.com')
    const endedPool = await createPool(bia, { name: 'Bolão encerrado' })
    const create = async (pool, owner) => codeFrom((await call('POST', `/pools/${pool}/invites`, { token: owner.token })).json.invite.link)
    const revoked = await create(poolId, admin)
    const usedByOther = await create(poolId, admin)
    const expired = await create(poolId, admin)
    const ended = await create(endedPool, bia)
    const revokedInvite = database.prepare('SELECT id FROM pool_invites ORDER BY created_at, rowid LIMIT 1').get()
    await call('DELETE', `/pools/${poolId}/invites/${revokedInvite.id}`, { token: admin.token })
    invites.consumeInvite(usedByOther, other.id)
    database.prepare("UPDATE pools SET status = 'ended' WHERE id = ?").run(endedPool)
    database.prepare('UPDATE pool_invites SET expires_at = ?, created_at = ? WHERE code_hash = ?')
      .run(startOfTests - 1000, startOfTests - 2000, hashOf(expired))
    clock.current = startOfTests

    const outcomes = []
    for (const code of ['codigo-inexistente', revoked, usedByOther, expired, ended]) {
      for (const operation of [invites.verifyInvite, invites.consumeInvite]) {
        try {
          operation(code, guest.id)
          outcomes.push('aceito')
        } catch (error) {
          outcomes.push(`${error.status}|${error.type}|${error.message}`)
        }
      }
    }

    assert.equal(outcomes.length, 10)
    assert.equal(new Set(outcomes).size, 1)
    assert.equal(outcomes[0], '404|invite_unavailable|Convite indisponível.')
  })
})

test('TC-14: consumir um convite não cria participação nem dá acesso às regras do bolão', async () => {
  await withHttpApp(async ({ call, signUp, createPool, invites, database }) => {
    const admin = await signUp('Ana', 'ana@example.com')
    const guest = await signUp('Caio', 'caio@example.com')
    const poolId = await createPool(admin)
    const code = codeFrom((await call('POST', `/pools/${poolId}/invites`, { token: admin.token })).json.invite.link)
    const before = database.prepare('SELECT * FROM pool_participations ORDER BY id').all()

    invites.consumeInvite(code, guest.id)

    assert.deepEqual(database.prepare('SELECT * FROM pool_participations ORDER BY id').all(), before)
    assert.equal((await call('GET', `/pools/${poolId}`, { token: guest.token })).status, 404)
    assert.deepEqual((await call('GET', '/pools', { token: guest.token })).json, { pools: [] })
    assert.equal((await call('POST', `/pools/${poolId}/invites`, { token: guest.token })).status, 404)
  })
})

test('TC-15: falha na auditoria durante criação ou revogação não persiste nada', async () => {
  await withHttpApp(async ({ call, signUp, createPool, database }) => {
    const admin = await signUp('Ana', 'ana@example.com')
    const poolId = await createPool(admin)

    database.exec(`
      CREATE TRIGGER fail_invite_audit BEFORE INSERT ON audit_records
      WHEN NEW.action = 'invite.created' AND NEW.result = 'success'
      BEGIN SELECT RAISE(ABORT, 'falha simulada'); END
    `)
    expectCommonFormat(await call('POST', `/pools/${poolId}/invites`, { token: admin.token }), 500, 'internal_error')
    assert.equal(inviteCount(database), 0)
    database.exec('DROP TRIGGER fail_invite_audit')

    const invite = (await call('POST', `/pools/${poolId}/invites`, { token: admin.token })).json.invite
    database.exec(`
      CREATE TRIGGER fail_revoke_audit BEFORE INSERT ON audit_records
      WHEN NEW.action = 'invite.revoked' AND NEW.result = 'success'
      BEGIN SELECT RAISE(ABORT, 'falha simulada'); END
    `)
    expectCommonFormat(await call('DELETE', `/pools/${poolId}/invites/${invite.id}`, { token: admin.token }), 500, 'internal_error')
    assert.equal(database.prepare('SELECT status FROM pool_invites').get().status, 'active')
    assert.equal(database.prepare('SELECT revoked_at FROM pool_invites').get().revoked_at, null)
    database.exec('DROP TRIGGER fail_revoke_audit')
    assert.equal((await call('DELETE', `/pools/${poolId}/invites/${invite.id}`, { token: admin.token })).status, 200)
  })
})

test('TC-16 e TC-17: requisições diretas ao backend seguem a mesma autorização por papel, sem a interface', async () => {
  await withHttpApp(async ({ call, signUp, createPool, addMember, database }) => {
    const admin = await signUp('Ana', 'ana@example.com')
    const member = await signUp('Caio', 'caio@example.com')
    const stranger = await signUp('Dani', 'dani@example.com')
    const poolId = await createPool(admin)
    addMember(poolId, member, 'participant', 'confirmed')
    const invite = (await call('POST', `/pools/${poolId}/invites`, { token: admin.token })).json.invite
    const calls = [
      ['POST', `/pools/${poolId}/invites`],
      ['GET', `/pools/${poolId}/invites`],
      ['DELETE', `/pools/${poolId}/invites/${invite.id}`],
    ]

    for (const [method, route] of calls) {
      assert.equal((await call(method, route)).status, 401, `${method} sem sessão`)
      assert.equal((await call(method, route, { token: member.token })).status, 403, `${method} participante`)
      assert.equal((await call(method, route, { token: stranger.token })).status, 404, `${method} não membro`)
    }
    assert.equal(database.prepare('SELECT status FROM pool_invites WHERE id = ?').get(invite.id).status, 'active')
    assert.equal(inviteCount(database), 1)
  })
})

test('TC-18: respostas de erro e registros técnicos nunca contêm o código do convite', async () => {
  await withHttpApp(async ({ call, signUp, createPool, invites, events, responses }) => {
    const admin = await signUp('Ana', 'ana@example.com')
    const guest = await signUp('Caio', 'caio@example.com')
    const poolId = await createPool(admin)
    const code = codeFrom((await call('POST', `/pools/${poolId}/invites`, { token: admin.token })).json.invite.link)
    const attempt = 'CODIGO-SECRETO-QUE-NAO-EXISTE'
    const start = responses.length

    const errors = []
    for (const operation of [invites.verifyInvite, invites.consumeInvite]) {
      for (const probe of [attempt, code.slice(0, 5), 'x'.repeat(400)]) {
        try { operation(probe, guest.id) } catch (error) { errors.push(`${error.message}|${error.type}`) }
      }
    }
    invites.consumeInvite(code, guest.id)
    try { invites.consumeInvite(code, 'outro-usuario') } catch (error) { errors.push(`${error.message}|${error.type}`) }
    await call('DELETE', `/pools/${poolId}/invites/inexistente`, { token: admin.token })

    const outputs = [...errors, ...responses.slice(start), JSON.stringify(events)]
    for (const output of outputs) {
      assert.equal(output.includes(attempt), false)
      assert.equal(output.includes(code), false)
    }
  })
})

test('TC-19: cada categoria de erro segue o formato comum, com correlação e sem detalhes internos', async () => {
  await withHttpApp(async ({ call, signUp, createPool, addMember, database }) => {
    const admin = await signUp('Ana', 'ana@example.com')
    const member = await signUp('Caio', 'caio@example.com')
    const poolId = await createPool(admin)
    addMember(poolId, member, 'participant', 'confirmed')
    const invite = (await call('POST', `/pools/${poolId}/invites`, { token: admin.token })).json.invite

    expectCommonFormat(await call('GET', `/pools/${poolId}/invites`), 401, 'session_rejected')
    expectCommonFormat(await call('GET', `/pools/${poolId}/invites`, { token: member.token }), 403, 'forbidden')
    expectCommonFormat(await call('GET', '/pools/inexistente/invites', { token: admin.token }), 404, 'not_found')
    await call('DELETE', `/pools/${poolId}/invites/${invite.id}`, { token: admin.token })
    expectCommonFormat(await call('DELETE', `/pools/${poolId}/invites/${invite.id}`, { token: admin.token }), 409, 'invite_not_active')
    database.exec("CREATE TRIGGER fail_invite BEFORE INSERT ON pool_invites BEGIN SELECT RAISE(ABORT, 'falha simulada'); END")
    const internal = await call('POST', `/pools/${poolId}/invites`, { token: admin.token })
    expectCommonFormat(internal, 500, 'internal_error')
    assert.equal(internal.json.message, 'Ocorreu uma falha interna.')
  })
})

test('TC-21: criação, revogação e tentativa negada geram registros com ator, objeto e resultado', async () => {
  await withHttpApp(async ({ call, signUp, createPool, addMember, auditStore }) => {
    const admin = await signUp('Ana', 'ana@example.com')
    const member = await signUp('Caio', 'caio@example.com')
    const poolId = await createPool(admin)
    addMember(poolId, member, 'participant', 'confirmed')
    const invite = (await call('POST', `/pools/${poolId}/invites`, { token: admin.token })).json.invite
    await call('DELETE', `/pools/${poolId}/invites/${invite.id}`, { token: admin.token })
    await call('POST', `/pools/${poolId}/invites`, { token: member.token })

    const onInvite = auditStore.findByObject({ type: 'invite', id: invite.id })
    assert.deepEqual(onInvite.map(({ action, result }) => [action, result]).sort(), [
      ['invite.created', 'success'],
      ['invite.revoked', 'success'],
    ])
    assert.ok(onInvite.every((record) => record.actor.id === admin.id && record.actor.type === 'user'))
    const onPool = auditStore.findByObject({ type: 'pool', id: poolId })
    assert.equal(onPool.filter((record) => record.result === 'denied').length, 1)
    assert.equal(onPool.find((record) => record.result === 'denied').actor.id, member.id)
  })
})

test('migração 006: aceita o status saiu, mantém as restrições e os índices da participação', async () => {
  await withHttpApp(async ({ signUp, createPool, addMember, database }) => {
    const admin = await signUp('Ana', 'ana@example.com')
    const member = await signUp('Caio', 'caio@example.com')
    const poolId = await createPool(admin)

    addMember(poolId, member, 'participant', 'left')
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM pool_participations WHERE status = 'left'").get().count, 1)
    assert.throws(() => database.prepare("UPDATE pool_participations SET status = 'invalido' WHERE status = 'left'").run())
    assert.throws(() => database.prepare("UPDATE pool_participations SET role = 'dono' WHERE status = 'left'").run())
    assert.throws(() => addMember(poolId, member, 'participant', 'confirmed'), /UNIQUE/)
    const indexes = database.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'pool_participations'").all().map(({ name }) => name)
    assert.ok(indexes.includes('pool_participations_user'))
  })
})
