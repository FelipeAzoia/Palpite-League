import { requestAuth } from './auth-api.js'

// O código do convite chega no fragmento (#invite=...) do link (SPEC-008). A interface o lê,
// o remove da barra de endereço e o mantém no sessionStorage durante o login e o cadastro;
// ele é descartado quando a solicitação é registrada ou a aba é fechada (SPEC-009, CA-22).
export const inviteStorageKey = 'palpite-league-invite'

export function readInviteCode(hash) {
  const match = /^#invite=([A-Za-z0-9_-]+)$/.exec(hash ?? '')
  return match ? match[1] : null
}

export function consumeInviteLink(location, history, storage) {
  const code = readInviteCode(location.hash)
  if (!code) return null
  history.replaceState(null, '', `${location.pathname}${location.search}`)
  try { storage.setItem(inviteStorageKey, code) } catch { /* armazenamento indisponível */ }
  return code
}

export function pendingInviteCode(storage) {
  try { return storage.getItem(inviteStorageKey) } catch { return null }
}

export function discardInviteCode(storage) {
  try { storage.removeItem(inviteStorageKey) } catch { /* armazenamento indisponível */ }
}

// O código viaja sempre no corpo, nunca no caminho ou na consulta.
export function openInvite(token, code, options = {}) {
  return requestAuth('/invites/open', { method: 'POST', body: { code }, token, ...options })
}

export function requestEntry(token, { code, rulesAccepted, lateEntryAcknowledged }, options = {}) {
  return requestAuth('/invites/requests', {
    method: 'POST',
    body: { code, rulesAccepted: rulesAccepted === true, lateEntryAcknowledged: lateEntryAcknowledged === true },
    token,
    ...options,
  })
}

export const situationLabels = {
  none: 'Você ainda não solicitou a entrada.',
  requested: 'Solicitação enviada. Ela aguarda a decisão do administrador ou coadministrador.',
  approved_awaiting_payment: 'Solicitação aprovada. Falta confirmar o pagamento da taxa de entrada.',
  confirmed: 'Você já participa deste bolão.',
  rejected: 'Sua solicitação foi recusada.',
  left: 'Você saiu deste bolão.',
}

export function canRequestEntry(situation) {
  return situation?.status === 'none'
}

export function canSubmitEntry({ rulesAccepted, lateEntryAcknowledged }, lateEntryRequired) {
  return rulesAccepted === true && (!lateEntryRequired || lateEntryAcknowledged === true)
}
