import { describe, expect, it, vi } from 'vitest'
import { fetchPoolsSummary, paginate, pointsLabel, poolStatusLabel, positionLabel } from '../../src/frontend/src/home-summary.js'

const pools = Array.from({ length: 12 }, (_, index) => ({ poolId: `p${index + 1}` }))

describe('Resumo da página inicial', () => {
  it('consulta o resumo com a sessão Bearer', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ pools: [] }) })
    await fetchPoolsSummary('opaque', { fetcher })
    expect(fetcher).toHaveBeenCalledWith('/account/pools-summary', { method: 'GET', headers: { authorization: 'Bearer opaque' } })
  })

  it('pagina de 5 em 5 bolões', () => {
    const first = paginate(pools, 1)
    expect(first.items.map(({ poolId }) => poolId)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
    expect(first).toMatchObject({ page: 1, totalPages: 3, total: 12, from: 1, to: 5, hasPrevious: false, hasNext: true })

    const last = paginate(pools, 3)
    expect(last.items.map(({ poolId }) => poolId)).toEqual(['p11', 'p12'])
    expect(last).toMatchObject({ from: 11, to: 12, hasPrevious: true, hasNext: false })
  })

  it('ajusta páginas fora do intervalo e lista vazia', () => {
    expect(paginate(pools, 99).page).toBe(3)
    expect(paginate(pools, 0).page).toBe(1)
    expect(paginate([], 1)).toMatchObject({ items: [], page: 1, totalPages: 1, total: 0, from: 0, to: 0, hasNext: false })
    expect(paginate(pools.slice(0, 5), 1)).toMatchObject({ totalPages: 1, hasNext: false })
  })

  it('formata pontos, colocação e situação do bolão', () => {
    expect(pointsLabel(1)).toBe('1 ponto')
    expect(pointsLabel(0)).toBe('0 pontos')
    expect(pointsLabel(12)).toBe('12 pontos')
    expect(positionLabel(2, 8)).toBe('2º de 8')
    expect(positionLabel(null, 0)).toBe('—')
    expect(poolStatusLabel('active')).toBe('Ativo')
    expect(poolStatusLabel('ended')).toBe('Encerrado')
  })
})
