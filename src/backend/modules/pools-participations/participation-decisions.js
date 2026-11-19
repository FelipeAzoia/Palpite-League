import { AppError } from '../../shared/app-error.js'
import { createPoolAccess, poolEnded } from './pool-access.js'
import { closedOpportunities } from './participation-requests.js'

// SPEC-010 — decisão administrativa de entrada e confirmação sem taxa.

const approvedAction = 'participation.approved'
const rejectedAction = 'participation.rejected'
const listedAction = 'participation.requests_listed'

export const decisionAuditDetailSchemas = Object.freeze({
  [approvedAction]: {
    outcome: { type: 'enum', values: ['confirmed', 'awaiting_payment'] },
    lateEntry: { type: 'boolean' },
  },
})

function requestNotFound() {
  return new AppError(404, 'not_found', 'A solicitação não foi encontrada neste bolão.')
}

function alreadyDecided() {
  return new AppError(409, 'request_already_decided', 'Esta solicitação já foi decidida.')
}

function notConfirmable() {
  return new AppError(409, 'participation_not_confirmable', 'Esta participação não pode ser confirmada.')
}

const decisionPoolEnded = () => poolEnded('Este bolão está encerrado e não aceita decisões de entrada.')

export function createParticipationDecisionsService(database, { auditStore, pools, now = Date.now }) {
  const access = createPoolAccess(database, auditStore)

  function isLateEntryAt(poolId, atMs) {
    const { pool } = pools.getInviteeRules(poolId)
    return closedOpportunities(pool.matches, atMs).length > 0
  }

  function findRequest(poolId, participationId) {
    if (typeof participationId !== 'string' || participationId.length > 100) return undefined
    return database.prepare('SELECT id, status FROM pool_participations WHERE id = ? AND pool_id = ?').get(participationId, poolId)
  }

  // Operação interna única, atômica e idempotente de confirmação (INV-012, OPEN-69).
  // Reutilizada pela SPEC-022 quando o pagamento for confirmado.
  function confirmParticipation(participationId, { at = now() } = {}) {
    return database.transaction(() => {
      const row = database.prepare(`
        SELECT id, pool_id, status, joined_at, late_entry FROM pool_participations WHERE id = ?
      `).get(participationId)
      if (!row) throw notConfirmable()
      if (row.status === 'confirmed') {
        return { id: row.id, status: 'confirmed', joinedAt: row.joined_at, lateEntry: row.late_entry === 1, changed: false }
      }
      if (!['requested', 'approved_awaiting_payment'].includes(row.status)) throw notConfirmable()

      const joinedAt = new Date(at).toISOString()
      // Entrada tardia: existe partida selecionada, não cancelada, que começou antes da confirmação (INV-005).
      const lateEntry = isLateEntryAt(row.pool_id, at)
      const updated = database.prepare(`
        UPDATE pool_participations
        SET status = 'confirmed', joined_at = ?, late_entry = ?, payment_confirmed = 1
        WHERE id = ? AND status = ?
      `).run(joinedAt, lateEntry ? 1 : 0, row.id, row.status)
      if (updated.changes !== 1) throw notConfirmable()
      return { id: row.id, status: 'confirmed', joinedAt, lateEntry, changed: true }
    })()
  }

  function listPendingRequests(userId, poolId) {
    const { poolId: id } = access.requireManager(userId, poolId, listedAction)
    const lateEntry = isLateEntryAt(id, now())
    const rows = database.prepare(`
      SELECT part.id, u.name, part.rules_accepted_at
      FROM pool_participations part JOIN users u ON u.id = part.user_id
      WHERE part.pool_id = ? AND part.status = 'requested'
      ORDER BY part.rules_accepted_at, part.id
    `).all(id)
    // Somente nome, data e hora da solicitação e a indicação de entrada tardia; nunca e-mail (INV-009).
    return {
      requests: rows.map((row) => ({ id: row.id, name: row.name, requestedAt: row.rules_accepted_at, lateEntry })),
    }
  }

  function prepareDecision(userId, poolId, participationId, action) {
    const context = access.requireManager(userId, poolId, action)
    const request = findRequest(context.poolId, participationId)
    if (!request) throw requestNotFound()
    if (context.poolStatus !== 'active') throw decisionPoolEnded()
    if (request.status !== 'requested') throw alreadyDecided()
    return { ...context, participationId: request.id }
  }

  // Revalida, dentro da transação, o decisor, o status solicitada e o bolão ativo (passo 2 do fluxo).
  function revalidate(userId, poolId, participationId) {
    const membership = access.readMembership(userId, poolId)
    if (!membership || !['approved_awaiting_payment', 'confirmed'].includes(membership.participation_status)
      || !['administrator', 'coadministrator'].includes(membership.role)) {
      throw new AppError(403, 'forbidden', 'Você não tem permissão para esta operação neste bolão.')
    }
    if (membership.pool_status !== 'active') throw decisionPoolEnded()
    const current = findRequest(poolId, participationId)
    if (current?.status !== 'requested') throw alreadyDecided()
    return membership
  }

  function approve(userId, poolId, participationId) {
    const context = prepareDecision(userId, poolId, participationId, approvedAction)
    const decidedAt = now()
    const hasFee = context.entryFeeCents > 0
    const lateEntry = hasFee ? false : isLateEntryAt(context.poolId, decidedAt)

    let result
    auditStore.runAuditedOperation({
      actor: { type: 'user', id: userId },
      action: approvedAction,
      object: { type: 'participation', id: context.participationId },
      details: { outcome: hasFee ? 'awaiting_payment' : 'confirmed', lateEntry },
    }, () => {
      revalidate(userId, context.poolId, context.participationId)
      if (hasFee) {
        // Com taxa: aprovada aguardando pagamento, sem data de entrada (INV-004).
        const updated = database.prepare(`
          UPDATE pool_participations SET status = 'approved_awaiting_payment', payment_confirmed = 0
          WHERE id = ? AND status = 'requested'
        `).run(context.participationId)
        if (updated.changes !== 1) throw alreadyDecided()
        result = { id: context.participationId, status: 'approved_awaiting_payment', paymentConfirmed: false }
      } else {
        // Sem taxa: confirmada na mesma transação (INV-003).
        const confirmed = confirmParticipation(context.participationId, { at: decidedAt })
        result = {
          id: confirmed.id,
          status: 'confirmed',
          paymentConfirmed: true,
          joinedAt: confirmed.joinedAt,
          lateEntry: confirmed.lateEntry,
        }
      }
    })
    return { participation: result }
  }

  function reject(userId, poolId, participationId) {
    const context = prepareDecision(userId, poolId, participationId, rejectedAction)
    auditStore.runAuditedOperation({
      actor: { type: 'user', id: userId },
      action: rejectedAction,
      object: { type: 'participation', id: context.participationId },
    }, () => {
      revalidate(userId, context.poolId, context.participationId)
      const updated = database.prepare(`
        UPDATE pool_participations SET status = 'rejected' WHERE id = ? AND status = 'requested'
      `).run(context.participationId)
      if (updated.changes !== 1) throw alreadyDecided()
    })
    return { participation: { id: context.participationId, status: 'rejected' } }
  }

  return { listPendingRequests, approve, reject, confirmParticipation }
}
