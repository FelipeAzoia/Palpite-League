import { requestAuth } from './auth-api.js'

// Página inicial: pontos e colocação do próprio usuário em cada bolão.

export const homePageSize = 5

export function fetchPoolsSummary(token, options = {}) {
  return requestAuth('/account/pools-summary', { token, ...options })
}

// Fatia de uma página (1, 2, ...); páginas fora do intervalo são ajustadas para a mais próxima.
export function paginate(items, page, pageSize = homePageSize) {
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), totalPages)
  const start = (current - 1) * pageSize
  const pageItems = items.slice(start, start + pageSize)
  return {
    items: pageItems,
    page: current,
    totalPages,
    total,
    from: total === 0 ? 0 : start + 1,
    to: start + pageItems.length,
    hasPrevious: current > 1,
    hasNext: current < totalPages,
  }
}

export function pointsLabel(points) {
  return `${points} ${points === 1 ? 'ponto' : 'pontos'}`
}

export function positionLabel(position, participants) {
  if (!position) return '—'
  return `${position}º de ${participants}`
}

export function poolStatusLabel(status) {
  return status === 'ended' ? 'Encerrado' : 'Ativo'
}
