import { requestAuth } from './auth-api.js'

export function fetchProfile(token, options = {}) {
  return requestAuth('/account/profile', { token, ...options })
}

export function updateProfileName(token, name, options = {}) {
  return requestAuth('/account/profile', { method: 'PATCH', body: { name }, token, ...options })
}

export function fetchAccountPlan(token, options = {}) {
  return requestAuth('/account/plan', { token, ...options })
}

export function fetchAvailablePlans(token, options = {}) {
  return requestAuth('/account/plans', { token, ...options })
}

// Sessão ausente, inválida, expirada ou encerrada: a interface leva o usuário ao login (SPEC-005, E1).
export function isSessionRejected(error) {
  return error?.status === 401
}
