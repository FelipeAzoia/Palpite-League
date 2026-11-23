import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { createSimulatedPaymentsProvider } from '../../src/backend/adapters/simulated-payments-provider.js'
import { createMercadoPagoTestPaymentsProvider } from '../../src/backend/adapters/mercado-pago-test-payments-provider.js'
import { lifecycleActions } from '../../src/backend/modules/payments-subscriptions/index.js'
import { expectCommonFormat, startOfTests, withHttpApp } from './support/app-harness.js'

// SPEC-020 — consulta e cancelamento da assinatura, expiração e downgrade. A suíte roda com o
// simulador ou com um Mercado Pago falso, sem credenciais reais e sem rede externa.

const confirm = { confirm: true }
const minute = 60 * 1000

function withSimulator(callback) {
  const provider = createSimulatedPaymentsProvider()
  return withHttpApp((context) => callback({ ...context, provider }), { paymentsProvider: provider })
}

async function becomePremium(context, user) {
  const created = await context.call('POST', '/account/premium/subscription', { token: user.token, body: confirm })
  assert.equal(created.status, 201, created.text)
  await context.call('POST', `/payments/simulated-checkout/${created.json.subscription.movementId}/decision`, {
    token: user.token, body: { decision: 'approve' },
  })
  const checked = await context.call('POST', '/account/premium/subscription/check', { token: user.token })
  assert.equal(checked.json.subscription.status, 'active', checked.text)
  return checked.json.subscription
}

const consult = (context, user) => context.call('GET', '/account/subscription', { token: user.token })
const cancel = (context, user, body = confirm) => context.call('POST', '/account/subscription/cancellation', { token: user.token, body })
const checkCancellation = (context, user) => context.call('POST', '/account/subscription/cancellation/check', { token: user.token })
const planOf = async (context, user) => (await context.call('GET', '/account/plan', { token: user.token })).json.plan.id

function count(context, sql, ...params) {
  return context.database.prepare(sql).get(...params).n
}

function cancellationMovements(context, subscriptionId) {
  return context.database.prepare(`
    SELECT * FROM financial_movements WHERE type = 'subscription_cancellation' AND operation_id = ? ORDER BY attempt_number
  `).all(subscriptionId)
}

const auditsOf = (context, id) => context.auditStore.findByObject({ type: 'subscription', id })

test('CT-01 e CT-02: consulta mostra o Premium com vigência em UTC e o Gratuito sem vigência', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const bruno = await context.signUp('Bruno')
    await becomePremium(context, ana)

    const premium = await consult(context, ana)
    assert.equal(premium.status, 200, premium.text)
    assert.equal(premium.json.plan.id, 'premium')
    assert.equal(premium.json.limit, 10)
    assert.equal(premium.json.liveResults, true)
    const { subscription } = premium.json
    assert.equal(subscription.status, 'active')
    assert.equal(subscription.cancellationPending, false)
    assert.equal(subscription.startsAt, new Date(startOfTests).toISOString())
    assert.equal(subscription.endsAt, '2026-12-14T15:00:00.000Z')
    assert.match(subscription.startsAt, /Z$/)
    assert.equal(subscription.simulated, true)
    assert.equal(subscription.endedAt, null)

    const free = await consult(context, bruno)
    assert.deepEqual(free.json, {
      plan: { id: 'free', name: 'Gratuito', features: { simultaneousPools: 1, unlimitedParticipation: true, liveResultsInCreatedPools: false } },
      limit: 1,
      liveResults: false,
      subscription: null,
    })
  })
})

