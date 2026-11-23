import assert from 'node:assert/strict'
import test from 'node:test'
import { createSimulatedPaymentsProvider } from '../../src/backend/adapters/simulated-payments-provider.js'
import {
  addBillingCycle,
  billingPolicyVersion,
  createPremiumSubscriptionService,
  lifecycleActions,
  renewalGraceMs,
} from '../../src/backend/modules/payments-subscriptions/index.js'
import { expectCommonFormat, startOfTests, withHttpApp } from './support/app-harness.js'

// SPEC-029 — renovação recorrente, plano anual e pagamento em atraso. Sempre com o simulador, que
// faz o papel do provedor que cobra cada ciclo; nada vai à rede.

const minute = 60 * 1000

function withSimulator(callback) {
  const provider = createSimulatedPaymentsProvider()
  return withHttpApp((context) => callback({ ...context, provider }), { paymentsProvider: provider })
}

async function becomePremium(context, user, billingCycle = 'monthly') {
  const created = await context.call('POST', '/account/premium/subscription', {
    token: user.token, body: { confirm: true, billingPolicyVersion, billingCycle },
  })
  assert.equal(created.status, 201, created.text)
  await context.call('POST', `/payments/simulated-checkout/${created.json.subscription.movementId}/decision`, {
    token: user.token, body: { decision: 'approve' },
  })
  const checked = await context.call('POST', '/account/premium/subscription/check', { token: user.token })
  assert.equal(checked.json.subscription.status, 'active', checked.text)
  return checked.json.subscription
}

const consult = async (context, user) => (await context.call('GET', '/account/subscription', { token: user.token })).json
const process = (context) => context.app.locals.tasks.processSubscriptions()
const retry = (context, user) => context.call('POST', '/account/subscription/renewal/retry', { token: user.token })
const renewals = (context, id) => context.database.prepare(`
  SELECT * FROM financial_movements WHERE type = 'subscription_renewal' AND operation_id = ? ORDER BY created_at, attempt_number
`).all(id)
const auditsOf = (context, id) => context.auditStore.findByObject({ type: 'subscription', id })

test('TC-01: as condições mostram mensal e anual com valores do backend; ciclo inválido é recusado', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const conditions = (await context.call('GET', '/account/premium', { token: ana.token })).json
    assert.deepEqual(conditions.cycles, [
      { id: 'monthly', priceCents: 1990, amount: '19.90', monthlyEquivalentCents: 1990, savingsCents: 0 },
      { id: 'annual', priceCents: 19900, amount: '199.00', monthlyEquivalentCents: 1658, savingsCents: 3980 },
    ])

    for (const billingCycle of ['weekly', 'ANNUAL', 12, null]) {
      const refused = await context.call('POST', '/account/premium/subscription', {
        token: ana.token, body: { confirm: true, billingPolicyVersion, billingCycle },
      })
      expectCommonFormat(refused, 400, 'validation_error')
      assert.ok(refused.json.fields.billingCycle)
    }
    // O cliente não define valor nem desconto (INV-001).
    const tampered = await context.call('POST', '/account/premium/subscription', {
      token: ana.token, body: { confirm: true, billingPolicyVersion, billingCycle: 'annual', priceCents: 100 },
    })
    expectCommonFormat(tampered, 400, 'validation_error')
    assert.equal(context.database.prepare('SELECT COUNT(*) AS n FROM subscriptions').get().n, 0)

    // O anual sempre custa menos que doze mensalidades (INV-002).
    const options = { auditStore: context.auditStore, financialCore: context.app.locals.financial, paymentsProvider: context.provider }
    assert.throws(() => createPremiumSubscriptionService(context.database, { ...options, priceCents: 1990, annualPriceCents: 23880 }), RangeError)
  })
})

test('TC-02: o anual custa R$ 199,00 e vale doze meses de calendário', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const subscription = await becomePremium(context, ana, 'annual')
    assert.equal(subscription.billingCycle, 'annual')
    assert.equal(subscription.amountCents, 19900)
    assert.equal(subscription.startsAt, new Date(startOfTests).toISOString())
    assert.equal(subscription.endsAt, '2027-11-14T15:00:00.000Z')
    assert.equal(subscription.nextChargeAt, subscription.endsAt)
    const payment = context.database.prepare("SELECT amount_cents FROM financial_movements WHERE type = 'subscription'").get()
    assert.equal(payment.amount_cents, 19900)
    assert.equal(auditsOf(context, subscription.id)[0].details.billingCycle, 'annual')

    assert.equal(addBillingCycle('2028-02-29T10:00:00.000Z', 'annual'), '2029-02-28T10:00:00.000Z')
    assert.equal(addBillingCycle('2026-12-31T10:00:00.000Z', 'monthly'), '2027-01-31T10:00:00.000Z')
    assert.equal(addBillingCycle('2026-01-31T10:00:00.000Z', 'monthly'), '2026-02-28T10:00:00.000Z')
  })
})

