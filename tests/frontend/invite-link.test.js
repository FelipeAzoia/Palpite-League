import { describe, expect, it, vi } from 'vitest'
import {
  canRequestEntry,
  canSubmitEntry,
  consumeInviteLink,
  discardInviteCode,
  inviteStorageKey,
  openInvite,
  pendingInviteCode,
  readInviteCode,
  requestEntry,
  situationLabels,
} from '../../src/frontend/src/invite-link.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
}

describe('link do convite (SPEC-009, CA-02 e CA-22)', () => {
  it('lê o código do fragmento e ignora outros fragmentos', () => {
    expect(readInviteCode('#invite=abc_DEF-123')).toBe('abc_DEF-123')
    for (const hash of ['', '#', '#token=abc', '#invite=', '#invite=a b', '?invite=abc', undefined]) {
      expect(readInviteCode(hash)).toBeNull()
    }
  })

  it('remove o código da barra de endereço e o mantém no sessionStorage durante o login', () => {
    const history = { replaceState: vi.fn() }
    const storage = memoryStorage()

    expect(consumeInviteLink({ pathname: '/', search: '', hash: '#invite=abc123' }, history, storage)).toBe('abc123')
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/')
    expect(storage.getItem(inviteStorageKey)).toBe('abc123')
    expect(pendingInviteCode(storage)).toBe('abc123')

    discardInviteCode(storage)
    expect(pendingInviteCode(storage)).toBeNull()
  })

  it('não altera o endereço sem convite e tolera armazenamento indisponível', () => {
    const history = { replaceState: vi.fn() }
    const broken = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') }, removeItem: () => { throw new Error('x') } }

    expect(consumeInviteLink({ pathname: '/', search: '', hash: '' }, history, memoryStorage())).toBeNull()
    expect(history.replaceState).not.toHaveBeenCalled()
    expect(consumeInviteLink({ pathname: '/', search: '', hash: '#invite=abc' }, history, broken)).toBe('abc')
    expect(pendingInviteCode(broken)).toBeNull()
    expect(() => discardInviteCode(broken)).not.toThrow()
  })
})

describe('API do convite', () => {
  it('envia o código apenas no corpo, com a sessão Bearer', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })

    await openInvite('opaque', 'abc', { fetcher })
    await requestEntry('opaque', { code: 'abc', rulesAccepted: true }, { fetcher })

    expect(fetcher).toHaveBeenNthCalledWith(1, '/invites/open', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer opaque' },
      body: JSON.stringify({ code: 'abc' }),
    })
    expect(fetcher).toHaveBeenNthCalledWith(2, '/invites/requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer opaque' },
      body: JSON.stringify({ code: 'abc', rulesAccepted: true, lateEntryAcknowledged: false }),
    })
    for (const [path] of fetcher.mock.calls) expect(path.includes('abc')).toBe(false)
  })

  it('preserva campos e detalhes dos erros 400 e 409', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ type: 'participation_exists', message: 'já existe', details: { status: 'requested' } }),
    })

    const error = await requestEntry('x', { code: 'c', rulesAccepted: true }, { fetcher }).catch((caught) => caught)

    expect(error.status).toBe(409)
    expect(error.details).toEqual({ status: 'requested' })
  })
})

describe('apresentação do convite', () => {
  it('descreve todas as situações e só permite solicitar sem participação', () => {
    expect(Object.keys(situationLabels).sort()).toEqual(['approved_awaiting_payment', 'confirmed', 'left', 'none', 'rejected', 'requested'])
    expect(canRequestEntry({ status: 'none' })).toBe(true)
    for (const status of ['requested', 'approved_awaiting_payment', 'confirmed', 'rejected', 'left']) {
      expect(canRequestEntry({ status })).toBe(false)
    }
  })

  it('exige o aceite e, quando há entrada tardia, a ciência', () => {
    expect(canSubmitEntry({ rulesAccepted: true }, false)).toBe(true)
    expect(canSubmitEntry({ rulesAccepted: false }, false)).toBe(false)
    expect(canSubmitEntry({ rulesAccepted: true, lateEntryAcknowledged: false }, true)).toBe(false)
    expect(canSubmitEntry({ rulesAccepted: true, lateEntryAcknowledged: true }, true)).toBe(true)
  })
})
