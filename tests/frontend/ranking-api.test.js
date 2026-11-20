import { describe, expect, it, vi } from 'vitest'
import { fetchPerformance, fetchRanking, positionLabel, roundSummary } from '../../src/frontend/src/ranking-api.js'

describe('API de ranking (SPEC-015)', () => {
  it('consulta ranking e desempenho com a sessão Bearer e os caminhos esperados', async () => {
    const ranking = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    const performance = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    await fetchRanking('opaque', 'pool/1', { fetcher: ranking })
    await fetchPerformance('opaque', 'pool/1', { fetcher: performance })
    expect(ranking).toHaveBeenCalledWith('/pools/pool%2F1/ranking', { method: 'GET', headers: { authorization: 'Bearer opaque' } })
    expect(performance).toHaveBeenCalledWith('/pools/pool%2F1/performance', { method: 'GET', headers: { authorization: 'Bearer opaque' } })
  })

  it('indica empate na posição', () => {
    const participants = [{ position: 1 }, { position: 1 }, { position: 3 }]
    expect(positionLabel(participants[0], participants)).toBe('1º (empate)')
    expect(positionLabel(participants[2], participants)).toBe('3º')
  })

  it('resume o desempenho da rodada', () => {
    expect(roundSummary({ points: 8, hits: 4, predictions: 4, finishedMatches: 4, totalMatches: 4, closed: true }))
      .toBe('8 pontos · 4 de 4 palpites certos · encerrada')
    expect(roundSummary({ points: 1, hits: 0, predictions: 2, finishedMatches: 1, totalMatches: 3, closed: false }))
      .toBe('1 ponto · 0 de 2 palpites certos · 1 de 3 partidas encerradas')
  })
})
