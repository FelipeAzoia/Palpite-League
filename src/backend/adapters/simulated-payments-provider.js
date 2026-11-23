import { PaymentsProviderError } from '../modules/payments-subscriptions/payments-provider.js'

// SPEC-018 — simulador de pagamentos, provedor padrão (ADR-0003, RNF15).
// Determinístico e sempre identificado como simulador. Nenhum dinheiro real é movimentado.
// Controles para testes e demonstração:
//   confirm(key) / refuse(key)   — a próxima consulta devolve confirmada ou recusada;
//                                   chamar de novo simula uma notificação repetida; é também o
//                                   que a página de pagamento simulado aciona (SPEC-019);
//   (sem controle)               — a operação fica pendente (atraso);
//   failNext(stage, code, opts)  — a próxima chamada de 'start' ou 'consult' falha com o código
//                                   ('timeout', 'response_error', 'invalid_response'); com
//                                   { afterRegistering: true }, o start registra a operação antes
//                                   de falhar, como um tempo esgotado depois de o provedor receber;
//   setRefundOutcome(outcome)     — resultado da próxima devolução (SPEC-024);
//   setPayoutOutcome(outcome)     — resultado do próximo repasse de premiação (SPEC-026);
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

  // SPEC-020: o cancelamento da assinatura. O provedor simulado aceita o cancelamento na hora, como o
  // provedor de teste; a confirmação só vale para a aplicação depois da conferência (INV-002).
  // refuse(key) simula a recusa e failNext('start', ...) a indisponibilidade.
  async function startSubscriptionCancellation(input) {
    const started = await startOperation(input)
    operations.get(input.operationKey).status = 'confirmed'
    return { providerId: started.providerId, continuation: null }
  }

  // SPEC-029: a cobrança recorrente da renovação. O provedor simulado cobra o ciclo sozinho; o
  // resultado vem de setRenewalOutcome ('confirmed' por padrão, 'refused' ou 'pending').
  let renewalOutcome = 'confirmed'
  async function startSubscriptionRenewal(input) {
    const started = await startOperation(input)
    operations.get(input.operationKey).status = renewalOutcome
    return { providerId: started.providerId, continuation: null }
  }

  function setRenewalOutcome(status) {
    if (!['confirmed', 'refused', 'pending'].includes(status)) throw new TypeError('unsupported renewal outcome')
    renewalOutcome = status
  }

  // SPEC-024: a devolução na transação original. O simulador resolve sozinho, sem página para o
  // pagador; o resultado vem de setRefundOutcome: 'confirmed' (padrão), 'refused', 'not_refundable'
  // (transação original não admite devolução), 'pending' ou 'amount_mismatch' (o provedor informa
  // outro valor). A devolução só vale para a aplicação depois da conferência.
  let refundOutcome = 'confirmed'
  const refundOutcomes = ['confirmed', 'refused', 'not_refundable', 'pending', 'amount_mismatch']
  async function startRefund(input) {
    if (!input?.original?.operationKey) throw new PaymentsProviderError('invalid_response')
    const started = await startOperation(input)
    const operation = operations.get(input.operationKey)
    operation.original = input.original
    operation.refundAmountCents = input.amountCents
    if (refundOutcome === 'refused' || refundOutcome === 'not_refundable') {
      operation.status = 'refused'
      operation.refusalReason = refundOutcome === 'not_refundable' ? 'not_refundable' : 'provider_refused'
    } else if (refundOutcome === 'amount_mismatch') {
      operation.status = 'confirmed'
      operation.reportedAmountCents = input.amountCents + 1
    } else {
      operation.status = refundOutcome
    }
    return { providerId: started.providerId, continuation: null }
  }

  async function consultRefund(reference) {
    const result = await consultOperation(reference)
    const operation = find(reference)
    return {
      ...result,
      ...(operation.refusalReason && result.status === 'refused' ? { refusalReason: operation.refusalReason } : {}),
      ...(operation.refundAmountCents !== undefined
        ? { amountCents: operation.reportedAmountCents ?? operation.refundAmountCents }
        : {}),
    }
  }

  // SPEC-026: o repasse da premiação ao vencedor. Mesmo comportamento da devolução, com o resultado
  // vindo de setPayoutOutcome ('confirmed' padrão, 'refused', 'pending' ou 'amount_mismatch').
  let payoutOutcome = 'confirmed'
  async function startPayout(input) {
    const started = await startOperation(input)
    const operation = operations.get(input.operationKey)
    operation.refundAmountCents = input.amountCents
    if (payoutOutcome === 'refused') {
      operation.status = 'refused'
      operation.refusalReason = 'provider_refused'
    } else if (payoutOutcome === 'amount_mismatch') {
      operation.status = 'confirmed'
      operation.reportedAmountCents = input.amountCents + 1
    } else {
      operation.status = payoutOutcome
    }
    return { providerId: started.providerId, continuation: null }
  }

  function setPayoutOutcome(outcome) {
    if (!['confirmed', 'refused', 'pending', 'amount_mismatch'].includes(outcome)) throw new TypeError('unsupported payout outcome')
    payoutOutcome = outcome
  }

  function setRefundOutcome(outcome) {
    if (!refundOutcomes.includes(outcome)) throw new TypeError('unsupported refund outcome')
    refundOutcome = outcome
  }

  function refundOf(operationKey) {
    return operations.get(operationKey)?.original ?? null
  }

  async function consultOperation(reference) {
    calls.consult += 1
    const failure = takeFailure('consult')
    if (failure) throw new PaymentsProviderError(failure.code)
    const operation = find(reference)
    if (!operation) throw new PaymentsProviderError('invalid_response')
    return { providerId: operation.providerId, status: operation.status }
  }

  // A decisão vale também para uma operação cujo início não chegou a responder: o simulador faz o
  // papel do provedor, que passa a conhecê-la quando o pagador decide na página simulada.
  function setStatus(operationKey, status) {
    if (typeof operationKey !== 'string' || operationKey === '') throw new TypeError('operationKey is required')
    const operation = operations.get(operationKey) ?? { operationKey, providerId: `sim-${operationKey}` }
    operation.status = status
    operations.set(operationKey, operation)
  }

  function failNext(stage, code, { afterRegistering = false } = {}) {
    if (!(stage in failures)) throw new TypeError('stage must be start or consult')
    failures[stage].push({ code, afterRegistering })
  }

  return {
    source: 'simulator',
    startOperation,
    consultOperation,
    // Extensão de assinatura (SPEC-019): no simulador, o mesmo fluxo da operação genérica.
    startSubscription: startOperation,
    consultSubscription: consultOperation,
    startSubscriptionCancellation,
    consultSubscriptionCancellation: consultOperation,
    startSubscriptionRenewal,
    consultSubscriptionRenewal: consultOperation,
    setRenewalOutcome,
    startRefund,
    consultRefund,
    setRefundOutcome,
    refundOf,
    startPayout,
    // A consulta devolve o valor informado pelo "provedor", como na devolução.
    consultPayout: consultRefund,
    setPayoutOutcome,
    confirm: (operationKey) => setStatus(operationKey, 'confirmed'),
    refuse: (operationKey) => setStatus(operationKey, 'refused'),
    failNext,
    calls,
  }
}
