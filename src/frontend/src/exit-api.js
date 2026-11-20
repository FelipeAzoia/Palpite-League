import { requestAuth } from './auth-api.js'

// SPEC-017 — saída voluntária do bolão: consequências e confirmação explícita.
export function fetchExitPreview(token, poolId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/exit`, { token, ...options })
}

export function confirmExit(token, poolId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/exit`, { method: 'POST', token, body: { confirm: true }, ...options })
}

// A interface só orienta; quem decide é o backend (INV-014). O administrador não sai do bolão ativo.
export function canLeave(role, poolStatus) {
  return poolStatus === 'active' && (role === 'participant' || role === 'coadministrator')
}

export function discardedLabel(count) {
  if (count === 0) return 'Você não tem palpites em partidas que ainda não começaram.'
  return count === 1
    ? '1 palpite em partida que ainda não começou será desconsiderado:'
    : `${count} palpites em partidas que ainda não começaram serão desconsiderados:`
}
