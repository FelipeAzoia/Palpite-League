import { PaymentsProviderError } from '../modules/payments-subscriptions/payments-provider.js'

// SPEC-018 — adaptador do Mercado Pago em ambiente de teste (ADR-0003, RNF15).
// - só aceita credenciais de teste: o prefixo legado TEST- ou, como o painel do Mercado Pago passou a
//   emitir credenciais de teste com o mesmo prefixo APP_USR- das de produção, uma chave APP_USR- com
//   confirmação explícita de que vem de "Credenciais de teste" (ADR-0003, RNF15);
// - a chave vem da configuração, nunca do repositório, e nunca aparece em respostas, registros técnicos ou auditoria (INV-011);
// - cliente HTTP isolado, com tempo limite e erros classificados; nenhuma chamada é repetida
//   automaticamente (INV-007);
// - a operação genérica inicia um checkout com a chave de operação como referência externa e como
//   chave de idempotência, e a consulta procura os pagamentos dessa referência.
// A integração real só é considerada atendida depois dos smoke tests do sandbox (OPEN-26), feitos
// nas Specs 019, 022, 024 e 026; até lá o provedor padrão é o simulador.

const apiBaseUrl = 'https://api.mercadopago.com'

function isAllowedTestCredential(accessToken, testCredentialsConfirmed) {
  if (accessToken.startsWith('TEST-')) return true
  return testCredentialsConfirmed === true && accessToken.startsWith('APP_USR-')
}

