import { describe, expect, it, vi } from 'vitest'
import { fetchPoolMedals, medalCountLabel, winnersLabel } from '../../src/frontend/src/medals-api.js'

describe('API de medalhas (SPEC-016)', () => {
  it('consulta as medalhas com a sessão Bearer e o caminho esperado', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    await fetchPoolMedals('opaque', 'pool/1', { fetcher })
    expect(fetcher).toHaveBeenCalledWith('/pools/pool%2F1/medals', { method: 'GET', headers: { authorization: 'Bearer opaque' } })
  })

  it('descreve os melhores da rodada, inclusive empates e rodada sem medalha', () => {
    expect(winnersLabel({ winners: [] })).toBe('Sem medalha nesta rodada (ninguém pontuou)')
    expect(winnersLabel({ winners: [{ name: 'Ana', points: 7 }, { name: 'Bruno', points: 7 }] })).toBe('Ana, Bruno · 7 pts')
  })

  it('conta as medalhas', () => {
    expect(medalCountLabel(1)).toBe('1 medalha')
    expect(medalCountLabel(3)).toBe('3 medalhas')
  })
})
