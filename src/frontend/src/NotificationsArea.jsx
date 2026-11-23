import { useEffect, useEffectEvent, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import {
  fetchNotifications,
  formatNotificationTime,
  markAllNotificationsRead,
  markNotificationRead,
  notificationTypeLabels,
} from './notifications-api.js'

// SPEC-027 — avisos do próprio usuário: mais recentes primeiro, com marcação de lida. Só leitura
// do que o backend gerou; nada aqui altera bolões, resultados ou pagamentos.
export default function NotificationsArea({ token, onSessionRejected, onUnreadChange }) {
  const [items, setItems] = useState(null)
  const [nextBefore, setNextBefore] = useState(null)
  const [unread, setUnread] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleError = useEffectEvent((caught) => {
    if (isSessionRejected(caught)) onSessionRejected()
    else setError(caught.message)
  })
  const reportUnread = useEffectEvent((count) => onUnreadChange?.(count))

  useEffect(() => {
    let active = true
    fetchNotifications(token).then((result) => {
      if (!active) return
      setItems(result.notifications)
      setNextBefore(result.nextBefore)
      setUnread(result.unreadCount)
      reportUnread(result.unreadCount)
    }).catch((caught) => {
      if (active) handleError(caught)
    })
    return () => { active = false }
  }, [token])

  function fail(caught) {
    if (isSessionRejected(caught)) onSessionRejected()
    else setError(caught.message)
  }

  function applyUnread(count) {
    setUnread(count)
    onUnreadChange?.(count)
  }

  async function loadMore() {
    setBusy(true)
    try {
      const result = await fetchNotifications(token, { before: nextBefore })
      setItems((current) => [...current, ...result.notifications])
      setNextBefore(result.nextBefore)
      applyUnread(result.unreadCount)
    } catch (caught) {
      fail(caught)
    } finally {
      setBusy(false)
    }
  }

  async function markOne(id) {
    try {
      const result = await markNotificationRead(token, id)
      setItems((current) => current.map((item) => (item.id === id ? result.notification : item)))
      applyUnread(result.unreadCount)
    } catch (caught) {
      fail(caught)
    }
  }

  async function markAll() {
    setBusy(true)
    try {
      const result = await markAllNotificationsRead(token)
      setItems((current) => current.map((item) => ({ ...item, read: true })))
      applyUnread(result.unreadCount)
    } catch (caught) {
      fail(caught)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="notifications-area">
      <div className="block-head">
        <div>
          <h2 id="auth-title">Avisos</h2>
          <p className="toolbar-note">{unread > 0 ? `${unread} ${unread === 1 ? 'aviso não lido' : 'avisos não lidos'}` : 'Tudo lido por aqui.'}</p>
        </div>
        {unread > 0 && (
          <button type="button" className="small-button" disabled={busy} onClick={markAll}>Marcar todos como lidos</button>
        )}
      </div>
      {error && <p className="form-message" role="alert">{error}</p>}
      {!items && !error && <p className="tab-loading" role="status"><LoaderCircle size={14} className="spin" /> Carregando avisos...</p>}
      {items && items.length === 0 && <p className="empty-state">Você ainda não tem avisos. Eles aparecem quando sua entrada é aprovada, saem resultados das partidas em que você palpitou, uma rodada termina, você ganha medalha, sua assinatura muda ou sua premiação é paga.</p>}
      {items && items.length > 0 && (
        <ul className="notification-list">
          {items.map((item) => (
            <li key={item.id} className={item.read ? 'notification' : 'notification notification-unread'}>
              <span className="notification-type">{notificationTypeLabels[item.type] ?? item.type}</span>
              <p className="notification-message">{item.message}</p>
              <span className="notification-meta">
                {formatNotificationTime(item.createdAt)}
                {!item.read && <button type="button" className="link-button" onClick={() => markOne(item.id)}>Marcar como lido</button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {nextBefore && (
        <button type="button" className="small-button" disabled={busy} onClick={loadMore}>Ver avisos anteriores</button>
      )}
    </div>
  )
}
