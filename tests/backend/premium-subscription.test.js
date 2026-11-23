import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { createSimulatedPaymentsProvider } from '../../src/backend/adapters/simulated-payments-provider.js'
import { createMercadoPagoTestPaymentsProvider } from '../../src/backend/adapters/mercado-pago-test-payments-provider.js'
import { addCalendarMonth, subscriptionActions } from '../../src/backend/modules/payments-subscriptions/index.js'
import { expectCommonFormat, startOfTests, withHttpApp } from './support/app-harness.js'

// SPEC-019 — contratação do Premium. A suíte roda com o simulador ou com um Mercado Pago falso,
// sem credenciais reais e sem rede externa.

const confirm = { confirm: true }

function withSimulator(callback) {
  const provider = createSimulatedPaymentsProvider()
  return withHttpApp((context) => callback({ ...context, provider }), { paymentsProvider: provider })
}

async function subscribe(context, user, body = confirm) {
  return context.call('POST', '/account/premium/subscription', { token: user.token, body })
}

async function decide(context, user, movementId, decision) {
  return context.call('POST', `/payments/simulated-checkout/${movementId}/decision`, { token: user.token, body: { decision } })
}

async function checkout(context, user) {
  return context.call('POST', '/account/premium/subscription/check', { token: user.token })
}

async function planOf(context, user) {
  return (await context.call('GET', '/account/plan', { token: user.token })).json
}

function count(context, sql, ...params) {
  return context.database.prepare(sql).get(...params).n
}

function auditsOf(context, type, id) {
  return context.auditStore.findByObject({ type, id })
}

test('TC-01: condições vêm do backend; valores enviados pelo cliente são rejeitados', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const conditions = await context.call('GET', '/account/premium', { token: ana.token })
    assert.equal(conditions.status, 200, conditions.text)
    assert.deepEqual(conditions.json, {
      plan: { id: 'premium', name: 'Premium', features: { simultaneousPools: 10, unlimitedParticipation: true, liveResultsInCreatedPools: true } },
      priceCents: 1990,
      amount: '19.90',
      currency: 'BRL',
      recurrence: 'monthly',
      environment: 'test',
      origin: 'simulator',
      simulated: true,
      canSubscribe: true,
      reason: null,
      subscription: null,
    })

    const divergent = await subscribe(context, ana, { confirm: true, amountCents: 1, recurrence: 'yearly' })
    expectCommonFormat(divergent, 400, 'validation_error')
    assert.deepEqual(Object.keys(divergent.json.fields).sort(), ['amountCents', 'recurrence'])
    for (const body of [{}, { confirm: 'sim' }, { confirm: false }]) {
      expectCommonFormat(await subscribe(context, ana, body), 400, 'confirmation_required')
    }
    assert.equal(count(context, 'SELECT COUNT(*) AS n FROM subscriptions'), 0)
    assert.equal(count(context, 'SELECT COUNT(*) AS n FROM financial_movements'), 0)
  })
})

test('TC-02 e TC-14: contratar cria assinatura e movimentação pendentes, com auditoria do usuário, sem mudar o plano', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const response = await subscribe(context, ana)
    assert.equal(response.status, 201, response.text)
    const { subscription } = response.json
    assert.equal(subscription.status, 'pending')
    assert.equal(subscription.amountCents, 1990)
    assert.equal(subscription.amount, '19.90')
    assert.equal(subscription.currency, 'BRL')
    assert.equal(subscription.recurrence, 'monthly')
    assert.equal(subscription.origin, 'simulator')
    assert.equal(subscription.simulated, true)
    assert.equal(subscription.startsAt, null)
    assert.equal(subscription.endsAt, null)
    assert.deepEqual(subscription.payment, { kind: 'simulated_checkout', simulated: true })

    const movement = context.database.prepare('SELECT * FROM financial_movements WHERE id = ?').get(subscription.movementId)
    assert.equal(movement.type, 'subscription')
    assert.equal(movement.status, 'pending')
    assert.equal(movement.origin, 'simulator')
    assert.equal(movement.amount_cents, 1990)
    assert.equal(movement.operation_type, 'subscription')
    assert.equal(movement.operation_id, subscription.id)
    assert.equal(movement.operation_key, `subscription:${subscription.id}:attempt-1`)

    const [requested] = auditsOf(context, 'subscription', subscription.id)
    assert.equal(requested.action, subscriptionActions.requested)
    assert.deepEqual(requested.actor, { type: 'user', id: ana.id })
    assert.equal(requested.result, 'success')
    assert.deepEqual(requested.details, { amountCents: 1990, newState: 'pending', origin: 'simulator' })
    assert.equal(auditsOf(context, 'financial_movement', movement.id)[0].action, 'financial.movement_created')

    assert.equal((await planOf(context, ana)).plan.id, 'free')
  })
})

