import { describe, expect, it, vi } from 'vitest'
import { requestAuth } from '../../src/frontend/src/auth-api.js'

describe('requestAuth', () => {
  it('envia JSON e sessão Bearer', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user: { id: 'user-1' } }) })

    await expect(requestAuth('/auth/me', { method: 'POST', body: { name: 'Ana' }, token: 'opaque-token', fetcher }))
      .resolves.toEqual({ user: { id: 'user-1' } })
    expect(fetcher).toHaveBeenCalledWith('/auth/me', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer opaque-token' },
      body: JSON.stringify({ name: 'Ana' }),
    })
  })

  it('converte erro da API em erro estruturado para a interface', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ type: 'validation_error', message: 'Confira os campos.', fields: { email: 'Inválido.' } }),
    })

    await expect(requestAuth('/auth/register', { method: 'POST', body: {}, fetcher }))
      .rejects.toMatchObject({
        message: 'Confira os campos.',
        status: 400,
        type: 'validation_error',
        fields: { email: 'Inválido.' },
      })
  })
})