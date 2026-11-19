import { requestAuth } from './auth-api.js'
import { roleLabels } from './pools-form.js'

// SPEC-011 — participantes do bolão e promoção a coadministrador.
export function fetchParticipants(token, poolId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/participants`, { token, ...options })
}

export function promoteParticipant(token, poolId, participationId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/participants/${encodeURIComponent(participationId)}/promote`, {
    method: 'POST',
    token,
    ...options,
  })
}

export const participationStatusLabels = {
  confirmed: 'Confirmada',
  approved_awaiting_payment: 'Aguardando pagamento',
}

export function participantRoleLabel(role) {
  return roleLabels[role] ?? role
}

// A interface só orienta; quem decide é o backend (INV-011).
export function canPromote(requesterRole, participant) {
  return requesterRole === 'administrator' && participant.role === 'participant' && participant.status === 'confirmed'
}
