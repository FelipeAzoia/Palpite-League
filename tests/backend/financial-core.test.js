import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { auditDetailSchemas, defaultFinancialReconciliationIntervalMs } from '../../src/backend/app.js'
import { createSimulatedPaymentsProvider } from '../../src/backend/adapters/simulated-payments-provider.js'
import { createMercadoPagoTestPaymentsProvider } from '../../src/backend/adapters/mercado-pago-test-payments-provider.js'
import { createAuditStore } from '../../src/backend/modules/notifications-audit/index.js'
import {
  createFinancialCoreService,
  financialActions,
  formatCents,
  PaymentsProviderError,
} from '../../src/backend/modules/payments-subscriptions/index.js'
import { createScheduler } from '../../src/backend/shared/scheduler.js'
import { expectCommonFormat, startOfTests, withHttpApp } from './support/app-harness.js'

// SPEC-018 — núcleo financeiro de teste. Toda a suíte roda com o simulador ou com adaptadores de
// teste, sem credenciais e sem rede externa (RNF18).

function payout(user, overrides = {}) {
  return {
    type: 'payout',
    amountCents: 2990,
    userId: user.id,
    operation: { type: 'pool', id: 'bolao-1' },
    ...overrides,
  }
}

function row(database, id) {
  return database.prepare('SELECT * FROM financial_movements WHERE id = ?').get(id)
}

function count(database, sql = 'SELECT COUNT(*) AS n FROM financial_movements', ...params) {
  return database.prepare(sql).get(...params).n
}

function auditOf(context, id) {
  return context.auditStore.findByObject({ type: 'financial_movement', id })
}

// Núcleo próprio do teste, sobre o banco do harness, para trocar o provedor e a auditoria.
function coreFor(context, { paymentsProvider = createSimulatedPaymentsProvider(), auditStore } = {}) {
  return createFinancialCoreService(context.database, {
    auditStore: auditStore ?? createAuditStore(context.database, { logger: context.logger, detailSchemasByAction: auditDetailSchemas }),
    paymentsProvider,
    logger: context.logger,
    now: () => context.clock.current,
  })
}

// Adaptador de teste mínimo do "provedor de teste": implementa a porta em memória (CA-16).
function createInMemoryTestProvider() {
  const statuses = new Map()
  return {
    source: 'test_provider',
    async startOperation({ operationKey }) {
      statuses.set(operationKey, 'pending')
      return { providerId: `mem-${operationKey}`, continuation: { kind: 'checkout', url: 'https://sandbox.example/checkout' } }
    },
    async consultOperation({ operationKey }) {
      if (!statuses.has(operationKey)) throw new PaymentsProviderError('invalid_response')
      return { providerId: `mem-${operationKey}`, status: statuses.get(operationKey) }
    },
    confirm: (key) => statuses.set(key, 'confirmed'),
    refuse: (key) => statuses.set(key, 'refused'),
  }
}

test('TC-01 e TC-15: iniciar registra movimentação pendente completa, com auditoria do usuário e origem simulador', async () => {
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const { movement, created } = await context.app.locals.financial.startMovement(payout(ana))

    assert.equal(created, true)
    assert.match(movement.id, /^[0-9a-f-]{36}$/)
    assert.equal(movement.type, 'payout')
    assert.equal(movement.amountCents, 2990)
    assert.equal(movement.currency, 'BRL')
    assert.equal(movement.status, 'pending')
    assert.equal(movement.userId, ana.id)
    assert.equal(movement.origin, 'simulator')
    assert.deepEqual(movement.operation, { type: 'pool', id: 'bolao-1' })
    assert.equal(movement.operationKey, 'pool:bolao-1:attempt-1')
    assert.equal(movement.providerId, 'sim-pool:bolao-1:attempt-1')
    assert.deepEqual(movement.continuation, { kind: 'simulated_checkout', simulated: true })
    assert.equal(movement.createdAt, new Date(startOfTests).toISOString())

    const [audit] = auditOf(context, movement.id)
    assert.equal(audit.action, financialActions.created)
    assert.deepEqual(audit.actor, { type: 'user', id: ana.id })
    assert.equal(audit.result, 'success')
    assert.equal(audit.origin, 'simulator')
    assert.deepEqual(audit.details, { movementType: 'payout', amountCents: 2990, newState: 'pending', origin: 'simulator' })
  })
})

