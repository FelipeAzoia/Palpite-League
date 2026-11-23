import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { defaultRefundProcessingIntervalMs } from '../../src/backend/app.js'
import { createSimulatedPaymentsProvider } from '../../src/backend/adapters/simulated-payments-provider.js'
import { refundProcessingActions } from '../../src/backend/modules/payments-subscriptions/index.js'
import { expectCommonFormat, withHttpApp } from './support/app-harness.js'

// SPEC-024 — processamento da devolução no provedor de teste, com o simulador de pagamentos, sem
// dinheiro real, sem credenciais e sem rede externa.

function withRefunds(callback) {
  const provider = createSimulatedPaymentsProvider()
  return withHttpApp((context) => callback({ ...context, provider }), { paymentsProvider: provider })
}

async function payFee(context, user, poolId) {
  const started = await context.call('POST', `/pools/${poolId}/entry-fee/payment`, { token: user.token })
  assert.equal(started.status, 201, started.text)
  context.provider.confirm(context.database.prepare('SELECT operation_key FROM financial_movements WHERE id = ?').get(started.json.payment.id).operation_key)
  await context.call('POST', `/pools/${poolId}/entry-fee/payment/check`, { token: user.token })
}

// Bolão com taxa de R$ 25,00: Ana administra e pagou; Caio é participante; Bruno pagou, saiu e pediu
// a devolução. Com approve, o pedido já sai aprovado.
async function setup(context, { approve = true } = {}) {
  const admin = await context.signUp('Ana')
  const member = await context.signUp('Bruno')
  const plain = await context.signUp('Caio')
  const { poolId } = await context.createPool(admin, { entryFee: 25 })
  await payFee(context, admin, poolId)
  await context.joinPool(admin, plain, poolId)
  await payFee(context, plain, poolId)
  await context.joinPool(admin, member, poolId)
  await payFee(context, member, poolId)
  assert.equal((await context.call('POST', `/pools/${poolId}/exit`, { token: member.token, body: { confirm: true } })).status, 200)
  const requested = await context.call('POST', `/pools/${poolId}/refund-request`, { token: member.token })
  assert.equal(requested.status, 201, requested.text)
  const requestId = requested.json.request.id
  if (approve) {
    const approved = await context.call('POST', `/pools/${poolId}/refund-requests/${requestId}/approve`, { token: admin.token })
    assert.equal(approved.status, 200, approved.text)
  }
  return { admin, member, plain, poolId, requestId }
}

const process = (context) => context.app.locals.tasks.processRefunds()
const reconcile = (context) => context.app.locals.tasks.reconcilePayments()
const ownView = async (context, user, poolId) => (await context.call('GET', `/pools/${poolId}/refund-request`, { token: user.token })).json.request
const adminList = (context, user, poolId) => context.call('GET', `/pools/${poolId}/refunds`, { token: user.token })
const retry = (context, user, poolId, id) => context.call('POST', `/pools/${poolId}/refunds/${id}/retry`, { token: user.token })

function refunds(context) {
  return context.database.prepare("SELECT * FROM financial_movements WHERE type = 'refund' ORDER BY attempt_number").all()
}

function source(context, requestId) {
  return context.database.prepare('SELECT m.* FROM financial_movements m JOIN refund_requests r ON r.source_movement_id = m.id WHERE r.id = ?').get(requestId)
}

function audits(context, action) {
  return context.database.prepare('SELECT * FROM audit_records WHERE action = ? ORDER BY id').all(action)
    .map((row) => ({ ...row, details: row.details_json === null ? null : JSON.parse(row.details_json) }))
}

test('CT-01, CT-03, CT-04, CT-16 e CT-17: pedido aprovado vira devolução na transação original e é concluída', async () => {
  await withRefunds(async (context) => {
    const { member, poolId, requestId } = await setup(context)
    const original = source(context, requestId)
    const before = { ...original }

    const result = await process(context)
    assert.deepEqual(result, { found: 1, started: 1, skipped: 0 })

    const [refund] = refunds(context)
    assert.equal(refund.status, 'confirmed')
    assert.equal(refund.amount_cents, 2500)
    assert.ok(refund.amount_cents <= original.amount_cents)
    assert.equal(refund.original_movement_id, original.id)
    assert.equal(refund.user_id, member.id)
    assert.equal(refund.operation_type, 'refund_request')
    assert.equal(refund.operation_id, requestId)
    assert.equal(refund.operation_key, `refund_request:${requestId}:attempt-1`)
    assert.equal(refund.origin, 'simulator')
    // O envio referenciou a transação original (INV-003).
    assert.deepEqual(context.provider.refundOf(refund.operation_key), { operationKey: original.operation_key, providerId: original.provider_id })
    // A movimentação de origem não muda (CA-18).
    assert.deepEqual(source(context, requestId), before)

    const view = await ownView(context, member, poolId)
    assert.equal(view.status, 'approved')
    assert.equal(view.displayStatus, 'completed')
    assert.equal(view.processing.simulated, true)
    const history = (await context.call('GET', '/account/financial-history', { token: member.token })).json.movements
    assert.equal(history.find(({ type }) => type === 'refund').simulated, true)

    const [started] = audits(context, refundProcessingActions.started)
    assert.equal(started.actor_type, 'system')
    assert.deepEqual(started.details, { amountCents: 2500, attemptNumber: 1 })
    assert.equal(audits(context, refundProcessingActions.completed)[0].actor_type, 'system')
    assert.equal(audits(context, 'financial.movement_created').at(-1).actor_type, 'system')
  })
})

