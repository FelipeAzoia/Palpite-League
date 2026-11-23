import { requestAuth } from './auth-api.js'

// SPEC-026 — premiação do bolão encerrado. O cliente nunca envia valor; quem decide vencedor,
// parte e estado é o backend (INV-013).

export function fetchPrize(token, poolId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/prize`, { token, ...options })
}

export function requestPrize(token, poolId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/prize/request`, { method: 'POST', token, ...options })
}

export const prizeStateLabels = {
  available: 'Disponível para solicitar',
  processing: 'Pagamento em processamento',
  completed: 'Premiação paga',
  refused: 'Pagamento recusado pelo provedor',
  waiting_refunds: 'Aguardando devoluções do bolão terminarem',
  not_winner: 'Você não está entre os vencedores deste bolão',
  no_winner: 'Este bolão terminou sem vencedor',
  nothing_to_pay: 'Sem premiação a pagar',
  pool_not_ended: 'Disponível depois do encerramento',
}

// Linha de situação do próprio vencedor, com a simulação sempre identificada (INV-009).
export function prizeSituation(view) {
  const parts = [prizeStateLabels[view.state] ?? view.state]
  if (view.payment?.inconsistent) parts.push('resposta do provedor em verificação')
  if (view.payment?.simulated) parts.push('simulação')
  return parts.join(' · ')
}
