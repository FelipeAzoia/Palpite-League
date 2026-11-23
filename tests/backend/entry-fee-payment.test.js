import assert from 'node:assert/strict'
import test from 'node:test'
import { createSimulatedPaymentsProvider } from '../../src/backend/adapters/simulated-payments-provider.js'
import { entryFeeActions } from '../../src/backend/modules/payments-subscriptions/index.js'
import { expectCommonFormat, withHttpApp } from './support/app-harness.js'

// SPEC-022 — pagamento da taxa de entrada. A suíte usa o simulador de pagamentos, sem dinheiro real,
// sem credenciais e sem rede externa.

function withPayments(callback) {
  const provider = createSimulatedPaymentsProvider()
  return withHttpApp((context) => callback({ ...context, provider }), { paymentsProvider: provider })
}

// Bolão com taxa de R$ 25,00 e um participante aprovado aguardando pagamento.
async function setup(context, { entryFee = 25 } = {}) {
  const admin = await context.signUp('Ana')
  const member = await context.signUp('Bruno')
  const pool = await context.createPool(admin, { entryFee })
  const participationId = await context.joinPool(admin, member, pool.poolId)
  return { admin, member, poolId: pool.poolId, participationId, matches: pool.matches }
}

const start = (context, user, poolId, body) => context.call('POST', `/pools/${poolId}/entry-fee/payment`, { token: user.token, body })
const check = (context, user, poolId) => context.call('POST', `/pools/${poolId}/entry-fee/payment/check`, { token: user.token })
const status = (context, user, poolId) => context.call('GET', `/pools/${poolId}/entry-fee`, { token: user.token })

function movements(context) {
  return context.database.prepare("SELECT * FROM financial_movements WHERE type = 'entry_fee' ORDER BY attempt_number").all()
}

function audits(context, action) {
  return context.database.prepare('SELECT * FROM audit_records WHERE action = ? ORDER BY id').all(action)
    .map((row) => ({ ...row, details: row.details_json === null ? null : JSON.parse(row.details_json) }))
}

// Paga na página simulada e confere, como a volta do checkout.
async function pay(context, user, poolId, decision = 'approve') {
  const started = await start(context, user, poolId)
  assert.equal(started.status, 201, started.text)
  const decided = await context.call('POST', `/payments/simulated-checkout/${started.json.payment.id}/decision`, {
    token: user.token, body: { decision },
  })
  assert.equal(decided.status, 200, decided.text)
  return check(context, user, poolId)
}

test('CT-01: titular aprovado inicia a cobrança com o valor da taxa do bolão', async () => {
  await withPayments(async (context) => {
    const { member, poolId, participationId } = await setup(context)
    const response = await start(context, member, poolId)

    assert.equal(response.status, 201, response.text)
    assert.equal(response.json.canPay, false)
    assert.equal(response.json.reason, 'entry_fee_pending')
    assert.deepEqual(response.json.entryFee, { amountCents: 2500, amount: '25.00', currency: 'BRL' })
    assert.equal(response.json.payment.status, 'pending')
    assert.equal(response.json.payment.amountCents, 2500)
    assert.equal(response.json.payment.attemptNumber, 1)
    assert.deepEqual(response.json.payment.continuation, { kind: 'simulated_checkout', simulated: true })
    assert.deepEqual(response.json.participation, { id: participationId, status: 'approved_awaiting_payment', paymentConfirmed: false })

    const [movement] = movements(context)
    assert.equal(movement.status, 'pending')
    assert.equal(movement.user_id, member.id)
    assert.equal(movement.operation_type, 'participation')
    assert.equal(movement.operation_id, participationId)
    assert.equal(movement.operation_key, `participation:${participationId}:attempt-1`)
    const [started] = audits(context, entryFeeActions.started)
    assert.equal(started.actor_id, member.id)
    assert.deepEqual(started.details, { amountCents: 2500, attemptNumber: 1 })
    assert.equal(context.participation(participationId).status, 'approved_awaiting_payment')
  })
})

