import { describe, expect, it, vi } from 'vitest'
import {
  describePrediction,
  draftFrom,
  fetchPredictionMatches,
  predictionBody,
  savePrediction,
} from '../../src/frontend/src/predictions-api.js'

function okFetcher(payload = {}) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => payload })
}

const match = { home: { name: 'Flamengo' }, away: { name: 'Palmeiras' } }

describe('API de palpites (SPEC-012)', () => {
  it('consulta as partidas e grava o palpite com a sessão Bearer e os caminhos esperados', async () => {
    const list = okFetcher()
    const save = okFetcher()

    await fetchPredictionMatches('opaque', 'pool/1', { fetcher: list })
    await savePrediction('opaque', 'pool/1', 'match 2', { type: 'result', outcome: 'draw' }, { fetcher: save })

    expect(list).toHaveBeenCalledWith('/pools/pool%2F1/predictions', { method: 'GET', headers: { authorization: 'Bearer opaque' } })
    expect(save).toHaveBeenCalledWith('/pools/pool%2F1/matches/match%202/prediction', {
      method: 'PUT',
      headers: { authorization: 'Bearer opaque', 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'result', outcome: 'draw' }),
    })
  })

  it('envia só os campos da modalidade escolhida', () => {
    expect(predictionBody({ type: 'result', outcome: 'home', homeGoals: '2', awayGoals: '1' })).toEqual({ type: 'result', outcome: 'home' })
    expect(predictionBody({ type: 'exact_score', outcome: 'home', homeGoals: '2', awayGoals: ' 0 ' })).toEqual({ type: 'exact_score', homeGoals: 2, awayGoals: 0 })
    // Valores inválidos seguem como estão para o backend apontar o campo (INV-015).
    expect(predictionBody({ type: 'exact_score', homeGoals: '1.5', awayGoals: '' })).toEqual({ type: 'exact_score', homeGoals: '1.5', awayGoals: undefined })
    expect(predictionBody({ type: 'result', outcome: '' })).toEqual({ type: 'result', outcome: undefined })
  })

  it('preenche o formulário a partir do palpite gravado', () => {
    expect(draftFrom(null)).toEqual({ type: 'result', outcome: '', homeGoals: '', awayGoals: '' })
    expect(draftFrom({ type: 'result', outcome: 'away' })).toEqual({ type: 'result', outcome: 'away', homeGoals: '', awayGoals: '' })
    expect(draftFrom({ type: 'exact_score', homeGoals: 3, awayGoals: 0 })).toEqual({ type: 'exact_score', outcome: '', homeGoals: '3', awayGoals: '0' })
  })

  it('descreve o palpite próprio', () => {
    expect(describePrediction(null, match)).toBe('Sem palpite')
    expect(describePrediction({ type: 'result', outcome: 'draw' }, match)).toBe('Resultado: Empate')
    expect(describePrediction({ type: 'exact_score', homeGoals: 2, awayGoals: 1 }, match)).toBe('Placar: Flamengo 2 × 1 Palmeiras')
  })
})
