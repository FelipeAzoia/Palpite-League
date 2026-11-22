import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/app-error.js'
import { createLogger } from '../../shared/logger.js'

export const moduleName = 'payments-subscriptions'

const movementTypes = Object.freeze(['entry_fee', 'subscription', 'refund', 'payout'])
const movementStatuses = Object.freeze(['pending', 'confirmed', 'refused'])
const origins = Object.freeze(['simulator', 'test_provider'])

export const financialActions = Object.freeze({
  created: 'financial.movement_created',
  confirmed: 'financial.movement_confirmed',
  refused: 'financial.movement_refused',
  failed: 'financial.movement_failed',
})

const enumState = { type: 'enum', values: movementStatuses }
const enumType = { type: 'enum', values: movementTypes }
const enumOrigin = { type: 'enum', values: origins }

export const financialAuditDetailSchemas = Object.freeze({
  [financialActions.created]: {
    movementType: enumType,
    amountCents: { type: 'integer' },
    state: enumState,
    origin: enumOrigin,
  },
  [financialActions.confirmed]: {
    previousState: enumState,
    newState: enumState,
    origin: enumOrigin,
  },
  [financialActions.refused]: {
    previousState: enumState,
    newState: enumState,
    origin: enumOrigin,
  },
  [financialActions.failed]: {
    previousState: enumState,
    origin: enumOrigin,
    reason: { type: 'enum', values: ['timeout', 'response_error', 'invalid_response', 'provider_error'] },
  },
})

const systemActor = Object.freeze({ type: 'system' })

function requiredText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') throw new AppError(400, 'validation_error', `${field} é obrigatório.`)
  return value.trim()
}

function normalizeOrigin(provider) {
  if (provider?.source === 'simulator') return 'simulator'
  if (provider?.source === 'test_provider') return 'test_provider'
  throw new TypeError('unsupported payment provider source')
}

function classifyProviderFailure(error) {
  const code = error?.code
  if (code === 'timeout') return 'timeout'
  if (code === 'invalid_response') return 'invalid_response'
  if (code === 'response_error') return 'response_error'
  return 'provider_error'
}

function toMovement(row) {
  if (!row) return null
  let continuation = null
  if (row.continuation_json) {
    try { continuation = JSON.parse(row.continuation_json) } catch { continuation = null }
  }
  return {
    id: row.id,
    operationKey: row.operation_key,
    type: row.type,
    amountCents: row.amount_cents,
    amount: (row.amount_cents / 100).toFixed(2),
    currency: row.currency,
    status: row.status,
    state: row.status,
    userId: row.user_id,
    origin: row.origin,
    providerId: row.provider_id,
    operationOrigin: { type: row.operation_type, id: row.operation_id },
    operationType: row.operation_type,
    operationId: row.operation_id,
    attemptNumber: row.attempt_number,
    originalMovementId: row.original_movement_id,
    continuation,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    confirmedAt: row.confirmed_at,
    refusedAt: row.refused_at,
  }
}

