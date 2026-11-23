import { describe, expect, it, vi } from 'vitest'
import {
  fetchNotifications,
  formatNotificationTime,
  markAllNotificationsRead,
  markNotificationRead,
  notificationTypeLabels,
  unreadBadge,
} from '../../src/frontend/src/notifications-api.js'

// SPEC-027 — avisos na interface.
describe('notificações (SPEC-027)', () => {
  it('lista, pagina e marca como lida pelos caminhos da conta', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    await fetchNotifications('opaque', {}, { fetcher })
    await fetchNotifications('opaque', { before: 'n-1', unread: true, limit: 5 }, { fetcher })
    await markNotificationRead('opaque', 'n/1', { fetcher })
    await markAllNotificationsRead('opaque', { fetcher })
    expect(fetcher.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      ['/account/notifications?limit=20', 'GET'],
      ['/account/notifications?limit=5&before=n-1&unread=true', 'GET'],
      ['/account/notifications/n%2F1/read', 'POST'],
      ['/account/notifications/read-all', 'POST'],
    ])
  })

  it('indicador de não lidas some quando é zero e limita a 99+', () => {
    expect(unreadBadge(0)).toBeNull()
    expect(unreadBadge(3)).toBe('3')
    expect(unreadBadge(150)).toBe('99+')
  })

  it('tem rótulo para os seis eventos do RF39 e mostra a hora de Brasília', () => {
    for (const type of ['entry_approved', 'result_recorded', 'result_corrected', 'round_closed', 'medal_awarded', 'subscription_changed', 'prize_completed']) {
      expect(notificationTypeLabels[type]).toBeTruthy()
    }
    expect(formatNotificationTime('2026-11-23T22:00:00.000Z')).toBe('23/11/2026, 19:00')
  })
})
