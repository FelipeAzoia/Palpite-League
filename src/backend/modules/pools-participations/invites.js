import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { AppError } from '../../shared/app-error.js'

const inviteValidityMs = 7 * 24 * 60 * 60 * 1000
const codeBytes = 16
const maxCodeLength = 200
const managerRoles = ['administrator', 'coadministrator']
const memberStatuses = ['approved_awaiting_payment', 'confirmed']
const defaultInterfaceBaseUrl = 'http://localhost:5173'

function codeHash(code) {
  return createHash('sha256').update(code).digest('hex')
}

function inviteUnavailable() {
  return new AppError(404, 'invite_unavailable', 'Convite indisponível.')
}

function poolNotFound() {
  return new AppError(404, 'not_found', 'O bolão solicitado não foi encontrado.')
}

function forbidden() {
  return new AppError(403, 'forbidden', 'Você não tem permissão para gerenciar os convites deste bolão.')
}

function poolEnded() {
  return new AppError(409, 'pool_ended', 'Este bolão está encerrado e não aceita novos convites.')
}

function inviteNotActive() {
  return new AppError(409, 'invite_not_active', 'Somente convites ativos podem ser revogados.')
}

function auditablePoolId(poolId) {
  return typeof poolId === 'string' && /^[0-9a-f-]{36}$/i.test(poolId) ? poolId : randomUUID()
}

