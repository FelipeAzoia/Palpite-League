import { requestAuth } from './auth-api.js'

export function fetchCreationAvailability(token, options = {}) {
  return requestAuth('/pools/creation-availability', { token, ...options })
}

export function createPool(token, body, options = {}) {
  return requestAuth('/pools', { method: 'POST', body, token, ...options })
}

export function fetchPools(token, options = {}) {
  return requestAuth('/pools', { token, ...options })
}

export function fetchPoolRules(token, poolId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}`, { token, ...options })
}
