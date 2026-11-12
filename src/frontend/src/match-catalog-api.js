import { requestAuth } from './auth-api.js'

export function fetchRounds(token, options = {}) {
  return requestAuth('/catalog/rounds', { token, ...options })
}

export function fetchRoundMatches(token, roundNumber, status, options = {}) {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  return requestAuth(`/catalog/rounds/${encodeURIComponent(roundNumber)}/matches${query}`, { token, ...options })
}
