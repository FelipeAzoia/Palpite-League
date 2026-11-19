import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/app-error.js'

// SPEC-009 — abertura do convite, aceite das regras, entrada tardia e solicitação de entrada.

const rulesAcceptedAction = 'participation.rules_accepted'
const requestedAction = 'participation.requested'

const lateEntryDetails = {
  lateEntryAcknowledged: { type: 'boolean' },
  closedMatchCount: { type: 'integer' },
}

// Detalhes permitidos na auditoria do aceite e da solicitação (INV-008, OPEN-67).
export const participationAuditDetailSchemas = Object.freeze({
  [rulesAcceptedAction]: lateEntryDetails,
  [requestedAction]: lateEntryDetails,
})

function validationError(fields) {
  return new AppError(400, 'validation_error', 'Confira os campos informados.', fields)
}

function participationExists(status) {
  return new AppError(
    409,
    'participation_exists',
    'Você já tem uma participação neste bolão e não pode solicitar a entrada novamente.',
    undefined,
    { status },
  )
}

function poolEnded() {
  return new AppError(404, 'invite_unavailable', 'Convite indisponível.')
}

function isUniqueViolation(error) {
  return error?.code === 'SQLITE_CONSTRAINT_UNIQUE' || error?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY'
}

// Oportunidades de palpite encerradas: partidas selecionadas com início anterior ao momento
// da consulta, sem as canceladas, em ordem cronológica (INV-010).
export function closedOpportunities(matches, nowMs) {
  return matches
    .filter((match) => match.status !== 'cancelled' && match.startsAt && Date.parse(match.startsAt) < nowMs)
    .sort((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt))
}

export function createParticipationRequestsService(database, { auditStore, invites, pools, now = Date.now }) {
  function findParticipation(poolId, userId) {
    return database.prepare(`
      SELECT id, role, status, payment_confirmed, rules_accepted_at
      FROM pool_participations WHERE pool_id = ? AND user_id = ?
    `).get(poolId, userId)
  }

  function situationOf(participation) {
    if (!participation) return { status: 'none' }
    return {
      status: participation.status,
      role: participation.role,
      rulesAcceptedAt: participation.rules_accepted_at,
    }
  }

  // Abre o convite: consome e vincula ao usuário (SPEC-008) e devolve regras, situação e entrada tardia.
  // Nunca cria participação (INV-002).
  function openInvite(userId, input) {
    const code = input?.code
    const { poolId } = invites.consumeInvite(code, userId)
    const { pool, participationConditions } = pools.getInviteeRules(poolId)
    const closedMatches = closedOpportunities(pool.matches, now())

    return {
      pool,
      participationConditions,
      situation: situationOf(findParticipation(poolId, userId)),
      lateEntry: {
        acknowledgementRequired: closedMatches.length > 0,
        closedMatches,
      },
    }
  }

  function readCount(poolId) {
    const { pool } = pools.getInviteeRules(poolId)
    return { poolStatus: pool.status, closedMatchCount: closedOpportunities(pool.matches, now()).length }
  }

  function requestEntry(userId, input) {
    const body = input !== null && typeof input === 'object' && !Array.isArray(input) ? input : {}
    // O convite precisa estar disponível para este usuário; um convite ativo ainda não aberto é consumido aqui.
    const { poolId } = invites.consumeInvite(body.code, userId)

    // A necessidade da ciência é recalculada no backend no momento do envio (INV-005, CA-09).
    const { closedMatchCount } = readCount(poolId)
    const lateEntryRequired = closedMatchCount > 0
    const fields = {}
    if (body.rulesAccepted !== true) fields.rulesAccepted = 'Aceite as regras do bolão para solicitar a entrada.'
    if (lateEntryRequired && body.lateEntryAcknowledged !== true) {
      fields.lateEntryAcknowledged = 'Confirme que está ciente das partidas em que não poderá palpitar.'
    }
    if (Object.keys(fields).length > 0) throw validationError(fields)

    const existing = findParticipation(poolId, userId)
    if (existing) throw participationExists(existing.status)

    const participationId = randomUUID()
    const rulesAcceptedAt = new Date(now()).toISOString()
    const details = { lateEntryAcknowledged: lateEntryRequired, closedMatchCount }
    const entry = (action) => ({
      actor: { type: 'user', id: userId },
      action,
      object: { type: 'participation', id: participationId },
      details,
    })

    try {
      auditStore.runAuditedOperation([entry(rulesAcceptedAction), entry(requestedAction)], () => {
        if (readCount(poolId).poolStatus !== 'active') throw poolEnded()
        const concurrent = findParticipation(poolId, userId)
        if (concurrent) throw participationExists(concurrent.status)
        // Papel participante, status solicitada, pagamento não confirmado e sem data de entrada (INV-006).
        database.prepare(`
          INSERT INTO pool_participations (
            id, pool_id, user_id, role, status, payment_confirmed, rules_accepted_at, joined_at
          ) VALUES (?, ?, ?, 'participant', 'requested', 0, ?, NULL)
        `).run(participationId, poolId, userId, rulesAcceptedAt)
      })
    } catch (error) {
      if (isUniqueViolation(error)) throw participationExists(findParticipation(poolId, userId)?.status ?? 'requested')
      throw error
    }

    return {
      participation: {
        id: participationId,
        poolId,
        role: 'participant',
        status: 'requested',
        paymentConfirmed: false,
        rulesAcceptedAt,
      },
      message: 'Solicitação enviada. Ela aguarda a decisão do administrador ou coadministrador do bolão.',
    }
  }

  return { openInvite, requestEntry }
}
