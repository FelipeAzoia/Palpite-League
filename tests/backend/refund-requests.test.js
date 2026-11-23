import assert from 'node:assert/strict'
import test from 'node:test'
import { createSimulatedPaymentsProvider } from '../../src/backend/adapters/simulated-payments-provider.js'
import { refundActions } from '../../src/backend/modules/pools-participations/index.js'
import { expectCommonFormat, withHttpApp } from './support/app-harness.js'

// SPEC-023 — solicitação e decisão administrativa de devolução, com o simulador de pagamentos.

function withRefunds(callback) {
  const provider = createSimulatedPaymentsProvider()
  return withHttpApp((context) => callback({ ...context, provider }), { paymentsProvider: provider })
}

async function payFee(context, user, poolId) {
  const started = await context.call('POST', `/pools/${poolId}/entry-fee/payment`, { token: user.token })
  assert.equal(started.status, 201, started.text)
  context.provider.confirm(context.database.prepare('SELECT operation_key FROM financial_movements WHERE id = ?').get(started.json.payment.id).operation_key)
  const checked = await context.call('POST', `/pools/${poolId}/entry-fee/payment/check`, { token: user.token })
  assert.equal(checked.json.participation.status, 'confirmed', checked.text)
}

async function leave(context, user, poolId) {
  const response = await context.call('POST', `/pools/${poolId}/exit`, { token: user.token, body: { confirm: true } })
  assert.equal(response.status, 200, response.text)
}

// Bolão com taxa de R$ 25,00: Ana administra; Caio é coadministrador; Bruno pagou e saiu.
async function setup(context) {
  const admin = await context.signUp('Ana')
  const coadmin = await context.signUp('Caio')
  const member = await context.signUp('Bruno')
  const pool = await context.createPool(admin, { entryFee: 25 })
  const { poolId } = pool
  await payFee(context, admin, poolId)
  const coadminParticipation = await context.joinPool(admin, coadmin, poolId)
  await payFee(context, coadmin, poolId)
  const promoted = await context.call('POST', `/pools/${poolId}/participants/${coadminParticipation}/promote`, { token: admin.token })
  assert.equal(promoted.status, 200, promoted.text)
  const memberParticipation = await context.joinPool(admin, member, poolId)
  await payFee(context, member, poolId)
  await leave(context, member, poolId)
  return { admin, coadmin, member, poolId, memberParticipation, matches: pool.matches }
}

const request = (context, user, poolId, body) => context.call('POST', `/pools/${poolId}/refund-request`, { token: user.token, body })
const own = (context, user, poolId) => context.call('GET', `/pools/${poolId}/refund-request`, { token: user.token })
const pending = (context, user, poolId) => context.call('GET', `/pools/${poolId}/refund-requests`, { token: user.token })
const decide = (context, user, poolId, id, decision) => context.call('POST', `/pools/${poolId}/refund-requests/${id}/${decision}`, { token: user.token })

function audits(context, action) {
  return context.database.prepare('SELECT * FROM audit_records WHERE action = ? ORDER BY id').all(action)
    .map((row) => ({ ...row, details: row.details_json === null ? null : JSON.parse(row.details_json) }))
}

const refundMovements = (context) => context.database.prepare("SELECT COUNT(*) AS n FROM financial_movements WHERE type = 'refund'").get().n
const requests = (context) => context.database.prepare('SELECT * FROM refund_requests').all()

test('CT-01 e CT-03: ex-participante com taxa confirmada pede a devolução; o valor vem do backend', async () => {
  await withRefunds(async (context) => {
    const { member, poolId, memberParticipation } = await setup(context)
    const response = await request(context, member, poolId)

    assert.equal(response.status, 201, response.text)
    assert.equal(response.json.request.status, 'pending')
    assert.equal(response.json.request.amountCents, 2500)
    assert.equal(response.json.request.amount, '25.00')
    assert.equal(response.json.canRequest, false)
    assert.equal(response.json.reason, 'refund_already_requested')
    const [row] = requests(context)
    assert.equal(row.participation_id, memberParticipation)
    assert.equal(row.user_id, member.id)
    assert.equal(new Date(row.requested_at).toISOString(), row.requested_at)
    const source = context.database.prepare('SELECT * FROM financial_movements WHERE id = ?').get(row.source_movement_id)
    assert.equal(source.type, 'entry_fee')
    assert.equal(source.status, 'confirmed')
    assert.equal(source.operation_id, memberParticipation)
    assert.deepEqual(audits(context, refundActions.requested)[0].details, { amountCents: 2500 })
    assert.equal(refundMovements(context), 0)
  })
})

