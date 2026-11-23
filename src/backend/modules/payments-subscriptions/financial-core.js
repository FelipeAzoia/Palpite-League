import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/app-error.js'
import { createLogger } from '../../shared/logger.js'
import {
  assertPaymentsProvider,
  PaymentsProviderError,
  paymentsProviderFailureCodes,
  paymentsProviderSources,
  providerStatuses,
} from './payments-provider.js'

// SPEC-018 — núcleo financeiro de teste.
// - toda movimentação nasce pendente, numa transação com a auditoria, ANTES de qualquer chamada ao
//   provedor: se a auditoria falha, nada é gravado e o provedor não é chamado (CA-18);
// - só a pendente evolui, para confirmada ou recusada, com confirmação verificável do provedor
//   (INV-003, INV-008); a mudança de estado, o tratador do tipo e a auditoria são atômicos (INV-009);
// - a chave de operação é a referência de negócio mais o número da tentativa; nova tentativa só
//   depois de uma recusa, e nada é repetido automaticamente (INV-006, INV-007);
// - o banco impede reabrir, reescrever ou apagar movimentações finais (migração 012).

export const movementTypes = Object.freeze(['entry_fee', 'subscription', 'refund', 'payout', 'subscription_cancellation', 'subscription_renewal'])
export const operationOriginTypes = Object.freeze(['participation', 'subscription', 'refund_request', 'pool'])
export const movementStatuses = providerStatuses

export const financialActions = Object.freeze({
  created: 'financial.movement_created',
  confirmed: 'financial.movement_confirmed',
  refused: 'financial.movement_refused',
  providerFailed: 'financial.provider_failed',
  inconsistent: 'financial.provider_inconsistent',
})

// Motivos de recusa que o provedor pode informar (SPEC-024, A6).
export const refusalReasons = Object.freeze(['not_refundable', 'provider_refused'])

const stateSchema = { type: 'enum', values: movementStatuses }
const typeSchema = { type: 'enum', values: movementTypes }
const originSchema = { type: 'enum', values: paymentsProviderSources }
const stateChangeSchema = {
  movementType: typeSchema,
  amountCents: { type: 'integer' },
  previousState: stateSchema,
  newState: stateSchema,
  origin: originSchema,
  providerId: { type: 'identifier' },
}

export const financialAuditDetailSchemas = Object.freeze({
  [financialActions.created]: {
    movementType: typeSchema,
    amountCents: { type: 'integer' },
    newState: stateSchema,
    origin: originSchema,
  },
  [financialActions.confirmed]: stateChangeSchema,
  [financialActions.refused]: { ...stateChangeSchema, refusalReason: { type: 'enum', values: refusalReasons } },
  [financialActions.inconsistent]: {
    movementType: typeSchema,
    amountCents: { type: 'integer' },
    reportedAmountCents: { type: 'integer' },
    origin: originSchema,
  },
  [financialActions.providerFailed]: {
    stage: { type: 'enum', values: ['start', 'consult'] },
    reason: { type: 'enum', values: paymentsProviderFailureCodes },
    state: stateSchema,
    origin: originSchema,
  },
})

const systemActor = Object.freeze({ type: 'system' })
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const businessReferencePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/

function invalid(message) {
  return new AppError(400, 'validation_error', message)
}

function requiredText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') throw invalid(`${field} é obrigatório.`)
  return value.trim()
}

// Formata centavos inteiros como "12.34" sem passar por ponto flutuante (INV-013).
export function formatCents(amountCents) {
  const reais = Math.trunc(amountCents / 100)
  const cents = String(amountCents % 100).padStart(2, '0')
  return `${reais}.${cents}`
}

function parseContinuation(json) {
  if (!json) return null
  try { return JSON.parse(json) } catch { return null }
}