test('TC-03: no fim do período o provedor cobra e a vigência é estendida por um ciclo (mensal e anual)', async () => {
  for (const [cycle, amount, firstEnd, secondEnd] of [
    ['monthly', 1990, '2026-12-14T15:00:00.000Z', '2027-01-14T15:00:00.000Z'],
    ['annual', 19900, '2027-11-14T15:00:00.000Z', '2028-11-14T15:00:00.000Z'],
  ]) {
    await withSimulator(async (context) => {
      const ana = await context.signUp('Ana')
      const { id, endsAt } = await becomePremium(context, ana, cycle)
      assert.equal(endsAt, firstEnd)

      context.clock.current = Date.parse(endsAt) - 1
      assert.deepEqual(await process(context), { renewed: 0, pastDue: 0, expired: 0, cancelled: 0 })
      context.clock.current = Date.parse(endsAt)
      assert.deepEqual(await process(context), { renewed: 1, pastDue: 0, expired: 0, cancelled: 0 })

      const view = (await consult(context, ana)).subscription
      assert.equal(view.status, 'active')
      assert.equal(view.endsAt, secondEnd)
      assert.equal(view.startsAt, new Date(startOfTests).toISOString())
      const [renewal] = renewals(context, id)
      assert.deepEqual([renewal.status, renewal.amount_cents, renewal.origin], ['confirmed', amount, 'simulator'])
      assert.equal(renewal.business_reference, `subscription_renewal:${id}:${firstEnd}`)
      const renewed = auditsOf(context, id).at(-1)
      assert.equal(renewed.action, lifecycleActions.renewed)
      assert.deepEqual(renewed.actor, { type: 'system' })
      assert.deepEqual(renewed.details, { previousState: 'past_due', newState: 'active', origin: 'simulator', endsAt: secondEnd })

      // No histórico financeiro, a renovação aparece como movimentação simulada com o valor do ciclo.
      const history = (await context.call('GET', '/account/financial-history', { token: ana.token })).json.movements
      const entry = history.find((item) => item.type === 'subscription_renewal')
      assert.deepEqual([entry.amountCents, entry.status, entry.simulated], [amount, 'confirmed', true])
    })
  }
})

test('TC-04: renovação recusada mantém o Premium na carência de 3 dias e expira no instante exato', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const { id, endsAt } = await becomePremium(context, ana)
    const graceEndsAt = new Date(Date.parse(endsAt) + renewalGraceMs).toISOString()
    context.provider.setRenewalOutcome('refused')

    context.clock.current = Date.parse(endsAt)
    assert.deepEqual(await process(context), { renewed: 0, pastDue: 1, expired: 0, cancelled: 0 })
    const pastDue = await consult(context, ana)
    assert.equal(pastDue.subscription.status, 'past_due')
    assert.equal(pastDue.subscription.graceEndsAt, graceEndsAt)
    assert.equal(pastDue.plan.id, 'premium')
    assert.equal(pastDue.renewal.canRetryPayment, true)
    assert.equal(pastDue.subscription.canRetryPayment, true)
    const refused = auditsOf(context, id).filter((record) => record.action === lifecycleActions.renewalRefused)
    assert.equal(refused.length, 1)
    assert.equal(refused[0].result, 'failure')

    context.clock.current = Date.parse(graceEndsAt) - 1
    await process(context)
    assert.equal((await consult(context, ana)).subscription.status, 'past_due')
    context.clock.current = Date.parse(graceEndsAt)
    await process(context)
    const expired = await consult(context, ana)
    assert.equal(expired.subscription.status, 'expired')
    assert.equal(expired.subscription.endedAt, graceEndsAt)
    assert.equal(expired.plan.id, 'free')
  })
})

