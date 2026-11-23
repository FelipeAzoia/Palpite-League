// SPEC-018 — porta do provedor de pagamentos (OPEN-85, INV-018).
// O domínio depende somente deste contrato; o simulador e o Mercado Pago em teste são adaptadores
// substituíveis por configuração. Toda operação é assíncrona.
//
//   source: 'simulator' | 'test_provider'   — origem gravada em cada movimentação (INV-005)
//   startOperation({ operationKey, type, amountCents, currency, userId })
//     → { providerId, continuation }        — a operação começa sempre pendente
//   consultOperation({ operationKey, providerId })
//     → { providerId, status: 'pending' | 'confirmed' | 'refused' }
//
// Falhas são sinalizadas com PaymentsProviderError e um código classificado. A porta nunca repete
// uma chamada por conta própria (ADR-0003). As operações de assinatura, reembolso e repasse são
// acrescentadas pelas Specs 019, 024 e 026.

export const paymentsProviderSources = Object.freeze(['simulator', 'test_provider'])
export const paymentsProviderFailureCodes = Object.freeze(['timeout', 'response_error', 'invalid_response'])
export const providerStatuses = Object.freeze(['pending', 'confirmed', 'refused'])

export class PaymentsProviderError extends Error {
  constructor(code) {
    super(code)
    this.name = 'PaymentsProviderError'
    this.code = paymentsProviderFailureCodes.includes(code) ? code : 'response_error'
  }
}

export function assertPaymentsProvider(provider) {
  if (!provider || !paymentsProviderSources.includes(provider.source)
    || typeof provider.startOperation !== 'function'
    || typeof provider.consultOperation !== 'function') {
    throw new TypeError('payments provider must implement the payments port')
  }
  return provider
}
