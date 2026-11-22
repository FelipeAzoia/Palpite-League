import { randomUUID } from 'node:crypto'

export class SimulatedPaymentProviderError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

export function createSimulatedPaymentsProvider({ now = Date.now, initialBehavior = 'pending' } = {}) {
  const operations = new Map()
  let behavior = initialBehavior

  function providerIdFor(operationKey) {
    return `sim-${operationKey}`
  }

  function startOperation(input) {
    const operationKey = input.operationKey || input.referenceId || input.reference
    if (!operationKey) throw new SimulatedPaymentProviderError('invalid_response')
    const existing = operations.get(operationKey)
    if (existing) return existing

    const providerId = providerIdFor(operationKey)
    const operation = {
      providerId,
      status: behavior === 'confirmed' ? 'confirmed'
        : behavior === 'refused' ? 'refused'
          : behavior === 'delay' ? 'pending'
            : behavior === 'failure' ? null
              : 'pending',
      continuation: {
        kind: 'simulated_checkout',
        notice: 'Operação simulada; nenhuma movimentação real de dinheiro.',
      },
      operationKey,
      occurredAt: new Date(now()).toISOString(),
    }
    if (operation.status === null) throw new SimulatedPaymentProviderError('timeout')
    operations.set(operationKey, operation)
    return {
      providerId,
      status: 'pending',
      continuation: operation.continuation,
    }
  }

  function consultOperation(input) {
    const key = typeof input === 'string' ? input : (input?.operationKey || input?.providerId)
    const operation = operations.get(key)
      ?? [...operations.values()].find((item) => item.providerId === key)
    if (!operation) throw new SimulatedPaymentProviderError('invalid_response')
    return { providerId: operation.providerId, status: operation.status }
  }

  function setBehavior(nextBehavior) {
    if (!['pending', 'confirmed', 'refused', 'delay', 'failure'].includes(nextBehavior)) {
      throw new TypeError('unsupported simulated payment behavior')
    }
    behavior = nextBehavior
  }

  function confirm(operationKey) { setOperationStatus(operationKey, 'confirmed') }
  function refuse(operationKey) { setOperationStatus(operationKey, 'refused') }
  function setOperationStatus(operationKey, status) {
    const operation = [...operations.values()].find((item) =>
      item.operationKey === operationKey || item.providerId === operationKey)
    if (operation) operation.status = status
  }

  return {
    source: 'simulator',
    startOperation,
    consultOperation,
    start: startOperation,
    consult: consultOperation,
    setBehavior,
    setStatus: setOperationStatus,
    confirm,
    refuse,
  }
}

export const createSimulatedPaymentProvider = createSimulatedPaymentsProvider
