import { requestAuth } from './auth-api.js'

export function fetchInvites(token, poolId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/invites`, { token, ...options })
}

export function createInvite(token, poolId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/invites`, { method: 'POST', token, ...options })
}

export function revokeInvite(token, poolId, inviteId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/invites/${encodeURIComponent(inviteId)}`, {
    method: 'DELETE',
    token,
    ...options,
  })
}