test('TC-02 e TC-15: confirmar e recusar aplicam o estado, executam o tratador e auditam com o sistema como ator', async () => {
  const provider = createSimulatedPaymentsProvider()
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const core = context.app.locals.financial
    const effects = []
    core.registerHandler('entry_fee', {
      onConfirmed: (movement, { database }) => {
        assert.equal(database.inTransaction, true)
        effects.push(['confirmed', movement.id])
      },
      onRefused: (movement, { database }) => {
        assert.equal(database.inTransaction, true)
        effects.push(['refused', movement.id])
      },
    })
    const fee = (id) => ({ type: 'entry_fee', amountCents: 1500, userId: ana.id, operation: { type: 'participation', id } })
    const { movement: paid } = await core.startMovement(fee('p-1'))
    const { movement: refused } = await core.startMovement(fee('p-2'))

    provider.confirm(paid.operationKey)
    provider.refuse(refused.operationKey)
    assert.deepEqual(await context.app.locals.tasks.reconcilePayments(), { checked: 2, applied: 2, pending: 0 })

    assert.equal(row(context.database, paid.id).status, 'confirmed')
    assert.equal(row(context.database, refused.id).status, 'refused')
    assert.deepEqual(effects, [['confirmed', paid.id], ['refused', refused.id]])

    const confirmation = auditOf(context, paid.id).at(-1)
    assert.equal(confirmation.action, financialActions.confirmed)
    assert.deepEqual(confirmation.actor, { type: 'system' })
    assert.equal(confirmation.result, 'success')
    assert.equal(confirmation.origin, 'simulator')
    assert.deepEqual(confirmation.details, {
      movementType: 'entry_fee', amountCents: 1500, previousState: 'pending', newState: 'confirmed',
      origin: 'simulator', providerId: paid.providerId,
    })

    const refusal = auditOf(context, refused.id).at(-1)
    assert.equal(refusal.action, financialActions.refused)
    assert.deepEqual(refusal.actor, { type: 'system' })
    assert.equal(refusal.result, 'failure')
    assert.equal(refusal.details.previousState, 'pending')
    assert.equal(refusal.details.newState, 'refused')
  }, { paymentsProvider: provider })
})

test('TC-03: sem resposta do provedor a movimentação permanece pendente e o tratador não roda', async () => {
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const core = context.app.locals.financial
    let effects = 0
    core.registerHandler('payout', { onConfirmed: () => { effects += 1 }, onRefused: () => { effects += 1 } })
    const { movement } = await core.startMovement(payout(ana))

    for (let index = 0; index < 3; index += 1) {
      assert.deepEqual(await context.app.locals.tasks.reconcilePayments(), { checked: 1, applied: 0, pending: 1 })
    }
    assert.equal(row(context.database, movement.id).status, 'pending')
    assert.equal(effects, 0)
    assert.equal(auditOf(context, movement.id).length, 1)
  })
})