test('CT-02: valor ou qualquer campo enviado pelo cliente é rejeitado e nada é criado', async () => {
  await withPayments(async (context) => {
    const { member, poolId } = await setup(context)
    const response = await start(context, member, poolId, { amountCents: 1 })
    expectCommonFormat(response, 400, 'validation_error')
    assert.ok(response.json.fields.amountCents)
    assert.equal(movements(context).length, 0)
  })
})

test('CT-03 e CT-17: confirmação verificável confirma movimentação e participação; simulação identificada', async () => {
  await withPayments(async (context) => {
    const { member, poolId, participationId } = await setup(context)
    const response = await pay(context, member, poolId)

    assert.equal(response.status, 200, response.text)
    assert.equal(response.json.payment.status, 'confirmed')
    assert.equal(response.json.payment.simulated, true)
    assert.equal(response.json.simulated, true)
    assert.equal(response.json.environment, 'test')
    assert.deepEqual(response.json.participation, { id: participationId, status: 'confirmed', paymentConfirmed: true })
    const participation = context.participation(participationId)
    assert.equal(participation.payment_confirmed, 1)
    assert.ok(participation.joined_at)
    assert.equal(movements(context)[0].origin, 'simulator')
    const [confirmed] = audits(context, entryFeeActions.confirmed)
    assert.equal(confirmed.actor_type, 'system')
    assert.equal(confirmed.origin, 'simulator')
    assert.deepEqual(confirmed.details, { amountCents: 2500, attemptNumber: 1, lateEntry: false })
    // O histórico próprio identifica a simulação.
    const history = await context.call('GET', '/account/financial-history', { token: member.token })
    assert.equal(history.json.movements.find(({ type }) => type === 'entry_fee').simulated, true)
  })
})

test('CT-04: falha no meio da confirmação desfaz tudo e a conferência seguinte conclui', async () => {
  await withPayments(async (context) => {
    const { member, poolId, participationId } = await setup(context)
    const started = (await start(context, member, poolId)).json
    context.provider.confirm(movements(context)[0].operation_key)
    context.database.exec(`
      CREATE TRIGGER fail_confirmation BEFORE UPDATE OF status ON pool_participations
      BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;
    `)

    const failed = await check(context, member, poolId)
    assert.equal(failed.status, 200)
    assert.equal(failed.json.payment.status, 'pending')
    assert.equal(context.participation(participationId).status, 'approved_awaiting_payment')
    assert.equal(audits(context, entryFeeActions.confirmed).length, 0)

    context.database.exec('DROP TRIGGER fail_confirmation')
    await context.app.locals.tasks.reconcilePayments()
    assert.equal(movements(context)[0].status, 'confirmed')
    assert.equal(context.participation(participationId).status, 'confirmed')
    assert.equal(started.payment.id, movements(context)[0].id)
  })
})

test('CT-05 e CT-19: recusa mantém a participação não confirmada e não há nova cobrança automática', async () => {
  await withPayments(async (context) => {
    const { member, poolId, participationId } = await setup(context)
    const response = await pay(context, member, poolId, 'refuse')

    assert.equal(response.json.payment.status, 'refused')
    assert.equal(response.json.payment.providerUnavailable, false)
    assert.equal(response.json.canPay, true)
    assert.equal(context.participation(participationId).status, 'approved_awaiting_payment')
    const [refused] = audits(context, entryFeeActions.refused)
    assert.equal(refused.result, 'failure')
    assert.deepEqual(refused.details, { attemptNumber: 1, cause: 'provider_refused' })

    const startsBefore = context.provider.calls.start
    await context.app.locals.tasks.reconcilePayments()
    await context.app.locals.tasks.reconcilePayments()
    assert.equal(context.provider.calls.start, startsBefore)
    assert.equal(movements(context).length, 1)
  })
})

