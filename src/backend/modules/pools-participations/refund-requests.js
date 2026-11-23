import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/app-error.js'
import { createPoolAccess, poolEnded, poolNotFound } from './pool-access.js'

// SPEC-023 — solicitação e decisão administrativa de devolução.
// - só quem saiu do bolão e tem taxa de entrada confirmada pede; o valor é o da movimentação
//   confirmada, calculado no backend (INV-002, INV-005);
// - um pedido por participação; a decisão é única e final (INV-006, INV-007);
// - decide administrador ou coadministrador do bolão, nunca o solicitante (INV-004);
// - esta Spec termina na autorização registrada: nenhuma movimentação de devolução é criada aqui, e
//   "aprovada" é sempre apresentada como aguardando processamento (INV-009, SPEC-024).

export const refundActions = Object.freeze({
  requested: 'refund.requested',
  approved: 'refund.approved',
  rejected: 'refund.rejected',
  listed: 'refund.requests_listed',
})

export const refundAuditDetailSchemas = Object.freeze({
  [refundActions.requested]: { amountCents: { type: 'integer' } },
  [refundActions.approved]: { amountCents: { type: 'integer' } },
  [refundActions.rejected]: { amountCents: { type: 'integer' } },
})

const ineligibleMessages = {
  participation_not_left: 'A devolução só pode ser pedida depois de sair do bolão.',
  entry_fee_not_paid: 'Não há taxa de entrada confirmada para devolver nesta participação.',
  already_refunded: 'A taxa desta participação já foi devolvida ou está em devolução.',
  pool_ended: 'Este bolão está encerrado e não aceita pedidos de devolução.',
  refund_already_requested: 'Já existe um pedido de devolução para esta participação.',
}

