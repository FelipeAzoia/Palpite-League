import { describe, expect, it, vi } from 'vitest'
import { fetchMyPoints, pointsLabel, predictionSummary } from '../../src/frontend/src/points-api.js'

const match = { home: { name: 'Flamengo' }, away: { name: 'Palmeiras' } }

describe('API de pontos (SPEC-014)', () => {
  it('consulta os próprios pontos com a sessão Bearer e o caminho esperado', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    await fetchMyPoints('opaque', 'pool/1', { fetcher })
    expect(fetcher).toHaveBeenCalledWith('/pools/pool%2F1/points', { method: 'GET', headers: { authorization: 'Bearer opaque' } })
  })

  it('distingue pontos vazios de zero', () => {
    expect(pointsLabel(null)).toBe('Aguardando pontuação')
    expect(pointsLabel(0)).toBe('0 pontos')
    expect(pointsLabel(5)).toBe('5 pontos')
  })

  it('resume o palpite da partida', () => {
    expect(predictionSummary({ ...match, prediction: null })).toBe('Você não palpitou nesta partida')
    expect(predictionSummary({ ...match, prediction: { type: 'exact_score', homeGoals: 2, awayGoals: 1 } })).toBe('Placar: Flamengo 2 × 1 Palmeiras')
  })
})
