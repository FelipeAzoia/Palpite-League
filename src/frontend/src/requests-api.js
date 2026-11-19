import { requestAuth } from './auth-api.js'

// SPEC-010 — solicitações de entrada pendentes e decisão administrativa.
export function fetchPendingRequests(token, poolId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/requests`, { token, ...options })
}

export function decideRequest(token, poolId, participationId, decision, options = {}) {
  if (decision !== 'approve' && decision !== 'reject') throw new TypeError('decision must be approve or reject')
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/requests/${encodeURIComponent(participationId)}/${decision}`, {
    method: 'POST',
    token,
    ...options,
  })
}

export function decisionMessage(participation) {
  if (participation.status === 'confirmed') {
    return participation.lateEntry
      ? 'Participação confirmada. Como partidas já começaram, ela não palpita nessas partidas.'
      : 'Participação confirmada.'
  }
  if (participation.status === 'approved_awaiting_payment') return 'Solicitação aprovada. A participação aguarda o pagamento da taxa.'
  return 'Solicitação rejeitada.'
}
