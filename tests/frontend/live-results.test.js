import { describe, expect, it, vi } from 'vitest'
import { fetchPoolLive, liveNotice, liveStateFor } from '../../src/frontend/src/results-api.js'

// SPEC-021 — apresentação dos dados ao vivo na aba de resultados.
describe('resultados ao vivo (SPEC-021)', () => {
  const live = {
    available: true,
    matches: [
      { id: 'a', status: 'in_progress', score: { home: 1, away: 0 }, official: false, hasData: true, updatedAt: '2026-11-23T22:05:00.000Z' },
      { id: 'b', status: 'in_progress', score: null, official: false, hasData: false, updatedAt: null },
    ],
  }

  it('consulta os dados ao vivo com a sessão Bearer e o caminho esperado', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    await fetchPoolLive('opaque', 'pool/1', { fetcher })
    expect(fetcher).toHaveBeenCalledWith('/pools/pool%2F1/live', { method: 'GET', headers: { authorization: 'Bearer opaque' } })
  })

  it('rotula o placar parcial como não oficial, com o horário da última atualização', () => {
    expect(liveStateFor({ id: 'a', status: 'in_progress' }, live)).toEqual({
      status: 'in_progress',
      score: { home: 1, away: 0 },
      caption: ['Parcial, não oficial', 'atualizado às 19:05'],
    })
  })

  it('indica a ausência de dados sem inventar placar', () => {
    expect(liveStateFor({ id: 'b', status: 'in_progress' }, live)).toEqual({
      status: 'in_progress', score: null, caption: ['Sem dados ao vivo', 'no momento'],
    })
    const noScore = { available: true, matches: [{ id: 'd', status: 'in_progress', score: null, hasData: true, updatedAt: '2026-11-23T22:05:00.000Z' }] }
    expect(liveStateFor({ id: 'd', status: 'in_progress' }, noScore).caption).toEqual(['atualizado às 19:05'])
  })

  it('o resultado oficial prevalece e bolão sem o recurso não mostra nada ao vivo', () => {
    expect(liveStateFor({ id: 'a', status: 'finished' }, live)).toBeNull()
    expect(liveStateFor({ id: 'a', status: 'in_progress' }, { available: false, matches: [] })).toBeNull()
    expect(liveStateFor({ id: 'c', status: 'in_progress' }, live)).toBeNull()
  })

  it('avisa que o recurso não está disponível só quando há partida em andamento', () => {
    const playing = [{ matches: [{ status: 'in_progress' }] }]
    const idle = [{ matches: [{ status: 'scheduled' }] }]
    expect(liveNotice({ available: false, reason: 'not_enabled', matches: [] }, playing)).toMatch(/não estão disponíveis/)
    expect(liveNotice({ available: false, reason: 'not_enabled', matches: [] }, idle)).toBeNull()
    expect(liveNotice(live, playing)).toBeNull()
  })
})
