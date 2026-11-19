import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/app-error.js'

// Autorização por papel e por status da participação no bolão, sempre no backend.
// Quem não é membro recebe 404; membro sem o papel exigido recebe 403. Toda negativa é
// auditada como "negado", em transação própria (OPEN-45, OPEN-65).

export const memberStatuses = Object.freeze(['approved_awaiting_payment', 'confirmed'])
export const managerRoles = Object.freeze(['administrator', 'coadministrator'])

export function poolNotFound() {
  return new AppError(404, 'not_found', 'O bolão solicitado não foi encontrado.')
}

export function poolEnded(message = 'Este bolão está encerrado e não aceita esta operação.') {
  return new AppError(409, 'pool_ended', message)
}

function forbidden(message) {
  return new AppError(403, 'forbidden', message)
}

function auditablePoolId(poolId) {
  return typeof poolId === 'string' && /^[0-9a-f-]{36}$/i.test(poolId) ? poolId : randomUUID()
}

export function createPoolAccess(database, auditStore) {
  function readMembership(userId, poolId) {
    if (typeof poolId !== 'string' || poolId.length > 100) return undefined
    return database.prepare(`
      SELECT pools.id AS pool_id, pools.status AS pool_status, pools.entry_fee_cents AS entry_fee_cents,
        part.id AS participation_id, part.role AS role, part.status AS participation_status
      FROM pools
      LEFT JOIN pool_participations part ON part.pool_id = pools.id AND part.user_id = ?
      WHERE pools.id = ?
    `).get(userId, poolId)
  }

  // roles: papéis aceitos; action: ação auditada em caso de negativa.
  function requireRole(userId, poolId, { roles, action, forbiddenMessage }) {
    const row = readMembership(userId, poolId)
    const isMember = Boolean(row) && memberStatuses.includes(row.participation_status)
    const allowed = isMember && roles.includes(row.role)
    if (!allowed) {
      auditStore.recordOutcome({
        actor: { type: 'user', id: userId },
        action,
        object: { type: 'pool', id: auditablePoolId(poolId) },
      }, 'denied')
      throw isMember ? forbidden(forbiddenMessage) : poolNotFound()
    }
    return {
      poolId: row.pool_id,
      poolStatus: row.pool_status,
      entryFeeCents: row.entry_fee_cents,
      role: row.role,
      participationId: row.participation_id,
    }
  }

  function requireManager(userId, poolId, action, forbiddenMessage = 'Você não tem permissão para esta operação neste bolão.') {
    return requireRole(userId, poolId, { roles: managerRoles, action, forbiddenMessage })
  }

  function requireAdministrator(userId, poolId, action, forbiddenMessage = 'Somente o administrador do bolão pode fazer esta operação.') {
    return requireRole(userId, poolId, { roles: ['administrator'], action, forbiddenMessage })
  }

  return { readMembership, requireManager, requireAdministrator }
}
