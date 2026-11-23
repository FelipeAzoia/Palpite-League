import { describe, expect, it, vi } from 'vitest'
import {
  decideRefund,
  fetchOwnRefunds,
  fetchPendingRefunds,
  refundDecisionMessage,
  refundStatusLabels,
  refundSituation,
  requestRefund,
  retryRefund,
  fetchApprovedRefunds,
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
    expect(refundSituation({ displayStatus: 'awaiting_processing', processing: { simulated: false } })).not.toMatch(/concluída/)
    expect(refundDecisionMessage({ status: 'approved' })).toMatch(/nenhum valor foi devolvido/)
    expect(refundDecisionMessage({ status: 'rejected' })).toMatch(/rejeitado/)
  })

  it('SPEC-024: situação da devolução com motivo da recusa e simulação identificada', () => {
    const completed = { displayStatus: 'completed', processing: { simulated: true, refusalReason: null, inconsistent: false } }
    expect(refundSituation(completed)).toBe('Devolução concluída · simulação')
    const refused = { displayStatus: 'refused', processing: { simulated: false, refusalReason: 'not_refundable', inconsistent: false } }
    expect(refundSituation(refused)).toBe('Devolução recusada pelo provedor: o pagamento original não admite devolução')
    const flagged = { displayStatus: 'processing', processing: { simulated: false, refusalReason: null, inconsistent: true } }
    expect(refundSituation(flagged)).toMatch(/em verificação/)
  })

  it('SPEC-024: lista e nova tentativa usam os caminhos da administração', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    await fetchApprovedRefunds('opaque', 'pool/1', { fetcher })
    await retryRefund('opaque', 'pool/1', 'r/1', { fetcher })
    expect(fetcher.mock.calls.map(([url, init]) => [url, init.method, init.body])).toEqual([
      ['/pools/pool%2F1/refunds', 'GET', undefined],
      ['/pools/pool%2F1/refunds/r%2F1/retry', 'POST', undefined],
    ])
  })
})
