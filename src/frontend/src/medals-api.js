import { requestAuth } from './auth-api.js'

// SPEC-016 — medalhas do bolão (somente leitura; exclusivamente visuais).
export function fetchPoolMedals(token, poolId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/medals`, { token, ...options })
}

export function medalCountLabel(count) {
  return count === 1 ? '1 medalha' : `${count} medalhas`
}

export function winnersLabel(round) {
  if (round.winners.length === 0) return 'Sem medalha nesta rodada (ninguém pontuou)'
  const names = round.winners.map(({ name }) => name).join(', ')
  return `${names} · ${round.winners[0].points} pts`
}
