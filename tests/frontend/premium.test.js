import { describe, expect, it, vi } from 'vitest'
import {
  checkPremiumSubscription,
  decideSimulatedPayment,
  fetchPremiumConditions,
  fetchSimulatedPayment,
  subscribePremium,
} from '../../src/frontend/src/premium-api.js'
import { checkResultMessage, formatDay, premiumStage, priceLabel, recurrenceLabel, stageMessage } from '../../src/frontend/src/premium-view.js'

function okFetcher(payload = {}) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => payload })
}

const conditions = (overrides = {}) => ({ priceCents: 1990, currency: 'BRL', recurrence: 'monthly', reason: null, subscription: null, ...overrides })

describe('API da contratação do Premium (SPEC-019)', () => {
  it('consulta as condições e a contratação com a sessão Bearer', async () => {
    const fetcher = okFetcher()
    await fetchPremiumConditions('opaque', { fetcher })
    expect(fetcher).toHaveBeenCalledWith('/account/premium', { method: 'GET', headers: { authorization: 'Bearer opaque' } })
  })

  it('contrata enviando só a confirmação explícita, nunca valor ou recorrência', async () => {
    const fetcher = okFetcher({ subscription: {} })
    await subscribePremium('opaque', { fetcher })
    const [url, options] = fetcher.mock.calls[0]
    expect(url).toBe('/account/premium/subscription')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ confirm: true })
  })

  it('confere no retorno do checkout e decide na página simulada', async () => {
    const check = okFetcher({ subscription: {} })
    await checkPremiumSubscription('opaque', { fetcher: check })
    expect(check.mock.calls[0][0]).toBe('/account/premium/subscription/check')
    expect(check.mock.calls[0][1].method).toBe('POST')

    const page = okFetcher({ payment: {} })
    await fetchSimulatedPayment('opaque', 'mov/1', { fetcher: page })
    expect(page.mock.calls[0][0]).toBe('/payments/simulated-checkout/mov%2F1')

    const decision = okFetcher({})
    await decideSimulatedPayment('opaque', 'mov-1', 'refuse', { fetcher: decision })
    expect(decision.mock.calls[0][0]).toBe('/payments/simulated-checkout/mov-1/decision')
    expect(JSON.parse(decision.mock.calls[0][1].body)).toEqual({ decision: 'refuse' })
  })
})

describe('Tela da contratação do Premium (SPEC-019)', () => {
  it('mostra o preço vindo do backend, em reais e por mês', () => {
    expect(priceLabel(conditions())).toBe('R$ 19,90 por mês')
    expect(priceLabel(conditions({ priceCents: 2500 }))).toBe('R$ 25,00 por mês')
    expect(recurrenceLabel('monthly')).toBe('por mês')
  })

  it('escolhe a etapa a partir da situação da contratação', () => {
    expect(premiumStage(conditions())).toBe('offer')
    expect(premiumStage(conditions({ reason: 'pending_subscription', subscription: { status: 'pending', payment: { kind: 'simulated_checkout' } } }))).toBe('pending')
    expect(premiumStage(conditions({ reason: 'pending_subscription', subscription: { status: 'pending', payment: null } }))).toBe('pending_unstarted')
    expect(premiumStage(conditions({ subscription: { status: 'refused' } }))).toBe('refused')
    expect(premiumStage(conditions({ reason: 'already_premium', subscription: { status: 'active' } }))).toBe('active')
  })

  it('informa o usuário em cada situação, sem prometer ativação antes da confirmação', () => {
    expect(stageMessage('pending')).toMatch(/só depois que o pagamento for confirmado/)
    expect(stageMessage('pending_unstarted')).toMatch(/não foi confirmada/)
    expect(stageMessage('refused')).toMatch(/continua Gratuito/)
    expect(stageMessage('active', { endsAt: '2026-12-14T15:05:00.000Z' })).toBe('Seu Premium está ativo. Vigência atual até 14/12/2026.')
    expect(checkResultMessage('active')).toMatch(/agora é Premium/)
    expect(checkResultMessage('refused')).toMatch(/continua Gratuito/)
    expect(checkResultMessage('pending')).toMatch(/não foi confirmada/)
    expect(formatDay(null)).toBe('')
  })
})
