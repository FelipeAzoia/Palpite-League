import { describe, expect, it, vi } from 'vitest'
import { fetchPrize, prizeSituation, prizeStateLabels, requestPrize } from '../../src/frontend/src/prize-api.js'

// SPEC-026 — premiação na interface.
describe('premiação (SPEC-026)', () => {
  it('consulta e solicita pelos caminhos do bolão, sem enviar valor', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    await fetchPrize('opaque', 'pool/1', { fetcher })
    await requestPrize('opaque', 'pool/1', { fetcher })
    expect(fetcher.mock.calls.map(([url, init]) => [url, init.method, init.body])).toEqual([
      ['/pools/pool%2F1/prize', 'GET', undefined],
      ['/pools/pool%2F1/prize/request', 'POST', undefined],
    ])
  })

  it('identifica a simulação, inclusive com a premiação paga', () => {
    expect(prizeSituation({ state: 'completed', payment: { simulated: true, inconsistent: false } })).toBe('Premiação paga · simulação')
    expect(prizeSituation({ state: 'processing', payment: { simulated: false, inconsistent: true } })).toMatch(/em verificação/)
    expect(prizeSituation({ state: 'available', payment: null })).toBe('Disponível para solicitar')
  })

  it('tem texto para cada estado, inclusive sem premiação a pagar', () => {
    for (const state of ['available', 'processing', 'completed', 'refused', 'waiting_refunds', 'not_winner', 'no_winner', 'nothing_to_pay']) {
      expect(prizeStateLabels[state]).toBeTruthy()
    }
  })
})