test('CT-03: valor enviado pelo cliente é rejeitado e nada é registrado', async () => {
  await withRefunds(async (context) => {
    const { member, poolId } = await setup(context)
    const response = await request(context, member, poolId, { amountCents: 99999 })
    expectCommonFormat(response, 400, 'validation_error')
    assert.ok(response.json.fields.amountCents)
    assert.equal(requests(context).length, 0)
  })
})

test('CT-02: a saída não cria pedido nem devolução', async () => {
  await withRefunds(async (context) => {
    const { member, poolId } = await setup(context)
    assert.equal(requests(context).length, 0)
    assert.equal(refundMovements(context), 0)
    const view = (await own(context, member, poolId)).json
    assert.equal(view.request, null)
    assert.equal(view.canRequest, true)
    assert.equal(view.eligibleAmountCents, 2500)
  })
})

test('CT-04: não saiu, sem taxa, já devolvida e bolão encerrado recebem conflito sem registro', async () => {
  await withRefunds(async (context) => {
    const { admin, coadmin, poolId } = await setup(context)
    expectCommonFormat(await request(context, coadmin, poolId), 409, 'participation_not_left')

    // Saiu de um bolão sem taxa: não há taxa a devolver.
    const freeAdmin = await context.signUp('Duda')
    const freeMember = await context.signUp('Edu')
    const free = await context.createPool(freeAdmin)
    await context.joinPool(freeAdmin, freeMember, free.poolId)
    await leave(context, freeMember, free.poolId)
    expectCommonFormat(await request(context, freeMember, free.poolId), 409, 'entry_fee_not_paid')

    // Taxa já em devolução (movimentação de devolução da SPEC-024 referenciando a original).
    const leaver = await context.signUp('Fábio')
    await context.joinPool(admin, leaver, poolId)
    await payFee(context, leaver, poolId)
    await leave(context, leaver, poolId)
    const original = context.database.prepare(`
      SELECT m.id FROM financial_movements m JOIN pool_participations p ON p.id = m.operation_id
      WHERE p.user_id = ? AND m.type = 'entry_fee'
    `).get(leaver.id)
    await context.app.locals.financial.startMovement({
      type: 'refund', amountCents: 2500, userId: leaver.id,
      operation: { type: 'refund_request', id: 'externo' }, originalMovementId: original.id,
    })
    expectCommonFormat(await request(context, leaver, poolId), 409, 'already_refunded')

    const last = await context.signUp('Gil')
    await context.joinPool(admin, last, poolId)
    await payFee(context, last, poolId)
    await leave(context, last, poolId)
    context.database.prepare("UPDATE pools SET status = 'ended' WHERE id = ?").run(poolId)
    expectCommonFormat(await request(context, last, poolId), 409, 'pool_ended')

    assert.equal(requests(context).length, 0)
    // Recusas por conflito de estado não são auditadas (OPEN-124).
    assert.equal(context.database.prepare("SELECT COUNT(*) AS n FROM audit_records WHERE action LIKE 'refund.%'").get().n, 0)
  })
})

test('CT-05: pedido repetido e pedidos simultâneos geram um único pedido', async () => {
  await withRefunds(async (context) => {
    const { member, poolId } = await setup(context)
    const responses = await Promise.all([request(context, member, poolId), request(context, member, poolId), request(context, member, poolId)])
    assert.deepEqual(responses.map(({ status }) => status).sort(), [201, 409, 409])
    expectCommonFormat(await request(context, member, poolId), 409, 'refund_already_requested')
    assert.equal(requests(context).length, 1)
  })
})

