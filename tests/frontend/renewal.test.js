import { describe, expect, it, vi } from 'vitest'
import { retryRenewalPayment } from '../../src/frontend/src/premium-api.js'
import {
  cancellationNotice,
  cancellationResultMessage,
  cycleHighlight,
  cycleName,
  premiumStage,
  priceLabel,
  retryResultMessage,
  stageMessage,
  subscriptionStatusLabel,
} from '../../src/frontend/src/premium-view.js'

const cycles = [
  { id: 'monthly', priceCents: 1990, monthlyEquivalentCents: 1990, savingsCents: 0 },
  { id: 'annual', priceCents: 19900, monthlyEquivalentCents: 1658, savingsCents: 3980 },
]

describe('Plano anual e renovação (SPEC-029)', () => {
  it('mostra os dois ciclos com os valores do backend e o destaque do anual', () => {
    const conditions = { priceCents: 1990, recurrence: 'monthly', cycles }
    expect(priceLabel(conditions, 'monthly')).toBe('R$ 19,90 por mês')
    expect(priceLabel(conditions, 'annual')).toBe('R$ 199,00 por ano')
    expect(priceLabel(conditions)).toBe('R$ 19,90 por mês')
    expect(cycleHighlight(cycles[1])).toBe('R$ 16,58 por mês · economia de R$ 39,80 (2 meses grátis)')
    expect(cycleHighlight(cycles[0])).toBe('')
    expect(cycleName('annual')).toBe('Anual')
    expect(cycleName('monthly')).toBe('Mensal')
  })

  it('reconhece a renovação pendente e a renovação cancelada', () => {
    expect(premiumStage({ reason: 'already_premium', subscription: { status: 'past_due' } })).toBe('past_due')
    expect(premiumStage({ reason: 'already_premium', subscription: { status: 'non_renewing' } })).toBe('non_renewing')
    expect(subscriptionStatusLabel('past_due')).toBe('Pagamento da renovação pendente')
    expect(subscriptionStatusLabel('non_renewing')).toBe('Renovação cancelada')
  })

  it('explica a próxima cobrança, a carência e o fim do Premium', () => {
    expect(stageMessage('active', { nextChargeAt: '2026-12-14T15:00:00.000Z' })).toMatch(/renovado automaticamente em 14\/12\/2026/)
    expect(stageMessage('past_due', { graceEndsAt: '2026-12-17T15:00:00.000Z' })).toMatch(/continua até 17\/12\/2026.*regularize/)
    expect(stageMessage('non_renewing', { premiumUntil: '2026-12-14T15:00:00.000Z' })).toMatch(/não haverá novas cobranças.*vale até 14\/12\/2026/)
  })

  it('o cancelamento confirmado mantém o Premium até o fim do período', () => {
    expect(cancellationResultMessage('non_renewing', { premiumUntil: '2026-12-14T15:00:00.000Z' })).toMatch(/vale até 14\/12\/2026/)
    const notice = cancellationNotice.join(' ')
    expect(notice).toMatch(/Nenhuma cobrança nova/)
    expect(notice).toMatch(/continua até o fim do período já pago/)
    expect(notice).toMatch(/Não há reembolso/)
  })

  it('pede nova tentativa de pagamento sem enviar nenhum dado', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ subscription: {} }) })
    await retryRenewalPayment('opaque', { fetcher })
    expect(fetcher).toHaveBeenCalledWith('/account/subscription/renewal/retry', { method: 'POST', headers: { authorization: 'Bearer opaque' } })
    expect(retryResultMessage('active')).toMatch(/renovada/)
    expect(retryResultMessage('past_due')).toMatch(/ainda não foi confirmado/)
  })
})