test('CT-02: pedido pendente ou rejeitado não gera devolução', async () => {
  await withRefunds(async (context) => {
    const { admin, poolId, requestId } = await setup(context, { approve: false })
    assert.deepEqual(await process(context), { found: 0, started: 0, skipped: 0 })
    await context.call('POST', `/pools/${poolId}/refund-requests/${requestId}/reject`, { token: admin.token })
    assert.deepEqual(await process(context), { found: 0, started: 0, skipped: 0 })
    assert.equal(refunds(context).length, 0)
    assert.equal(context.provider.calls.start, 3)
  })
})

test('CT-05 e CT-12: recusa e transação não reembolsável ficam recusadas com o motivo, sem repetição', async () => {
  for (const outcome of ['refused', 'not_refundable']) {
    await withRefunds(async (context) => {
      const { member, poolId } = await setup(context)
      context.provider.setRefundOutcome(outcome)
      await process(context)

      const [refund] = refunds(context)
      const reason = outcome === 'not_refundable' ? 'not_refundable' : 'provider_refused'
      assert.equal(refund.status, 'refused')
      assert.equal(refund.refusal_reason, reason)
      const view = await ownView(context, member, poolId)
      assert.equal(view.status, 'approved')
      assert.equal(view.displayStatus, 'refused')
      assert.equal(view.processing.refusalReason, reason)
      const [refused] = audits(context, refundProcessingActions.refused)
      assert.equal(refused.result, 'failure')
      assert.equal(refused.details.refusalReason, reason)

      // Nenhuma tarefa cria nova tentativa (CA-10, INV-007).
      const starts = context.provider.calls.start
      await process(context)
      await reconcile(context)
      await process(context)
      assert.equal(context.provider.calls.start, starts)
      assert.equal(refunds(context).length, 1)
    })
  }
})

test('CT-06: devolução pendente aparece em processamento e a conferência resolve, sem nova movimentação', async () => {
  await withRefunds(async (context) => {
    const { member, poolId } = await setup(context)
    context.provider.setRefundOutcome('pending')
    await process(context)
    assert.equal((await ownView(context, member, poolId)).displayStatus, 'processing')
    await process(context)
    assert.equal(refunds(context).length, 1)

    context.provider.confirm(refunds(context)[0].operation_key)
    await reconcile(context)
    assert.equal(refunds(context)[0].status, 'confirmed')
    assert.equal((await ownView(context, member, poolId)).displayStatus, 'completed')
  })
})

test('CT-07: indisponibilidade, tempo esgotado e resposta ambígua mantêm pendente', async () => {
  for (const [stage, code, afterRegistering] of [['start', 'response_error', false], ['start', 'timeout', true], ['consult', 'invalid_response', false]]) {
    await withRefunds(async (context) => {
      const { member, poolId } = await setup(context)
      context.provider.failNext(stage, code, { afterRegistering })
      await process(context)
      const [refund] = refunds(context)
      assert.equal(refund.status, 'pending', `${stage}/${code}`)
      assert.equal((await ownView(context, member, poolId)).displayStatus, 'processing')
      assert.equal(audits(context, 'financial.provider_failed').at(-1).details.reason, code)

      // Quando o provedor recebeu o pedido, a conferência posterior resolve sem nova movimentação.
      if (afterRegistering || stage === 'consult') {
        context.provider.confirm(refund.operation_key)
        await reconcile(context)
        assert.equal(refunds(context)[0].status, 'confirmed')
      }
      assert.equal(refunds(context).length, 1)
    })
  }
})

