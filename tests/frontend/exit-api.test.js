import { describe, expect, it, vi } from 'vitest'
import { canLeave, confirmExit, discardedLabel, fetchExitPreview } from '../../src/frontend/src/exit-api.js'

describe('API de saída do bolão (SPEC-017)', () => {
  it('consulta as consequências e confirma com a sessão Bearer e confirmação explícita', async () => {
    const preview = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    const exit = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    await fetchExitPreview('opaque', 'pool/1', { fetcher: preview })
    await confirmExit('opaque', 'pool/1', { fetcher: exit })
    expect(preview).toHaveBeenCalledWith('/pools/pool%2F1/exit', { method: 'GET', headers: { authorization: 'Bearer opaque' } })
    expect(exit).toHaveBeenCalledWith('/pools/pool%2F1/exit', {
      method: 'POST',
      headers: { authorization: 'Bearer opaque', 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    })
  })

  it('mostra a saída só a participante e coadministrador de bolão ativo', () => {
    expect(canLeave('participant', 'active')).toBe(true)
    expect(canLeave('coadministrator', 'active')).toBe(true)
    expect(canLeave('administrator', 'active')).toBe(false)
    expect(canLeave('participant', 'ended')).toBe(false)
  })

  it('descreve os palpites desconsiderados', () => {
    expect(discardedLabel(0)).toBe('Você não tem palpites em partidas que ainda não começaram.')
    expect(discardedLabel(1)).toBe('1 palpite em partida que ainda não começou será desconsiderado:')
    expect(discardedLabel(3)).toBe('3 palpites em partidas que ainda não começaram serão desconsiderados:')
  })
})