test('TC-04: nova tentativa só depois de uma recusa, com nova chave; pendente e confirmada devolvem a existente', async () => {
  const provider = createSimulatedPaymentsProvider()
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const core = context.app.locals.financial

    const pending = await core.startMovement(payout(ana, { operation: { type: 'pool', id: 'pendente' } }))
    const pendingAgain = await core.startMovement(payout(ana, { operation: { type: 'pool', id: 'pendente' } }))
    assert.equal(pendingAgain.created, false)
    assert.equal(pendingAgain.movement.id, pending.movement.id)

    const paid = await core.startMovement(payout(ana, { operation: { type: 'pool', id: 'paga' } }))
    provider.confirm(paid.movement.operationKey)
    await core.checkMovement(paid.movement.id)
    const paidAgain = await core.startMovement(payout(ana, { operation: { type: 'pool', id: 'paga' } }))
    assert.equal(paidAgain.created, false)
    assert.equal(paidAgain.movement.id, paid.movement.id)
    assert.equal(paidAgain.movement.status, 'confirmed')

    const refused = await core.startMovement(payout(ana, { operation: { type: 'pool', id: 'recusada' } }))
    provider.refuse(refused.movement.operationKey)
    await core.checkMovement(refused.movement.id)
    const retry = await core.startMovement(payout(ana, { operation: { type: 'pool', id: 'recusada' } }))
    assert.equal(retry.created, true)
    assert.notEqual(retry.movement.id, refused.movement.id)
    assert.equal(retry.movement.attemptNumber, 2)
    assert.equal(retry.movement.operationKey, 'pool:recusada:attempt-2')
    assert.equal(retry.movement.status, 'pending')
    assert.equal(row(context.database, refused.movement.id).status, 'refused')

    assert.equal(count(context.database), 4)
    assert.equal(provider.calls.start, 4)
  }, { paymentsProvider: provider })
})

test('TC-05: solicitações e confirmações repetidas não duplicam movimentação, estado, efeito nem auditoria', async () => {
  const provider = createSimulatedPaymentsProvider()
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const core = context.app.locals.financial
    let effects = 0
    core.registerHandler('payout', { onConfirmed: () => { effects += 1 }, onRefused: () => {} })

    const first = await core.startMovement(payout(ana))
    const second = await core.startMovement(payout(ana))
    assert.equal(second.movement.id, first.movement.id)
    assert.equal(count(context.database), 1)
    assert.equal(provider.calls.start, 1)

    // A mesma referência com outro valor não reaproveita nem cria nada.
    await assert.rejects(core.startMovement(payout(ana, { amountCents: 1 })), { status: 409, type: 'financial_reference_conflict' })

    for (let index = 0; index < 3; index += 1) {
      provider.confirm(first.movement.operationKey)
      await Promise.all([context.app.locals.tasks.reconcilePayments(), core.checkMovement(first.movement.operationKey)])
    }
    assert.equal(count(context.database), 1)
    assert.equal(effects, 1)
    assert.equal(count(context.database, 'SELECT COUNT(*) AS n FROM audit_records WHERE action = ?', financialActions.confirmed), 1)
    assert.equal((await core.checkMovement(first.movement.id)).applied, false)
  }, { paymentsProvider: provider })
})

test('TC-06: tempo esgotado ao iniciar não repete a cobrança e consulta o estado antes de qualquer nova tentativa', async () => {
  const provider = createSimulatedPaymentsProvider()
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const core = context.app.locals.financial

    provider.failNext('start', 'timeout', { afterRegistering: true })
    const { movement } = await core.startMovement(payout(ana))
    assert.equal(movement.status, 'pending')
    assert.equal(movement.providerId, null)
    const failure = auditOf(context, movement.id).at(-1)
    assert.equal(failure.action, financialActions.providerFailed)
    assert.equal(failure.result, 'failure')
    assert.deepEqual(failure.details, { stage: 'start', reason: 'timeout', state: 'pending', origin: 'simulator' })
    assert.ok(context.events.some((event) => event.component === 'payments' && event.result === 'provider_start_timeout'))

    // O tempo passa e a conferência roda: nenhuma nova cobrança, só consultas.
    context.clock.current += 10 * 60 * 1000
    await context.app.locals.tasks.reconcilePayments()
    await context.app.locals.tasks.reconcilePayments()
    assert.equal(provider.calls.start, 1)
    assert.equal(provider.calls.consult, 2)

    // Pedir de novo consulta o estado da anterior e não cria outra.
    const consultsBefore = provider.calls.consult
    const again = await core.startMovement(payout(ana))
    assert.equal(again.created, false)
    assert.equal(again.movement.id, movement.id)
    assert.equal(provider.calls.consult, consultsBefore + 1)
    assert.equal(provider.calls.start, 1)

    // O provedor havia recebido a operação: a conferência a confirma pela chave.
    provider.confirm(movement.operationKey)
    assert.equal((await context.app.locals.tasks.reconcilePayments()).applied, 1)
    assert.equal(row(context.database, movement.id).status, 'confirmed')
    assert.equal(row(context.database, movement.id).provider_id, `sim-${movement.operationKey}`)
  }, { paymentsProvider: provider })
})