function formatCents(cents) {
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

function conflict(type) {
  return new AppError(409, type, ineligibleMessages[type])
}

function requestNotFound() {
  return new AppError(404, 'not_found', 'O pedido de devolução não foi encontrado neste bolão.')
}

function alreadyDecided() {
  return new AppError(409, 'refund_already_decided', 'Este pedido de devolução já foi decidido.')
}

// Situação apresentada ao solicitante: aprovada aguarda processamento até a SPEC-024 (OPEN-121).
function displayStatus(status) {
  return status === 'approved' ? 'awaiting_processing' : status
}

export function createRefundRequestsService(database, { auditStore, now = Date.now }) {
  const access = createPoolAccess(database, auditStore)
  const nowIso = () => new Date(now()).toISOString()

  // Participação própria em qualquer status; quem nunca participou recebe o 404 de bolão
  // inexistente, sem revelar nada (E1, CA-14).
  function ownParticipation(userId, poolId) {
    const row = typeof poolId === 'string' && poolId.length <= 100
      ? database.prepare(`
        SELECT part.id, part.status, p.id AS pool_id, p.name AS pool_name, p.status AS pool_status
        FROM pool_participations part JOIN pools p ON p.id = part.pool_id
        WHERE part.pool_id = ? AND part.user_id = ?
      `).get(poolId, userId)
      : undefined
    if (!row) throw poolNotFound()
    return row
  }

  // Movimentação de origem: a taxa de entrada confirmada da participação. Pagamento tardio
  // sinalizado pela SPEC-022 tem tratamento próprio e não entra aqui (OPEN-122).
  const sourceMovement = (participationId) => database.prepare(`
    SELECT m.id, m.amount_cents FROM financial_movements m
    WHERE m.type = 'entry_fee' AND m.operation_type = 'participation' AND m.operation_id = ?
      AND m.status = 'confirmed'
      AND NOT EXISTS (SELECT 1 FROM entry_fee_late_payments lp WHERE lp.movement_id = m.id)
    ORDER BY m.attempt_number DESC LIMIT 1
  `).get(participationId)

  const refundOf = (movementId) => database.prepare(`
    SELECT id FROM financial_movements WHERE type = 'refund' AND original_movement_id = ? AND status <> 'refused'
  `).get(movementId)

  const requestOf = (participationId) => database.prepare('SELECT * FROM refund_requests WHERE participation_id = ?').get(participationId)

  // Motivo de inelegibilidade, ou null (A3, CA-04, CA-17).
  function ineligibility(row, movement, existing) {
    if (existing) return 'refund_already_requested'
    if (row.status !== 'left') return 'participation_not_left'
    if (!movement) return 'entry_fee_not_paid'
    if (refundOf(movement.id)) return 'already_refunded'
    if (row.pool_status !== 'active') return 'pool_ended'
    return null
  }

  function requestView(request) {
    if (!request) return null
    return {
      id: request.id,
      status: request.status,
      displayStatus: displayStatus(request.status),
      amountCents: request.amount_cents,
      amount: formatCents(request.amount_cents),
      currency: request.currency,
      requestedAt: request.requested_at,
      decidedAt: request.decided_at,
    }
  }

  function ownView(row) {
    const movement = sourceMovement(row.id)
    const existing = requestOf(row.id)
    const reason = ineligibility(row, movement, existing)
    return {
      pool: { id: row.pool_id, name: row.pool_name, status: row.pool_status },
      eligibleAmountCents: existing?.amount_cents ?? movement?.amount_cents ?? null,
      canRequest: reason === null,
      reason,
      request: requestView(existing),
    }
  }

  function getOwnRequest(userId, poolId) {
    return ownView(ownParticipation(userId, poolId))
  }

  // Devoluções do próprio usuário: participações que saiu com taxa confirmada, com ou sem pedido.
  function listOwn(userId) {
    const rows = database.prepare(`
      SELECT part.id, part.status, p.id AS pool_id, p.name AS pool_name, p.status AS pool_status
      FROM pool_participations part JOIN pools p ON p.id = part.pool_id
      WHERE part.user_id = ? AND part.status = 'left'
      ORDER BY p.created_at DESC, p.id
    `).all(userId)
    return { refunds: rows.map(ownView).filter((item) => item.request || item.eligibleAmountCents !== null) }
  }

  function validateEmpty(body) {
    const input = body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {}
    const fields = Object.fromEntries(Object.keys(input)
      .map((key) => [key, 'O valor e as condições da devolução são definidos pelo sistema.']))
    if (Object.keys(fields).length > 0) throw new AppError(400, 'validation_error', 'Confira os campos informados.', fields)
  }

  function requestRefund(userId, poolId, body) {
    validateEmpty(body)
    const row = ownParticipation(userId, poolId)
    const movement = sourceMovement(row.id)
    const reason = ineligibility(row, movement, requestOf(row.id))
    if (reason) throw conflict(reason)

    const id = randomUUID()
    try {
      auditStore.runAuditedOperation({
        actor: { type: 'user', id: userId },
        action: refundActions.requested,
        object: { type: 'refund_request', id },
        details: { amountCents: movement.amount_cents },
      }, () => {
        // Revalida na transação: a restrição única impede um segundo pedido simultâneo (CT-05).
        const current = database.prepare(`
          SELECT part.status, p.status AS pool_status FROM pool_participations part
          JOIN pools p ON p.id = part.pool_id WHERE part.id = ?
        `).get(row.id)
        const fresh = ineligibility({ ...row, ...current }, sourceMovement(row.id), requestOf(row.id))
        if (fresh) throw conflict(fresh)
        database.prepare(`
          INSERT INTO refund_requests (
            id, participation_id, pool_id, user_id, source_movement_id, amount_cents, currency, status, requested_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'BRL', 'pending', ?)
        `).run(id, row.id, row.pool_id, userId, movement.id, movement.amount_cents, nowIso())
      })
    } catch (error) {
      if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') throw conflict('refund_already_requested')
      throw error
    }
    return ownView(ownParticipation(userId, poolId))
  }

  // Pedidos pendentes do bolão para a administração: solicitante, valor e instante (OPEN-123).
  function listPending(userId, poolId) {
    const { poolId: id } = access.requireManager(userId, poolId, refundActions.listed)
    const rows = database.prepare(`
      SELECT r.id, r.amount_cents, r.requested_at, u.name
      FROM refund_requests r JOIN users u ON u.id = r.user_id
      WHERE r.pool_id = ? AND r.status = 'pending'
      ORDER BY r.requested_at, r.id
    `).all(id)
    return {
      requests: rows.map((row) => ({
        id: row.id,
        requesterName: row.name,
        amountCents: row.amount_cents,
        amount: formatCents(row.amount_cents),
        requestedAt: row.requested_at,
      })),
    }
  }

  function decide(userId, poolId, requestId, decision) {
    const action = decision === 'approved' ? refundActions.approved : refundActions.rejected
    const context = access.requireManager(userId, poolId, action)
    const request = typeof requestId === 'string' && requestId.length <= 100
      ? database.prepare('SELECT * FROM refund_requests WHERE id = ? AND pool_id = ?').get(requestId, context.poolId)
      : undefined
    if (!request) throw requestNotFound()
    // Conflito de interesse (E3, CA-10): por segurança, mesmo que o solicitante já não seja membro.
    if (request.user_id === userId) {
      auditStore.recordOutcome({ actor: { type: 'user', id: userId }, action, object: { type: 'refund_request', id: request.id } }, 'denied')
      throw new AppError(403, 'forbidden', 'Você não pode decidir o próprio pedido de devolução.')
    }
    if (context.poolStatus !== 'active') throw poolEnded('Este bolão está encerrado e não aceita decisões de devolução.')
    if (request.status !== 'pending') throw alreadyDecided()

    const decidedAt = nowIso()
    auditStore.runAuditedOperation({
      actor: { type: 'user', id: userId },
      action,
      object: { type: 'refund_request', id: request.id },
      details: { amountCents: request.amount_cents },
    }, () => {
      // Revalida decisor e bolão na transação; a atualização condicional garante uma única decisão.
      const membership = access.readMembership(userId, context.poolId)
      if (!membership || !['approved_awaiting_payment', 'confirmed'].includes(membership.participation_status)
        || !['administrator', 'coadministrator'].includes(membership.role)) {
        throw new AppError(403, 'forbidden', 'Você não tem permissão para esta operação neste bolão.')
      }
      if (membership.pool_status !== 'active') throw poolEnded('Este bolão está encerrado e não aceita decisões de devolução.')
      const updated = database.prepare(`
        UPDATE refund_requests SET status = ?, decided_by = ?, decided_at = ?
        WHERE id = ? AND status = 'pending'
      `).run(decision, userId, decidedAt, request.id)
      if (updated.changes !== 1) throw alreadyDecided()
    })
    const decided = database.prepare('SELECT * FROM refund_requests WHERE id = ?').get(request.id)
    return { request: { ...requestView(decided), decidedBy: userId } }
  }

  return {
    getOwnRequest,
    listOwn,
    requestRefund,
    listPending,
    approve: (userId, poolId, requestId) => decide(userId, poolId, requestId, 'approved'),
    reject: (userId, poolId, requestId) => decide(userId, poolId, requestId, 'rejected'),
  }
}
