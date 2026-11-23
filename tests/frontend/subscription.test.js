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

describe('Política de Cobrança e Cancelamento (alterações de 23/11/2026)', () => {
  it('tem a mesma versão que o backend exige na contratação', async () => {
    const { billingPolicyVersion } = await import('../../src/frontend/src/billing-policy.js')
    const backend = await import('../../src/backend/modules/payments-subscriptions/premium-subscription.js')
    expect(billingPolicyVersion).toBe(backend.billingPolicyVersion)
  })

  it('explica cobrança, vigência sem renovação, cancelamento, reembolso, bolões e dados de pagamento', async () => {
    const { billingPolicySections } = await import('../../src/frontend/src/billing-policy.js')
    const text = billingPolicySections.flatMap(({ title, items }) => [title, ...items]).join(' ')
    for (const fragment of [
      'R$ 19,90 por mês', 'uma única vez', 'só é ativado depois que o provedor confirma', 'não há renovação automática',
      'no máximo 1 bolão em andamento', 'deixa de ter resultados ao vivo', 'Não há reembolso', 'não pede nem guarda dados de cartão',
    ]) {
      expect(text).toContain(fragment)
    }
  })

  it('bloqueia o cancelamento com mais de 1 bolão em andamento e avisa sobre o ao vivo', async () => {
    const { cancellationBlockedMessage } = await import('../../src/frontend/src/premium-view.js')
    expect(cancellationBlockedMessage(0)).toBe('')
    expect(cancellationBlockedMessage(1)).toBe('')
    expect(cancellationBlockedMessage(3)).toMatch(/no máximo 1 bolão em andamento.*Hoje você tem 3/)
    expect(cancellationNotice.join(' ')).toMatch(/deixa de ter resultados ao vivo/)
  })
})