test('TC-06: falhas de consulta deixam pendente, sem efeito, e são registradas sem segredos', async () => {
  const provider = createSimulatedPaymentsProvider()
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const core = context.app.locals.financial
    const { movement } = await core.startMovement(payout(ana))
    provider.confirm(movement.operationKey)
    for (const code of ['timeout', 'response_error', 'invalid_response']) {
      provider.failNext('consult', code)
      assert.equal((await core.checkMovement(movement.id)).applied, false)
      assert.equal(row(context.database, movement.id).status, 'pending')
    }
    const reasons = auditOf(context, movement.id).filter((record) => record.action === financialActions.providerFailed)
      .map((record) => record.details.reason)
    assert.deepEqual(reasons, ['timeout', 'response_error', 'invalid_response'])
    assert.equal((await core.checkMovement(movement.id)).applied, true)
  }, { paymentsProvider: provider })
})

test('TC-07: falha do tratador ou da auditoria na confirmação desfaz tudo; a conferência seguinte aplica', async () => {
  const provider = createSimulatedPaymentsProvider()
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const core = context.app.locals.financial
    context.database.exec('CREATE TABLE handler_effects (movement_id TEXT NOT NULL)')
    let failHandler = true
    core.registerHandler('payout', {
      onConfirmed: (movement, { database }) => {
        database.prepare('INSERT INTO handler_effects (movement_id) VALUES (?)').run(movement.id)
        if (failHandler) throw new Error('falha simulada do tratador')
      },
      onRefused: () => {},
    })
    const { movement } = await core.startMovement(payout(ana))
    provider.confirm(movement.operationKey)

    assert.equal((await context.app.locals.tasks.reconcilePayments()).applied, 0)
    assert.equal(row(context.database, movement.id).status, 'pending')
    assert.equal(count(context.database, 'SELECT COUNT(*) AS n FROM handler_effects'), 0)
    assert.equal(auditOf(context, movement.id).some((record) => record.action === financialActions.providerFailed), false)
    assert.ok(context.events.some((event) => event.result === 'state_change_failed'))

    failHandler = false
    assert.equal((await context.app.locals.tasks.reconcilePayments()).applied, 1)
    assert.equal(row(context.database, movement.id).status, 'confirmed')
    assert.equal(count(context.database, 'SELECT COUNT(*) AS n FROM handler_effects'), 1)
  }, { paymentsProvider: provider })

  // Falha da auditoria ao aplicar a confirmação e a recusa.
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const simulator = createSimulatedPaymentsProvider()
    const realAudit = createAuditStore(context.database, { logger: context.logger, detailSchemasByAction: auditDetailSchemas })
    let failAudit = true
    const flakyAudit = {
      ...realAudit,
      runAuditedOperation(entry, operation) {
        if (failAudit && entry.action === financialActions.confirmed) {
          return context.database.transaction(() => { operation(context.database); throw new Error('falha simulada da auditoria') })()
        }
        return realAudit.runAuditedOperation(entry, operation)
      },
      recordOutcome(entry, result) {
        if (failAudit && entry.action === financialActions.refused) throw new Error('falha simulada da auditoria')
        return realAudit.recordOutcome(entry, result)
      },
    }
    const core = coreFor(context, { paymentsProvider: simulator, auditStore: flakyAudit })
    context.database.exec('CREATE TABLE handler_effects (movement_id TEXT NOT NULL)')
    const recordEffect = (movement, { database }) => {
      database.prepare('INSERT INTO handler_effects (movement_id) VALUES (?)').run(movement.id)
    }
    core.registerHandler('payout', { onConfirmed: recordEffect, onRefused: recordEffect })
    const { movement: toConfirm } = await core.startMovement(payout(ana, { operation: { type: 'pool', id: 'c' } }))
    const { movement: toRefuse } = await core.startMovement(payout(ana, { operation: { type: 'pool', id: 'r' } }))
    simulator.confirm(toConfirm.operationKey)
    simulator.refuse(toRefuse.operationKey)

    assert.equal((await core.reconcilePending()).applied, 0)
    assert.equal(row(context.database, toConfirm.id).status, 'pending')
    assert.equal(row(context.database, toRefuse.id).status, 'pending')
    assert.equal(count(context.database, 'SELECT COUNT(*) AS n FROM handler_effects'), 0)

    failAudit = false
    assert.equal((await core.reconcilePending()).applied, 2)
    assert.equal(row(context.database, toConfirm.id).status, 'confirmed')
    assert.equal(row(context.database, toRefuse.id).status, 'refused')
    assert.equal(count(context.database, 'SELECT COUNT(*) AS n FROM handler_effects'), 2)
  })
})

