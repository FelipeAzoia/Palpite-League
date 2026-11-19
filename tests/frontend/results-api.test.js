import { describe, expect, it, vi } from 'vitest'
import { describeResult, fetchPoolResults, syncNotice } from '../../src/frontend/src/results-api.js'

describe('API de resultados (SPEC-013)', () => {
  it('consulta os resultados com a sessão Bearer e o caminho esperado', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    await fetchPoolResults('opaque', 'pool/1', { fetcher })
    expect(fetcher).toHaveBeenCalledWith('/pools/pool%2F1/results', { method: 'GET', headers: { authorization: 'Bearer opaque' } })
  })

  it('mostra o placar só de partida encerrada', () => {
    expect(describeResult({ status: 'finished', score: { home: 2, away: 1 } })).toBe('2 × 1')
    expect(describeResult({ status: 'finished', score: null })).toBe('Placar indisponível')
    expect(describeResult({ status: 'in_progress', score: null })).toBe('–')
  })

  it('indica a situação da última sincronização', () => {
    expect(syncNotice({ lastAttemptAt: null }).text).toMatch(/ainda não foram sincronizados/)
    const ok = syncNotice({ lastAttemptAt: '2026-11-23T22:00:00.000Z', lastSuccessAt: '2026-11-23T22:00:00.000Z', lastAttemptFailed: false })
    expect(ok).toEqual({ failed: false, text: 'Resultados atualizados em 23/11/2026, 19:00.' })
    const failed = syncNotice({ lastAttemptAt: '2026-11-23T22:10:00.000Z', lastSuccessAt: '2026-11-23T22:00:00.000Z', lastAttemptFailed: true })
    expect(failed.failed).toBe(true)
    expect(failed.text).toMatch(/falhou.*23\/11\/2026, 19:00/)
  })
})
