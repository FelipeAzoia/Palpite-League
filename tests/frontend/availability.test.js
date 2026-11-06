import { describe, expect, it, vi } from 'vitest'
import { checkAvailability } from '../../src/frontend/src/availability.js'

describe('checkAvailability', () => {
  it('consulta o endpoint HTTP do backend', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'available' }) })

    await expect(checkAvailability(fetcher)).resolves.toEqual({ status: 'available' })
    expect(fetcher).toHaveBeenCalledWith('/health')
  })

  it('trata respostas indisponíveis sem expor a resposta interna', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false })

    await expect(checkAvailability(fetcher)).rejects.toThrow('Backend unavailable')
  })
})