test('CT-06 e CT-15: administrador e coadministrador aprovam; aprovada aguarda processamento, sem devolução', async () => {
  for (const decider of ['admin', 'coadmin']) {
    await withRefunds(async (context) => {
      const users = await setup(context)
      const { member, poolId } = users
      await request(context, member, poolId)

      const list = await pending(context, users[decider], poolId)
      assert.equal(list.status, 200, list.text)
      assert.equal(list.json.requests.length, 1)
      const [item] = list.json.requests
      assert.deepEqual(Object.keys(item).sort(), ['amount', 'amountCents', 'id', 'requestedAt', 'requesterName'])
      assert.equal(item.requesterName, 'Bruno')
      assert.equal(list.text.includes(member.email), false)

      const approved = await decide(context, users[decider], poolId, item.id, 'approve')
      assert.equal(approved.status, 200, approved.text)
      assert.equal(approved.json.request.status, 'approved')
      assert.equal(approved.json.request.displayStatus, 'awaiting_processing')
      assert.equal(approved.json.request.decidedBy, users[decider].id)
      const [row] = requests(context)
      assert.equal(row.decided_by, users[decider].id)
      assert.equal(new Date(row.decided_at).toISOString(), row.decided_at)
      assert.equal(audits(context, refundActions.approved)[0].actor_id, users[decider].id)
      assert.equal(refundMovements(context), 0)

      const view = (await own(context, member, poolId)).json.request
      assert.equal(view.displayStatus, 'awaiting_processing')
      assert.equal(JSON.stringify(view).includes('refunded'), false)
      assert.equal((await pending(context, users[decider], poolId)).json.requests.length, 0)
    })
  }
})

test('CT-07 e CT-11: rejeição é final; decisão repetida recebe conflito e a primeira prevalece', async () => {
  await withRefunds(async (context) => {
    const { admin, coadmin, member, poolId } = await setup(context)
    const created = (await request(context, member, poolId)).json.request
    const rejected = await decide(context, admin, poolId, created.id, 'reject')
    assert.equal(rejected.json.request.status, 'rejected')
    expectCommonFormat(await decide(context, coadmin, poolId, created.id, 'approve'), 409, 'refund_already_decided')
    assert.equal(requests(context)[0].status, 'rejected')
    assert.equal(requests(context)[0].decided_by, admin.id)
    assert.equal(audits(context, refundActions.rejected)[0].result, 'success')
    assert.throws(() => context.database.prepare("UPDATE refund_requests SET status = 'approved'").run(), /final/)
    // Novo pedido após a rejeição não é permitido (OPEN-118).
    expectCommonFormat(await request(context, member, poolId), 409, 'refund_already_requested')
  })
})

test('CT-11: decisões simultâneas registram uma única decisão', async () => {
  await withRefunds(async (context) => {
    const { admin, coadmin, member, poolId } = await setup(context)
    const created = (await request(context, member, poolId)).json.request
    const responses = await Promise.all([
      decide(context, admin, poolId, created.id, 'approve'),
      decide(context, coadmin, poolId, created.id, 'reject'),
    ])
    assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 409])
    const winner = responses.find(({ status }) => status === 200).json.request.status
    assert.equal(requests(context)[0].status, winner)
  })
})

test('CT-08 e CT-16: membro sem papel de administração é negado e auditado, inclusive por chamada direta', async () => {
  await withRefunds(async (context) => {
    const { admin, member, poolId } = await setup(context)
    const plain = await context.signUp('Hugo')
    await context.joinPool(admin, plain, poolId)
    await payFee(context, plain, poolId)
    const created = (await request(context, member, poolId)).json.request

    expectCommonFormat(await pending(context, plain, poolId), 403, 'forbidden')
    expectCommonFormat(await decide(context, plain, poolId, created.id, 'approve'), 403, 'forbidden')
    expectCommonFormat(await decide(context, plain, poolId, created.id, 'reject'), 403, 'forbidden')
    assert.equal(audits(context, refundActions.listed)[0].result, 'denied')
    assert.equal(audits(context, refundActions.approved)[0].result, 'denied')
    assert.equal(audits(context, refundActions.rejected)[0].result, 'denied')
    assert.equal(requests(context)[0].status, 'pending')
  })
})

