import { describe, expect, it, vi } from 'vitest'
import { decideRequest, decisionMessage, fetchPendingRequests } from '../../src/frontend/src/requests-api.js'

function okFetcher(payload = {}) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => payload })
}

describe('API de solicitações de entrada (SPEC-010)', () => {
  it('lista e decide com a sessão Bearer e os caminhos esperados', async () => {
    const list = okFetcher()
    const approve = okFetcher()
    const reject = okFetcher()

    await fetchPendingRequests('opaque', 'pool/1', { fetcher: list })
    await decideRequest('opaque', 'pool/1', 'part 2', 'approve', { fetcher: approve })
    await decideRequest('opaque', 'pool/1', 'part 2', 'reject', { fetcher: reject })

    expect(list).toHaveBeenCalledWith('/pools/pool%2F1/requests', { method: 'GET', headers: { authorization: 'Bearer opaque' } })
    expect(approve).toHaveBeenCalledWith('/pools/pool%2F1/requests/part%202/approve', { method: 'POST', headers: { authorization: 'Bearer opaque' } })
    expect(reject).toHaveBeenCalledWith('/pools/pool%2F1/requests/part%202/reject', { method: 'POST', headers: { authorization: 'Bearer opaque' } })
  })

  it('recusa decisões desconhecidas antes de chamar o servidor', () => {
    expect(() => decideRequest('x', 'p', 'r', 'delete')).toThrow(TypeError)
  })

  it('descreve o resultado de cada decisão', () => {
    expect(decisionMessage({ status: 'confirmed', lateEntry: false })).toBe('Participação confirmada.')
    expect(decisionMessage({ status: 'confirmed', lateEntry: true })).toMatch(/já começaram/)
    expect(decisionMessage({ status: 'approved_awaiting_payment' })).toMatch(/pagamento/)
    expect(decisionMessage({ status: 'rejected' })).toBe('Solicitação rejeitada.')
  })
})
