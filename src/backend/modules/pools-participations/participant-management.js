import { AppError } from '../../shared/app-error.js'
import { createPoolAccess, memberStatuses, poolEnded } from './pool-access.js'

// SPEC-011 — lista de participantes e promoção a coadministrador.

const listedAction = 'participation.participants_listed'
const promotedAction = 'participation.promoted'
const roles = ['administrator', 'coadministrator', 'participant']

export const participantAuditDetailSchemas = Object.freeze({
  [promotedAction]: {
    previousRole: { type: 'enum', values: roles },
    newRole: { type: 'enum', values: roles },
  },
})

function targetNotFound() {
  return new AppError(404, 'not_found', 'O participante não foi encontrado neste bolão.')
}

function notEligible(message) {
  return new AppError(409, 'participant_not_eligible', message)
}

const promotionPoolEnded = () => poolEnded('Este bolão está encerrado e não aceita promoções.')

export function createParticipantManagementService(database, { auditStore }) {
  const access = createPoolAccess(database, auditStore)

  function findTarget(poolId, participationId) {
    if (typeof participationId !== 'string' || participationId.length > 100) return undefined
    return database.prepare('SELECT id, role, status FROM pool_participations WHERE id = ? AND pool_id = ?').get(participationId, poolId)
  }

  // Membros (aprovada ou confirmada) com nome, papel e status, sem e-mail (INV-008, OPEN-70).
  function listParticipants(userId, poolId) {
    const context = access.requireManager(userId, poolId, listedAction, 'Somente o administrador e o coadministrador veem os participantes.')
    const rows = database.prepare(`
      SELECT part.id, u.name, part.role, part.status
      FROM pool_participations part JOIN users u ON u.id = part.user_id
      WHERE part.pool_id = ? AND part.status IN (${memberStatuses.map(() => '?').join(',')})
      ORDER BY CASE part.role WHEN 'administrator' THEN 0 WHEN 'coadministrator' THEN 1 ELSE 2 END, u.name, part.id
    `).all(context.poolId, ...memberStatuses)
    return {
      requesterRole: context.role,
      participants: rows.map((row) => ({ id: row.id, name: row.name, role: row.role, status: row.status })),
    }
  }

  function eligibilityError(target) {
    if (target.role === 'administrator') return notEligible('O administrador do bolão não pode ser promovido.')
    if (target.role === 'coadministrator') return notEligible('Este participante já é coadministrador.')
    if (target.status !== 'confirmed') return notEligible('Só participantes com participação confirmada podem ser promovidos.')
    return null
  }

  function promote(userId, poolId, participationId) {
    const context = access.requireAdministrator(userId, poolId, promotedAction)
    const target = findTarget(context.poolId, participationId)
    if (!target) throw targetNotFound()
    if (context.poolStatus !== 'active') throw promotionPoolEnded()
    const ineligible = eligibilityError(target)
    if (ineligible) throw ineligible

    auditStore.runAuditedOperation({
      actor: { type: 'user', id: userId },
      action: promotedAction,
      object: { type: 'participation', id: target.id },
      details: { previousRole: 'participant', newRole: 'coadministrator' },
    }, () => {
      // Revalida na transação: solicitante ainda administrador e bolão ainda ativo.
      const membership = access.readMembership(userId, context.poolId)
      if (membership?.role !== 'administrator' || !memberStatuses.includes(membership.participation_status)) {
        throw new AppError(403, 'forbidden', 'Somente o administrador do bolão pode fazer esta operação.')
      }
      if (membership.pool_status !== 'active') throw promotionPoolEnded()
      // Atualização condicional: só o papel muda, e só de participante confirmado (INV-003, INV-009).
      const updated = database.prepare(`
        UPDATE pool_participations SET role = 'coadministrator'
        WHERE id = ? AND pool_id = ? AND role = 'participant' AND status = 'confirmed'
      `).run(target.id, context.poolId)
      if (updated.changes !== 1) {
        throw eligibilityError(findTarget(context.poolId, target.id)) ?? notEligible('Este participante não pode ser promovido.')
      }
    })

    return { participation: { id: target.id, role: 'coadministrator', status: 'confirmed' } }
  }

  return { listParticipants, promote }
}