test('CT-09, CT-10 e CT-13: não membro, o próprio solicitante e terceiros não decidem nem veem o pedido alheio', async () => {
  await withRefunds(async (context) => {
    const { member, poolId } = await setup(context)
    const created = (await request(context, member, poolId)).json.request
    const outsider = await context.signUp('Iara')

    const listed = await pending(context, outsider, poolId)
    expectCommonFormat(listed, 404, 'not_found')
    const missing = await pending(context, outsider, '00000000-0000-4000-8000-000000000000')
    assert.equal(missing.json.message, listed.json.message)
    expectCommonFormat(await decide(context, outsider, poolId, created.id, 'approve'), 404, 'not_found')
    // O solicitante saiu: para a administração do bolão ele não é membro.
    expectCommonFormat(await decide(context, member, poolId, created.id, 'approve'), 404, 'not_found')
    expectCommonFormat(await own(context, outsider, poolId), 404, 'not_found')
    expectCommonFormat(await request(context, outsider, poolId), 404, 'not_found')
    expectCommonFormat(await context.call('GET', `/pools/${poolId}/refund-request`), 401, 'session_rejected')
    expectCommonFormat(await context.call('GET', '/account/refund-requests'), 401, 'session_rejected')
    assert.deepEqual((await context.call('GET', '/account/refund-requests', { token: outsider.token })).json, { refunds: [] })
    assert.equal(requests(context)[0].status, 'pending')
  })
})

test('CT-10: o banco nunca aceita o solicitante como decisor', async () => {
  await withRefunds(async (context) => {
    const { member, poolId } = await setup(context)
    await request(context, member, poolId)
    assert.throws(() => context.database.prepare("UPDATE refund_requests SET status = 'approved', decided_by = user_id, decided_at = 'x'").run())
  })
})

test('CT-12: sem decisor elegível, o pedido permanece pendente', async () => {
  await withRefunds(async (context) => {
    const { member, poolId } = await setup(context)
    await request(context, member, poolId)
    for (const task of Object.values(context.app.locals.tasks)) await task()
    assert.equal(requests(context)[0].status, 'pending')
  })
})

test('CT-14: falha durante a decisão desfaz tudo e o pedido permanece pendente', async () => {
  await withRefunds(async (context) => {
    const { admin, member, poolId } = await setup(context)
    const created = (await request(context, member, poolId)).json.request
    context.database.exec(`
      CREATE TEMP TRIGGER fail_decision AFTER UPDATE ON refund_requests
      BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;
    `)
    expectCommonFormat(await decide(context, admin, poolId, created.id, 'approve'), 500, 'internal_error')
    assert.equal(requests(context)[0].status, 'pending')
    assert.equal(requests(context)[0].decided_by, null)
    assert.equal(audits(context, refundActions.approved).filter(({ result }) => result === 'success').length, 0)
  })
})

test('CA-17: bolão encerrado não aceita decisão', async () => {
  await withRefunds(async (context) => {
    const { admin, member, poolId } = await setup(context)
    const created = (await request(context, member, poolId)).json.request
    context.database.prepare("UPDATE pools SET status = 'ended' WHERE id = ?").run(poolId)
    expectCommonFormat(await decide(context, admin, poolId, created.id, 'approve'), 409, 'pool_ended')
    assert.equal(requests(context)[0].status, 'pending')
  })
})

test('CT-17 e CT-18: auditoria em UTC e sem segredos; valor nunca maior que o pago', async () => {
  await withRefunds(async (context) => {
    const { admin, member, poolId } = await setup(context)
    const before = context.responses.length
    const created = (await request(context, member, poolId)).json.request
    await decide(context, admin, poolId, created.id, 'approve')
    const records = context.database.prepare("SELECT * FROM audit_records WHERE action LIKE 'refund.%'").all()
    assert.equal(records.length, 2)
    for (const record of records) assert.equal(new Date(record.occurred_at).toISOString(), record.occurred_at)
    const everything = JSON.stringify(records) + context.responses.slice(before).join('')
    assert.equal(everything.includes(member.email), false)
    assert.equal(/senha-segura|token|secret/i.test(everything), false)
    const [row] = requests(context)
    const paid = context.database.prepare('SELECT amount_cents FROM financial_movements WHERE id = ?').get(row.source_movement_id).amount_cents
    assert.ok(row.amount_cents <= paid)
  })
})

test('lista de devoluções próprias: só as participações que saiu com taxa confirmada', async () => {
  await withRefunds(async (context) => {
    const { member, poolId } = await setup(context)
    const before = (await context.call('GET', '/account/refund-requests', { token: member.token })).json.refunds
    assert.equal(before.length, 1)
    assert.equal(before[0].pool.id, poolId)
    assert.equal(before[0].canRequest, true)
    await request(context, member, poolId)
    const after = (await context.call('GET', '/account/refund-requests', { token: member.token })).json.refunds
    assert.equal(after[0].request.status, 'pending')
  })
})
