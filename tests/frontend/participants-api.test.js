import { describe, expect, it, vi } from 'vitest'
import { canPromote, fetchParticipants, participantRoleLabel, promoteParticipant } from '../../src/frontend/src/participants-api.js'

function okFetcher(payload = {}) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => payload })
}

describe('API de participantes (SPEC-011)', () => {
  it('lista e promove com a sessão Bearer e os caminhos esperados', async () => {
    const list = okFetcher()
    const promote = okFetcher()

    await fetchParticipants('opaque', 'pool/1', { fetcher: list })
    await promoteParticipant('opaque', 'pool/1', 'part 2', { fetcher: promote })

    expect(list).toHaveBeenCalledWith('/pools/pool%2F1/participants', { method: 'GET', headers: { authorization: 'Bearer opaque' } })
    expect(promote).toHaveBeenCalledWith('/pools/pool%2F1/participants/part%202/promote', { method: 'POST', headers: { authorization: 'Bearer opaque' } })
  })

  it('mostra a ação de promover só ao administrador e só para participante confirmado', () => {
    const participant = { role: 'participant', status: 'confirmed' }
    expect(canPromote('administrator', participant)).toBe(true)
    expect(canPromote('coadministrator', participant)).toBe(false)
    expect(canPromote('participant', participant)).toBe(false)
    expect(canPromote('administrator', { role: 'participant', status: 'approved_awaiting_payment' })).toBe(false)
    expect(canPromote('administrator', { role: 'coadministrator', status: 'confirmed' })).toBe(false)
    expect(canPromote('administrator', { role: 'administrator', status: 'confirmed' })).toBe(false)
  })

  it('traduz os papéis', () => {
    expect(participantRoleLabel('coadministrator')).toBe('Coadministrador')
  })
})
