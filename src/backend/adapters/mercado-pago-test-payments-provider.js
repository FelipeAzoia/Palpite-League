export class MercadoPagoTestProviderError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

export function createMercadoPagoTestPaymentsProvider({ timeoutMs = Number(process.env.PAYMENTS_PROVIDER_TIMEOUT_MS || 10000) } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('payment provider timeout must be positive')

  return {
    source: 'test_provider',
    startOperation() {
      throw new MercadoPagoTestProviderError('proof_pending')
    },
    consultOperation() {
      throw new MercadoPagoTestProviderError('proof_pending')
    },
  }
}
