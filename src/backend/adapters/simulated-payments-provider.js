import { PaymentsProviderError } from '../modules/payments-subscriptions/payments-provider.js'

// SPEC-018 — simulador de pagamentos, provedor padrão (ADR-0003, RNF15).
// Determinístico e sempre identificado como simulador. Nenhum dinheiro real é movimentado.
// Controles para testes e demonstração:
//   confirm(key) / refuse(key)   — a próxima consulta devolve confirmada ou recusada;
//                                   chamar de novo simula uma notificação repetida;
//   (sem controle)               — a operação fica pendente (atraso);
//   failNext(stage, code, opts)  — a próxima chamada de 'start' ou 'consult' falha com o código
//                                   ('timeout', 'response_error', 'invalid_response'); com
//                                   { afterRegistering: true }, o start registra a operação antes
//                                   de falhar, como um tempo esgotado depois de o provedor receber;
//   calls                         — quantas vezes cada operação da porta foi chamada.

export function createSimulatedPaymentsProvider() {
  const operations = new Map()
  const failures = { start: [], consult: [] }
  const calls = { start: 0, consult: 0 }

  function takeFailure(stage) {
    return failures[stage].shift() ?? null
  }

  function find(reference) {
    if (!reference) return null
    return operations.get(reference.operationKey)
      ?? [...operations.values()].find((operation) => operation.providerId === reference.providerId)
      ?? null
  }

  async function startOperation(input) {
    calls.start += 1
    const failure = takeFailure('start')
    const operationKey = input?.operationKey
    if (typeof operationKey !== 'string' || operationKey === '') throw new PaymentsProviderError('invalid_response')
    if (failure && !failure.afterRegistering) throw new PaymentsProviderError(failure.code)

    const operation = operations.get(operationKey) ?? {
      operationKey,
      providerId: `sim-${operationKey}`,
      status: 'pending',
    }
    operations.set(operationKey, operation)
    if (failure) throw new PaymentsProviderError(failure.code)

    return {
      providerId: operation.providerId,
      continuation: { kind: 'simulated_checkout', simulated: true },
    }
  }

  async function consultOperation(reference) {
    calls.consult += 1
    const failure = takeFailure('consult')
    if (failure) throw new PaymentsProviderError(failure.code)
    const operation = find(reference)
    if (!operation) throw new PaymentsProviderError('invalid_response')
    return { providerId: operation.providerId, status: operation.status }
  }

  function setStatus(operationKey, status) {
    const operation = operations.get(operationKey)
    if (!operation) throw new Error(`unknown simulated operation: ${operationKey}`)
    operation.status = status
  }

  function failNext(stage, code, { afterRegistering = false } = {}) {
    if (!(stage in failures)) throw new TypeError('stage must be start or consult')
    failures[stage].push({ code, afterRegistering })
  }

  return {
    source: 'simulator',
    startOperation,
    consultOperation,
    confirm: (operationKey) => setStatus(operationKey, 'confirmed'),
    refuse: (operationKey) => setStatus(operationKey, 'refused'),
    failNext,
    calls,
  }
}