test('CT-05 e CT-17: o cancelamento fica pendente, registra a operação simulada e mantém o Premium', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const { id } = await becomePremium(context, ana)
    context.clock.current += 10 * minute

    const response = await cancel(context, ana)
    assert.equal(response.status, 202, response.text)
    assert.equal(response.json.subscription.status, 'cancellation_pending')
    assert.equal(response.json.subscription.cancellationPending, true)
    assert.equal(response.json.subscription.cancellationRequestedAt, new Date(startOfTests + 10 * minute).toISOString())
    assert.equal(await planOf(context, ana), 'premium')
    assert.equal((await consult(context, ana)).json.plan.id, 'premium')

    const [movement] = cancellationMovements(context, id)
    assert.equal(movement.status, 'pending')
    assert.equal(movement.amount_cents, 0)
    assert.equal(movement.origin, 'simulator')
    assert.equal(movement.operation_key, `subscription_cancellation:${id}:attempt-1`)
    assert.equal(response.json.subscription.cancellationMovementId, movement.id)

    const requested = auditsOf(context, id).at(-1)
    assert.equal(requested.action, lifecycleActions.cancellationRequested)
    assert.deepEqual(requested.actor, { type: 'user', id: ana.id })
    assert.deepEqual(requested.details, { previousState: 'active', newState: 'cancellation_pending', origin: 'simulator' })

    // No histórico financeiro o cancelamento aparece como operação simulada, de valor zero.
    const history = (await context.call('GET', '/account/financial-history', { token: ana.token })).json.movements
    const entry = history.find((item) => item.type === 'subscription_cancellation')
    assert.deepEqual([entry.amountCents, entry.status, entry.origin, entry.simulated], [0, 'pending', 'simulator', true])
  })
})

test('CT-07: a confirmação do provedor cancela, volta ao Gratuito e é auditada pelo sistema', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const { id } = await becomePremium(context, ana)
    await cancel(context, ana)
    context.clock.current += minute

    const checked = await checkCancellation(context, ana)
    assert.equal(checked.status, 200, checked.text)
    assert.equal(checked.json.subscription.status, 'cancelled')
    assert.equal(checked.json.subscription.endedAt, new Date(startOfTests + minute).toISOString())
    assert.equal(await planOf(context, ana), 'free')
    assert.equal((await context.call('GET', '/pools/creation-availability', { token: ana.token })).json.limit, 1)
    assert.equal(cancellationMovements(context, id)[0].status, 'confirmed')

    const cancelled = auditsOf(context, id).at(-1)
    assert.equal(cancelled.action, lifecycleActions.cancelled)
    assert.deepEqual(cancelled.actor, { type: 'system' })
    assert.equal(cancelled.result, 'success')
    assert.deepEqual(cancelled.details, { previousState: 'cancellation_pending', newState: 'cancelled', origin: 'simulator' })

    // CT-03: a consulta mostra o estado final e quando passou a valer.
    const view = (await consult(context, ana)).json
    assert.equal(view.plan.id, 'free')
    assert.equal(view.subscription.status, 'cancelled')
    assert.equal(view.subscription.endedAt, new Date(startOfTests + minute).toISOString())
  })
})

test('CT-08: a recusa volta a assinatura para ativa, sem nova tentativa automática; o usuário pode pedir de novo', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const { id } = await becomePremium(context, ana)
    await cancel(context, ana)
    const [first] = cancellationMovements(context, id)
    context.provider.refuse(first.operation_key)

    await context.app.locals.tasks.reconcilePayments()
    const view = (await consult(context, ana)).json.subscription
    assert.equal(view.status, 'active')
    assert.equal(view.cancellationRequestedAt, null)
    assert.equal(await planOf(context, ana), 'premium')
    const refused = auditsOf(context, id).at(-1)
    assert.equal(refused.action, lifecycleActions.cancellationRefused)
    assert.equal(refused.result, 'failure')
    assert.deepEqual(refused.actor, { type: 'system' })

    const startsBefore = context.provider.calls.start
    await context.app.locals.tasks.reconcilePayments()
    await context.app.locals.tasks.reconcilePayments()
    assert.equal(context.provider.calls.start, startsBefore)
    assert.equal(cancellationMovements(context, id).length, 1)

    const retry = await cancel(context, ana)
    assert.equal(retry.status, 202, retry.text)
    const movements = cancellationMovements(context, id)
    assert.equal(movements.length, 2)
    assert.equal(movements[1].operation_key, `subscription_cancellation:${id}:attempt-2`)
  })
})

test('CT-09: provedor indisponível mantém o cancelamento pendente, nunca cancelado, e a conferência posterior resolve', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const { id } = await becomePremium(context, ana)

    context.provider.failNext('start', 'timeout', { afterRegistering: true })
    const response = await cancel(context, ana)
    expectCommonFormat(response, 503, 'payments_provider_unavailable')
    assert.equal(response.json.details.subscription.status, 'cancellation_pending')
    assert.equal((await consult(context, ana)).json.subscription.status, 'cancellation_pending')
    assert.equal(await planOf(context, ana), 'premium')

    for (let index = 0; index < 2; index += 1) {
      await context.app.locals.tasks.reconcilePayments()
      assert.equal((await consult(context, ana)).json.subscription.status, 'cancellation_pending')
    }

    // O provedor processa o pedido que recebeu; a conferência seguinte aplica.
    context.provider.confirm(cancellationMovements(context, id)[0].operation_key)
    await context.app.locals.tasks.reconcilePayments()
    assert.equal((await consult(context, ana)).json.subscription.status, 'cancelled')
    assert.equal(await planOf(context, ana), 'free')
  })
})

