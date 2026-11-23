import { AppError } from '../../shared/app-error.js'
import { createLogger } from '../../shared/logger.js'
import { createPoolAccess } from '../pools-participations/pool-access.js'
import { refundProcessingState } from '../pools-participations/refund-requests.js'
import { formatCents, refusalReasons } from './financial-core.js'

// SPEC-024 — processamento da devolução no provedor de teste.
// - a aprovação da SPEC-023 é a ordem de início: a tarefa agendada processa só pedidos aprovados
//   sem nenhuma tentativa; depois disso, só a conferência de pendentes age (OPEN-126, INV-007);
// - a devolução é uma nova movimentação, na transação original, com o valor aprovado (INV-002 a 004);
// - pendente até confirmação verificável: indisponibilidade ou resposta ambígua nunca viram recusa
//   nem conclusão (INV-005); nova tentativa só pela administração, depois de uma recusa (INV-006).

export const refundProcessingActions = Object.freeze({
  started: 'refund.processing_started',
  completed: 'refund.completed',
  refused: 'refund.refused',
  retried: 'refund.retried',
  listed: 'refund.processing_listed',
})

export const refundProcessingAuditDetailSchemas = Object.freeze({
  [refundProcessingActions.started]: { amountCents: { type: 'integer' }, attemptNumber: { type: 'integer' } },
  [refundProcessingActions.completed]: { amountCents: { type: 'integer' }, attemptNumber: { type: 'integer' } },
  [refundProcessingActions.refused]: {
    amountCents: { type: 'integer' }, attemptNumber: { type: 'integer' }, refusalReason: { type: 'enum', values: refusalReasons },
  },
  [refundProcessingActions.retried]: { amountCents: { type: 'integer' }, attemptNumber: { type: 'integer' } },
})

const systemActor = Object.freeze({ type: 'system' })

const conflictMessages = {
  refund_not_started: 'A devolução ainda não foi enviada ao provedor; ela começa automaticamente em instantes.',
  refund_in_progress: 'A devolução está em processamento. Aguarde o resultado antes de tentar de novo.',
  refund_completed: 'A devolução já foi concluída.',
  refund_not_approved: 'Só pedidos aprovados têm devolução para processar.',
}

function conflict(type) {
  return new AppError(409, type, conflictMessages[type])
}

