import { requestAuth } from './auth-api.js'

// SPEC-027 — notificações próprias, dentro da aplicação. A interface só lista e marca como lida;
// destinatários e conteúdo são decididos pelo backend (INV-012).

export function fetchNotifications(token, { before, unread, limit = 20 } = {}, options = {}) {
  const query = new URLSearchParams({ limit: String(limit) })
  if (before) query.set('before', before)
  if (unread) query.set('unread', 'true')
  return requestAuth(`/account/notifications?${query}`, { token, ...options })
}

export function markNotificationRead(token, notificationId, options = {}) {
  return requestAuth(`/account/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'POST', token, ...options })
}

export function markAllNotificationsRead(token, options = {}) {
  return requestAuth('/account/notifications/read-all', { method: 'POST', token, ...options })
}

// O indicador de não lidas é atualizado neste intervalo, como a tarefa que gera as notificações.
export const unreadRefreshIntervalMs = 60 * 1000

export const notificationTypeLabels = {
  entry_approved: 'Entrada aprovada',
  result_recorded: 'Resultado',
  result_corrected: 'Resultado corrigido',
  round_closed: 'Rodada encerrada',
  medal_awarded: 'Medalha',
  subscription_changed: 'Assinatura',
  prize_completed: 'Premiação',
}

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

export function formatNotificationTime(iso) {
  return dateTimeFormatter.format(new Date(iso))
}

export function unreadBadge(count) {
  if (!count) return null
  return count > 99 ? '99+' : String(count)
}