test('CT-10 e CT-11: confirmação repetida e pedidos simultâneos não duplicam operação nem efeitos', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const { id } = await becomePremium(context, ana)

    const [first, second] = await Promise.all([cancel(context, ana), cancel(context, ana)])
    assert.deepEqual([first.status, second.status].sort(), [202, 409])
    expectCommonFormat(first.status === 409 ? first : second, 409, 'cancellation_already_pending')
    assert.equal(cancellationMovements(context, id).length, 1)

    const key = cancellationMovements(context, id)[0].operation_key
    for (let index = 0; index < 3; index += 1) {
      context.provider.confirm(key)
      await Promise.all([checkCancellation(context, ana), context.app.locals.tasks.reconcilePayments()])
    }
    assert.equal(count(context, 'SELECT COUNT(*) AS n FROM audit_records WHERE action = ? AND object_id = ?', lifecycleActions.cancelled, id), 1)
    assert.equal(cancellationMovements(context, id).length, 1)
    assert.equal((await consult(context, ana)).json.subscription.status, 'cancelled')
  })
})

test('CT-12 e CT-04: cancelar sem assinatura ativa, já pendente, cancelada ou expirada é conflito; só a própria; sem sessão é 401', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const bruno = await context.signUp('Bruno')
    const carla = await context.signUp('Carla')

    expectCommonFormat(await cancel(context, bruno), 409, 'no_active_subscription')
    expectCommonFormat(await cancel(context, ana, {}), 400, 'confirmation_required')
    expectCommonFormat(await cancel(context, ana, { confirm: true, userId: bruno.id }), 400, 'validation_error')

    const { id } = await becomePremium(context, ana)
    // Bruno não tem como atingir a assinatura de Ana: nada a cancelar para ele, e a de Ana segue igual.
    expectCommonFormat(await cancel(context, bruno), 409, 'no_active_subscription')
    assert.equal((await consult(context, ana)).json.subscription.status, 'active')
    assert.equal((await consult(context, bruno)).json.subscription, null)
    assert.equal(cancellationMovements(context, id).length, 0)

    await cancel(context, ana)
    expectCommonFormat(await cancel(context, ana), 409, 'cancellation_already_pending')
    await checkCancellation(context, ana)
    expectCommonFormat(await cancel(context, ana), 409, 'subscription_ended')

    await becomePremium(context, carla)
    context.clock.current += 40 * 24 * 60 * minute
    context.app.locals.tasks.expireSubscriptions()
    expectCommonFormat(await cancel(context, carla), 409, 'subscription_ended')

    for (const [method, path] of [
      ['GET', '/account/subscription'],
      ['POST', '/account/subscription/cancellation'],
      ['POST', '/account/subscription/cancellation/check'],
    ]) {
      expectCommonFormat(await context.call(method, path, method === 'POST' ? { body: confirm } : {}), 401, 'session_rejected')
    }
  })
})

test('CT-13 e CT-14: a expiração vale no instante UTC do fim da vigência, pelo sistema, e reexecutar não muda nada', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const { id, endsAt } = await becomePremium(context, ana)

    context.clock.current = Date.parse(endsAt) - 1
    assert.deepEqual(context.app.locals.tasks.expireSubscriptions(), { checked: 0, expired: 0 })
    assert.equal(await planOf(context, ana), 'premium')

    context.clock.current = Date.parse(endsAt)
    assert.deepEqual(context.app.locals.tasks.expireSubscriptions(), { checked: 1, expired: 1 })
    const view = (await consult(context, ana)).json
    assert.equal(view.plan.id, 'free')
    assert.equal(view.subscription.status, 'expired')
    assert.equal(view.subscription.endedAt, endsAt)

    const expired = auditsOf(context, id).at(-1)
    assert.equal(expired.action, lifecycleActions.expired)
    assert.deepEqual(expired.actor, { type: 'system' })
    assert.deepEqual(expired.details, { previousState: 'active', newState: 'expired', origin: 'simulator', endsAt })
    assert.match(expired.occurredAt, /Z$/)

    context.clock.current += 60 * minute
    assert.deepEqual(context.app.locals.tasks.expireSubscriptions(), { checked: 0, expired: 0 })
    assert.equal(count(context, 'SELECT COUNT(*) AS n FROM audit_records WHERE action = ?', lifecycleActions.expired), 1)

    // Depois de expirada, a pessoa pode contratar de novo (SPEC-019).
    assert.equal((await context.call('GET', '/account/premium', { token: ana.token })).json.canSubscribe, true)
  })
})