test('CT-06: pagamento pendente continua pendente, sem nova cobrança, até a conferência', async () => {
  await withPayments(async (context) => {
    const { member, poolId, participationId } = await setup(context)
    await start(context, member, poolId)

    const pending = await status(context, member, poolId)
    assert.equal(pending.json.payment.status, 'pending')
    assert.equal(pending.json.reason, 'entry_fee_pending')
    assert.equal((await check(context, member, poolId)).json.payment.status, 'pending')
    assert.equal(context.participation(participationId).status, 'approved_awaiting_payment')

    context.provider.confirm(movements(context)[0].operation_key)
    await context.app.locals.tasks.reconcilePayments()
    assert.equal(context.participation(participationId).status, 'confirmed')
    assert.equal(movements(context).length, 1)
  })
})

test('CT-07: provedor indisponível não cria cobrança e registra a tentativa como recusada', async () => {
  await withPayments(async (context) => {
    const { member, poolId, participationId } = await setup(context)
    context.provider.failNext('start', 'timeout')

    const response = await start(context, member, poolId)
    expectCommonFormat(response, 503, 'payments_provider_unavailable')
    const [movement] = movements(context)
    assert.equal(movement.status, 'refused')
    assert.equal(movement.provider_id, null)
    assert.equal(context.participation(participationId).status, 'approved_awaiting_payment')
    assert.deepEqual(audits(context, entryFeeActions.refused)[0].details, { attemptNumber: 1, cause: 'provider_unavailable' })
    const view = (await status(context, member, poolId)).json
    assert.equal(view.payment.providerUnavailable, true)
    assert.equal(view.canPay, true)
  })
})

test('CT-08: nova tentativa após recusa consulta a anterior e usa o número seguinte', async () => {
  await withPayments(async (context) => {
    const { member, poolId, participationId } = await setup(context)
    await pay(context, member, poolId, 'refuse')
    const consultsBefore = context.provider.calls.consult

    const retry = await start(context, member, poolId)
    assert.equal(retry.status, 201, retry.text)
    assert.equal(retry.json.payment.attemptNumber, 2)
    assert.equal(movements(context)[1].operation_key, `participation:${participationId}:attempt-2`)
    assert.equal(context.provider.calls.consult, consultsBefore)

    const confirmed = await check(context, member, poolId)
    assert.equal(confirmed.json.payment.status, 'pending')
    context.provider.confirm(movements(context)[1].operation_key)
    assert.equal((await check(context, member, poolId)).json.participation.status, 'confirmed')
  })
})

test('CT-09: com tentativa pendente ou já confirmada, nova cobrança recebe conflito e nada é criado', async () => {
  await withPayments(async (context) => {
    const { member, poolId } = await setup(context)
    await start(context, member, poolId)
    const consultsBefore = context.provider.calls.consult

    const again = await start(context, member, poolId)
    expectCommonFormat(again, 409, 'entry_fee_pending')
    // Antes de recusar, o estado da tentativa anterior foi consultado no provedor (A5).
    assert.equal(context.provider.calls.consult, consultsBefore + 1)
    assert.equal(movements(context).length, 1)

    context.provider.confirm(movements(context)[0].operation_key)
    await context.app.locals.tasks.reconcilePayments()
    expectCommonFormat(await start(context, member, poolId), 409, 'participation_already_confirmed')
    assert.equal(movements(context).length, 1)
  })
})

test('CT-10: solicitações simultâneas criam uma única cobrança', async () => {
  await withPayments(async (context) => {
    const { member, poolId } = await setup(context)
    const responses = await Promise.all([start(context, member, poolId), start(context, member, poolId), start(context, member, poolId)])
    assert.deepEqual(responses.map(({ status: code }) => code).sort(), [201, 409, 409])
    assert.equal(movements(context).length, 1)
    assert.equal(context.provider.calls.start, 1)
  })
})

test('CT-11: a mesma confirmação recebida várias vezes não tem efeito adicional', async () => {
  await withPayments(async (context) => {
    const { member, poolId, participationId } = await setup(context)
    await pay(context, member, poolId)
    const joinedAt = context.participation(participationId).joined_at
    const auditCount = context.database.prepare('SELECT COUNT(*) AS n FROM audit_records').get().n

    context.provider.confirm(movements(context)[0].operation_key)
    await check(context, member, poolId)
    await context.app.locals.tasks.reconcilePayments()

    assert.equal(context.participation(participationId).joined_at, joinedAt)
    assert.equal(context.database.prepare('SELECT COUNT(*) AS n FROM audit_records').get().n, auditCount)
    assert.equal(movements(context).length, 1)
  })
})

