import { requestAuth } from './auth-api.js'

// SPEC-022 — pagamento da taxa de entrada. O cliente nunca envia valor: o backend usa a taxa do
// bolão e decide quando a participação é confirmada (INV-002, INV-014).

export function fetchEntryFee(token, poolId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/entry-fee`, { token, ...options })
}

export function startEntryFeePayment(token, poolId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/entry-fee/payment`, { method: 'POST', token, ...options })
}

// Volta do checkout: o backend consulta o provedor e aplica o resultado.
export function checkEntryFeePayment(token, poolId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/entry-fee/payment/check`, { method: 'POST', token, ...options })
}

// Texto da situação do pagamento mostrado ao titular.
export function entryFeeSituation(view) {
  const payment = view?.payment
  if (view?.participation.status === 'confirmed') {
    return { tone: 'done', text: 'Pagamento confirmado. Sua participação está confirmada.' }
  }
  if (!payment) return { tone: 'muted', text: 'Sua entrada foi aprovada. Pague a taxa para confirmar a participação.' }
  if (payment.status === 'pending') {
    return { tone: 'warn', text: 'Pagamento em andamento. A participação é confirmada assim que o pagamento for confirmado.' }
  }
  if (payment.providerUnavailable) {
    return { tone: 'alert', text: 'O provedor de pagamentos estava indisponível e nada foi cobrado. Você pode tentar de novo.' }
  }
  if (payment.status === 'refused') return { tone: 'alert', text: 'O pagamento foi recusado. Você pode tentar de novo.' }
  return { tone: 'muted', text: 'Pagamento confirmado.' }
}

// Mensagem da volta do checkout, conforme o resultado conferido no backend.
export function entryFeeResultMessage(view) {
  if (view.participation.status === 'confirmed') return 'Pagamento confirmado! Sua participação no bolão está confirmada.'
  if (view.payment?.status === 'refused') return 'O pagamento foi recusado. Nada foi confirmado; você pode tentar de novo.'
  return 'O pagamento ainda está pendente. Assim que for confirmado, sua participação será liberada.'
}