test('TC-03: a confirmação ativa a assinatura, a vigência e o Premium; recursos valem só para novos bolões', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const before = await context.createPool(ana)
    const created = (await subscribe(context, ana)).json.subscription

    // Aprovar na página simulada não muda nada até a conferência (INV-001, INV-008).
    assert.equal((await decide(context, ana, created.movementId, 'approve')).status, 200)
    assert.equal((await planOf(context, ana)).plan.id, 'free')
    assert.equal(context.database.prepare('SELECT status FROM subscriptions').get().status, 'pending')

    context.clock.current += 5 * 60 * 1000
    const checked = await checkout(context, ana)
    assert.equal(checked.status, 200, checked.text)
    const confirmedAt = new Date(startOfTests + 5 * 60 * 1000).toISOString()
    assert.equal(checked.json.subscription.status, 'active')
    assert.equal(checked.json.subscription.startsAt, confirmedAt)
    assert.equal(checked.json.subscription.endsAt, addCalendarMonth(confirmedAt))
    assert.equal(checked.json.subscription.endsAt, '2026-12-14T15:05:00.000Z')
    assert.equal(checked.json.subscription.payment, null)
    assert.equal(context.database.prepare('SELECT status FROM financial_movements').get().status, 'confirmed')

    assert.deepEqual(await planOf(context, ana), {
      plan: { id: 'premium', name: 'Premium', features: { simultaneousPools: 10, unlimitedParticipation: true, liveResultsInCreatedPools: true } },
      status: 'active',
    })
    assert.equal((await context.call('GET', '/auth/me', { token: ana.token })).json.user.plan, 'premium')

    const availability = (await context.call('GET', '/pools/creation-availability', { token: ana.token })).json
    assert.equal(availability.limit, 10)
    assert.equal(availability.canCreate, true)
    const after = await context.createPool(ana)
    assert.equal((await context.call('GET', `/pools/${after.poolId}`, { token: ana.token })).json.pool.liveResults, true)
    assert.equal((await context.call('GET', `/pools/${before.poolId}`, { token: ana.token })).json.pool.liveResults, false)

    const activated = auditsOf(context, 'subscription', created.id).at(-1)
    assert.equal(activated.action, subscriptionActions.activated)
    assert.deepEqual(activated.actor, { type: 'system' })
    assert.equal(activated.result, 'success')
    assert.deepEqual(activated.details, { amountCents: 1990, previousState: 'pending', newState: 'active', origin: 'simulator' })
  })
})

test('INV-005: vigência de um mês de calendário em UTC, com o último dia quando o dia não existe', () => {
  assert.equal(addCalendarMonth('2026-11-14T15:00:00.000Z'), '2026-12-14T15:00:00.000Z')
  assert.equal(addCalendarMonth('2026-12-15T23:59:59.999Z'), '2027-01-15T23:59:59.999Z')
  assert.equal(addCalendarMonth('2027-01-31T10:00:00.000Z'), '2027-02-28T10:00:00.000Z')
  assert.equal(addCalendarMonth('2028-01-31T10:00:00.000Z'), '2028-02-29T10:00:00.000Z')
  assert.equal(addCalendarMonth('2026-03-31T00:00:00.000Z'), '2026-04-30T00:00:00.000Z')
})

test('TC-04 e TC-14: a recusa deixa a assinatura recusada e o plano Gratuito, auditada como falha; nova contratação é aceita', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const first = (await subscribe(context, ana)).json.subscription
    await decide(context, ana, first.movementId, 'refuse')
    const checked = await checkout(context, ana)
    assert.equal(checked.json.subscription.status, 'refused')
    assert.equal(checked.json.subscription.payment, null)
    assert.equal((await planOf(context, ana)).plan.id, 'free')

    const refused = auditsOf(context, 'subscription', first.id).at(-1)
    assert.equal(refused.action, subscriptionActions.refused)
    assert.deepEqual(refused.actor, { type: 'system' })
    assert.equal(refused.result, 'failure')
    assert.deepEqual(refused.details, { amountCents: 1990, previousState: 'pending', newState: 'refused', origin: 'simulator' })

    const conditions = (await context.call('GET', '/account/premium', { token: ana.token })).json
    assert.equal(conditions.canSubscribe, true)
    assert.equal(conditions.subscription.status, 'refused')

    const retry = await subscribe(context, ana)
    assert.equal(retry.status, 201, retry.text)
    assert.notEqual(retry.json.subscription.id, first.id)
    assert.equal(retry.json.subscription.status, 'pending')
    assert.equal(count(context, 'SELECT COUNT(*) AS n FROM subscriptions'), 2)
    assert.throws(() => context.database.prepare("UPDATE subscriptions SET status = 'active' WHERE id = ?").run(first.id), /final/)
  })
})

