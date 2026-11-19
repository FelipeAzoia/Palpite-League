import assert from 'node:assert/strict'
import test from 'node:test'
import { createSimulatedSportsProvider } from '../../src/backend/adapters/simulated-sports-provider.js'
import { createSportsCatalogService } from '../../src/backend/modules/matches-results/index.js'
import {
  createParticipationDecisionsService,
  createPoolsService,
} from '../../src/backend/modules/pools-participations/index.js'
import { expectCommonFormat, startOfTests, withHttpApp } from './support/app-harness.js'

async function setup(context, poolOptions = {}) {
  const admin = await context.signUp('Ana')
  const guest = await context.signUp('Bruno')
  const pool = await context.createPool(admin, poolOptions)
  const requestId = await context.requestEntry(admin, guest, pool.poolId)
  return { admin, guest, requestId, ...pool }
}

const deniedCount = (database, action) => database.prepare(
  "SELECT COUNT(*) AS count FROM audit_records WHERE action = ? AND result = 'denied'",
).get(action).count

test('TC-01: a lista mostra só as solicitações pendentes do bolão, com nome, data e entrada tardia, sem e-mail', async () => {
  await withHttpApp(async (context) => {
    const { admin, guest, poolId, requestId } = await setup(context)
    const decided = await context.signUp('Carla')
    const decidedId = await context.requestEntry(admin, decided, poolId)
    await context.call('POST', `/pools/${poolId}/requests/${decidedId}/reject`, { token: admin.token })
    const otherAdmin = await context.signUp('Diego')
    const otherPool = await context.createPool(otherAdmin)
    await context.requestEntry(otherAdmin, await context.signUp('Elisa'), otherPool.poolId)

    const response = await context.call('GET', `/pools/${poolId}/requests`, { token: admin.token })

    assert.equal(response.status, 200)
    assert.deepEqual(response.json.requests, [
      { id: requestId, name: 'Bruno', requestedAt: new Date(startOfTests).toISOString(), lateEntry: false },
    ])
    assert.equal(response.text.includes(guest.email), false)
    assert.equal(/@example\.com|code|invite/.test(response.text), false)
  })
})

test('TC-02: aprovar em bolão sem taxa confirma a participação, com data, sinalizador, pagamento, auditoria e acesso de membro', async () => {
  await withHttpApp(async (context) => {
    const { admin, guest, poolId, requestId } = await setup(context)
    context.clock.current += 60_000

    const response = await context.call('POST', `/pools/${poolId}/requests/${requestId}/approve`, { token: admin.token })

    assert.equal(response.status, 200)
    assert.deepEqual(response.json.participation, {
      id: requestId,
      status: 'confirmed',
      paymentConfirmed: true,
      joinedAt: new Date(context.clock.current).toISOString(),
      lateEntry: false,
    })
    const row = context.participation(requestId)
    assert.equal(row.status, 'confirmed')
    assert.equal(row.joined_at, new Date(context.clock.current).toISOString())
    assert.equal(row.late_entry, 0)
    assert.equal(row.payment_confirmed, 1)
    const [record] = context.auditStore.findByObject({ type: 'participation', id: requestId })
      .filter(({ action }) => action === 'participation.approved')
    assert.equal(record.result, 'success')
    assert.equal(record.actor.id, admin.id)
    assert.deepEqual(record.details, { outcome: 'confirmed', lateEntry: false })
    assert.equal((await context.call('GET', `/pools/${poolId}`, { token: guest.token })).status, 200)
    assert.deepEqual((await context.call('GET', '/pools', { token: guest.token })).json.pools.map(({ id }) => id), [poolId])
  })
})

test('TC-03: o sinalizador de entrada tardia considera partida iniciada e ignora partida apenas cancelada', async () => {
  await withHttpApp(async (context) => {
    const late = await setup(context)
    context.startMatch(late.matches[0].id)
    const lateResponse = await context.call('POST', `/pools/${late.poolId}/requests/${late.requestId}/approve`, { token: late.admin.token })
    assert.equal(lateResponse.json.participation.lateEntry, true)
    assert.equal(context.participation(late.requestId).late_entry, 1)

    const admin = await context.signUp('Fábio')
    const pool = await context.createPool(admin)
    const requestId = await context.requestEntry(admin, await context.signUp('Gabi'), pool.poolId)
    context.startMatch(pool.matches[0].id, { status: 'cancelled' })
    const cancelled = await context.call('POST', `/pools/${pool.poolId}/requests/${requestId}/approve`, { token: admin.token })
    assert.equal(cancelled.json.participation.lateEntry, false)
  })
})

