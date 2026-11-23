import { PaymentsProviderError } from '../modules/payments-subscriptions/payments-provider.js'

// SPEC-018 — adaptador do Mercado Pago em ambiente de teste (ADR-0003, RNF15).
// - só aceita credenciais de teste (prefixo TEST-); a chave vem da configuração, nunca do repositório,
//   e nunca aparece em respostas, registros técnicos ou auditoria (INV-011);
// - cliente HTTP isolado, com tempo limite e erros classificados; nenhuma chamada é repetida
//   automaticamente (INV-007);
// - a operação genérica inicia um checkout com a chave de operação como referência externa e como
//   chave de idempotência, e a consulta procura os pagamentos dessa referência.
// A integração real só é considerada atendida depois dos smoke tests do sandbox (OPEN-26), feitos
// nas Specs 019, 022, 024 e 026; até lá o provedor padrão é o simulador.

const apiBaseUrl = 'https://api.mercadopago.com'

export function createMercadoPagoTestPaymentsProvider({
  accessToken,
  timeoutMs = 10000,
  fetcher = fetch,
  baseUrl = apiBaseUrl,
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('payments provider timeout must be positive')
  if (accessToken !== undefined && accessToken !== '' && !String(accessToken).startsWith('TEST-')) {
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

  return { source: 'test_provider', startOperation, consultOperation }
}