export function createMercadoPagoTestPaymentsProvider({
  accessToken,
  timeoutMs = 10000,
  fetcher = fetch,
  baseUrl = apiBaseUrl,
  backUrl = '',
  subscriptionsProofApproved = false,
  testCredentialsConfirmed = false,
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('payments provider timeout must be positive')
  if (accessToken !== undefined && accessToken !== '' && !isAllowedTestCredential(String(accessToken), testCredentialsConfirmed)) {
    throw new Error('Only Mercado Pago test credentials are allowed')
  }

  async function request(method, path, { body, idempotencyKey } = {}) {
    if (!accessToken) throw new PaymentsProviderError('response_error')

    let response
    try {
      response = await fetcher(new URL(path, baseUrl), {
        method,
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      throw new PaymentsProviderError(error?.name === 'TimeoutError' || error?.name === 'AbortError'
        ? 'timeout'
        : 'response_error')
    }

    if (!response.ok) throw new PaymentsProviderError('response_error')
    try {
      return await response.json()
    } catch {
      throw new PaymentsProviderError('invalid_response')
    }
  }

  async function startOperation({ operationKey, type, amountCents, currency }) {
    const body = await request('POST', '/checkout/preferences', {
      idempotencyKey: operationKey,
      body: {
        external_reference: operationKey,
        items: [{
          id: type,
          title: 'Palpite League (ambiente de teste)',
          quantity: 1,
          currency_id: currency,
          // O domínio guarda centavos inteiros; a API do provedor recebe o valor em reais.
          unit_price: Number(`${Math.trunc(amountCents / 100)}.${String(amountCents % 100).padStart(2, '0')}`),
        }],
      },
    })
    const checkoutUrl = body?.sandbox_init_point
    if (typeof body?.id !== 'string' || body.id === '' || typeof checkoutUrl !== 'string' || !checkoutUrl.startsWith('https://')) {
      throw new PaymentsProviderError('invalid_response')
    }
    return {
      providerId: `mp-pref-${body.id}`,
      continuation: { kind: 'checkout', url: checkoutUrl },
    }
  }

  // Confirmada só com um pagamento aprovado; recusada só quando todos os pagamentos da referência
  // foram rejeitados ou cancelados; qualquer outra situação permanece pendente (INV-008).
  async function consultOperation({ operationKey, providerId }) {
    const path = `/v1/payments/search?external_reference=${encodeURIComponent(operationKey)}`
    const body = await request('GET', path)
    if (!Array.isArray(body?.results)) throw new PaymentsProviderError('invalid_response')
    const statuses = body.results.map((payment) => payment?.status)
    if (statuses.some((status) => typeof status !== 'string')) throw new PaymentsProviderError('invalid_response')

    let status = 'pending'
    if (statuses.includes('approved')) status = 'confirmed'
    else if (statuses.length > 0 && statuses.every((item) => item === 'rejected' || item === 'cancelled')) status = 'refused'
    return { providerId: providerId ?? null, status }
  }

  // SPEC-019 — Assinaturas do Mercado Pago em teste, sem plano associado (OPEN-87). Só é usada depois
  // dos smoke tests do sandbox aprovados pela equipe (OPEN-26); até lá a chamada falha sem rede.
  function requireSubscriptionsProof() {
    if (!subscriptionsProofApproved) throw new PaymentsProviderError('response_error')
  }

  async function startSubscription({ operationKey, amountCents, currency, payer, context }) {
    requireSubscriptionsProof()
    if (typeof payer?.email !== 'string' || payer.email === '' || !backUrl) throw new PaymentsProviderError('response_error')
    const body = await request('POST', '/preapproval', {
      idempotencyKey: operationKey,
      body: {
        reason: 'Palpite League Premium (ambiente de teste)',
        external_reference: operationKey,
        payer_email: payer.email,
        back_url: backUrl,
        status: 'pending',
        auto_recurring: {
          // Ciclo mensal ou anual (SPEC-029): o provedor cobra sozinho a cada ciclo.
          frequency: context?.billingCycle === 'annual' ? 12 : 1,
          frequency_type: 'months',
          transaction_amount: Number(`${Math.trunc(amountCents / 100)}.${String(amountCents % 100).padStart(2, '0')}`),
          currency_id: currency,
        },
      },
    })
    const checkoutUrl = body?.init_point
    if (typeof body?.id !== 'string' || body.id === '' || typeof checkoutUrl !== 'string' || !checkoutUrl.startsWith('https://')) {
      throw new PaymentsProviderError('invalid_response')
    }
    return { providerId: `mp-sub-${body.id}`, continuation: { kind: 'checkout', url: checkoutUrl } }
  }

  // Autorizada é a confirmação verificável; cancelada é a recusa; o resto permanece pendente.
  async function consultSubscription({ operationKey, providerId }) {
    requireSubscriptionsProof()
    const body = await request('GET', `/preapproval/search?external_reference=${encodeURIComponent(operationKey)}`)
    if (!Array.isArray(body?.results)) throw new PaymentsProviderError('invalid_response')
    const statuses = body.results.map((item) => item?.status)
    if (statuses.some((status) => typeof status !== 'string')) throw new PaymentsProviderError('invalid_response')

    let status = 'pending'
    if (statuses.includes('authorized')) status = 'confirmed'
    else if (statuses.length > 0 && statuses.every((item) => item === 'cancelled')) status = 'refused'
    return { providerId: providerId ?? null, status }
  }

  // SPEC-020 — cancelamento da assinatura (preapproval) no Mercado Pago em teste. A confirmação
  // verificável é a assinatura com status "cancelled" na consulta; qualquer outro status permanece
  // pendente, e a falha da chamada deixa o cancelamento pendente sem repetição automática.
  const preapprovalIdOf = (providerId, prefix) => (
    typeof providerId === 'string' && providerId.startsWith(prefix) ? providerId.slice(prefix.length) : null
  )

  async function startSubscriptionCancellation({ operationKey, context }) {
    requireSubscriptionsProof()
    const preapprovalId = preapprovalIdOf(context?.subscriptionProviderId, 'mp-sub-')
    if (!preapprovalId) throw new PaymentsProviderError('response_error')
    const body = await request('PUT', `/preapproval/${encodeURIComponent(preapprovalId)}`, {
      idempotencyKey: operationKey,
      body: { status: 'cancelled' },
    })
    if (typeof body?.id !== 'string' || body.id !== preapprovalId) throw new PaymentsProviderError('invalid_response')
    return { providerId: `mp-cancel-${preapprovalId}`, continuation: null }
  }

  async function consultSubscriptionCancellation({ providerId }) {
    requireSubscriptionsProof()
    const preapprovalId = preapprovalIdOf(providerId, 'mp-cancel-')
    if (!preapprovalId) throw new PaymentsProviderError('invalid_response')
    const body = await request('GET', `/preapproval/${encodeURIComponent(preapprovalId)}`)
    if (typeof body?.status !== 'string') throw new PaymentsProviderError('invalid_response')
    return { providerId, status: body.status === 'cancelled' ? 'confirmed' : 'pending' }
  }

  // SPEC-029 — cobrança recorrente da renovação. O Mercado Pago cobra o ciclo sozinho; o sistema só
  // registra a expectativa e consulta os pagamentos autorizados da assinatura a partir do fim do
  // período. Aprovado confirma; recusado ou cancelado (fora do reprocessamento) recusa; o resto fica pendente.
  async function startSubscriptionRenewal({ context }) {
    requireSubscriptionsProof()
    const preapprovalId = preapprovalIdOf(context?.subscriptionProviderId, 'mp-sub-')
    const periodEndsAt = Date.parse(context?.periodEndsAt ?? '')
    if (!preapprovalId || !Number.isFinite(periodEndsAt)) throw new PaymentsProviderError('response_error')
    return { providerId: `mp-renew-${Math.trunc(periodEndsAt / 1000)}-${preapprovalId}`, continuation: null }
  }

  async function consultSubscriptionRenewal({ providerId }) {
    requireSubscriptionsProof()
    const match = /^mp-renew-(\d+)-(.+)$/.exec(providerId ?? '')
    if (!match) throw new PaymentsProviderError('invalid_response')
    const periodEndsAt = Number(match[1]) * 1000
    const body = await request('GET', `/authorized_payments/search?preapproval_id=${encodeURIComponent(match[2])}`)
    if (!Array.isArray(body?.results)) throw new PaymentsProviderError('invalid_response')
    const charges = body.results.filter((item) => Date.parse(item?.date_created ?? '') >= periodEndsAt - 24 * 60 * 60 * 1000)
    let status = 'pending'
    if (charges.some((item) => item?.payment?.status === 'approved')) status = 'confirmed'
    else if (charges.length > 0 && charges.every((item) => item?.status === 'cancelled'
      || (item?.payment?.status === 'rejected' && item?.status !== 'recycling'))) status = 'refused'
    return { providerId, status }
  }

  return {
    source: 'test_provider',
    startOperation,
    consultOperation,
    startSubscription,
    consultSubscription,
    startSubscriptionCancellation,
    consultSubscriptionCancellation,
    startSubscriptionRenewal,
    consultSubscriptionRenewal,
  }
}