test('TC-05: nova tentativa só depois da recusa; confirmada, a vigência segue do fim do período anterior', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const bruno = await context.signUp('Bruno')
    const { id, endsAt } = await becomePremium(context, ana)
    expectCommonFormat(await retry(context, ana), 409, 'no_renewal_pending')
    expectCommonFormat(await retry(context, bruno), 404, 'subscription_not_found')

    // Provedor ainda sem resposta: a nova tentativa só consulta e é recusada por conflito.
    context.provider.setRenewalOutcome('pending')
    context.clock.current = Date.parse(endsAt)
    await process(context)
    expectCommonFormat(await retry(context, ana), 409, 'renewal_payment_pending')
    assert.equal(renewals(context, id).length, 1)

    context.provider.refuse(renewals(context, id)[0].operation_key)
    await context.app.locals.tasks.reconcilePayments()
    assert.equal((await consult(context, ana)).renewal.canRetryPayment, true)

    context.clock.current = Date.parse(endsAt) + 2 * 24 * 60 * minute
    context.provider.setRenewalOutcome('confirmed')
    const retried = await retry(context, ana)
    assert.equal(retried.status, 200, retried.text)
    assert.equal(retried.json.subscription.status, 'active')
    assert.equal(retried.json.subscription.endsAt, addBillingCycle(endsAt, 'monthly'))
    const attempts = renewals(context, id)
    assert.deepEqual(attempts.map((movement) => [movement.attempt_number, movement.status]), [[1, 'refused'], [2, 'confirmed']])
    expectCommonFormat(await retry(context, ana), 409, 'no_renewal_pending')
  })
})

test('TC-06 e RNF21: a tarefa repetida, em paralelo, não cobra nem estende duas vezes', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const { id, endsAt } = await becomePremium(context, ana)
    context.clock.current = Date.parse(endsAt)

    const first = process(context)
    assert.equal(process(context), first, 'execuções simultâneas compartilham a mesma')
    await first
    for (let index = 0; index < 3; index += 1) {
      await Promise.all([process(context), context.app.locals.tasks.reconcilePayments()])
    }
    assert.equal(renewals(context, id).length, 1)
    assert.equal(auditsOf(context, id).filter((record) => record.action === lifecycleActions.renewed).length, 1)
    assert.equal((await consult(context, ana)).subscription.endsAt, addBillingCycle(endsAt, 'monthly'))
    assert.equal(context.provider.calls.start, 2, 'uma cobrança da contratação e uma da renovação')

    // A falha de uma assinatura não impede as demais.
    const bruno = await context.signUp('Bruno')
    const brunoSubscription = await becomePremium(context, bruno)
    context.database.exec("CREATE TEMP TRIGGER fail_ana BEFORE UPDATE OF status ON subscriptions WHEN OLD.user_id = '" + ana.id + "' BEGIN SELECT RAISE(ABORT, 'falha simulada'); END")
    context.clock.current = Date.parse(addBillingCycle(endsAt, 'monthly'))
    assert.ok(Date.parse(brunoSubscription.endsAt) <= context.clock.current)
    const result = await process(context)
    assert.equal(result.renewed, 1)
    assert.equal((await consult(context, bruno)).subscription.status, 'active')
    assert.ok(context.events.some((event) => event.result === 'period_processing_failed'))
  })
})

test('TC-07: cancelar mantém o Premium até o fim do período, sem nova cobrança, e então volta ao Gratuito', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const { id, endsAt } = await becomePremium(context, ana, 'annual')
    await context.createPool(ana)
    await context.call('POST', '/account/subscription/cancellation', { token: ana.token, body: { confirm: true } })
    await context.call('POST', '/account/subscription/cancellation/check', { token: ana.token })

    const pending = await consult(context, ana)
    assert.equal(pending.subscription.status, 'non_renewing')
    assert.equal(pending.subscription.premiumUntil, endsAt)
    assert.equal(pending.plan.id, 'premium')
    const availability = (await context.call('GET', '/pools/creation-availability', { token: ana.token })).json
    assert.deepEqual([availability.limit, availability.canCreate, availability.cancellationPending], [1, false, true])

    context.clock.current = Date.parse(endsAt) - minute
    await process(context)
    assert.equal((await consult(context, ana)).subscription.status, 'non_renewing')
    context.clock.current = Date.parse(endsAt)
    assert.deepEqual(await process(context), { renewed: 0, pastDue: 0, expired: 0, cancelled: 1 })
    const ended = await consult(context, ana)
    assert.equal(ended.subscription.status, 'cancelled')
    assert.equal(ended.plan.id, 'free')
    assert.equal(renewals(context, id).length, 0, 'nenhuma cobrança depois do cancelamento')
    assert.equal(context.database.prepare("SELECT live_results FROM pools WHERE creator_id = ?").get(ana.id).live_results, 0)
  })
})

