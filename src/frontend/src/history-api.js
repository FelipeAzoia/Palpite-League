import { requestAuth } from './auth-api.js'

// SPEC-028 — histórico do bolão, somente leitura. Pontos e posições vêm do backend, pelas mesmas
// regras do ranking; a interface só apresenta.

export function fetchHistory(token, poolId, { round, page, pageSize } = {}, options = {}) {
  const query = new URLSearchParams()
  if (round) query.set('round', String(round))
  if (page) query.set('page', String(page))
  if (pageSize) query.set('pageSize', String(pageSize))
  const suffix = query.size ? `?${query}` : ''
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/history${suffix}`, { token, ...options })
}

export function fetchLeftPools(token, options = {}) {
  return requestAuth('/account/left-pools', { token, ...options })
}

export const historyStatusLabels = {
  scheduled: 'Agendada',
  in_progress: 'Em andamento',
  finished: 'Encerrada',
  postponed: 'Adiada',
  cancelled: 'Cancelada',
}

// Pontos da partida: só com resultado oficial; antes disso, um traço.
export function matchPointsLabel(match) {
  if (match.points === null) return '—'
  return `${match.points} ${match.points === 1 ? 'pt' : 'pts'}`
}

export function summaryHeadline(summary) {
  if (summary.final) {
    if (summary.position === null) return 'Bolão encerrado'
    return `${summary.winner ? 'Vencedor · ' : ''}${summary.position}º de ${summary.participants} no resultado final`
  }
  if (summary.position === null) return 'Você saiu deste bolão'
  return `${summary.position}º de ${summary.participants} agora`
}