test('OPEN-91: cancelamento pendente que atinge o fim da vigência expira; a confirmação tardia só fica registrada', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const { id, endsAt } = await becomePremium(context, ana)
    context.provider.failNext('start', 'timeout', { afterRegistering: true })
    await cancel(context, ana)

    context.clock.current = Date.parse(endsAt)
    context.app.locals.tasks.expireSubscriptions()
    assert.equal((await consult(context, ana)).json.subscription.status, 'expired')
    assert.equal(auditsOf(context, id).at(-1).details.previousState, 'cancellation_pending')

    context.provider.confirm(cancellationMovements(context, id)[0].operation_key)
    assert.equal((await context.app.locals.tasks.reconcilePayments()).applied, 1)
    assert.equal(cancellationMovements(context, id)[0].status, 'confirmed')
    assert.equal((await consult(context, ana)).json.subscription.status, 'expired')
    assert.equal(await planOf(context, ana), 'free')
    assert.equal(count(context, 'SELECT COUNT(*) AS n FROM audit_records WHERE action = ?', lifecycleActions.cancelled), 0)
  })
})

test('CT-15 e CT-16: bolões, participações, palpites e medalhas ficam intactos; o limite do Gratuito vale para novas criações', async () => {
  for (const ending of ['cancel', 'expire']) {
    await withSimulator(async (context) => {
      const ana = await context.signUp('Ana')
      const bruno = await context.signUp('Bruno')
      const { endsAt } = await becomePremium(context, ana)
      const first = await context.createPool(ana)
      const second = await context.createPool(ana, { round: 3 })
      await context.joinPool(ana, bruno, first.poolId)
      const participation = context.database.prepare('SELECT id FROM pool_participations WHERE pool_id = ? AND user_id = ?').get(first.poolId, ana.id).id
      context.database.prepare(`
        INSERT INTO predictions (id, participation_id, match_id, type, predicted_outcome, submitted_at)
        VALUES ('p-1', ?, ?, 'result', 'home', '2026-11-14T15:00:00.000Z')
      `).run(participation, first.matches[0].id)

      const snapshot = () => JSON.stringify(['pools', 'pool_matches', 'pool_participations', 'predictions', 'pool_medals']
        .map((table) => context.database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))
      const before = snapshot()

      if (ending === 'cancel') {
        await cancel(context, ana)
        await checkCancellation(context, ana)
      } else {
        context.clock.current = Date.parse(endsAt)
        context.app.locals.tasks.expireSubscriptions()
      }
      assert.equal(await planOf(context, ana), 'free')
      assert.equal(snapshot(), before)
      for (const { poolId } of [first, second]) {
        const pool = (await context.call('GET', `/pools/${poolId}`, { token: ana.token })).json.pool
        assert.equal(pool.status, 'active')
        assert.equal(pool.liveResults, true)
      }

      const availability = (await context.call('GET', '/pools/creation-availability', { token: ana.token })).json
      assert.deepEqual([availability.limit, availability.activePools, availability.canCreate], [1, 2, false])
      const matches = (await context.call('GET', '/catalog/rounds/4/matches?status=scheduled', { token: ana.token })).json.matches
      const blocked = await context.call('POST', '/pools', {
        token: ana.token,
        body: {
          name: 'Mais um', startsOn: '2026-11-14', endsOn: '2026-12-31', entryFee: 0,
          prizeModel: 'winner_takes_all', tiebreaker: 'exact_scores', selection: { matchIds: [matches[0].id] },
        },
      })
      expectCommonFormat(blocked, 409, 'pool_limit_reached')
    })
  }
})

