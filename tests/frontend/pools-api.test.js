import { describe, expect, it, vi } from 'vitest'
import { createPool, fetchCreationAvailability, fetchPoolRules, fetchPools } from '../../src/frontend/src/pools-api.js'
import {
  buildPoolRequest,
  formatBrl,
  formatDay,
  todayInSaoPaulo,
  toggleValue,
} from '../../src/frontend/src/pools-form.js'

function okFetcher(payload = {}) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => payload })
}

describe('API de bolões (SPEC-007)', () => {
  it('usa a sessão Bearer e os caminhos esperados', async () => {
    for (const [call, args, path, method] of [
      [fetchCreationAvailability, [], '/pools/creation-availability', 'GET'],
      [fetchPools, [], '/pools', 'GET'],
      [fetchPoolRules, ['abc/def'], '/pools/abc%2Fdef', 'GET'],
    ]) {
      const fetcher = okFetcher()
      await call('opaque-token', ...args, { fetcher })
      expect(fetcher).toHaveBeenCalledWith(path, { method, headers: { authorization: 'Bearer opaque-token' } })
    }
  })

  it('cria o bolão com POST e o corpo montado pelo formulário', async () => {
    const fetcher = okFetcher({ pool: {} })
    const body = { name: 'Bolão' }

    await createPool('opaque-token', body, { fetcher })

    const [url, options] = fetcher.mock.calls[0]
    expect(url).toBe('/pools')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual(body)
  })

  it('preserva campos e detalhes do erro de limite para a interface', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ type: 'pool_limit_reached', message: 'Limite atingido.', details: { limit: 1, guidance: 'Conheça o Premium.' } }),
    })

    const error = await createPool('x', {}, { fetcher }).catch((caught) => caught)

    expect(error.status).toBe(409)
    expect(error.type).toBe('pool_limit_reached')
    expect(error.details).toEqual({ limit: 1, guidance: 'Conheça o Premium.' })
  })
})

describe('formulário de bolão', () => {
  it('monta o corpo da criação com taxa normalizada e seleção ordenada', () => {
    const request = buildPoolRequest({
      name: 'Bolão da Turma',
      startsOn: '2026-11-13',
      endsOn: '2026-12-31',
      entryFee: ' 25,5 ',
      prizeModel: 'winner_takes_all',
      tiebreaker: 'exact_scores',
      matchIds: ['b', 'a'],
      roundNumbers: [3, 1, 2],
    })

    expect(request).toEqual({
      name: 'Bolão da Turma',
      startsOn: '2026-11-13',
      endsOn: '2026-12-31',
      entryFee: '25.5',
      prizeModel: 'winner_takes_all',
      tiebreaker: 'exact_scores',
      selection: { matchIds: ['b', 'a'], roundNumbers: [1, 2, 3] },
    })
  })

  it('alterna valores sem alterar a lista original', () => {
    const original = [1, 2]

    expect(toggleValue(original, 3)).toEqual([1, 2, 3])
    expect(toggleValue(original, 2)).toEqual([1])
    expect(original).toEqual([1, 2])
  })

  it('formata valores e datas e calcula o dia em São Paulo', () => {
    expect(formatBrl('25.00')).toBe('R$ 25,00')
    expect(formatDay('2026-11-13')).toBe('13/11/2026')
    expect(todayInSaoPaulo(new Date('2026-11-14T01:30:00Z'))).toBe('2026-11-13')
  })
})
