import { describe, expect, it, vi } from 'vitest'
import { requestAuth } from '../../src/frontend/src/auth-api.js'
import { consumeRecoveryToken, readRecoveryToken } from '../../src/frontend/src/recovery-link.js'

describe('link de recuperação (SPEC-004, TC-19)', () => {
  it('lê o token do fragmento e ignora fragmentos que não são de recuperação', () => {
    expect(readRecoveryToken('#token=abc_DEF-123')).toBe('abc_DEF-123')
    for (const hash of ['', '#', '#outra=abc', '#token=', '#token=a b', '#token=abc&x=1', '?token=abc', undefined]) {
      expect(readRecoveryToken(hash)).toBeNull()
    }
  })

  it('remove o token da barra de endereço sem recarregar a página', () => {
    const history = { replaceState: vi.fn() }
    const location = { pathname: '/', search: '?a=1', hash: '#token=abc123' }

    expect(consumeRecoveryToken(location, history)).toBe('abc123')
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/?a=1')
  })

  it('não altera o endereço quando não há token', () => {
    const history = { replaceState: vi.fn() }

    expect(consumeRecoveryToken({ pathname: '/', search: '', hash: '' }, history)).toBeNull()
    expect(history.replaceState).not.toHaveBeenCalled()
  })

  it('envia o token apenas no corpo da requisição de redefinição', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: 'ok' }) })

    await requestAuth('/auth/password-reset', { method: 'POST', body: { token: 'abc123', password: 'nova-senha-123' }, fetcher })

    const [url, options] = fetcher.mock.calls[0]
    expect(url).toBe('/auth/password-reset')
    expect(url).not.toContain('abc123')
    expect(options.headers.authorization).toBeUndefined()
    expect(JSON.parse(options.body)).toEqual({ token: 'abc123', password: 'nova-senha-123' })
  })
})