export function createRefundProcessingService(database, {
  auditStore,
  financialCore,
  logger = createLogger(),
} = {}) {
  if (!auditStore || !financialCore) throw new TypeError('auditStore and financialCore are required')
  const access = createPoolAccess(database, auditStore)

  const latestRefund = (requestId) => database.prepare(`
    SELECT * FROM financial_movements
    WHERE type = 'refund' AND operation_type = 'refund_request' AND operation_id = ?
    ORDER BY attempt_number DESC LIMIT 1
  `).get(requestId)

  // Tratadores do núcleo: a mudança de estado da movimentação e a auditoria da devolução são
  // atômicas (INV-009). O estado exibido do pedido é derivado da movimentação.
  financialCore.registerHandler('refund', {
    onConfirmed(movement) {
      auditStore.runAuditedOperation({
        actor: systemActor,
        action: refundProcessingActions.completed,
        object: { type: 'refund_request', id: movement.operation.id },
        origin: movement.origin,
        details: { amountCents: movement.amountCents, attemptNumber: movement.attemptNumber },
      }, () => {})
    },
    onRefused(movement) {
      auditStore.recordOutcome({
        actor: systemActor,
        action: refundProcessingActions.refused,
        object: { type: 'refund_request', id: movement.operation.id },
        origin: movement.origin,
        details: {
          amountCents: movement.amountCents,
          attemptNumber: movement.attemptNumber,
          refusalReason: movement.refusalReason ?? 'provider_refused',
        },
      }, 'failure')
    },
  })

  // Pré-condições internas (A8): pedido aprovado, origem confirmada do próprio solicitante, sem
  // devolução ativa da mesma origem e valor nunca maior que o pago. Devolve o motivo ou null.
  function precondition(request) {
    if (request.status !== 'approved') return 'not_approved'
    const source = database.prepare('SELECT * FROM financial_movements WHERE id = ?').get(request.source_movement_id)
    if (!source || source.status !== 'confirmed' || source.type !== 'entry_fee' || source.user_id !== request.user_id) return 'source_not_confirmed'
    if (request.amount_cents > source.amount_cents) return 'amount_exceeds_source'
    const active = database.prepare(`
      SELECT 1 FROM financial_movements
      WHERE type = 'refund' AND original_movement_id = ? AND status IN ('pending', 'confirmed')
    `).get(source.id)
    if (active) return 'active_refund_exists'
    return null
  }

  async function startRefund(request, { actor, auditAction }) {
    const { movement } = await financialCore.startMovement({
      type: 'refund',
      amountCents: request.amount_cents,
      userId: request.user_id,
      operation: { type: 'refund_request', id: request.id },
      originalMovementId: request.source_movement_id,
    }, {
      actor,
      onCreate: (created) => {
        auditStore.runAuditedOperation({
          actor,
          action: auditAction,
          object: { type: 'refund_request', id: request.id },
          origin: created.origin,
          details: { amountCents: created.amountCents, attemptNumber: created.attemptNumber },
        }, () => {})
      },
    })
    // Retorno imediato do provedor: se ele já tem o resultado, a conferência o aplica agora; senão,
    // a devolução segue pendente para a conferência periódica.
    if (movement.status === 'pending' && movement.providerId) await financialCore.checkMovement(movement.id)
    return movement
  }

  // Tarefa agendada (OPEN-126): só pedidos aprovados sem nenhuma tentativa, em bolão ativo ou
  // encerrado. Nunca cria nova tentativa depois de uma recusa (INV-007).
  async function processApproved() {
    const pending = database.prepare(`
      SELECT r.* FROM refund_requests r
      WHERE r.status = 'approved'
        AND NOT EXISTS (
          SELECT 1 FROM financial_movements m
          WHERE m.type = 'refund' AND m.operation_type = 'refund_request' AND m.operation_id = r.id
        )
      ORDER BY r.decided_at, r.id
    `).all()
    let started = 0
    let skipped = 0
    for (const request of pending) {
      const reason = precondition(request)
      if (reason) {
        // Nada é enviado; o caso fica no log técnico (A8).
        logger.error('refund-processing', `precondition_failed_${reason}`)
        skipped += 1
        continue
      }
      try {
        await startRefund(request, { actor: systemActor, auditAction: refundProcessingActions.started })
        started += 1
      } catch {
        logger.error('refund-processing', 'start_failed')
      }
    }
    return { found: pending.length, started, skipped }
  }

  function poolRequest(context, requestId) {
    const request = typeof requestId === 'string' && requestId.length <= 100
      ? database.prepare('SELECT * FROM refund_requests WHERE id = ? AND pool_id = ?').get(requestId, context.poolId)
      : undefined
    if (!request) throw new AppError(404, 'not_found', 'O pedido de devolução não foi encontrado neste bolão.')
    return request
  }

  // Nova tentativa pela administração (A4, OPEN-129): só depois de uma recusa; antes, o estado da
  // tentativa anterior é consultado.
  async function retry(userId, poolId, requestId) {
    const context = access.requireManager(userId, poolId, refundProcessingActions.retried)
    const request = poolRequest(context, requestId)
    if (request.status !== 'approved') throw conflict('refund_not_approved')
    let latest = latestRefund(request.id)
    if (!latest) throw conflict('refund_not_started')
    if (latest.status === 'pending') {
      await financialCore.checkMovement(latest.id)
      latest = latestRefund(request.id)
    }
    if (latest.status === 'pending') throw conflict('refund_in_progress')
    if (latest.status === 'confirmed') throw conflict('refund_completed')
    const reason = precondition(request)
    if (reason) {
      logger.error('refund-processing', `precondition_failed_${reason}`)
      throw conflict('refund_in_progress')
    }
    await startRefund(request, { actor: { type: 'user', id: userId }, auditAction: refundProcessingActions.retried })
    return { refund: view(database.prepare('SELECT r.*, u.name FROM refund_requests r JOIN users u ON u.id = r.user_id WHERE r.id = ?').get(request.id)) }
  }

  function view(row) {
    const processing = refundProcessingState(database, row.id)
    return {
      id: row.id,
      requesterName: row.name,
      amountCents: row.amount_cents,
      amount: formatCents(row.amount_cents),
      decidedAt: row.decided_at,
      state: processing.state,
      attempts: processing.attempts,
      simulated: processing.simulated,
      refusalReason: processing.refusalReason,
      inconsistent: processing.inconsistent,
      updatedAt: processing.updatedAt,
      canRetry: processing.state === 'refused',
    }
  }

  // Devoluções aprovadas do bolão para a administração, sem dados do provedor (OPEN-131).
  function listApproved(userId, poolId) {
    const context = access.requireManager(userId, poolId, refundProcessingActions.listed)
    const rows = database.prepare(`
      SELECT r.*, u.name FROM refund_requests r JOIN users u ON u.id = r.user_id
      WHERE r.pool_id = ? AND r.status = 'approved'
      ORDER BY r.decided_at DESC, r.id
    `).all(context.poolId)
    return { refunds: rows.map(view) }
  }

  return { processApproved, retry, listApproved }
}
