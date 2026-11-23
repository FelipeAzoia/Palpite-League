import { describe, expect, it, vi } from 'vitest'
import { fetchFinancialHistory, isSessionRejected } from '../../src/frontend/src/account-api.js'
import {
  formatBrl,
  formatMovementDate,
  movementStatusLabel,
  movementTypeLabel,
  originBadge,
  testEnvironmentNotice,
} from '../../src/frontend/src/financial-view.js'

describe('Histórico financeiro (SPEC-018)', () => {
  it('consulta o histórico próprio com a sessão Bearer, sem indicar usuário nem filtros', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ environment: 'test', movements: [] }) })

    await fetchFinancialHistory('opaque-token', { fetcher })

    expect(fetcher).toHaveBeenCalledWith('/account/financial-history', { method: 'GET', headers: { authorization: 'Bearer opaque-token' } })
  })

  it('leva ao login quando a sessão é rejeitada', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ type: 'session_rejected', message: 'Sessão inválida.' }) })

    const error = await fetchFinancialHistory('x', { fetcher }).catch((caught) => caught)

    expect(isSessionRejected(error)).toBe(true)
  })

  it('formata centavos inteiros em reais sem erro de ponto flutuante', () => {
    expect(formatBrl(10 + 20)).toBe('R$ 0,30')
    expect(formatBrl(2990)).toBe('R$ 29,90')
    expect(formatBrl(123456789)).toBe('R$ 1.234.567,89')
    expect(formatBrl(5)).toBe('R$ 0,05')
    expect(formatBrl(0.3)).toBe('R$ —')
  })

  it('identifica a origem: a simulação nunca aparece como confirmação do provedor', () => {
    expect(originBadge({ origin: 'simulator', status: 'confirmed' })).toBe('Simulação')
    expect(originBadge({ origin: 'test_provider', status: 'confirmed' })).toBe('Provedor de teste')
  })

  it('exibe tipos, estados, data em horário de Brasília e o aviso permanente de ambiente de teste', () => {
    expect(movementTypeLabel('entry_fee')).toBe('Taxa de entrada')
    expect(movementTypeLabel('subscription')).toBe('Assinatura')
    expect(movementTypeLabel('refund')).toBe('Devolução')
    expect(movementTypeLabel('payout')).toBe('Premiação')
    expect(movementStatusLabel('pending')).toBe('Pendente')
    expect(movementStatusLabel('confirmed')).toBe('Confirmada')
    expect(movementStatusLabel('refused')).toBe('Recusada')
    expect(formatMovementDate('2026-11-14T15:00:00.000Z')).toMatch(/14\/11\/2026.*12:00/)
    expect(testEnvironmentNotice).toMatch(/teste/)
    expect(testEnvironmentNotice).toMatch(/dinheiro real/)
    expect(testEnvironmentNotice).toMatch(/comprovante/)
  })
})
