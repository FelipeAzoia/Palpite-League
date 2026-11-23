import { describe, expect, it, vi } from 'vitest'
import { fetchFinalResult, formatEndedAt, winnersHeadline } from '../../src/frontend/src/final-result-api.js'

// SPEC-025 — resultado final na interface.
describe('resultado final (SPEC-025)', () => {
  it('consulta o resultado final do bolão, somente leitura', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    await fetchFinalResult('opaque', 'pool/1', { fetcher })
    expect(fetcher).toHaveBeenCalledWith('/pools/pool%2F1/final-result', { method: 'GET', headers: { authorization: 'Bearer opaque' } })
  })

  it('anuncia vencedor único, co-vencedores e a ausência de vencedor', () => {
    const row = (name, winner) => ({ name, winner })
    expect(winnersHeadline({ standings: [row('Bruno', true), row('Caio', false)] })).toBe('Vencedor: Bruno')
    expect(winnersHeadline({ standings: [row('Ana', true), row('Bruno', true), row('Caio', true)] })).toBe('Co-vencedores: Ana, Bruno e Caio')
    expect(winnersHeadline({ standings: [row('Ana', false)], noWinnerReason: 'zero_points' })).toMatch(/ninguém pontuou/)
    expect(winnersHeadline({ standings: [], noWinnerReason: 'no_eligible' })).toMatch(/nenhum participante confirmado/)
  })

  it('mostra o instante do encerramento no horário de Brasília', () => {
    expect(formatEndedAt('2027-01-01T00:00:00.000Z')).toBe('31/12/2026, 21:00')
  })
})
