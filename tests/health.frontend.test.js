import { describe, expect, it, vi } from 'vitest'
import { fetchHealth } from '../frontend/health.js'

describe('fetchHealth', () => {
  it('reports an available backend from the HTTP health response', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    })

    await expect(fetchHealth(fetchImplementation)).resolves.toEqual({
      available: true,
      component: undefined,
    })
    expect(fetchImplementation).toHaveBeenCalledWith('/api/health')
  })

  it('reports an unavailable component without treating HTTP 503 as success', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ status: 'unavailable', component: 'persistence' }),
    })

    await expect(fetchHealth(fetchImplementation)).resolves.toEqual({
      available: false,
      component: 'persistence',
    })
  })
})
