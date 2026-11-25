import { describe, expect, it, vi } from 'vitest'
import { fetchApiFootball2024, fetchShowcaseStatus, fetchTeams } from '../../src/frontend/src/match-catalog-api.js'
import { buildSelection, matchesForTeams, selectionModes, selectionSummary, showcaseScore } from '../../src/frontend/src/pool-selection.js'
import { buildPoolRequest } from '../../src/frontend/src/pools-form.js'

// SPEC-031 — escolha de partidas por modo e por times (TC-08).
describe('Escolha das partidas do bolão (SPEC-031)', () => {
  it('oferece os três modos', () => {
    expect(selectionModes.map(({ id }) => id)).toEqual(['all_in_period', 'rounds', 'matches'])
  })

  it('monta o pedido só com o que vale no modo escolhido', () => {
    const base = { roundNumbers: [3, 1], matchIds: ['m1'], teamIds: ['t1'] }
    expect(buildSelection({ ...base, selectionMode: 'all_in_period' })).toEqual({ mode: 'all_in_period', teamIds: ['t1'] })
    expect(buildSelection({ ...base, selectionMode: 'rounds' })).toEqual({ mode: 'rounds', roundNumbers: [1, 3], teamIds: ['t1'] })
    expect(buildSelection({ ...base, selectionMode: 'matches' })).toEqual({ mode: 'matches', matchIds: ['m1'] })
    expect(buildSelection({ ...base, teamIds: [], selectionMode: 'all_in_period' })).toEqual({ mode: 'all_in_period' })
    expect(buildPoolRequest({ name: 'B', startsOn: '', endsOn: '', entryFeeCents: 0, prizeModel: 'x', tiebreaker: 'y', ...base, selectionMode: 'rounds' }).selection)
      .toEqual({ mode: 'rounds', roundNumbers: [1, 3], teamIds: ['t1'] })
  })

  it('o filtro de times mostra os jogos em que ao menos um time escolhido joga', () => {
    const matches = [
      { id: 'a', home: { id: 'fla' }, away: { id: 'pal' } },
      { id: 'b', home: { id: 'cor' }, away: { id: 'fla' } },
      { id: 'c', home: { id: 'cor' }, away: { id: 'sao' } },
    ]
    expect(matchesForTeams(matches, ['fla']).map(({ id }) => id)).toEqual(['a', 'b'])
    expect(matchesForTeams(matches, []).length).toBe(3)
  })

  it('resume o que vai entrar no bolão', () => {
    expect(selectionSummary({ selectionMode: 'all_in_period', startsOn: '2026-11-24', endsOn: '2026-12-31' }, ['Flamengo']))
      .toBe('Todos os jogos agendados de 24/11/2026 a 31/12/2026 em que Flamengo joga.')
    expect(selectionSummary({ selectionMode: 'all_in_period', startsOn: '2026-11-24', endsOn: '' })).toMatch(/Informe o início e o fim/)
    expect(selectionSummary({ selectionMode: 'rounds', roundNumbers: [5, 2, 3] }, ['Flamengo', 'Palmeiras', 'Bahia']))
      .toBe('Rodadas 2, 3 e 5: jogos agendados em que Flamengo, Palmeiras ou Bahia jogam.')
    expect(selectionSummary({ selectionMode: 'matches', matchIds: ['a', 'b'] })).toBe('2 jogos escolhidos.')
  })
})

describe('Consulta da API-Football 2024 (SPEC-031)', () => {
  it('consulta times, a situação e os dados de 2024 com a sessão Bearer', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    await fetchTeams('opaque', { fetcher })
    await fetchShowcaseStatus('opaque', { fetcher })
    await fetchApiFootball2024('opaque', { fetcher })
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/catalog/teams', '/catalog/showcase', '/catalog/showcase/api-football-2024'])
    expect(fetcher.mock.calls[0][1].headers.authorization).toBe('Bearer opaque')
  })

  it('mostra o placar final', () => {
    expect(showcaseScore({ home: { score: 2 }, away: { score: 0 } })).toBe('2 × 0')
    expect(showcaseScore({ home: { score: null }, away: { score: null } })).toBe('×')
  })
})
