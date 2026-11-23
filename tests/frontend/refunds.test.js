import { describe, expect, it, vi } from 'vitest'
import {
  decideRefund,
  fetchOwnRefunds,
  fetchPendingRefunds,
  refundDecisionMessage,
  refundStatusLabels,
  requestRefund,
} from '../../src/frontend/src/refunds-api.js'

// SPEC-023 — pedidos de devolução na interface.
describe('devoluções (SPEC-023)', () => {
  it('usa os caminhos esperados e nunca envia valor', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    await fetchOwnRefunds('opaque', { fetcher })
    await requestRefund('opaque', 'pool/1', { fetcher })
    await fetchPendingRefunds('opaque', 'pool/1', { fetcher })
    await decideRefund('opaque', 'pool/1', 'r/1', 'approve', { fetcher })
    expect(fetcher.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      ['/account/refund-requests', 'GET'],
      ['/pools/pool%2F1/refund-request', 'POST'],
      ['/pools/pool%2F1/refund-requests', 'GET'],
      ['/pools/pool%2F1/refund-requests/r%2F1/approve', 'POST'],
    ])
    expect(fetcher.mock.calls.every(([, init]) => init.body === undefined)).toBe(true)
    expect(() => decideRefund('opaque', 'p', 'r', 'refund')).toThrow(TypeError)
  })

  it('aprovada aparece como aguardando processamento, nunca como devolvida', () => {
    expect(refundStatusLabels.awaiting_processing).toMatch(/aguardando processamento/)
    expect(Object.values(refundStatusLabels).some((label) => /devolvid/i.test(label))).toBe(false)
    expect(refundDecisionMessage({ status: 'approved' })).toMatch(/nenhum valor foi devolvido/)
    expect(refundDecisionMessage({ status: 'rejected' })).toMatch(/rejeitado/)
  })
})