function toMovement(row) {
  return {
    id: row.id,
    operationKey: row.operation_key,
    businessReference: row.business_reference,
    attemptNumber: row.attempt_number,
    type: row.type,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    userId: row.user_id,
    origin: row.origin,
    operation: { type: row.operation_type, id: row.operation_id },
    providerId: row.provider_id,
    continuation: parseContinuation(row.continuation_json),
    originalMovementId: row.original_movement_id,
    refusalReason: row.refusal_reason ?? null,
    inconsistency: row.inconsistency ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// Item do histórico próprio (RF41): só o que a tela precisa, com a origem sempre identificada.
function toHistoryItem(row) {
  return {
    id: row.id,
    type: row.type,
    amountCents: row.amount_cents,
    amount: formatCents(row.amount_cents),
    currency: row.currency,
    status: row.status,
    origin: row.origin,
    simulated: row.origin === 'simulator',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function validateStart(input) {
  if (!input || typeof input !== 'object') throw invalid('A operação financeira é obrigatória.')
  const type = requiredText(input.type, 'type')
  if (!movementTypes.includes(type)) throw invalid('Tipo de movimentação inválido.')
  // O cancelamento da assinatura não movimenta dinheiro: é registrado com valor zero (SPEC-020).
  if (type === 'subscription_cancellation') {
    if (input.amountCents !== 0) throw invalid('O cancelamento da assinatura não tem valor.')
  } else if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw invalid('O valor deve ser informado em centavos inteiros e positivos.')
  }
  if (input.currency !== undefined && input.currency !== 'BRL') throw invalid('A moeda deve ser BRL.')
  const userId = requiredText(input.userId, 'userId')
  const operationType = requiredText(input.operation?.type, 'operation.type')
  if (!operationOriginTypes.includes(operationType)) throw invalid('Operação de origem inválida.')
  const operationId = requiredText(input.operation?.id, 'operation.id')
  const businessReference = input.businessReference === undefined
    ? `${operationType}:${operationId}`
    : requiredText(input.businessReference, 'businessReference')
  if (!businessReferencePattern.test(businessReference)) throw invalid('Referência de negócio inválida.')
  const originalMovementId = input.originalMovementId === undefined || input.originalMovementId === null
    ? null
    : requiredText(input.originalMovementId, 'originalMovementId')
  if ((type === 'refund') !== (originalMovementId !== null)) {
    throw invalid('Somente a devolução referencia, e sempre referencia, a movimentação original.')
  }
  return {
    type,
    amountCents: input.amountCents,
    userId,
    operationType,
    operationId,
    businessReference,
    originalMovementId,
  }
}

function sameRequest(row, request) {
  return row.type === request.type
    && row.amount_cents === request.amountCents
    && row.user_id === request.userId
    && row.operation_type === request.operationType
    && row.operation_id === request.operationId
    && row.original_movement_id === request.originalMovementId
}

export function createFinancialCoreService(database, {
  auditStore,
  paymentsProvider,
  logger = createLogger(),
  now = Date.now,
} = {}) {
  if (!auditStore) throw new TypeError('auditStore is required')
  const provider = assertPaymentsProvider(paymentsProvider)
  const handlers = new Map()

  const findById = (id) => database.prepare('SELECT * FROM financial_movements WHERE id = ?').get(id)
  const findByKey = (key) => database.prepare('SELECT * FROM financial_movements WHERE operation_key = ?').get(key)
  const latestAttempt = (businessReference) => database.prepare(`
    SELECT * FROM financial_movements WHERE business_reference = ?
    ORDER BY attempt_number DESC LIMIT 1
  `).get(businessReference)
  const nowIso = () => new Date(now()).toISOString()

  // Ponto de extensão das Specs 019, 022, 024 e 026 (OPEN-85). Os tratadores rodam dentro da
  // transação da mudança de estado; lançar um erro desfaz a mudança e deixa a movimentação pendente.
  function registerHandler(type, { onConfirmed, onRefused } = {}) {
    if (!movementTypes.includes(type)) throw new TypeError('unsupported movement type')
    if (typeof onConfirmed !== 'function' || typeof onRefused !== 'function') {
      throw new TypeError('onConfirmed and onRefused handlers are required')
    }
    handlers.set(type, { onConfirmed, onRefused })
  }

  function recordProviderFailure(row, stage, error) {
    const reason = error instanceof PaymentsProviderError ? error.code : 'response_error'
    logger.error('payments', `provider_${stage}_${reason}`)
    try {
      auditStore.recordOutcome({
        actor: systemActor,
        action: financialActions.providerFailed,
        object: { type: 'financial_movement', id: row.id },
        origin: row.origin,
        details: { stage, reason, state: 'pending', origin: row.origin },
      }, 'failure')
    } catch {
      // A falha da auditoria já é registrada tecnicamente pelo audit store; o estado não muda.
    }
  }

  // Cria a movimentação pendente e sua auditoria numa única transação. Devolve a existente quando a
  // última tentativa da mesma referência ainda está pendente ou já foi confirmada (A1, E3).
  // onCreate, quando informado, roda dentro dessa mesma transação com a movimentação recém-criada:
  // é onde a Spec proprietária grava o próprio registro (por exemplo, a assinatura) e sua auditoria,
  // de modo que tudo persista junto ou nada persista (SPEC-019 INV-004).
  function createOrReuse(request, onCreate, actor = { type: 'user', id: request.userId }) {
    const latest = latestAttempt(request.businessReference)
    if (latest && !sameRequest(latest, request)) {
      throw new AppError(409, 'financial_reference_conflict', 'Já existe outra operação financeira com esta referência.')
    }
    if (latest && latest.status !== 'refused') return { row: latest, created: false }

    if (request.originalMovementId !== null) {
      const original = findById(request.originalMovementId)
      if (!original || original.user_id !== request.userId) throw new AppError(404, 'not_found', 'Movimentação original não encontrada.')
      if (original.status !== 'confirmed' || original.type === 'refund') {
        throw new AppError(409, 'original_movement_not_refundable', 'Somente uma movimentação confirmada pode ser devolvida.')
      }
    }

    const id = randomUUID()
    const attemptNumber = latest ? latest.attempt_number + 1 : 1
    const operationKey = `${request.businessReference}:attempt-${attemptNumber}`
    const at = nowIso()
    auditStore.runAuditedOperation({
      actor,
      action: financialActions.created,
      object: { type: 'financial_movement', id },
      origin: provider.source,
      details: { movementType: request.type, amountCents: request.amountCents, newState: 'pending', origin: provider.source },
    }, () => {
      database.prepare(`
        INSERT INTO financial_movements (
          id, operation_key, business_reference, attempt_number, type, amount_cents, currency, status,
          user_id, origin, operation_type, operation_id, original_movement_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'BRL', 'pending', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, operationKey, request.businessReference, attemptNumber, request.type, request.amountCents,
        request.userId, provider.source, request.operationType, request.operationId, request.originalMovementId,
        at, at,
      )
      if (onCreate) {
        const outcome = onCreate(toMovement(findById(id)), { database })
        if (typeof outcome?.then === 'function') throw new TypeError('onCreate must be synchronous')
      }
    })
    return { row: findById(id), created: true }
  }

  // Operações da porta por tipo: as Specs proprietárias estendem a porta genérica (OPEN-85). A
  // assinatura usa startSubscription/consultSubscription quando o adaptador as oferece (SPEC-019); o
  // cancelamento exige as operações próprias e nunca cai na operação genérica, que seria uma cobrança
  // (SPEC-020, INV-008).
  const typeOperations = Object.freeze({
    // A devolução usa a transação original e nunca cai na operação genérica, que seria uma cobrança
    // (SPEC-024, INV-003); sem as operações próprias, a devolução fica pendente.
    refund: { start: 'startRefund', consult: 'consultRefund', required: true },
    // O repasse da premiação também nunca cai na operação genérica (SPEC-026); sem as operações
    // próprias no adaptador, ele fica pendente.
    payout: { start: 'startPayout', consult: 'consultPayout', required: true },
    subscription: { start: 'startSubscription', consult: 'consultSubscription', required: false },
    subscription_cancellation: { start: 'startSubscriptionCancellation', consult: 'consultSubscriptionCancellation', required: true },
    // A renovação é cobrada pelo provedor (SPEC-029); sem as operações próprias não há cobrança.
    subscription_renewal: { start: 'startSubscriptionRenewal', consult: 'consultSubscriptionRenewal', required: true },
  })

  function unsupportedOperation() {
    throw new PaymentsProviderError('response_error')
  }

  function operationFor(type, kind) {
    const operations = typeOperations[type]
    const specific = operations ? provider[operations[kind]] : undefined
    if (typeof specific === 'function') return specific
    if (operations?.required) return unsupportedOperation
    return kind === 'start' ? provider.startOperation : provider.consultOperation
  }

  // Inicia a operação no provedor depois da transação. Uma falha deixa a movimentação pendente,
  // sem repetição automática; a conferência seguinte consulta o estado pela chave (E1, CA-07).
  // Os dados do pagador e o contexto vão só para o provedor: não são gravados nem auditados (INV-011).
  // Com refuseWhenUnavailable, a falha no início encerra a tentativa como recusada, sem cobrança no
  // provedor (SPEC-022, OPEN-111): o titular pode tentar de novo, e nada é repetido automaticamente.
  async function startAtProvider(row, { payer, providerContext, refuseWhenUnavailable = false } = {}) {
    let result
    try {
      result = await operationFor(row.type, 'start').call(provider, {
        operationKey: row.operation_key,
        type: row.type,
        amountCents: row.amount_cents,
        currency: row.currency,
        userId: row.user_id,
        ...(row.original_movement_id ? { original: originalReference(row.original_movement_id) } : {}),
        ...(payer ? { payer } : {}),
        ...(providerContext ? { context: providerContext } : {}),
      })
      if (!result || typeof result.providerId !== 'string' || !identifierPattern.test(result.providerId)
        || (result.continuation != null && (typeof result.continuation !== 'object' || Array.isArray(result.continuation)))) {
        throw new PaymentsProviderError('invalid_response')
      }
    } catch (error) {
      recordProviderFailure(row, 'start', error)
      if (refuseWhenUnavailable) {
        try {
          const current = findById(row.id)
          if (current.status === 'pending' && current.provider_id === null) changeState(current, 'refused', null)
        } catch {
          // A recusa é refeita pela conferência seguinte, que consulta o provedor pela chave.
          logger.error('payments', 'state_change_failed')
        }
      }
      return findById(row.id)
    }

    try {
      database.prepare(`
        UPDATE financial_movements SET provider_id = ?, continuation_json = ?, updated_at = ?
        WHERE id = ? AND status = 'pending' AND provider_id IS NULL
      `).run(result.providerId, result.continuation ? JSON.stringify(result.continuation) : null, nowIso(), row.id)
    } catch {
      logger.error('payments', 'provider_reference_not_persisted')
    }
    return findById(row.id)
  }

  // Referência da transação original no provedor, enviada na devolução (SPEC-024, INV-003).
  function originalReference(movementId) {
    const original = findById(movementId)
    return { operationKey: original.operation_key, providerId: original.provider_id }
  }

  async function startMovement(input, { onCreate, payer, providerContext, refuseWhenUnavailable, actor } = {}) {
    if (onCreate !== undefined && typeof onCreate !== 'function') throw new TypeError('onCreate must be a function')
    const request = validateStart(input)
    const { row, created } = createOrReuse(request, onCreate, actor)
    if (created) {
      const started = await startAtProvider(row, { payer, providerContext, refuseWhenUnavailable })
      return { movement: toMovement(started), created: true }
    }
    // Repetição de uma operação ainda pendente: consulta o estado antes de qualquer outra coisa,
    // nunca inicia uma nova cobrança (E1, E3).
    if (row.status === 'pending') {
      const { movement } = await checkMovement(row.id)
      return { movement, created: false }
    }
    return { movement: toMovement(row), created: false }
  }

  function changeState(row, newState, providerId, refusalReason = null) {
    const handler = handlers.get(row.type)
    const movement = toMovement(row)
    const auditEntry = {
      actor: systemActor,
      action: newState === 'confirmed' ? financialActions.confirmed : financialActions.refused,
      object: { type: 'financial_movement', id: row.id },
      origin: row.origin,
      details: {
        movementType: row.type,
        amountCents: row.amount_cents,
        previousState: 'pending',
        newState,
        origin: row.origin,
        ...(providerId ? { providerId } : {}),
        ...(newState === 'refused' && refusalReason ? { refusalReason } : {}),
      },
    }

    function apply() {
      if (handler) {
        const outcome = newState === 'confirmed'
          ? handler.onConfirmed(movement, { database })
          : handler.onRefused({ ...movement, refusalReason }, { database })
        if (typeof outcome?.then === 'function') throw new TypeError('financial handlers must be synchronous')
      }
      const changed = database.prepare(`
        UPDATE financial_movements SET status = ?, provider_id = COALESCE(provider_id, ?), refusal_reason = ?, updated_at = ?
        WHERE id = ? AND status = 'pending'
      `).run(newState, providerId ?? null, newState === 'refused' ? refusalReason : null, nowIso(), row.id)
      if (changed.changes !== 1) throw new Error('financial movement is no longer pending')
    }

    if (newState === 'confirmed') {
      auditStore.runAuditedOperation(auditEntry, apply)
    } else {
      // A recusa é auditada com resultado falha (CA-03), na mesma transação da mudança.
      database.transaction(() => {
        apply()
        auditStore.recordOutcome(auditEntry, 'failure')
      })()
    }
  }

  // Consulta o provedor sobre uma movimentação e aplica a resposta (conferência periódica ou volta
  // do checkout). Repetir a conferência de uma movimentação final não tem efeito (INV-006).
  async function checkMovement(reference) {
    const lookup = requiredText(reference, 'reference')
    const row = findById(lookup) ?? findByKey(lookup)
    if (!row) throw new AppError(404, 'not_found', 'Movimentação financeira não encontrada.')
    if (row.status !== 'pending') return { movement: toMovement(row), applied: false }
    // Um provedor nunca confirma movimentações de outra origem (INV-005).
    if (row.origin !== provider.source) {
      logger.warn('payments', 'origin_mismatch')
      return { movement: toMovement(row), applied: false }
    }

    let status
    let providerId
    let refusalReason = null
    let reportedAmount = null
    try {
      const result = await operationFor(row.type, 'consult').call(provider, { operationKey: row.operation_key, providerId: row.provider_id })
      status = result?.status
      providerId = result?.providerId ?? row.provider_id ?? null
      if (result?.refusalReason !== undefined && result?.refusalReason !== null) {
        if (!refusalReasons.includes(result.refusalReason)) throw new PaymentsProviderError('invalid_response')
        refusalReason = result.refusalReason
      }
      if (result?.amountCents !== undefined && result?.amountCents !== null) {
        if (!Number.isSafeInteger(result.amountCents)) throw new PaymentsProviderError('invalid_response')
        reportedAmount = result.amountCents
      }
      if (!movementStatuses.includes(status) || (providerId !== null && (typeof providerId !== 'string' || !identifierPattern.test(providerId)))) {
        throw new PaymentsProviderError('invalid_response')
      }
    } catch (error) {
      recordProviderFailure(row, 'consult', error)
      return { movement: toMovement(findById(row.id)), applied: false }
    }

    if (status === 'pending') return { movement: toMovement(findById(row.id)), applied: false }

    // Valor informado diferente do registrado: a confirmação não é aplicada; a movimentação fica
    // pendente e sinalizada como inconsistente (SPEC-024, A7). A sinalização é auditada uma vez.
    if (status === 'confirmed' && reportedAmount !== null && reportedAmount !== row.amount_cents) {
      logger.warn('payments', 'provider_amount_mismatch')
      if (row.inconsistency !== 'amount_mismatch') {
        try {
          database.transaction(() => {
            database.prepare(`
              UPDATE financial_movements SET inconsistency = 'amount_mismatch', updated_at = ?
              WHERE id = ? AND status = 'pending'
            `).run(nowIso(), row.id)
            auditStore.recordOutcome({
              actor: systemActor,
              action: financialActions.inconsistent,
              object: { type: 'financial_movement', id: row.id },
              origin: row.origin,
              details: { movementType: row.type, amountCents: row.amount_cents, reportedAmountCents: reportedAmount, origin: row.origin },
            }, 'failure')
          })()
        } catch {
          logger.error('payments', 'inconsistency_not_recorded')
        }
      }
      return { movement: toMovement(findById(row.id)), applied: false }
    }

    // Sem await daqui em diante: a releitura e a mudança acontecem sem outra conferência no meio.
    const current = findById(row.id)
    if (current.status !== 'pending') return { movement: toMovement(current), applied: false }
    try {
      changeState(current, status, providerId, status === 'refused' ? refusalReason : null)
    } catch {
      // Falha do tratador ou da auditoria: tudo é desfeito e a próxima conferência tenta de novo (E2).
      logger.error('payments', 'state_change_failed')
      return { movement: toMovement(findById(row.id)), applied: false }
    }
    return { movement: toMovement(findById(row.id)), applied: true }
  }

  async function runReconciliation() {
    const ids = database.prepare(`
      SELECT id FROM financial_movements WHERE status = 'pending' ORDER BY created_at ASC, rowid ASC
    `).all().map(({ id }) => id)
    let applied = 0
    for (const id of ids) {
      try {
        if ((await checkMovement(id)).applied) applied += 1
      } catch {
        logger.error('payments', 'reconciliation_item_failed')
      }
    }
    return { checked: ids.length, applied, pending: ids.length - applied }
  }

  // Tarefa de conferência das pendentes (a cada 5 minutos e logo após a inicialização). Uma execução
  // em andamento é reaproveitada, nunca sobreposta (INV-014).
  let reconciliation = null
  function reconcilePending() {
    reconciliation ??= runReconciliation().finally(() => { reconciliation = null })
    return reconciliation
  }

  // Histórico financeiro próprio (RF41), da mais recente para a mais antiga (INV-012).
  function getHistory(userId) {
    return database.prepare(`
      SELECT * FROM financial_movements WHERE user_id = ?
      ORDER BY created_at DESC, rowid DESC
    `).all(requiredText(userId, 'userId')).map(toHistoryItem)
  }

  return { startMovement, checkMovement, reconcilePending, registerHandler, getHistory }
}
