import { requestAuth } from './auth-api.js'

export function fetchRounds(token, options = {}) {
  return requestAuth('/catalog/rounds', { token, ...options })
}

// SPEC-031: times do catálogo, para o filtro de times da criação do bolão.
export function fetchTeams(token, options = {}) {
  return requestAuth('/catalog/teams', { token, ...options })
}

// SPEC-031: consulta somente leitura do Brasileirão 2024 pela API-Football.
export function fetchShowcaseStatus(token, options = {}) {
  return requestAuth('/catalog/showcase', { token, ...options })
}

export function fetchApiFootball2024(token, options = {}) {
  return requestAuth('/catalog/showcase/api-football-2024', { token, ...options })
}

export function fetchRoundMatches(token, roundNumber, status, options = {}) {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  return requestAuth(`/catalog/rounds/${encodeURIComponent(roundNumber)}/matches${query}`, { token, ...options })
}