test('TC-07 e CA-18: falha da auditoria na criação não grava movimentação nem chama o provedor', async () => {
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const simulator = createSimulatedPaymentsProvider()
    const realAudit = createAuditStore(context.database, { logger: context.logger, detailSchemasByAction: auditDetailSchemas })
    const core = coreFor(context, {
      paymentsProvider: simulator,
      auditStore: {
        ...realAudit,
        runAuditedOperation: (_entry, operation) => context.database.transaction(() => {
          operation(context.database)
          throw new Error('falha simulada da auditoria')
        })(),
      },
    })

    await assert.rejects(core.startMovement(payout(ana)))
    assert.equal(count(context.database), 0)
    assert.equal(simulator.calls.start, 0)
  })
})

test('TC-08: conferência roda logo após a inicialização e a cada 5 minutos, sem sobreposição e isolada de falhas', async () => {
  assert.equal(defaultFinancialReconciliationIntervalMs, 5 * 60 * 1000)
  const startup = fs.readFileSync(new URL('../../src/backend/index.js', import.meta.url), 'utf8')
  assert.match(startup, /'financial-reconciliation'[\s\S]*FINANCIAL_RECONCILIATION_INTERVAL_MS[\s\S]*reconcilePayments/)

  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const core = context.app.locals.financial
    await core.startMovement(payout(ana))

    // Duas chamadas simultâneas compartilham a mesma execução.
    const first = core.reconcilePending()
    assert.equal(core.reconcilePending(), first)
    await first

    const timers = []
    const scheduler = createScheduler({
      logger: context.logger,
      setTimer: (callback, ms) => { timers.push({ callback, ms }); return timers.length },
      clearTimer: () => {},
    })
    let runs = 0
    let failNext = true
    scheduler.register('financial-reconciliation', defaultFinancialReconciliationIntervalMs, async () => {
      runs += 1
      if (failNext) { failNext = false; throw new Error('falha simulada da conferência') }
      return context.app.locals.tasks.reconcilePayments()
    })
    await scheduler.start()
    assert.equal(runs, 1)
    assert.equal(timers.at(-1).ms, 5 * 60 * 1000)
    await timers.at(-1).callback()
    assert.equal(runs, 2)
    scheduler.stop()
  })
})

test('TC-09: dois adaptadores de teste da porta são trocados sem alterar o núcleo', async () => {
  for (const makeProvider of [createSimulatedPaymentsProvider, createInMemoryTestProvider]) {
    await withHttpApp(async (context) => {
      const ana = await context.signUp('Ana')
      const provider = makeProvider()
      const core = coreFor(context, { paymentsProvider: provider })
      const { movement } = await core.startMovement(payout(ana))
      assert.equal(movement.origin, provider.source)
      provider.confirm(movement.operationKey)
      assert.equal((await core.reconcilePending()).applied, 1)
      assert.equal(row(context.database, movement.id).status, 'confirmed')
      assert.equal(row(context.database, movement.id).origin, provider.source)
    })
  }

  assert.throws(() => createFinancialCoreService({}, { auditStore: {}, paymentsProvider: { source: 'real_money' } }), TypeError)
})