test('CT-08: nova tentativa da administração após recusa cria a tentativa seguinte', async () => {
  await withRefunds(async (context) => {
    const { admin, member, poolId, requestId } = await setup(context)
    context.provider.setRefundOutcome('refused')
    await process(context)
    context.provider.setRefundOutcome('confirmed')

    const response = await retry(context, admin, poolId, requestId)
    assert.equal(response.status, 201, response.text)
    assert.equal(response.json.refund.state, 'completed')
    assert.equal(response.json.refund.attempts, 2)
    const [first, second] = refunds(context)
    assert.equal(first.status, 'refused')
    assert.equal(second.status, 'confirmed')
    assert.equal(second.operation_key, `refund_request:${requestId}:attempt-2`)
    const [retried] = audits(context, refundProcessingActions.retried)
    assert.equal(retried.actor_id, admin.id)
    assert.deepEqual(retried.details, { amountCents: 2500, attemptNumber: 2 })
    assert.equal((await ownView(context, member, poolId)).displayStatus, 'completed')
  })
})

test('CT-09: nova tentativa sem recusa, com devolução pendente ou concluída recebe conflito', async () => {
  await withRefunds(async (context) => {
    const { admin, poolId, requestId } = await setup(context)
    expectCommonFormat(await retry(context, admin, poolId, requestId), 409, 'refund_not_started')

    context.provider.setRefundOutcome('pending')
    await process(context)
    const consults = context.provider.calls.consult
    expectCommonFormat(await retry(context, admin, poolId, requestId), 409, 'refund_in_progress')
    // A tentativa anterior foi consultada antes de recusar (INV-006).
    assert.equal(context.provider.calls.consult, consults + 1)

    context.provider.confirm(refunds(context)[0].operation_key)
    expectCommonFormat(await retry(context, admin, poolId, requestId), 409, 'refund_completed')
    assert.equal(refunds(context).length, 1)
    // Conflitos de estado não são auditados (OPEN-133).
    assert.equal(audits(context, refundProcessingActions.retried).length, 0)
  })
})

test('CT-10: confirmação repetida não tem efeito adicional', async () => {
  await withRefunds(async (context) => {
    await setup(context)
    await process(context)
    const audited = context.database.prepare('SELECT COUNT(*) AS n FROM audit_records').get().n
    context.provider.confirm(refunds(context)[0].operation_key)
    await reconcile(context)
    await process(context)
    assert.equal(context.database.prepare('SELECT COUNT(*) AS n FROM audit_records').get().n, audited)
    assert.equal(refunds(context).length, 1)
  })
})

test('CT-11: falha ao registrar o resultado desfaz tudo e a conferência seguinte conclui', async () => {
  await withRefunds(async (context) => {
    const { member, poolId } = await setup(context)
    context.database.exec(`
      CREATE TEMP TRIGGER fail_refund_audit BEFORE INSERT ON audit_records
      WHEN NEW.action = 'refund.completed'
      BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;
    `)
    await process(context)
    assert.equal(refunds(context)[0].status, 'pending')
    assert.equal((await ownView(context, member, poolId)).displayStatus, 'processing')

    context.database.exec('DROP TRIGGER fail_refund_audit')
    await reconcile(context)
    assert.equal(refunds(context)[0].status, 'confirmed')
  })
})

test('CT-13: valor divergente informado pelo provedor não confirma; fica pendente e sinalizado', async () => {
  await withRefunds(async (context) => {
    const { admin, member, poolId } = await setup(context)
    context.provider.setRefundOutcome('amount_mismatch')
    await process(context)
    await reconcile(context)

    const [refund] = refunds(context)
    assert.equal(refund.status, 'pending')
    assert.equal(refund.inconsistency, 'amount_mismatch')
    assert.equal((await ownView(context, member, poolId)).processing.inconsistent, true)
    assert.equal((await adminList(context, admin, poolId)).json.refunds[0].inconsistent, true)
    // A sinalização é auditada uma única vez.
    const flagged = audits(context, 'financial.provider_inconsistent')
    assert.equal(flagged.length, 1)
    assert.deepEqual(flagged[0].details, { movementType: 'refund', amountCents: 2500, reportedAmountCents: 2501, origin: 'simulator' })
  })
})