test('TC-08: a consulta mostra ciclo, valor, próxima cobrança, fim do Premium e carência conforme o estado', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const { endsAt } = await becomePremium(context, ana)
    const active = (await consult(context, ana)).subscription
    assert.deepEqual([active.billingCycle, active.amountCents, active.nextChargeAt, active.premiumUntil, active.graceEndsAt], ['monthly', 1990, endsAt, null, null])

    context.provider.setRenewalOutcome('refused')
    context.clock.current = Date.parse(endsAt)
    await process(context)
    const pastDue = (await consult(context, ana)).subscription
    assert.deepEqual([pastDue.status, pastDue.nextChargeAt, pastDue.graceEndsAt], ['past_due', null, new Date(Date.parse(endsAt) + renewalGraceMs).toISOString()])
  })
})

test('TC-09: provedor sem as operações de renovação não faz cobrança genérica; a assinatura vai para a carência', async () => {
  const provider = createSimulatedPaymentsProvider()
  delete provider.startSubscriptionRenewal
  delete provider.consultSubscriptionRenewal
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const { id, endsAt } = await becomePremium({ ...context, provider }, ana)
    const startsBefore = provider.calls.start
    context.clock.current = Date.parse(endsAt)
    assert.deepEqual(await process(context), { renewed: 0, pastDue: 1, expired: 0, cancelled: 0 })
    assert.equal(provider.calls.start, startsBefore)
    assert.equal(renewals(context, id)[0].status, 'pending')
    assert.equal((await consult(context, ana)).subscription.status, 'past_due')
  }, { paymentsProvider: provider })
})

test('TC-10: a contratação exige o aceite da nova versão da política', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    assert.equal(billingPolicyVersion, '2026-11-23.2')
    const old = await context.call('POST', '/account/premium/subscription', {
      token: ana.token, body: { confirm: true, billingPolicyVersion: '2026-11-23', billingCycle: 'annual' },
    })
    expectCommonFormat(old, 400, 'billing_policy_not_accepted')
  })
})

test('INV-003: a confirmação de uma cobrança de outro período não estende a vigência atual', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const { id, endsAt } = await becomePremium(context, ana)
    // Uma cobrança antiga, de um período que não é o atual, chega pendente e depois é confirmada.
    context.provider.setRenewalOutcome('pending')
    const { movement: stale } = await context.app.locals.financial.startMovement({
      type: 'subscription_renewal',
      amountCents: 1990,
      userId: ana.id,
      operation: { type: 'subscription', id },
      businessReference: `subscription_renewal:${id}:2026-10-14T15:00:00.000Z`,
    })
    context.provider.setRenewalOutcome('refused')
    context.clock.current = Date.parse(endsAt)
    await process(context)
    assert.equal((await consult(context, ana)).subscription.status, 'past_due')

    context.provider.confirm(stale.operationKey)
    assert.equal((await context.app.locals.financial.checkMovement(stale.id)).applied, true)
    const view = (await consult(context, ana)).subscription
    assert.equal(view.status, 'past_due')
    assert.equal(view.endsAt, endsAt)
  })
})

test('banco: a vigência só aumenta e a carência exige o fim depois do período', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const { id, endsAt } = await becomePremium(context, ana)
    assert.throws(() => context.database.prepare('UPDATE subscriptions SET ends_at = ? WHERE id = ?').run('2026-11-20T00:00:00.000Z', id), /immutable/)
    assert.throws(() => context.database.prepare('UPDATE subscriptions SET ends_at = ends_at WHERE id = ?').run(id), /immutable/)
    assert.throws(() => context.database.prepare("UPDATE subscriptions SET status = 'past_due', grace_ends_at = ? WHERE id = ?").run(endsAt, id), /CHECK/)
    assert.throws(() => context.database.prepare("UPDATE subscriptions SET recurrence = 'annual' WHERE id = ?").run(id), /immutable/)
  })
})