test('TC-05: pendente reaparece sem criar outra; Premium ativo recebe 409; sem sessão recebe 401', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const first = (await subscribe(context, ana)).json.subscription

    const conditions = (await context.call('GET', '/account/premium', { token: ana.token })).json
    assert.equal(conditions.canSubscribe, false)
    assert.equal(conditions.reason, 'pending_subscription')
    assert.equal(conditions.subscription.id, first.id)
    assert.equal(conditions.subscription.status, 'pending')

    const again = await subscribe(context, ana)
    assert.equal(again.status, 200, again.text)
    assert.equal(again.json.subscription.id, first.id)
    assert.deepEqual(again.json.subscription.payment, { kind: 'simulated_checkout', simulated: true })
    assert.equal(count(context, 'SELECT COUNT(*) AS n FROM subscriptions'), 1)
    assert.equal(count(context, 'SELECT COUNT(*) AS n FROM financial_movements'), 1)
    assert.equal((await planOf(context, ana)).plan.id, 'free')

    await decide(context, ana, first.movementId, 'approve')
    await checkout(context, ana)
    expectCommonFormat(await subscribe(context, ana), 409, 'already_premium')
    assert.equal((await context.call('GET', '/account/premium', { token: ana.token })).json.reason, 'already_premium')

    for (const [method, path] of [
      ['GET', '/account/premium'],
      ['POST', '/account/premium/subscription'],
      ['GET', '/account/premium/subscription'],
      ['POST', '/account/premium/subscription/check'],
      ['GET', `/payments/simulated-checkout/${first.movementId}`],
    ]) {
      expectCommonFormat(await context.call(method, path, method === 'POST' ? { body: confirm } : {}), 401, 'session_rejected')
    }
  })
})

test('TC-06: falhas do provedor preservam o estado, informam o usuário e nada é repetido automaticamente', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const { provider } = context

    provider.failNext('start', 'timeout')
    const failed = await subscribe(context, ana)
    expectCommonFormat(failed, 503, 'payments_provider_unavailable')
    assert.match(failed.json.message, /não foi confirmada/)
    const pending = (await context.call('GET', '/account/premium/subscription', { token: ana.token })).json.subscription
    assert.equal(pending.status, 'pending')
    assert.equal(pending.payment, null)
    assert.equal((await planOf(context, ana)).plan.id, 'free')
    assert.ok(context.events.some((event) => event.result === 'provider_start_timeout'))

    // O tempo passa e a conferência roda: nenhuma nova cobrança.
    context.clock.current += 60 * 60 * 1000
    await context.app.locals.tasks.reconcilePayments()
    assert.equal(provider.calls.start, 1)

    // Pedir de novo consulta a anterior antes de qualquer outra coisa e não inicia outra operação.
    const consultsBefore = provider.calls.consult
    const again = await subscribe(context, ana)
    assert.equal(again.status, 200, again.text)
    assert.equal(again.json.subscription.id, pending.id)
    assert.equal(provider.calls.consult, consultsBefore + 1)
    assert.equal(provider.calls.start, 1)

    // Erro de resposta e resposta inválida na consulta também deixam pendente.
    for (const code of ['response_error', 'invalid_response']) {
      provider.failNext('consult', code)
      const checked = await checkout(context, ana)
      assert.equal(checked.status, 200)
      assert.equal(checked.json.subscription.status, 'pending')
    }
    const reasons = auditsOf(context, 'financial_movement', pending.movementId)
      .filter((record) => record.action === 'financial.provider_failed').map((record) => `${record.details.stage}:${record.details.reason}`)
    assert.deepEqual(reasons.slice(0, 1), ['start:timeout'])
    assert.ok(reasons.includes('consult:response_error') && reasons.includes('consult:invalid_response'))

    // Na página simulada o pagador conclui; a conferência aplica.
    await decide(context, ana, pending.movementId, 'approve')
    assert.equal((await checkout(context, ana)).json.subscription.status, 'active')
    assert.equal(provider.calls.start, 1)
  })
})