test('CT-14 e CT-15: só solicitante e administração veem; membro sem papel é negado e auditado', async () => {
  await withRefunds(async (context) => {
    const { admin, plain, poolId, requestId } = await setup(context)
    context.provider.setRefundOutcome('refused')
    await process(context)
    const outsider = await context.signUp('Duda')

    const listed = await adminList(context, admin, poolId)
    assert.equal(listed.status, 200, listed.text)
    const [item] = listed.json.refunds
    assert.equal(item.requesterName, 'Bruno')
    assert.equal(item.state, 'refused')
    assert.equal(item.canRetry, true)
    const movement = refunds(context)[0]
    for (const secret of [movement.operation_key, movement.provider_id]) assert.equal(listed.text.includes(secret), false)

    expectCommonFormat(await adminList(context, plain, poolId), 403, 'forbidden')
    expectCommonFormat(await retry(context, plain, poolId, requestId), 403, 'forbidden')
    assert.equal(audits(context, refundProcessingActions.retried)[0].result, 'denied')
    assert.equal(audits(context, refundProcessingActions.listed)[0].result, 'denied')
    expectCommonFormat(await adminList(context, outsider, poolId), 404, 'not_found')
    expectCommonFormat(await retry(context, outsider, poolId, requestId), 404, 'not_found')
    expectCommonFormat(await context.call('GET', `/pools/${poolId}/refund-request`, { token: outsider.token }), 404, 'not_found')
    expectCommonFormat(await context.call('GET', `/pools/${poolId}/refunds`), 401, 'session_rejected')
    assert.equal(refunds(context).length, 1)
  })
})

test('A página de pagamento simulado não aceita decidir uma devolução', async () => {
  await withRefunds(async (context) => {
    const { member } = await setup(context)
    context.provider.setRefundOutcome('pending')
    await process(context)
    const [refund] = refunds(context)
    expectCommonFormat(await context.call('GET', `/payments/simulated-checkout/${refund.id}`, { token: member.token }), 404, 'not_found')
    expectCommonFormat(await context.call('POST', `/payments/simulated-checkout/${refund.id}/decision`, {
      token: member.token, body: { decision: 'approve' },
    }), 404, 'not_found')
    assert.equal(refunds(context)[0].status, 'pending')
  })
})

test('CT-18: auditoria em UTC, com o sistema como ator nas ações automáticas e sem segredos', async () => {
  await withRefunds(async (context) => {
    const { member } = await setup(context)
    await process(context)
    const records = context.database.prepare("SELECT * FROM audit_records WHERE action IN ('refund.processing_started', 'refund.completed')").all()
    assert.equal(records.length, 2)
    for (const record of records) {
      assert.equal(record.actor_type, 'system')
      assert.equal(new Date(record.occurred_at).toISOString(), record.occurred_at)
    }
    const text = JSON.stringify(records)
    assert.equal(text.includes(member.email), false)
    assert.equal(/token|secret|senha/i.test(text), false)
  })
})

test('CT-19: pré-condição interna violada não envia nada e vai ao log técnico', async () => {
  await withRefunds(async (context) => {
    const { requestId } = await setup(context)
    // Devolução ativa da mesma origem criada por fora (outra operação).
    const original = source(context, requestId)
    await context.app.locals.financial.startMovement({
      type: 'refund', amountCents: 2500, userId: original.user_id,
      operation: { type: 'refund_request', id: 'outra-operacao' }, originalMovementId: original.id,
    })
    const starts = context.provider.calls.start
    const result = await process(context)
    assert.equal(result.skipped, 1)
    assert.equal(context.provider.calls.start, starts)
    assert.equal(context.events.some((event) => event.component === 'refund-processing' && event.result === 'precondition_failed_active_refund_exists'), true)
    assert.equal(refunds(context).filter(({ operation_id: id }) => id === requestId).length, 0)
  })
})

test('CT-20: a devolução não altera ranking, participação nem o bolão', async () => {
  await withRefunds(async (context) => {
    const { admin, member, poolId } = await setup(context)
    const snapshot = () => ({
      participations: context.database.prepare('SELECT id, status, total_points, payment_confirmed FROM pool_participations ORDER BY id').all(),
      pool: context.database.prepare('SELECT * FROM pools WHERE id = ?').get(poolId),
      ranking: null,
    })
    const before = snapshot()
    const rankingBefore = (await context.call('GET', `/pools/${poolId}/ranking`, { token: admin.token })).json
    await process(context)
    assert.deepEqual(snapshot(), before)
    assert.deepEqual((await context.call('GET', `/pools/${poolId}/ranking`, { token: admin.token })).json, rankingBefore)
    assert.equal(context.database.prepare('SELECT status FROM pool_participations WHERE user_id = ?').get(member.id).status, 'left')
  })
})

test('processamento independe do bolão encerrado; tarefa registrada a cada 1 minuto', async () => {
  assert.equal(defaultRefundProcessingIntervalMs, 60 * 1000)
  const entry = fs.readFileSync(new URL('../../src/backend/index.js', import.meta.url), 'utf8')
  assert.match(entry, /'refund-processing'/)
  await withRefunds(async (context) => {
    const { poolId } = await setup(context)
    context.database.prepare("UPDATE pools SET status = 'ended' WHERE id = ?").run(poolId)
    await process(context)
    assert.equal(refunds(context)[0].status, 'confirmed')
  })
})