test('TC-13: um provedor nunca aplica resposta a movimentações de outra origem', async () => {
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const simulator = createSimulatedPaymentsProvider()
    const simulated = await coreFor(context, { paymentsProvider: simulator }).startMovement(payout(ana))
    simulator.confirm(simulated.movement.operationKey)

    const testProvider = createInMemoryTestProvider()
    const otherCore = coreFor(context, { paymentsProvider: testProvider })
    assert.equal((await otherCore.reconcilePending()).applied, 0)
    assert.equal(row(context.database, simulated.movement.id).status, 'pending')
    assert.equal(row(context.database, simulated.movement.id).origin, 'simulator')
  })
})

test('TC-10: movimentações finais não são reabertas, reescritas nem apagadas; a devolução é uma nova movimentação', async () => {
  const provider = createSimulatedPaymentsProvider()
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const bruno = await context.signUp('Bruno')
    const core = context.app.locals.financial
    assert.deepEqual(Object.keys(core).sort(), ['checkMovement', 'getHistory', 'reconcilePending', 'registerHandler', 'startMovement'])

    const fee = { type: 'entry_fee', amountCents: 1500, userId: ana.id, operation: { type: 'participation', id: 'p-1' } }
    const { movement: paid } = await core.startMovement(fee)
    const refundOf = (overrides = {}) => ({
      type: 'refund', amountCents: 1500, userId: ana.id,
      operation: { type: 'refund_request', id: 'devolucao-1' }, originalMovementId: paid.id, ...overrides,
    })

    // Original ainda pendente não pode ser devolvida.
    await assert.rejects(core.startMovement(refundOf()), { status: 409, type: 'original_movement_not_refundable' })
    await assert.rejects(core.startMovement(refundOf({ originalMovementId: undefined })), { status: 400 })
    await assert.rejects(core.startMovement({ ...fee, originalMovementId: paid.id, operation: { type: 'participation', id: 'p-x' } }), { status: 400 })

    provider.confirm(paid.operationKey)
    await core.checkMovement(paid.id)
    await assert.rejects(core.startMovement(refundOf({ userId: bruno.id, operation: { type: 'refund_request', id: 'outra' } })), { status: 404 })

    const { movement: refund } = await core.startMovement(refundOf())
    assert.notEqual(refund.id, paid.id)
    assert.equal(refund.originalMovementId, paid.id)
    assert.equal(refund.type, 'refund')
    assert.equal(row(context.database, paid.id).status, 'confirmed')
    assert.equal(row(context.database, paid.id).amount_cents, 1500)

    for (const sql of [
      "UPDATE financial_movements SET status = 'pending' WHERE id = ?",
      "UPDATE financial_movements SET status = 'refused' WHERE id = ?",
      'UPDATE financial_movements SET amount_cents = 1 WHERE id = ?',
      "UPDATE financial_movements SET updated_at = 'x' WHERE id = ?",
      'DELETE FROM financial_movements WHERE id = ?',
    ]) {
      assert.throws(() => context.database.prepare(sql).run(paid.id), /immutable|never deleted/)
    }
    // Mesmo pendente, a identidade da movimentação não muda, e nada é apagado.
    assert.throws(() => context.database.prepare('UPDATE financial_movements SET amount_cents = 1 WHERE id = ?').run(refund.id), /immutable/)
    assert.throws(() => context.database.prepare('DELETE FROM financial_movements WHERE id = ?').run(refund.id), /never deleted/)
  }, { paymentsProvider: provider })
})

