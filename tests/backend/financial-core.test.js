import assert from 'node:assert/strict'
import test from 'node:test'
import { createSimulatedPaymentsProvider } from '../../src/backend/adapters/simulated-payments-provider.js'
import { expectCommonFormat, withHttpApp } from './support/app-harness.js'

test('SPEC-018: cria, confirma, recusa, reconcilia e limita o histórico ao próprio usuário', async () => {
  const provider = createSimulatedPaymentsProvider()
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const bruno = await context.signUp('Bruno')

    const confirmed = context.app.locals.financial.startMovement({
      type: 'subscription',
      amountCents: 2990,
      currency: 'BRL',
      userId: ana.id,
      operationType: 'subscription',
      operationId: 'subscription-1',
    })
    assert.equal(confirmed.status, 'pending')
    assert.equal(confirmed.origin, 'simulator')
    assert.equal(confirmed.amountCents, 2990)

    provider.confirm(confirmed.operationKey)
    assert.deepEqual(context.app.locals.tasks.reconcilePayments(), { checked: 1, applied: 1, pending: 0 })
    const confirmedRow = context.database.prepare('SELECT * FROM financial_movements WHERE id = ?').get(confirmed.id)
    assert.equal(confirmedRow.status, 'confirmed')

    const repeated = context.app.locals.financial.startMovement({
      type: 'subscription',
      amountCents: 2990,
      userId: ana.id,
      operationType: 'subscription',
      operationId: 'subscription-1',
    })
    assert.equal(repeated.id, confirmed.id)

    const refund = context.app.locals.financial.startMovement({
      type: 'refund',
      amountCents: 100,
      userId: ana.id,
      operationType: 'refund_request',
      operationId: 'refund-1',
      originalMovementId: confirmed.id,
    })
    provider.refuse(refund.operationKey)
    context.app.locals.tasks.reconcilePayments()
    const refusedRow = context.database.prepare('SELECT * FROM financial_movements WHERE id = ?').get(refund.id)
    assert.equal(refusedRow.status, 'refused')

    const retry = context.app.locals.financial.startMovement({
      type: 'refund',
      amountCents: 100,
      userId: ana.id,
      operationType: 'refund_request',
      operationId: 'refund-1',
      originalMovementId: confirmed.id,
    })
    assert.notEqual(retry.id, refund.id)
    assert.match(retry.operationKey, /attempt:2$/)

    const anaHistory = await context.call('GET', '/account/financial-history', { token: ana.token })
    assert.equal(anaHistory.status, 200, anaHistory.text)
    assert.ok(anaHistory.json.movements.every((movement) => movement.userId === ana.id))

    const brunoHistory = await context.call('GET', '/account/financial-movements', { token: bruno.token })
    assert.equal(brunoHistory.status, 200, brunoHistory.text)
    assert.deepEqual(brunoHistory.json.movements, [])
    expectCommonFormat(await context.call('GET', '/account/financial-history'), 401, 'session_rejected')
  }, { paymentsProvider: provider })
})

test('SPEC-018: idempotência da chave e estados finais', async () => {
  const provider = createSimulatedPaymentsProvider()
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const input = {
      type: 'entry_fee',
      amountCents: 10,
      userId: ana.id,
      operationType: 'participation',
      operationId: 'participation-1',
      operationKey: 'participation:participation-1',
    }
    const first = context.app.locals.financial.startMovement(input)
    const second = context.app.locals.financial.startMovement(input)
    assert.equal(first.id, second.id)
    assert.equal(context.database.prepare('SELECT COUNT(*) AS count FROM financial_movements').get().count, 1)

    provider.confirm(first.operationKey)
    context.app.locals.tasks.reconcilePayments()
    provider.confirm(first.operationKey)
    context.app.locals.tasks.reconcilePayments()
    assert.equal(context.database.prepare('SELECT COUNT(*) AS count FROM financial_movements').get().count, 1)
    assert.equal(context.database.prepare('SELECT COUNT(*) AS count FROM audit_records WHERE action = ?').get('financial.movement_confirmed').count, 1)
  }, { paymentsProvider: provider })
})

test('SPEC-018: falha do tratador volta para conferência', async () => {
  const provider = createSimulatedPaymentsProvider({ initialBehavior: 'pending' })
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const movement = context.app.locals.financial.startMovement({
      type: 'entry_fee',
      amountCents: 10,
      userId: ana.id,
      operationType: 'participation',
      operationId: 'participation-handler-failure',
    })
    context.app.locals.financial.registerHandler('entry_fee', {
      confirmed: () => { throw new Error('falha simulada do tratador') },
      refused: () => true,
    })
    provider.confirm(movement.operationKey)
    assert.equal(context.app.locals.tasks.reconcilePayments().applied, 0)
    assert.equal(context.database.prepare(
      'SELECT status FROM financial_movements WHERE id = ?',
    ).get(movement.id).status, 'pending')

    context.app.locals.financial.registerHandler('entry_fee', {
      confirmed: () => true,
      refused: () => true,
    })
    assert.equal(context.app.locals.tasks.reconcilePayments().applied, 1)
  }, { paymentsProvider: provider })
})

test('SPEC-018: falha ao iniciar deixa pendente e registra falha técnica', async () => {
  const provider = createSimulatedPaymentsProvider({ initialBehavior: 'failure' })
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const movement = context.app.locals.financial.startMovement({
      type: 'subscription',
      amountCents: 2990,
      userId: ana.id,
      operationType: 'subscription',
      operationId: 'subscription-failure',
    })

    assert.equal(movement.status, 'pending')
    assert.equal(movement.providerId, null)
    assert.equal(context.database.prepare(
      'SELECT COUNT(*) AS count FROM audit_records WHERE action = ?',
    ).get('financial.movement_failed').count, 1)
  }, { paymentsProvider: provider })
})

test('SPEC-018: valores em centavos são exatos e as finais não são reabertas', async () => {
  const provider = createSimulatedPaymentsProvider()
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const subtotal = 10 + 20
    const movement = context.app.locals.financial.startMovement({
      type: 'subscription',
      amountCents: subtotal,
      userId: ana.id,
      operationType: 'subscription',
      operationId: 'subscription-decimal',
    })

    assert.equal(movement.amountCents, 30)
    assert.equal(movement.amount, '0.30')
    provider.confirm(movement.operationKey)
    context.app.locals.tasks.reconcilePayments()

    const finalRow = context.database.prepare(
      'SELECT status FROM financial_movements WHERE id = ?',
    ).get(movement.id)
    assert.equal(finalRow.status, 'confirmed')
    assert.equal(context.app.locals.financial.consultMovement(movement.operationKey).applied, false)
  }, { paymentsProvider: provider })
})
