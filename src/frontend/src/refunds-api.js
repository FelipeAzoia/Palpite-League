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

// Aprovada nunca aparece como devolvida: a devolução em si é processada depois (CA-16).
export const refundStatusLabels = {
  pending: 'Aguardando decisão da administração',
  awaiting_processing: 'Aprovada — aguardando processamento da devolução',
  rejected: 'Rejeitada',
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