test('TC-07: confirmações repetidas e contratações simultâneas não duplicam assinatura, movimentação nem ativação', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const [first, second] = await Promise.all([subscribe(context, ana), subscribe(context, ana)])
    assert.deepEqual([first.status, second.status].sort(), [200, 201])
    assert.equal(first.json.subscription.id, second.json.subscription.id)
    assert.equal(count(context, 'SELECT COUNT(*) AS n FROM subscriptions'), 1)
    assert.equal(count(context, 'SELECT COUNT(*) AS n FROM financial_movements'), 1)

    const { movementId, id } = first.json.subscription
    for (let index = 0; index < 3; index += 1) {
      await decide(context, ana, movementId, 'approve').catch(() => {})
      context.provider.confirm(context.database.prepare('SELECT operation_key FROM financial_movements').get().operation_key)
      await Promise.all([checkout(context, ana), context.app.locals.tasks.reconcilePayments()])
    }
    assert.equal(count(context, 'SELECT COUNT(*) AS n FROM audit_records WHERE action = ? AND object_id = ?', subscriptionActions.activated, id), 1)
    assert.equal(count(context, "SELECT COUNT(*) AS n FROM audit_records WHERE action = 'financial.movement_confirmed'"), 1)
    assert.equal(count(context, "SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'active'"), 1)
    expectCommonFormat(await decide(context, ana, movementId, 'approve'), 409, 'payment_already_decided')
  })
})

test('TC-08: falha da atualização do plano ou da auditoria desfaz a ativação; a conferência seguinte aplica', async () => {
  for (const failure of [
    "CREATE TEMP TRIGGER test_failure BEFORE UPDATE OF plan ON users BEGIN SELECT RAISE(ABORT, 'falha simulada do plano'); END",
    "CREATE TEMP TRIGGER test_failure BEFORE INSERT ON audit_records WHEN NEW.action = 'subscription.activated' AND NEW.result = 'success' BEGIN SELECT RAISE(ABORT, 'falha simulada da auditoria'); END",
  ]) {
    await withSimulator(async (context) => {
      const ana = await context.signUp('Ana')
      const { movementId, id } = (await subscribe(context, ana)).json.subscription
      await decide(context, ana, movementId, 'approve')

      context.database.exec(failure)
      const checked = await checkout(context, ana)
      assert.equal(checked.status, 200, checked.text)
      assert.equal(checked.json.subscription.status, 'pending')
      assert.equal(context.database.prepare('SELECT status FROM financial_movements WHERE id = ?').get(movementId).status, 'pending')
      assert.equal((await planOf(context, ana)).plan.id, 'free')
      assert.equal(count(context, "SELECT COUNT(*) AS n FROM audit_records WHERE action = ? AND result = 'success'", subscriptionActions.activated), 0)

      context.database.exec('DROP TRIGGER temp.test_failure')
      assert.equal((await context.app.locals.tasks.reconcilePayments()).applied, 1)
      assert.equal(context.database.prepare('SELECT status FROM subscriptions WHERE id = ?').get(id).status, 'active')
      assert.equal((await planOf(context, ana)).plan.id, 'premium')
    })
  }
})

test('TC-09: o retorno do checkout atualiza na hora e a tarefa de conferência aplica quem não volta', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const bruno = await context.signUp('Bruno')
    const anaSubscription = (await subscribe(context, ana)).json.subscription
    const brunoSubscription = (await subscribe(context, bruno)).json.subscription
    await decide(context, ana, anaSubscription.movementId, 'approve')
    await decide(context, bruno, brunoSubscription.movementId, 'refuse')

    assert.equal((await checkout(context, ana)).json.subscription.status, 'active')
    // Bruno não volta do checkout: a tarefa periódica aplica a recusa.
    assert.deepEqual(await context.app.locals.tasks.reconcilePayments(), { checked: 1, applied: 1, pending: 0 })
    assert.equal((await context.call('GET', '/account/premium/subscription', { token: bruno.token })).json.subscription.status, 'refused')
  })
})

