import { describe, expect, it, vi } from 'vitest'
import {
  checkEntryFeePayment,
  entryFeeResultMessage,
  entryFeeSituation,
  fetchEntryFee,
  startEntryFeePayment,
} from '../../src/frontend/src/entry-fee-api.js'

// SPEC-022 — pagamento da taxa de entrada na interface.
describe('taxa de entrada (SPEC-022)', () => {
  const ok = () => vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })

  it('usa os caminhos do bolão e nunca envia valor', async () => {
    const fetcher = ok()
    await fetchEntryFee('opaque', 'pool/1', { fetcher })
    await startEntryFeePayment('opaque', 'pool/1', { fetcher })
    await checkEntryFeePayment('opaque', 'pool/1', { fetcher })
    expect(fetcher.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      ['/pools/pool%2F1/entry-fee', 'GET'],
      ['/pools/pool%2F1/entry-fee/payment', 'POST'],
      ['/pools/pool%2F1/entry-fee/payment/check', 'POST'],
    ])
    expect(fetcher.mock.calls.every(([, init]) => init.body === undefined)).toBe(true)
  })

  const base = { participation: { status: 'approved_awaiting_payment' }, payment: null }

  it('descreve cada situação do pagamento', () => {
    expect(entryFeeSituation(base).text).toMatch(/Pague a taxa/)
    expect(entryFeeSituation({ ...base, payment: { status: 'pending' } }).tone).toBe('warn')
    expect(entryFeeSituation({ ...base, payment: { status: 'refused', providerUnavailable: false } }).text).toMatch(/recusado/)
    expect(entryFeeSituation({ ...base, payment: { status: 'refused', providerUnavailable: true } }).text).toMatch(/indisponível e nada foi cobrado/)
    expect(entryFeeSituation({ participation: { status: 'confirmed' }, payment: { status: 'confirmed' } }).tone).toBe('done')
  })

  it('a mensagem da volta do checkout segue o que o backend conferiu', () => {
    expect(entryFeeResultMessage({ participation: { status: 'confirmed' } })).toMatch(/confirmada/)
    expect(entryFeeResultMessage({ ...base, payment: { status: 'refused' } })).toMatch(/recusado/)
    expect(entryFeeResultMessage({ ...base, payment: { status: 'pending' } })).toMatch(/pendente/)
  })
})