test('TC-11 e TC-13: cada usuário vê só o próprio histórico, do mais recente ao mais antigo, com a origem; sem sessão é 401', async () => {
  const provider = createSimulatedPaymentsProvider()
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const bruno = await context.signUp('Bruno')
    const core = context.app.locals.financial
    const { movement: older } = await core.startMovement(payout(ana))
    context.clock.current += 60 * 1000
    const { movement: newer } = await core.startMovement({ type: 'entry_fee', amountCents: 1000, userId: ana.id, operation: { type: 'participation', id: 'p-1' } })
    await core.startMovement(payout(bruno, { operation: { type: 'pool', id: 'bolao-bruno' } }))
    provider.confirm(older.operationKey)
    await core.reconcilePending()

    const anaHistory = await context.call('GET', '/account/financial-history', { token: ana.token })
    assert.equal(anaHistory.status, 200, anaHistory.text)
    assert.equal(anaHistory.json.environment, 'test')
    assert.deepEqual(anaHistory.json.movements.map(({ id }) => id), [newer.id, older.id])
    assert.deepEqual(anaHistory.json.movements[1], {
      id: older.id,
      type: 'payout',
      amountCents: 2990,
      amount: '29.90',
      currency: 'BRL',
      status: 'confirmed',
      origin: 'simulator',
      simulated: true,
      createdAt: new Date(startOfTests).toISOString(),
      updatedAt: new Date(startOfTests + 60 * 1000).toISOString(),
    })

    const brunoHistory = await context.call('GET', '/account/financial-history', { token: bruno.token })
    assert.equal(brunoHistory.json.movements.length, 1)
    assert.ok(!brunoHistory.text.includes(older.id) && !brunoHistory.text.includes(newer.id))

    expectCommonFormat(await context.call('GET', '/account/financial-history'), 401, 'session_rejected')
    expectCommonFormat(await context.call('GET', '/account/financial-history', { token: 'invalido' }), 401, 'session_rejected')
  }, { paymentsProvider: provider })
})

test('TC-12: valores em centavos inteiros são exatos, em BRL, e valores não inteiros são rejeitados', async () => {
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const core = context.app.locals.financial
    const { movement } = await core.startMovement(payout(ana, { amountCents: 10 + 20 }))
    assert.equal(movement.amountCents, 30)
    assert.equal(formatCents(30), '0.30')
    assert.equal(formatCents(2990), '29.90')
    assert.equal(formatCents(100000005), '1000000.05')

    for (const amountCents of [0.1, 0.3, -10, 0, '30', Number.NaN]) {
      await assert.rejects(core.startMovement(payout(ana, { amountCents, operation: { type: 'pool', id: `v-${amountCents}` } })), { status: 400 })
    }
    await assert.rejects(core.startMovement(payout(ana, { currency: 'USD', operation: { type: 'pool', id: 'usd' } })), { status: 400 })
    assert.throws(() => context.database.prepare(`
      INSERT INTO financial_movements (id, operation_key, business_reference, attempt_number, type, amount_cents, currency,
        status, user_id, origin, operation_type, operation_id, created_at, updated_at)
      VALUES ('x', 'k', 'b', 1, 'payout', 0.3, 'BRL', 'pending', ?, 'simulator', 'payout', 's', 'now', 'now')
    `).run(ana.id), /CHECK/)
  })
})

test('TC-14: nenhuma chave aparece em respostas, registros técnicos ou auditoria; o repositório não guarda credenciais', async () => {
  const token = 'TEST-0000000000000000-segredo-de-teste'
  const failingFetcher = async () => ({ ok: false, status: 401, json: async () => ({ message: token }) })
  const provider = createMercadoPagoTestPaymentsProvider({ accessToken: token, fetcher: failingFetcher })
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const { movement } = await context.app.locals.financial.startMovement(payout(ana))
    await context.app.locals.tasks.reconcilePayments()
    const history = await context.call('GET', '/account/financial-history', { token: ana.token })

    assert.equal(movement.origin, 'test_provider')
    assert.equal(history.json.movements[0].simulated, false)
    const audits = JSON.stringify(context.database.prepare('SELECT * FROM audit_records').all())
    for (const text of [JSON.stringify(context.events), audits, ...context.responses]) {
      assert.equal(text.includes(token), false)
      assert.equal(/segredo-de-teste/.test(text), false)
    }
  }, { paymentsProvider: provider })

  assert.throws(() => createMercadoPagoTestPaymentsProvider({ accessToken: 'APP_USR-producao' }), /test credentials/)
  const example = fs.readFileSync(new URL('../../.env.example', import.meta.url), 'utf8')
  assert.match(example, /^MERCADO_PAGO_TEST_ACCESS_TOKEN=$/m)
  assert.match(example, /^PAYMENTS_PROVIDER=$/m)
})