test('TC-10: a página de pagamento simulado se identifica, é só do dono e só existe com o simulador', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const bruno = await context.signUp('Bruno')
    const { movementId } = (await subscribe(context, ana)).json.subscription

    const page = await context.call('GET', `/payments/simulated-checkout/${movementId}`, { token: ana.token })
    assert.equal(page.status, 200, page.text)
    assert.deepEqual(page.json.payment, {
      id: movementId, type: 'subscription', amountCents: 1990, amount: '19.90', currency: 'BRL', status: 'pending', simulated: true,
    })
    expectCommonFormat(await context.call('GET', `/payments/simulated-checkout/${movementId}`, { token: bruno.token }), 404, 'not_found')
    expectCommonFormat(await decide(context, bruno, movementId, 'approve'), 404, 'not_found')
    expectCommonFormat(await decide(context, ana, movementId, 'pagar'), 400, 'validation_error')
    expectCommonFormat(await context.call('GET', '/payments/simulated-checkout/inexistente', { token: ana.token }), 404, 'not_found')
  })

  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    expectCommonFormat(await context.call('GET', '/payments/simulated-checkout/qualquer', { token: ana.token }), 404, 'not_found')
    expectCommonFormat(await context.call('POST', '/payments/simulated-checkout/qualquer/decision', { token: ana.token, body: { decision: 'approve' } }), 404, 'not_found')
  }, { paymentsProvider: createMercadoPagoTestPaymentsProvider({ accessToken: 'TEST-x', fetcher: async () => { throw new Error('sem rede') } }) })
})

test('TC-11: cada usuário vê só a própria contratação, em cada estado, com datas e origem', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const bruno = await context.signUp('Bruno')
    const carla = await context.signUp('Carla')
    expectCommonFormat(await context.call('GET', '/account/premium/subscription', { token: ana.token }), 404, 'subscription_not_found')
    expectCommonFormat(await checkout(context, ana), 404, 'subscription_not_found')

    const anaSubscription = (await subscribe(context, ana)).json.subscription
    const brunoSubscription = (await subscribe(context, bruno)).json.subscription
    const carlaSubscription = (await subscribe(context, carla)).json.subscription
    await decide(context, bruno, brunoSubscription.movementId, 'approve')
    await decide(context, carla, carlaSubscription.movementId, 'refuse')
    await context.app.locals.tasks.reconcilePayments()

    const views = {}
    for (const [name, user] of Object.entries({ ana, bruno, carla })) {
      const response = await context.call('GET', '/account/premium/subscription', { token: user.token })
      assert.equal(response.status, 200, response.text)
      views[name] = response.json.subscription
    }
    assert.equal(views.ana.id, anaSubscription.id)
    assert.equal(views.ana.status, 'pending')
    assert.equal(views.bruno.id, brunoSubscription.id)
    assert.equal(views.bruno.status, 'active')
    assert.ok(views.bruno.startsAt && views.bruno.endsAt)
    assert.equal(views.carla.id, carlaSubscription.id)
    assert.equal(views.carla.status, 'refused')
    for (const view of Object.values(views)) {
      assert.equal(view.origin, 'simulator')
      assert.equal(view.simulated, true)
      assert.equal(view.createdAt, new Date(startOfTests).toISOString())
    }
  })
})