test('OPEN-110: o criador do bolão com taxa paga como qualquer titular aprovado', async () => {
  await withPayments(async (context) => {
    const { admin, poolId } = await setup(context)
    const view = (await status(context, admin, poolId)).json
    assert.equal(view.participation.status, 'approved_awaiting_payment')
    assert.equal(view.canPay, true)
    assert.equal((await pay(context, admin, poolId)).json.participation.status, 'confirmed')
  })
})

test('CT-12: participação não aprovada, já confirmada, bolão sem taxa e bolão encerrado recebem conflito', async () => {
  await withPayments(async (context) => {
    const { admin, member, poolId } = await setup(context)
    const requester = await context.signUp('Caio')
    await context.requestEntry(admin, requester, poolId)
    expectCommonFormat(await start(context, requester, poolId), 409, 'participation_not_payable')
    // O criador também paga a taxa (OPEN-110); depois de pago, nova cobrança recebe conflito.
    assert.equal((await pay(context, admin, poolId)).json.participation.status, 'confirmed')
    expectCommonFormat(await start(context, admin, poolId), 409, 'participation_already_confirmed')

    const freeAdmin = await context.signUp('Duda')
    const freeMember = await context.signUp('Edu')
    const free = await context.createPool(freeAdmin)
    await context.joinPool(freeAdmin, freeMember, free.poolId)
    expectCommonFormat(await start(context, freeMember, free.poolId), 409, 'entry_fee_not_required')

    context.database.prepare("UPDATE pools SET status = 'ended' WHERE id = ?").run(poolId)
    expectCommonFormat(await start(context, member, poolId), 409, 'pool_ended')
    assert.equal(movements(context).length, 1)
    // Recusas por conflito de estado não são auditadas (OPEN-115).
    assert.equal(audits(context, entryFeeActions.started).length, 1)
  })
})

test('CT-13: outro usuário e sem autenticação não iniciam nem consultam, sem revelar a participação', async () => {
  await withPayments(async (context) => {
    const { poolId } = await setup(context)
    const outsider = await context.signUp('Fred')
    const own = await start(context, outsider, poolId)
    expectCommonFormat(own, 404, 'not_found')
    expectCommonFormat(await status(context, outsider, poolId), 404, 'not_found')
    expectCommonFormat(await check(context, outsider, poolId), 404, 'not_found')
    const missing = await status(context, outsider, '00000000-0000-4000-8000-000000000000')
    expectCommonFormat(missing, 404, 'not_found')
    assert.equal(missing.json.message, own.json.message)
    expectCommonFormat(await context.call('POST', `/pools/${poolId}/entry-fee/payment`), 401, 'session_rejected')
    expectCommonFormat(await context.call('GET', `/pools/${poolId}/entry-fee`), 401, 'session_rejected')
    // A simulação de pagamento de outro usuário também não é acessível.
    assert.equal(movements(context).length, 0)
  })
})

test('CT-14: a administração vê só a situação da participação, sem detalhes da movimentação', async () => {
  await withPayments(async (context) => {
    const { admin, member, poolId } = await setup(context)
    await start(context, member, poolId)
    const movement = movements(context)[0]

    const listed = await context.call('GET', `/pools/${poolId}/participants`, { token: admin.token })
    assert.equal(listed.status, 200, listed.text)
    const entry = listed.json.participants.find(({ name }) => name === 'Bruno')
    assert.equal(entry.status, 'approved_awaiting_payment')
    for (const secret of [movement.id, movement.operation_key, String(movement.provider_id), '2500']) {
      assert.equal(listed.text.includes(secret), false, secret)
    }
    expectCommonFormat(await context.call('GET', `/payments/simulated-checkout/${movement.id}`, { token: admin.token }), 404, 'not_found')
  })
})