test('TC-04 e TC-14: participante comum recebe 403, não membro 404 e sem sessão 401, sem alteração', async () => {
  await withHttpApp(async (context) => {
    const { admin, poolId, requestId } = await setup(context)
    const member = await context.signUp('Hugo')
    await context.joinPool(admin, member, poolId)
    const outsider = await context.signUp('Iara')

    for (const [token, status, type] of [[member.token, 403, 'forbidden'], [outsider.token, 404, 'not_found']]) {
      expectCommonFormat(await context.call('GET', `/pools/${poolId}/requests`, { token }), status, type)
      expectCommonFormat(await context.call('POST', `/pools/${poolId}/requests/${requestId}/approve`, { token }), status, type)
      expectCommonFormat(await context.call('POST', `/pools/${poolId}/requests/${requestId}/reject`, { token }), status, type)
    }
    expectCommonFormat(await context.call('POST', `/pools/${poolId}/requests/${requestId}/approve`), 401, 'session_rejected')
    expectCommonFormat(await context.call('GET', '/pools/nao-existe/requests', { token: admin.token }), 404, 'not_found')

    assert.equal(context.participation(requestId).status, 'requested')
    assert.equal(deniedCount(context.database, 'participation.approved'), 2)
    assert.equal(deniedCount(context.database, 'participation.rejected'), 2)
    assert.equal(deniedCount(context.database, 'participation.requests_listed'), 3)
  })
})

test('TC-05: aprovar em bolão com taxa deixa aguardando pagamento, sem data de entrada, e o usuário é membro', async () => {
  await withHttpApp(async (context) => {
    const { admin, guest, poolId, requestId } = await setup(context, { entryFee: '10.00' })

    const response = await context.call('POST', `/pools/${poolId}/requests/${requestId}/approve`, { token: admin.token })

    assert.equal(response.status, 200)
    assert.deepEqual(response.json.participation, { id: requestId, status: 'approved_awaiting_payment', paymentConfirmed: false })
    const row = context.participation(requestId)
    assert.equal(row.status, 'approved_awaiting_payment')
    assert.equal(row.joined_at, null)
    assert.equal(row.late_entry, null)
    assert.equal(row.payment_confirmed, 0)
    assert.equal((await context.call('GET', `/pools/${poolId}`, { token: guest.token })).status, 200)
    const [record] = context.auditStore.findByObject({ type: 'participation', id: requestId })
      .filter(({ action }) => action === 'participation.approved')
    assert.deepEqual(record.details, { outcome: 'awaiting_payment', lateEntry: false })
  })
})

test('TC-06: rejeitar deixa a participação rejeitada, sem acesso, e uma nova solicitação recebe 409', async () => {
  await withHttpApp(async (context) => {
    const { admin, guest, poolId, requestId } = await setup(context)

    const response = await context.call('POST', `/pools/${poolId}/requests/${requestId}/reject`, { token: admin.token })

    assert.equal(response.status, 200)
    assert.deepEqual(response.json.participation, { id: requestId, status: 'rejected' })
    expectCommonFormat(await context.call('GET', `/pools/${poolId}`, { token: guest.token }), 404, 'not_found')
    const code = await context.inviteCode(admin, poolId)
    const reopened = await context.call('POST', '/invites/open', { token: guest.token, body: { code } })
    assert.equal(reopened.json.situation.status, 'rejected')
    expectCommonFormat(await context.call('POST', '/invites/requests', {
      token: guest.token, body: { code, rulesAccepted: true },
    }), 409, 'participation_exists')
    const records = context.auditStore.findByObject({ type: 'participation', id: requestId })
      .filter(({ action }) => action === 'participation.rejected')
    assert.equal(records.length, 1)
    assert.equal(records[0].details, null)
  })
})

test('TC-07: coadministrador confirmado lista, aprova e rejeita solicitações', async () => {
  await withHttpApp(async (context) => {
    const { admin, poolId, requestId } = await setup(context)
    const coadmin = await context.signUp('João')
    const coadminId = await context.joinPool(admin, coadmin, poolId)
    context.database.prepare("UPDATE pool_participations SET role = 'coadministrator' WHERE id = ?").run(coadminId)
    const other = await context.requestEntry(admin, await context.signUp('Karla'), poolId)

    assert.equal((await context.call('GET', `/pools/${poolId}/requests`, { token: coadmin.token })).json.requests.length, 2)
    assert.equal((await context.call('POST', `/pools/${poolId}/requests/${requestId}/approve`, { token: coadmin.token })).status, 200)
    assert.equal((await context.call('POST', `/pools/${poolId}/requests/${other}/reject`, { token: coadmin.token })).status, 200)
  })
})

test('TC-08: decidir de novo uma solicitação já decidida devolve 409 e nada muda', async () => {
  await withHttpApp(async (context) => {
    const { admin, poolId, requestId } = await setup(context)
    await context.call('POST', `/pools/${poolId}/requests/${requestId}/approve`, { token: admin.token })
    const before = context.participation(requestId)

    for (const action of ['approve', 'reject']) {
      expectCommonFormat(await context.call('POST', `/pools/${poolId}/requests/${requestId}/${action}`, { token: admin.token }), 409, 'request_already_decided')
    }
    assert.deepEqual(context.participation(requestId), before)
  })
})