test('TC-13 e CA-21 (com provedor falso): Assinaturas do Mercado Pago em teste, sem segredos em lugar nenhum', async () => {
  const token = 'TEST-1111111111111111-segredo-de-teste'
  const requests = []
  let preapprovalStatus = 'pending'
  const fetcher = async (url, options) => {
    requests.push({ url: String(url), options })
    const body = options.method === 'POST'
      ? { id: 'pre-123', init_point: 'https://sandbox.mercadopago.com.br/subscriptions/checkout?preapproval_id=pre-123', access_token: token }
      : { results: [{ id: 'pre-123', status: preapprovalStatus }] }
    return { ok: true, status: 200, json: async () => body }
  }
  const provider = createMercadoPagoTestPaymentsProvider({
    accessToken: token, fetcher, backUrl: 'http://localhost:5173', subscriptionsProofApproved: true,
  })

  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const conditions = (await context.call('GET', '/account/premium', { token: ana.token })).json
    assert.equal(conditions.origin, 'test_provider')
    assert.equal(conditions.simulated, false)

    const created = await subscribe(context, ana)
    assert.equal(created.status, 201, created.text)
    assert.deepEqual(created.json.subscription.payment, {
      kind: 'checkout', url: 'https://sandbox.mercadopago.com.br/subscriptions/checkout?preapproval_id=pre-123',
    })
    assert.equal(created.json.subscription.simulated, false)
    const [start] = requests
    assert.equal(start.url, 'https://api.mercadopago.com/preapproval')
    const body = JSON.parse(start.options.body)
    assert.equal(body.payer_email, ana.email)
    assert.equal(body.auto_recurring.transaction_amount, 19.9)
    assert.equal(body.auto_recurring.frequency_type, 'months')
    assert.equal(body.external_reference, `subscription:${created.json.subscription.id}:attempt-1`)
    assert.equal(start.options.headers['x-idempotency-key'], body.external_reference)
    assert.equal(body.preapproval_plan_id, undefined)

    assert.equal((await checkout(context, ana)).json.subscription.status, 'pending')
    preapprovalStatus = 'authorized'
    const checked = await checkout(context, ana)
    assert.equal(checked.json.subscription.status, 'active')
    assert.match(requests.at(-1).url, /\/preapproval\/search\?external_reference=/)
    assert.equal((await planOf(context, ana)).plan.id, 'premium')

    const audits = JSON.stringify(context.database.prepare('SELECT * FROM audit_records').all())
    const movements = JSON.stringify(context.database.prepare('SELECT * FROM financial_movements').all())
    for (const text of [JSON.stringify(context.events), audits, movements, ...context.responses]) {
      assert.equal(text.includes(token), false)
      assert.equal(text.includes('segredo-de-teste'), false)
    }
    // O e-mail do pagador vai só ao provedor: não entra em auditoria, registros técnicos nem movimentação.
    for (const text of [JSON.stringify(context.events), audits, movements]) assert.equal(text.includes(ana.email), false)
  }, { paymentsProvider: provider })

  // Sem os smoke tests aprovados, a contratação com o Mercado Pago não sai do lugar e nada vai à rede.
  const blockedRequests = []
  const blocked = createMercadoPagoTestPaymentsProvider({
    accessToken: token, backUrl: 'http://localhost:5173', fetcher: async (url) => { blockedRequests.push(url); throw new Error('sem rede') },
  })
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    expectCommonFormat(await subscribe(context, ana), 503, 'payments_provider_unavailable')
    assert.equal(blockedRequests.length, 0)
    assert.equal((await planOf(context, ana)).plan.id, 'free')
  }, { paymentsProvider: blocked })

  const example = fs.readFileSync(new URL('../../.env.example', import.meta.url), 'utf8')
  assert.match(example, /^PREMIUM_TEST_PRICE_CENTS=$/m)
  assert.match(example, /^MERCADO_PAGO_SUBSCRIPTIONS_PROOF_APPROVED=$/m)
})

test('TC-15: erros 400, 401, 404, 409, 503 e 500 seguem o formato comum, sem detalhes internos', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    expectCommonFormat(await subscribe(context, ana, {}), 400, 'confirmation_required')
    expectCommonFormat(await context.call('GET', '/account/premium'), 401, 'session_rejected')
    expectCommonFormat(await checkout(context, ana), 404, 'subscription_not_found')
    context.provider.failNext('start', 'response_error')
    expectCommonFormat(await subscribe(context, ana), 503, 'payments_provider_unavailable')
    const { movementId } = (await context.call('GET', '/account/premium/subscription', { token: ana.token })).json.subscription
    await decide(context, ana, movementId, 'approve')
    await checkout(context, ana)
    expectCommonFormat(await subscribe(context, ana), 409, 'already_premium')

    context.database.exec('DROP INDEX subscriptions_user_created')
    context.database.exec('ALTER TABLE subscriptions RENAME TO subscriptions_hidden')
    const failure = await context.call('GET', '/account/premium', { token: ana.token })
    expectCommonFormat(failure, 500, 'internal_error')
    assert.equal(/subscriptions|no such table|SQLITE/i.test(failure.text), false)
  })
})

test('banco: plano Premium só com assinatura ativa e no máximo uma pendente ou ativa por usuário', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    assert.throws(() => context.database.prepare("UPDATE users SET plan = 'premium' WHERE id = ?").run(ana.id), /active subscription/)
    const insert = context.database.prepare(`
      INSERT INTO subscriptions (id, user_id, status, amount_cents, currency, recurrence, origin, created_at, updated_at)
      VALUES (?, ?, 'pending', 1990, 'BRL', 'monthly', 'simulator', 'x', 'x')
    `)
    insert.run('s-1', ana.id)
    assert.throws(() => insert.run('s-2', ana.id), /UNIQUE/)
    assert.throws(() => context.database.prepare('DELETE FROM subscriptions').run(), /never deleted/)
    assert.throws(() => context.database.prepare('UPDATE subscriptions SET amount_cents = 1').run(), /immutable/)
  })
})
