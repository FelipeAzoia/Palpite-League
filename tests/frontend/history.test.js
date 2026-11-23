import { describe, expect, it, vi } from 'vitest'
import { fetchHistory, fetchLeftPools, matchPointsLabel, summaryHeadline } from '../../src/frontend/src/history-api.js'

// SPEC-028 — histórico do bolão na interface.
describe('histórico (SPEC-028)', () => {
  it('consulta com filtro e paginação, e lista os bolões deixados', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    await fetchHistory('opaque', 'pool/1', {}, { fetcher })
    await fetchHistory('opaque', 'pool/1', { round: 3, page: 2, pageSize: 5 }, { fetcher })
    await fetchLeftPools('opaque', { fetcher })
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/pools/pool%2F1/history',
      '/pools/pool%2F1/history?round=3&page=2&pageSize=5',
      '/account/left-pools',
    ])
  })

  it('pontos só aparecem com resultado oficial', () => {
    expect(matchPointsLabel({ points: null })).toBe('—')
    expect(matchPointsLabel({ points: 0 })).toBe('0 pts')
    expect(matchPointsLabel({ points: 5 })).toBe('5 pts')
  })

  it('resumo mostra a posição atual, a final congelada ou a saída', () => {
    expect(summaryHeadline({ final: false, position: 2, participants: 5 })).toBe('2º de 5 agora')
    expect(summaryHeadline({ final: true, position: 1, participants: 5, winner: true })).toBe('Vencedor · 1º de 5 no resultado final')
    expect(summaryHeadline({ final: false, position: null })).toBe('Você saiu deste bolão')
  })
})
