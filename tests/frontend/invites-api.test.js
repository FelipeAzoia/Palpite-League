import { describe, expect, it, vi } from 'vitest'
import { createInvite, fetchInvites, revokeInvite } from '../../src/frontend/src/invites-api.js'
import { canManageInvites, formatInviteDate, inviteStatusLabels } from '../../src/frontend/src/invites-view.js'

function okFetcher(payload = {}) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => payload })
}

describe('API de convites (SPEC-008)', () => {
  it('lista, cria e revoga com a sessão Bearer e os caminhos esperados', async () => {
    const list = okFetcher()
    const create = okFetcher()
    const revoke = okFetcher()

    await fetchInvites('opaque', 'pool/1', { fetcher: list })
    await createInvite('opaque', 'pool/1', { fetcher: create })
    await revokeInvite('opaque', 'pool/1', 'inv 2', { fetcher: revoke })

    expect(list).toHaveBeenCalledWith('/pools/pool%2F1/invites', { method: 'GET', headers: { authorization: 'Bearer opaque' } })
    expect(create).toHaveBeenCalledWith('/pools/pool%2F1/invites', { method: 'POST', headers: { authorization: 'Bearer opaque' } })
    expect(revoke).toHaveBeenCalledWith('/pools/pool%2F1/invites/inv%202', { method: 'DELETE', headers: { authorization: 'Bearer opaque' } })
  })

  it('preserva o status e a mensagem dos erros 403, 404 e 409 para a interface', async () => {
    for (const [status, type] of [[403, 'forbidden'], [404, 'not_found'], [409, 'invite_not_active']]) {
      const fetcher = vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({ type, message: `erro ${status}` }) })

      const error = await revokeInvite('x', 'p', 'i', { fetcher }).catch((caught) => caught)

      expect(error.status).toBe(status)
      expect(error.type).toBe(type)
      expect(error.message).toBe(`erro ${status}`)
    }
  })
})

describe('apresentação de convites', () => {
  it('só mostra a seção de convites para administrador e coadministrador', () => {
    expect(canManageInvites('administrator')).toBe(true)
    expect(canManageInvites('coadministrator')).toBe(true)
    expect(canManageInvites('participant')).toBe(false)
    expect(canManageInvites(undefined)).toBe(false)
  })

  it('traduz os quatro status e formata datas em São Paulo', () => {
    expect(Object.keys(inviteStatusLabels).sort()).toEqual(['active', 'expired', 'revoked', 'used'])
    expect(inviteStatusLabels.expired).toBe('Expirado')
    // A vírgula entre data e hora depende da versão do ICU do Node.
    expect(formatInviteDate('2026-11-14T15:30:00.000Z')).toMatch(/^14\/11\/2026,? 12:30$/)
  })
})