test('TC-17: 401 e 500 do histórico seguem o formato comum, com correlação e sem detalhes internos', async () => {
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    expectCommonFormat(await context.call('GET', '/account/financial-history'), 401, 'session_rejected')
    context.database.exec('DROP TABLE financial_movements')
    const failure = await context.call('GET', '/account/financial-history', { token: ana.token })
    expectCommonFormat(failure, 500, 'internal_error')
    assert.equal(/financial_movements|no such table/i.test(failure.text), false)
  })
})

test('adaptador Mercado Pago em teste: cliente HTTP com tempo limite, idempotência e erros classificados', async () => {
  const requests = []
  const responses = []
  const fetcher = async (url, options) => {
    requests.push({ url: String(url), options })
    const next = responses.shift()
    if (next instanceof Error) throw next
    return next
  }
  const json = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body })
  const provider = createMercadoPagoTestPaymentsProvider({ accessToken: 'TEST-abc', fetcher, timeoutMs: 1234 })
  assert.equal(provider.source, 'test_provider')

  responses.push(json({ id: '123-abc', sandbox_init_point: 'https://sandbox.mercadopago.com.br/checkout?pref_id=123-abc' }))
  const started = await provider.startOperation({ operationKey: 'pool:s-1:attempt-1', type: 'payout', amountCents: 2990, currency: 'BRL' })
  assert.deepEqual(started, {
    providerId: 'mp-pref-123-abc',
    continuation: { kind: 'checkout', url: 'https://sandbox.mercadopago.com.br/checkout?pref_id=123-abc' },
  })
  const [create] = requests
  assert.equal(create.url, 'https://api.mercadopago.com/checkout/preferences')
  assert.equal(create.options.method, 'POST')
  assert.equal(create.options.headers['x-idempotency-key'], 'pool:s-1:attempt-1')
  assert.ok(create.options.signal instanceof AbortSignal)
  const body = JSON.parse(create.options.body)
  assert.equal(body.external_reference, 'pool:s-1:attempt-1')
  assert.equal(body.items[0].unit_price, 29.9)
  assert.equal(body.items[0].currency_id, 'BRL')

  const consult = (results) => {
    responses.push(json({ results }))
    return provider.consultOperation({ operationKey: 'k', providerId: 'mp-pref-1' })
  }
  assert.equal((await consult([])).status, 'pending')
  assert.equal((await consult([{ status: 'in_process' }])).status, 'pending')
  assert.equal((await consult([{ status: 'rejected' }, { status: 'approved' }])).status, 'confirmed')
  assert.equal((await consult([{ status: 'rejected' }, { status: 'cancelled' }])).status, 'refused')
  assert.match(requests.at(-1).url, /\/v1\/payments\/search\?external_reference=k$/)

  const failures = [
    [Object.assign(new Error('t'), { name: 'TimeoutError' }), 'timeout'],
    [new Error('rede'), 'response_error'],
    [json({}, false), 'response_error'],
    [{ ok: true, json: async () => { throw new SyntaxError('x') } }, 'invalid_response'],
    [json({ results: 'x' }), 'invalid_response'],
  ]
  for (const [response, code] of failures) {
    responses.push(response)
    await assert.rejects(provider.consultOperation({ operationKey: 'k' }), (error) => error instanceof PaymentsProviderError && error.code === code)
  }
  responses.push(json({ id: '1', sandbox_init_point: 'http://inseguro' }))
  await assert.rejects(provider.startOperation({ operationKey: 'k', type: 'payout', amountCents: 1, currency: 'BRL' }), { code: 'invalid_response' })

  const withoutKey = createMercadoPagoTestPaymentsProvider({ fetcher })
  const before = requests.length
  await assert.rejects(withoutKey.consultOperation({ operationKey: 'k' }), { code: 'response_error' })
  assert.equal(requests.length, before)
})