test('CT-15: pagamento confirmado após saída, rejeição ou encerramento fica sinalizado e não confirma', async () => {
  for (const scenario of ['left', 'pool_ended']) {
    await withPayments(async (context) => {
      const { member, poolId, participationId } = await setup(context)
      await start(context, member, poolId)
      if (scenario === 'left') {
        context.database.prepare("UPDATE pool_participations SET status = 'left' WHERE id = ?").run(participationId)
      } else {
        context.database.prepare("UPDATE pools SET status = 'ended' WHERE id = ?").run(poolId)
      }
      context.provider.confirm(movements(context)[0].operation_key)
      await context.app.locals.tasks.reconcilePayments()

      assert.equal(movements(context)[0].status, 'confirmed')
      assert.notEqual(context.participation(participationId).status, 'confirmed')
      assert.equal(context.participation(participationId).payment_confirmed, 0)
      const flag = context.database.prepare('SELECT * FROM entry_fee_late_payments').get()
      assert.equal(flag.reason, scenario)
      assert.equal(flag.participation_id, participationId)
      assert.deepEqual(audits(context, entryFeeActions.latePayment)[0].details, { amountCents: 2500, reason: scenario })
      // Nenhum reembolso automático (ADR-0003).
      assert.equal(context.database.prepare("SELECT COUNT(*) AS n FROM financial_movements WHERE type = 'refund'").get().n, 0)
    })
  }
})

test('CT-16: participação não confirmada por pagamento não palpita nem aparece no ranking', async () => {
  await withPayments(async (context) => {
    const { admin, member, poolId, matches } = await setup(context)
    // O criador paga a própria taxa para ver o ranking como participante confirmado.
    await pay(context, admin, poolId)
    const prediction = await context.call('PUT', `/pools/${poolId}/matches/${matches[0].id}/prediction`, {
      token: member.token, body: { type: 'outcome', outcome: 'home' },
    })
    assert.ok([403, 404, 409].includes(prediction.status), prediction.text)
    const ranking = await context.call('GET', `/pools/${poolId}/ranking`, { token: admin.token })
    assert.equal(ranking.json.participants.some(({ name }) => name === 'Bruno'), false)

    await pay(context, member, poolId)
    const after = await context.call('GET', `/pools/${poolId}/ranking`, { token: admin.token })
    assert.equal(after.json.participants.some(({ name }) => name === 'Bruno'), true)
  })
})

test('CT-18: registros em UTC e respostas e auditoria sem segredos', async () => {
  await withPayments(async (context) => {
    const { member, poolId } = await setup(context)
    const before = context.responses.length
    const paid = await pay(context, member, poolId)
    assert.equal(paid.status, 200)
    const [movement] = movements(context)
    assert.equal(new Date(movement.created_at).toISOString(), movement.created_at)
    const records = context.database.prepare("SELECT * FROM audit_records WHERE action LIKE 'entry_fee.%'").all()
    assert.ok(records.length >= 2)
    for (const record of records) assert.equal(new Date(record.occurred_at).toISOString(), record.occurred_at)
    const everything = JSON.stringify(records) + context.responses.slice(before).join('')
    assert.equal(everything.includes(member.email), false)
    assert.equal(/access_token|senha-segura|secret/i.test(everything), false)
  })
})

test('CT-20: o valor cobrado é o da criação do bolão, em centavos inteiros, e não muda', async () => {
  await withPayments(async (context) => {
    const { member, poolId } = await setup(context, { entryFee: '12,34'.replace(',', '.') })
    assert.throws(() => context.database.prepare('UPDATE pools SET entry_fee_cents = 1 WHERE id = ?').run(poolId))
    const response = await start(context, member, poolId)
    assert.equal(response.json.payment.amountCents, 1234)
    assert.equal(response.json.payment.amount, '12.34')
    assert.equal(Number.isInteger(movements(context)[0].amount_cents), true)
  })
})