test('CT-18: cancelamento com o Mercado Pago em teste, sem segredos em registros e respostas', async () => {
  const token = 'TEST-2222222222222222-segredo-de-teste'
  const requests = []
  let preapprovalStatus = 'pending'
  const fetcher = async (url, options) => {
    const path = new URL(url).pathname
    requests.push({ method: options.method, path })
    let body
    if (options.method === 'POST') body = { id: 'pre-9', init_point: 'https://sandbox.mercadopago.com.br/subscriptions/checkout?preapproval_id=pre-9' }
    else if (options.method === 'PUT') {
      preapprovalStatus = 'cancelled'
      body = { id: 'pre-9', status: 'cancelled', access_token: token }
    } else if (path === '/preapproval/search') body = { results: [{ id: 'pre-9', status: preapprovalStatus === 'pending' ? 'authorized' : preapprovalStatus }] }
    else body = { id: 'pre-9', status: preapprovalStatus }
    return { ok: true, status: 200, json: async () => body }
  }
  const provider = createMercadoPagoTestPaymentsProvider({ accessToken: token, fetcher, backUrl: 'http://localhost:5173', subscriptionsProofApproved: true })

  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    await context.call('POST', '/account/premium/subscription', { token: ana.token, body: confirm })
    preapprovalStatus = 'authorized'
    assert.equal((await context.call('POST', '/account/premium/subscription/check', { token: ana.token })).json.subscription.status, 'active')

    const requested = await cancel(context, ana)
    assert.equal(requested.status, 202, requested.text)
    assert.equal(requested.json.subscription.simulated, false)
    assert.deepEqual(requests.find((item) => item.method === 'PUT'), { method: 'PUT', path: '/preapproval/pre-9' })
    assert.equal((await checkCancellation(context, ana)).json.subscription.status, 'cancelled')
    assert.equal(await planOf(context, ana), 'free')

    const audits = JSON.stringify(context.database.prepare('SELECT * FROM audit_records').all())
    const movements = JSON.stringify(context.database.prepare('SELECT * FROM financial_movements').all())
    for (const text of [JSON.stringify(context.events), audits, movements, ...context.responses]) {
      assert.equal(text.includes(token), false)
      assert.equal(text.includes('segredo-de-teste'), false)
    }
  }, { paymentsProvider: provider })

  // Um adaptador sem as operações de cancelamento nunca cai na operação genérica (que seria uma cobrança).
  const generic = createSimulatedPaymentsProvider()
  delete generic.startSubscriptionCancellation
  delete generic.consultSubscriptionCancellation
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    await becomePremium(context, ana)
    const startsBefore = generic.calls.start
    expectCommonFormat(await cancel(context, ana), 503, 'payments_provider_unavailable')
    assert.equal(generic.calls.start, startsBefore)
  }, { paymentsProvider: generic })

  const example = fs.readFileSync(new URL('../../.env.example', import.meta.url), 'utf8')
  assert.match(example, /^SUBSCRIPTION_EXPIRATION_INTERVAL_MS=$/m)
})

test('CT-19: transições inválidas são rejeitadas no banco e estados finais não são reabertos', async () => {
  await withSimulator(async (context) => {
    const ana = await context.signUp('Ana')
    const bruno = await context.signUp('Bruno')
    const cancelled = await becomePremium(context, ana)
    await cancel(context, ana)
    await checkCancellation(context, ana)
    const expired = await becomePremium(context, bruno)
    context.clock.current = Date.parse(expired.endsAt)
    context.app.locals.tasks.expireSubscriptions()

    for (const id of [cancelled.id, expired.id]) {
      for (const status of ['active', 'cancellation_pending', 'pending']) {
        assert.throws(() => context.database.prepare('UPDATE subscriptions SET status = ? WHERE id = ?').run(status, id), /final/)
      }
    }
    assert.throws(() => context.database.prepare("UPDATE users SET plan = 'premium' WHERE id = ?").run(ana.id), /active subscription/)
    assert.throws(() => context.database.prepare('UPDATE subscriptions SET ends_at = ? WHERE id = ?').run('2030-01-01T00:00:00.000Z', cancelled.id), /final|immutable/)
    assert.throws(() => context.database.prepare("INSERT INTO financial_movements (id, operation_key, business_reference, attempt_number, type, amount_cents, currency, status, user_id, origin, operation_type, operation_id, created_at, updated_at) VALUES ('x', 'k', 'b', 1, 'subscription_cancellation', 100, 'BRL', 'pending', ?, 'simulator', 'subscription', 's', 'n', 'n')").run(ana.id), /CHECK/)
  })
})
