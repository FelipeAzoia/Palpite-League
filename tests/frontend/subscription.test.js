import { describe, expect, it, vi } from 'vitest'
import { openMovementsSummary, movementTypeLabel } from '../../src/frontend/src/financial-view.js'
import {
  checkSubscriptionCancellation,
  fetchSubscription,
  requestSubscriptionCancellation,
} from '../../src/frontend/src/premium-api.js'
import {
  cancellationNotice,
  cancellationResultMessage,
  formatUtc,
  premiumStage,
  stageMessage,
  subscriptionStatusLabel,
} from '../../src/frontend/src/premium-view.js'

const okFetcher = (payload = {}) => vi.fn().mockResolvedValue({ ok: true, json: async () => payload })

describe('API da assinatura (SPEC-020)', () => {
  it('consulta a assinatura com a sessão Bearer', async () => {
    const fetcher = okFetcher()
    await fetchSubscription('opaque', { fetcher })
    expect(fetcher).toHaveBeenCalledWith('/account/subscription', { method: 'GET', headers: { authorization: 'Bearer opaque' } })
  })

  it('pede o cancelamento enviando só a confirmação explícita e confere depois', async () => {
    const cancel = okFetcher({ subscription: {} })
    await requestSubscriptionCancellation('opaque', { fetcher: cancel })
    expect(cancel.mock.calls[0][0]).toBe('/account/subscription/cancellation')
    expect(cancel.mock.calls[0][1].method).toBe('POST')
    expect(JSON.parse(cancel.mock.calls[0][1].body)).toEqual({ confirm: true })

    const check = okFetcher({ subscription: {} })
    await checkSubscriptionCancellation('opaque', { fetcher: check })
    expect(check.mock.calls[0][0]).toBe('/account/subscription/cancellation/check')
  })
})

describe('Tela da assinatura (SPEC-020)', () => {
  const conditions = (subscription, reason = null) => ({ reason, subscription })

  it('escolhe a etapa pelo estado vindo do backend', () => {
    expect(premiumStage(conditions({ status: 'active' }, 'already_premium'))).toBe('active')
    expect(premiumStage(conditions({ status: 'cancellation_pending' }, 'already_premium'))).toBe('cancellation_pending')
    expect(premiumStage(conditions({ status: 'cancelled' }))).toBe('ended')
    expect(premiumStage(conditions({ status: 'expired' }))).toBe('ended')
  })

  it('nunca chama de cancelada uma assinatura com cancelamento pendente', () => {
    expect(subscriptionStatusLabel('cancellation_pending')).toBe('Cancelamento aguardando confirmação')
    expect(subscriptionStatusLabel('cancelled')).toBe('Cancelada')
    expect(subscriptionStatusLabel('expired')).toBe('Expirada')
    expect(subscriptionStatusLabel('active')).toBe('Ativa')
    expect(stageMessage('cancellation_pending')).toMatch(/aguarda a confirmação/)
    expect(stageMessage('cancellation_pending')).toMatch(/Premium continua valendo/)
    expect(cancellationResultMessage('cancellation_pending')).toMatch(/aguarda a confirmação/)
    expect(cancellationResultMessage('cancelled')).toMatch(/voltou ao plano Gratuito/)
    expect(cancellationResultMessage('active')).toMatch(/recusado/)
  })

  it('mostra o fim da assinatura com a data e os bolões preservados', () => {
    expect(stageMessage('ended', { status: 'cancelled', endedAt: '2026-11-20T12:00:00.000Z' })).toMatch(/cancelada em 20\/11\/2026.*bolões continuam/)
    expect(stageMessage('ended', { status: 'expired', endedAt: '2026-12-14T15:00:00.000Z' })).toMatch(/expirou em 14\/12\/2026/)
  })

  it('exibe as datas da vigência em UTC', () => {
    expect(formatUtc('2026-12-14T15:05:00.000Z')).toBe('14/12/2026, 15:05 UTC')
    expect(formatUtc(null)).toBe('')
  })

  it('o aviso fixo fala de reembolso, retorno ao Gratuito e bolões preservados', () => {
    const text = cancellationNotice.join(' ')
    expect(text).toMatch(/Não há reembolso/)
    expect(text).toMatch(/plano Gratuito/)
    expect(text).toMatch(/bolões, participações, palpites e medalhas continuam/)
  })

  it('o cancelamento aparece no histórico, mas não como pagamento em aberto no Perfil', () => {
    expect(movementTypeLabel('subscription_cancellation')).toBe('Cancelamento da assinatura')
    expect(openMovementsSummary([{ type: 'subscription_cancellation', status: 'pending', amountCents: 0 }])).toEqual({ count: 0, label: 'Nada em aberto' })
  })
})
