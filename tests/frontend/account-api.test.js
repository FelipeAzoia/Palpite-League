import { describe, expect, it, vi } from 'vitest'
import {
  fetchAccountPlan,
  fetchAvailablePlans,
  fetchProfile,
  isSessionRejected,
  updateProfileName,
} from '../../src/frontend/src/account-api.js'
import { describeFeatures, planStatusLabel } from '../../src/frontend/src/plan-features.js'

function okFetcher(payload) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => payload })
}

describe('API da conta (SPEC-005)', () => {
  it('consulta perfil, plano e planos com a sessão Bearer e sem indicar usuário', async () => {
    for (const [call, path] of [
      [fetchProfile, '/account/profile'],
      [fetchAccountPlan, '/account/plan'],
      [fetchAvailablePlans, '/account/plans'],
    ]) {
      const fetcher = okFetcher({})
      await call('opaque-token', { fetcher })
      expect(fetcher).toHaveBeenCalledWith(path, { method: 'GET', headers: { authorization: 'Bearer opaque-token' } })
    }
  })

  it('altera somente o nome, enviando um único campo', async () => {
    const fetcher = okFetcher({ profile: {} })

    await updateProfileName('opaque-token', 'Ana Maria', { fetcher })

    const [url, options] = fetcher.mock.calls[0]
    expect(url).toBe('/account/profile')
    expect(options.method).toBe('PATCH')
    expect(JSON.parse(options.body)).toEqual({ name: 'Ana Maria' })
  })

  it('reconhece a sessão rejeitada e preserva o erro de validação no campo', async () => {
    const rejected = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ type: 'session_rejected', message: 'Sessão inválida.' }) })
    const invalid = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ type: 'validation_error', message: 'Confira.', fields: { name: 'Nome inválido.' } }) })

    const sessionError = await fetchProfile('x', { fetcher: rejected }).catch((error) => error)
    const validationError = await updateProfileName('x', '', { fetcher: invalid }).catch((error) => error)

    expect(isSessionRejected(sessionError)).toBe(true)
    expect(isSessionRejected(validationError)).toBe(false)
    expect(validationError.fields).toEqual({ name: 'Nome inválido.' })
  })
})

describe('recursos dos planos', () => {
  it('descreve os recursos do plano Gratuito e do Premium sem preço', () => {
    const free = describeFeatures({ simultaneousPools: 1, unlimitedParticipation: true, liveResultsInCreatedPools: false })
    const premium = describeFeatures({ simultaneousPools: 10, unlimitedParticipation: true, liveResultsInCreatedPools: true })

    expect(free.map((feature) => feature.value)).toEqual(['Até 1', 'Sem limite', 'Não'])
    expect(premium.map((feature) => feature.value)).toEqual(['Até 10', 'Sem limite', 'Sim'])
    expect(JSON.stringify([free, premium])).not.toMatch(/R\$|pre[cç]o/i)
  })

  it('traduz o status ativo', () => {
    expect(planStatusLabel('active')).toBe('Ativo')
  })
})
