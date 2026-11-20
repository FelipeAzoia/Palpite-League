import { requestAuth } from './auth-api.js'

// SPEC-015 — ranking do bolão e desempenho próprio por rodada (somente leitura).
export function fetchRanking(token, poolId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/ranking`, { token, ...options })
}

export function fetchPerformance(token, poolId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/performance`, { token, ...options })
}

// Cabeçalho curto da coluna do valor de desempate.
export const tiebreakColumnLabels = {
  exact_scores: 'Exatos',
  correct_results: 'Acertos',
  last_round_points: 'Últ. rodada',
}

// Posição com indicação de empate (por exemplo, "1º" e "1º" para empatados).
export function positionLabel(participant, participants) {
  const tied = participants.filter(({ position }) => position === participant.position).length > 1
  return `${participant.position}º${tied ? ' (empate)' : ''}`
}

export function roundSummary(round) {
  const status = round.closed ? 'encerrada' : `${round.finishedMatches} de ${round.totalMatches} partidas encerradas`
  return `${round.points} ${round.points === 1 ? 'ponto' : 'pontos'} · ${round.hits} de ${round.predictions} palpites certos · ${status}`
}
