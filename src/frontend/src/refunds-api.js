import { requestAuth } from './auth-api.js'

// SPEC-023 — pedido de devolução por quem saiu do bolão e decisão da administração. O cliente nunca
// envia valor; quem decide elegibilidade, valor e permissão é o backend (INV-012).

export function fetchOwnRefunds(token, options = {}) {
  return requestAuth('/account/refund-requests', { token, ...options })
}

export function requestRefund(token, poolId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/refund-request`, { method: 'POST', token, ...options })
}

export function fetchPendingRefunds(token, poolId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/refund-requests`, { token, ...options })
}

export function decideRefund(token, poolId, requestId, decision, options = {}) {
  if (decision !== 'approve' && decision !== 'reject') throw new TypeError('decision must be approve or reject')
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/refund-requests/${encodeURIComponent(requestId)}/${decision}`, {
    method: 'POST', token, ...options,
  })
}

// Aprovada nunca aparece como devolvida: só a devolução confirmada pelo provedor é "concluída"
// (SPEC-023 CA-16, SPEC-024 OPEN-131).
export const refundStatusLabels = {
  pending: 'Aguardando decisão da administração',
  awaiting_processing: 'Aprovada — aguardando processamento da devolução',
  processing: 'Devolução em processamento',
  completed: 'Devolução concluída',
  refused: 'Devolução recusada pelo provedor',
  rejected: 'Rejeitada',
}

export const refusalReasonLabels = {
  not_refundable: 'o pagamento original não admite devolução',
  provider_refused: 'o provedor recusou a devolução',
}

// Texto da situação, com a simulação sempre identificada, inclusive quando concluída (INV-010).
export function refundSituation(request) {
  const label = refundStatusLabels[request.displayStatus] ?? request.displayStatus
  const processing = request.processing
  if (!processing) return label
  const parts = [label]
  if (request.displayStatus === 'refused' && processing.refusalReason) parts[0] = `${label}: ${refusalReasonLabels[processing.refusalReason] ?? processing.refusalReason}`
  if (processing.inconsistent) parts.push('resposta do provedor em verificação')
  if (processing.simulated) parts.push('simulação')
  return parts.join(' · ')
}

// SPEC-024 — devoluções aprovadas do bolão e nova tentativa depois de uma recusa (administração).
export function fetchApprovedRefunds(token, poolId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/refunds`, { token, ...options })
}

export function retryRefund(token, poolId, requestId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/refunds/${encodeURIComponent(requestId)}/retry`, { method: 'POST', token, ...options })
}

export const refundReasonLabels = {
  pool_ended: 'O bolão foi encerrado; não é mais possível pedir a devolução.',
  already_refunded: 'A taxa desta participação já foi devolvida ou está em devolução.',
}

export function refundDecisionMessage(request) {
  return request.status === 'approved'
    ? 'Devolução aprovada. Ela ainda precisa ser processada; nenhum valor foi devolvido até agora.'
    : 'Pedido de devolução rejeitado.'
}
