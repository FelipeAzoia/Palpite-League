import { requestAuth } from './auth-api.js'
import { describePrediction } from './predictions-api.js'

// SPEC-014 — pontos do próprio participante. A interface só consulta; os pontos são automáticos.
export function fetchMyPoints(token, poolId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/points`, { token, ...options })
}

export function pointsLabel(points) {
  if (points === null || points === undefined) return 'Aguardando pontuação'
  return points === 1 ? '1 ponto' : `${points} pontos`
}

export function predictionSummary(match) {
  return match.prediction ? describePrediction(match.prediction, match) : 'Você não palpitou nesta partida'
}