test('TC-09: aprovar e rejeitar simultâneos efetivam apenas uma decisão', async () => {
  await withHttpApp(async (context) => {
    const { admin, poolId, requestId } = await setup(context)

    const responses = await Promise.all(['approve', 'reject'].map((action) => (
      context.call('POST', `/pools/${poolId}/requests/${requestId}/${action}`, { token: admin.token })
    )))

    assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 409])
    const successes = context.database.prepare(`
      SELECT COUNT(*) AS count FROM audit_records
      WHERE object_id = ? AND result = 'success' AND action IN ('participation.approved', 'participation.rejected')
    `).get(requestId).count
    assert.equal(successes, 1)
  })
})

test('TC-10: bolão encerrado não aceita decisões (409)', async () => {
  await withHttpApp(async (context) => {
    const { admin, poolId, requestId } = await setup(context)
    context.database.prepare("UPDATE pools SET status = 'ended' WHERE id = ?").run(poolId)

    for (const action of ['approve', 'reject']) {
      expectCommonFormat(await context.call('POST', `/pools/${poolId}/requests/${requestId}/${action}`, { token: admin.token }), 409, 'pool_ended')
    }
    assert.equal(context.participation(requestId).status, 'requested')
  })
})

test('TC-11: falha na auditoria deixa a solicitação pendente e nenhum dado de entrada gravado', async () => {
  await withHttpApp(async (context) => {
    const { admin, poolId, requestId } = await setup(context)
    context.database.exec(`
      CREATE TRIGGER fail_decision_audit BEFORE INSERT ON audit_records
      WHEN NEW.action IN ('participation.approved', 'participation.rejected') AND NEW.result = 'success'
      BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;
    `)

    for (const action of ['approve', 'reject']) {
      expectCommonFormat(await context.call('POST', `/pools/${poolId}/requests/${requestId}/${action}`, { token: admin.token }), 500, 'internal_error')
    }
    const row = context.participation(requestId)
    assert.equal(row.status, 'requested')
    assert.equal(row.joined_at, null)
    assert.equal(row.late_entry, null)
  })
})

test('TC-13: decidir solicitação de outro bolão devolve 404 e não altera regras nem outras participações', async () => {
  await withHttpApp(async (context) => {
    const { admin, poolId, requestId } = await setup(context)
    const otherAdmin = await context.signUp('Lara')
    const other = await context.createPool(otherAdmin)
    const otherRequest = await context.requestEntry(otherAdmin, await context.signUp('Mário'), other.poolId)
    const snapshot = () => ({
      pools: context.database.prepare('SELECT * FROM pools ORDER BY id').all(),
      participations: context.database.prepare('SELECT * FROM pool_participations ORDER BY id').all(),
    })
    const before = snapshot()

    expectCommonFormat(await context.call('POST', `/pools/${poolId}/requests/${otherRequest}/approve`, { token: admin.token }), 404, 'not_found')
    expectCommonFormat(await context.call('POST', `/pools/${poolId}/requests/inexistente/reject`, { token: admin.token }), 404, 'not_found')
    assert.deepEqual(snapshot(), before)

    await context.call('POST', `/pools/${poolId}/requests/${requestId}/approve`, { token: admin.token })
    const after = snapshot()
    assert.deepEqual(after.pools, before.pools)
    assert.deepEqual(after.participations.filter(({ id }) => id !== requestId), before.participations.filter(({ id }) => id !== requestId))
  })
})

test('TC-15: a confirmação interna é idempotente e recusa status incompatível', async () => {
  await withHttpApp(async (context) => {
    const { admin, poolId, requestId } = await setup(context, { entryFee: '10.00' })
    await context.call('POST', `/pools/${poolId}/requests/${requestId}/approve`, { token: admin.token })
    const catalog = createSportsCatalogService(context.database, createSimulatedSportsProvider(), { now: () => context.clock.current })
    const pools = createPoolsService(context.database, { auditStore: context.auditStore, sportsCatalog: catalog, now: () => context.clock.current })
    const decisions = createParticipationDecisionsService(context.database, { auditStore: context.auditStore, pools, now: () => context.clock.current })

    const first = decisions.confirmParticipation(requestId)
    context.clock.current += 5 * 60_000
    const second = decisions.confirmParticipation(requestId)

    assert.equal(first.changed, true)
    assert.equal(second.changed, false)
    assert.equal(second.joinedAt, first.joinedAt)
    assert.equal(second.lateEntry, first.lateEntry)
    assert.equal(context.participation(requestId).joined_at, first.joinedAt)

    const rejected = await context.requestEntry(admin, await context.signUp('Nina'), poolId)
    await context.call('POST', `/pools/${poolId}/requests/${rejected}/reject`, { token: admin.token })
    assert.throws(() => decisions.confirmParticipation(rejected), { type: 'participation_not_confirmable' })
  })
})
