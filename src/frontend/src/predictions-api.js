import { requestAuth } from './auth-api.js'

// SPEC-012 — partidas do bolão para palpite e palpite próprio.
// A interface só orienta: prazo, direito e formato são decididos pelo backend (INV-015).

export function fetchPredictionMatches(token, poolId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/predictions`, { token, ...options })
}

export function savePrediction(token, poolId, matchId, prediction, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/matches/${encodeURIComponent(matchId)}/prediction`, {
    method: 'PUT',
    token,
    body: prediction,
    ...options,
  })
}

export const situationLabels = {
  open: 'Aberta para palpite',
  closed: 'Palpites encerrados',
  late_entry: 'Sem direito (entrada tardia)',
  unavailable: 'Indisponível',
}

export const situationHints = {
  closed: 'O prazo terminou no início da partida.',
  late_entry: 'Você entrou no bolão depois do início desta partida.',
  unavailable: 'A partida foi adiada, cancelada ou ainda não tem data e hora.',
}

export const outcomeLabels = {
  home: 'Vitória do mandante',
  draw: 'Empate',
  away: 'Vitória do visitante',
}

// Mensagens dos 409 por tipo estável (OPEN-72).
export const blockedMessages = {
  prediction_deadline_passed: 'O prazo para palpitar nesta partida terminou no início do jogo.',
  late_entry_not_allowed: 'Você entrou no bolão depois do início desta partida e não pode palpitar nela.',
  match_unavailable: 'Esta partida não está disponível para palpite.',
  participation_not_confirmed: 'Sua participação ainda não foi confirmada. Conclua o pagamento da taxa de entrada para palpitar.',
  pool_ended: 'Este bolão está encerrado e não aceita palpites.',
}

// Estado inicial do formulário a partir do palpite gravado (ou vazio).
export function draftFrom(prediction) {
  if (prediction?.type === 'exact_score') {
    return { type: 'exact_score', outcome: '', homeGoals: String(prediction.homeGoals), awayGoals: String(prediction.awayGoals) }
  }
  if (prediction?.type === 'result') return { type: 'result', outcome: prediction.outcome, homeGoals: '', awayGoals: '' }
  return { type: 'result', outcome: '', homeGoals: '', awayGoals: '' }
}

function toGoals(value) {
  const text = String(value).trim()
  return /^\d+$/.test(text) ? Number(text) : text === '' ? undefined : text
}

// Monta o corpo enviado: só os campos da modalidade escolhida (INV-002).
export function predictionBody(draft) {
  if (draft.type === 'exact_score') {
    return { type: 'exact_score', homeGoals: toGoals(draft.homeGoals), awayGoals: toGoals(draft.awayGoals) }
  }
  return { type: 'result', outcome: draft.outcome || undefined }
}

export function describePrediction(prediction, match) {
  if (!prediction) return 'Sem palpite'
  if (prediction.type === 'exact_score') {
    return `Placar: ${match.home.name} ${prediction.homeGoals} × ${prediction.awayGoals} ${match.away.name}`
  }
  return `Resultado: ${outcomeLabels[prediction.outcome] ?? prediction.outcome}`
}