export function createInvitesService(database, {
  auditStore,
  now = Date.now,
  interfaceBaseUrl = process.env.APP_BASE_URL || defaultInterfaceBaseUrl,
}) {
  // Autorização por papel e por status da participação, sempre no backend (INV-001, INV-015).
  // Toda negativa é auditada como "negado", em transação própria (INV-012).
  function authorize(userId, poolId, action) {
    const row = typeof poolId === 'string' && poolId.length <= 100
      ? database.prepare(`
        SELECT pools.status AS pool_status, part.role AS role, part.status AS participation_status
        FROM pools
        LEFT JOIN pool_participations part ON part.pool_id = pools.id AND part.user_id = ?
        WHERE pools.id = ?
      `).get(userId, poolId)
      : undefined

    const isMember = Boolean(row) && memberStatuses.includes(row.participation_status)
    const isManager = isMember && managerRoles.includes(row.role)
    if (!isManager) {
      auditStore.recordOutcome({
        actor: { type: 'user', id: userId },
        action,
        object: { type: 'pool', id: auditablePoolId(poolId) },
      }, 'denied')
      throw isMember ? forbidden() : poolNotFound()
    }
    return { poolStatus: row.pool_status }
  }

  function statusOf(row, nowMs) {
    return row.status === 'active' && row.expires_at <= nowMs ? 'expired' : row.status
  }

  function createInvite(userId, poolId) {
    const { poolStatus } = authorize(userId, poolId, 'invite.created')
    if (poolStatus !== 'active') throw poolEnded()

    const code = randomBytes(codeBytes).toString('base64url')
    const inviteId = randomUUID()
    const createdAt = now()
    const expiresAt = createdAt + inviteValidityMs

    auditStore.runAuditedOperation({
      actor: { type: 'user', id: userId },
      action: 'invite.created',
      object: { type: 'invite', id: inviteId },
    }, () => {
      const pool = database.prepare('SELECT status FROM pools WHERE id = ?').get(poolId)
      if (pool?.status !== 'active') throw poolEnded()
      database.prepare(`
        INSERT INTO pool_invites (id, pool_id, code_hash, status, created_by, created_at, expires_at)
        VALUES (?, ?, ?, 'active', ?, ?, ?)
      `).run(inviteId, poolId, codeHash(code), userId, createdAt, expiresAt)
    })

    return {
      invite: {
        id: inviteId,
        status: 'active',
        createdAt: new Date(createdAt).toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
        // O código só existe neste link, devolvido uma única vez (INV-003, INV-004).
        link: `${interfaceBaseUrl.replace(/\/+$/, '')}/#invite=${code}`,
      },
    }
  }

  function listInvites(userId, poolId) {
    authorize(userId, poolId, 'invite.listed')
    const nowMs = now()
    const rows = database.prepare(`
      SELECT i.id, i.status, i.created_at, i.expires_at, i.used_at, u.name AS created_by_name
      FROM pool_invites i JOIN users u ON u.id = i.created_by
      WHERE i.pool_id = ?
      ORDER BY i.created_at DESC, i.id
    `).all(poolId)

    return {
      invites: rows.map((row) => ({
        id: row.id,
        status: statusOf(row, nowMs),
        createdAt: new Date(row.created_at).toISOString(),
        expiresAt: new Date(row.expires_at).toISOString(),
        createdBy: row.created_by_name,
        ...(row.used_at === null ? {} : { usedAt: new Date(row.used_at).toISOString() }),
      })),
    }
  }

  function revokeInvite(userId, poolId, inviteId) {
    authorize(userId, poolId, 'invite.revoked')
    const invite = typeof inviteId === 'string' && inviteId.length <= 100
      ? database.prepare('SELECT id, status, expires_at FROM pool_invites WHERE id = ? AND pool_id = ?').get(inviteId, poolId)
      : undefined
    if (!invite) throw new AppError(404, 'not_found', 'O convite solicitado não foi encontrado neste bolão.')
    if (statusOf(invite, now()) !== 'active') throw inviteNotActive()

    auditStore.runAuditedOperation({
      actor: { type: 'user', id: userId },
      action: 'invite.revoked',
      object: { type: 'invite', id: invite.id },
    }, () => {
      const revoked = database.prepare(`
        UPDATE pool_invites SET status = 'revoked', revoked_at = ?
        WHERE id = ? AND status = 'active' AND expires_at > ?
      `).run(now(), invite.id, now())
      if (revoked.changes !== 1) throw inviteNotActive()
    })

    return { invite: { id: invite.id, status: 'revoked' } }
  }

  // Leituras e consumo para o fluxo de entrada (SPEC-009). Todo caso indisponível devolve a mesma resposta (INV-009).
  function findInvite(code) {
    if (typeof code !== 'string' || code.length === 0 || code.length > maxCodeLength) return undefined
    return database.prepare(`
      SELECT i.id, i.pool_id, i.status, i.expires_at, i.used_by, pools.status AS pool_status
      FROM pool_invites i JOIN pools ON pools.id = i.pool_id
      WHERE i.code_hash = ?
    `).get(codeHash(code))
  }

  function isUsableBy(invite, userId, nowMs) {
    if (!invite || invite.pool_status !== 'active') return false
    if (invite.status === 'active') return invite.expires_at > nowMs
    // Convite já consumido continua válido para quem o consumiu; a expiração não o alcança (INV-007).
    return invite.status === 'used' && invite.used_by === userId
  }

  function verifyInvite(code, userId) {
    const invite = findInvite(code)
    if (!isUsableBy(invite, userId, now())) throw inviteUnavailable()
    return { poolId: invite.pool_id, inviteId: invite.id, alreadyConsumed: invite.status === 'used' }
  }

  function consumeInvite(code, userId) {
    return database.transaction(() => {
      const invite = findInvite(code)
      const nowMs = now()
      if (!isUsableBy(invite, userId, nowMs)) throw inviteUnavailable()
      if (invite.status === 'used') {
        return { poolId: invite.pool_id, inviteId: invite.id, alreadyConsumed: true }
      }

      const consumed = database.prepare(`
        UPDATE pool_invites SET status = 'used', used_by = ?, used_at = ?
        WHERE id = ? AND status = 'active' AND expires_at > ?
      `).run(userId, nowMs, invite.id, nowMs)
      if (consumed.changes !== 1) throw inviteUnavailable()
      return { poolId: invite.pool_id, inviteId: invite.id, alreadyConsumed: false }
    })()
  }

  return { createInvite, listInvites, revokeInvite, verifyInvite, consumeInvite }
}
