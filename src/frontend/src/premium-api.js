import { requestAuth } from './auth-api.js'

// SPEC-019 — contratação do Premium. Valor e recorrência nunca saem do cliente: a contratação envia
// somente a confirmação explícita.

export function fetchPremiumConditions(token, options = {}) {
  return requestAuth('/account/premium', { token, ...options })
}

// Envia a confirmação e a versão da Política de Cobrança e Cancelamento que a pessoa aceitou.
export function subscribePremium(token, billingPolicyVersion, options = {}) {
  return requestAuth('/account/premium/subscription', {
    method: 'POST', body: { confirm: true, billingPolicyVersion }, token, ...options,
  })
}

// Retorno do checkout: o backend consulta o provedor e aplica o resultado.
export function checkPremiumSubscription(token, options = {}) {
  return requestAuth('/account/premium/subscription/check', { method: 'POST', token, ...options })
}

// Página de pagamento simulado: só existe com o simulador ativo.
export function fetchSimulatedPayment(token, movementId, options = {}) {
  return requestAuth(`/payments/simulated-checkout/${encodeURIComponent(movementId)}`, { token, ...options })
}

export function decideSimulatedPayment(token, movementId, decision, options = {}) {
  return requestAuth(`/payments/simulated-checkout/${encodeURIComponent(movementId)}/decision`, {
    method: 'POST', body: { decision }, token, ...options,
  })
}

// SPEC-020 — consulta da assinatura, pedido de cancelamento (só a confirmação explícita) e
// conferência do cancelamento pendente.
export function fetchSubscription(token, options = {}) {
  return requestAuth('/account/subscription', { token, ...options })
}

export function requestSubscriptionCancellation(token, options = {}) {
  return requestAuth('/account/subscription/cancellation', { method: 'POST', body: { confirm: true }, token, ...options })
}

export function checkSubscriptionCancellation(token, options = {}) {
  return requestAuth('/account/subscription/cancellation/check', { method: 'POST', token, ...options })
}