export function createFinancialCoreService(database, {
  auditStore,
  paymentProvider,
  logger = createLogger(),
  now = Date.now,
} = {}) {
  if (!paymentProvider) throw new TypeError('paymentProvider is required')
  if (!auditStore) throw new TypeError('auditStore is required')

  const handlers = new Map()

  function registerHandler(type, handlersForType) {
    if (!movementTypes.includes(type)) throw new TypeError('unsupported movement type')
    if (!handlersForType || typeof handlersForType.confirmed !== 'function' || typeof handlersForType.refused !== 'function') {
      throw new TypeError('confirmed and refused handlers are required')
    }
    handlers.set(type, handlersForType)
  }

  function findByOperation(type, id) {
    return database.prepare(`
      SELECT * FROM financial_movements
      WHERE operation_type = ? AND operation_id = ?
      ORDER BY attempt_number DESC, created_at DESC LIMIT 1
    `).get(type, id)
  }

  function findByKey(operationKey) {
    return database.prepare('SELECT * FROM financial_movements WHERE operation_key = ?').get(operationKey)
  }

  function findById(id) {
    return database.prepare('SELECT * FROM financial_movements WHERE id = ?').get(id)
  }

  function startMovement(input) {
    const type = requiredText(input?.type, 'type')
    if (!movementTypes.includes(type)) throw new AppError(400, 'validation_error', 'Tipo de movimentação inválido.')
    const amountCents = input.amountCents
    if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
      throw new AppError(400, 'validation_error', 'O valor deve ser informado em centavos inteiros.')
    }
    if (input.currency && input.currency !== 'BRL') throw new AppError(400, 'validation_error', 'A moeda deve ser BRL.')
    const userId = requiredText(input.userId, 'userId')
    const operationType = requiredText(input.operationType, 'operationType')
    const operationId = requiredText(input.operationId, 'operationId')
    const originalMovementId = input.originalMovementId ? requiredText(input.originalMovementId, 'originalMovementId') : null

    const latestRow = findByOperation(operationType, operationId)
    if (latestRow) {
      if (latestRow.status !== 'refused') return toMovement(latestRow)
      const previous = toMovement(latestRow)
      if (!input.allowRetry && type === previous.type) {
        // A consulta prévia é feita pelo chamador; a recusa permite uma nova tentativa.
      }
    }

    const attemptNumber = latestRow ? latestRow.attempt_number + (latestRow.status === 'refused' ? 1 : 0) : 1
    if (latestRow && latestRow.status !== 'refused') return toMovement(latestRow)

    const explicitKey = input.operationKey ? requiredText(input.operationKey, 'operationKey') : null
    const baseKey = explicitKey || `${operationType}:${operationId}`
    const operationKey = baseKey.includes(':attempt:')
      ? baseKey.replace(/:attempt:\d+$/, `:attempt:${attemptNumber}`)
      : `${baseKey}:attempt:${attemptNumber}`
    const existing = findByKey(operationKey)
    if (existing) return toMovement(existing)

    const id = randomUUID()
    const at = new Date(now()).toISOString()
    const origin = normalizeOrigin(paymentProvider)
    let providerId = null
    let continuation = null

    const movement = auditStore.runAuditedOperation({
      actor: { type: 'user', id: userId },
      action: financialActions.created,
      object: { type: 'financial_movement', id },
      origin,
      details: { movementType: type, amountCents, state: 'pending', origin },
    }, () => {
      try {
        const providerResult = paymentProvider.startOperation({
          type,
          amountCents,
          currency: 'BRL',
          operationKey,
          operationType,
          operationId,
          userId,
        })
        providerId = providerResult?.providerId ?? null
        continuation = providerResult?.continuation ?? null
      } catch (error) {
        logger.error('payments', 'provider_start_failed')
        const reason = classifyProviderFailure(error)
        try {
          auditStore.recordOutcome({
            actor: systemActor,
            action: financialActions.failed,
            object: { type: 'financial_movement', id },
            origin,
            details: { previousState: 'pending', origin, reason },
          }, 'failure')
        } catch {
          // A falha técnica já é registrada pelo audit store; ela não altera o estado da movimentação.
        }
        providerId = null
        continuation = null
      }

      database.prepare(`
        INSERT INTO financial_movements (
          id, operation_key, type, amount_cents, currency, status, user_id, origin,
          provider_id, operation_type, operation_id, attempt_number, original_movement_id,
          continuation_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, operationKey, type, amountCents, 'BRL', userId, origin,
        providerId, operationType, operationId, attemptNumber, originalMovementId,
        continuation ? JSON.stringify(continuation) : null, at, at,
      )
      return toMovement(findById(id))
    })

    return movement
  }

  function applyResult(movementRow, nextStatus) {
    if (!movementRow || movementRow.status !== 'pending') return { movement: toMovement(movementRow), applied: false }
    if (!['confirmed', 'refused'].includes(nextStatus)) return { movement: toMovement(movementRow), applied: false }

    const movement = toMovement(movementRow)
    const handler = handlers.get(movement.type)
    const at = new Date(now()).toISOString()
    const action = nextStatus === 'confirmed' ? financialActions.confirmed : financialActions.refused

    const updated = auditStore.runAuditedOperation({
      actor: systemActor,
      action,
      object: { type: 'financial_movement', id: movement.id },
      origin: movement.origin,
      details: nextStatus === 'confirmed'
        ? { previousState: 'pending', newState: 'confirmed', origin: movement.origin }
        : { previousState: 'pending', newState: 'refused', origin: movement.origin },
    }, () => {
      const result = handler
        ? (nextStatus === 'confirmed'
          ? handler.confirmed(movement, database)
          : handler.refused(movement, database))
        : true
      if (result === false) throw new Error('Financial state handler rejected the change')

      if (nextStatus === 'confirmed') {
        database.prepare(`
          UPDATE financial_movements
          SET status = 'confirmed', updated_at = ?, confirmed_at = ?
          WHERE id = ? AND status = 'pending'
        `).run(at, at, movement.id)
      } else {
        database.prepare(`
          UPDATE financial_movements
          SET status = 'refused', updated_at = ?, refused_at = ?
          WHERE id = ? AND status = 'pending'
        `).run(at, at, movement.id)
      }
      return toMovement(findById(movement.id))
    })

    return { movement: updated, applied: true }
  }

  function consultMovement(input) {
    const keyOrId = typeof input === 'string' ? input : (input?.operationKey || input?.id)
    let row = findByKey(keyOrId) || findById(keyOrId)
    if (!row) throw new AppError(404, 'not_found', 'Movimentação financeira não encontrada.')
    if (row.status !== 'pending') return { movement: toMovement(row), applied: false }

    try {
      const result = paymentProvider.consultOperation({
        providerId: row.provider_id,
        operationKey: row.operation_key,
      })
      const status = result?.status
      if (status === 'confirmed') return applyResult(row, 'confirmed')
      if (status === 'refused' || status === 'rejected') return applyResult(row, 'refused')
      return { movement: toMovement(row), applied: false }
    } catch (error) {
      logger.error('payments', 'provider_consult_failed')
      const reason = classifyProviderFailure(error)
      try {
        auditStore.recordOutcome({
          actor: systemActor,
          action: financialActions.failed,
          object: { type: 'financial_movement', id: row.id },
          origin: row.origin,
          details: { previousState: 'pending', origin: row.origin, reason },
        }, 'failure')
      } catch {
        // O estado da movimentação não é alterado por falhas técnicas do provedor.
      }
      return { movement: toMovement(row), applied: false }
    }
  }

  function reconcilePending() {
    const rows = database.prepare(`
      SELECT * FROM financial_movements WHERE status = 'pending' ORDER BY created_at ASC
    `).all()
    let applied = 0
    let pending = 0
    for (const row of rows) {
      try {
        const result = consultMovement(row.operation_key)
        if (result.applied) applied += 1
        else pending += 1
      } catch {
        pending += 1
      }
    }
    return { checked: rows.length, applied, pending }
  }

  function getHistory(userId) {
    if (typeof userId !== 'string' || !userId) throw new AppError(401, 'session_rejected', 'Sua sessão expirou ou não é válida.')
    const rows = database.prepare(`
      SELECT * FROM financial_movements
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId)
    return rows.map(toMovement)
  }

  function getHistoryForUser(userId) { return getHistory(userId) }

  return {
    startMovement,
    startOperation: startMovement,
    registerHandler,
    registerMovimentacao: registerHandler,
    consultMovement,
    consulterMovimentacao: consultMovement,
    reconcilePending,
    reconcilePayments: reconcilePending,
    reconcile: reconcilePending,
    getHistory,
    getHistoryForUser,
  }
}

export const createPaymentCoreService = createFinancialCoreService