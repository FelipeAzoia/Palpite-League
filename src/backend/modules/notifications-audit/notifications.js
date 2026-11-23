import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/app-error.js'
import { createLogger } from '../../shared/logger.js'

// SPEC-027 — notificações de eventos.
// A geração só observa estados já estabelecidos: lê a trilha de auditoria (entrada aprovada,
// resultado registrado ou corrigido, mudanças de assinatura, premiação concluída) e as medalhas, e
// confere o estado atual na origem antes de notificar. Nenhuma Spec de origem chama este módulo nem
// é alterada por ele (INV-003); atualizações ao vivo nunca notificam (INV-004).

const pageSizeMax = 50
const batchSize = 500

const subscriptionMessages = {
  'subscription.activated': 'Sua assinatura Premium foi ativada.',
  'subscription.refused': 'O pagamento da assinatura Premium foi recusado. Seu plano não mudou.',
  'subscription.cancelled': 'Sua assinatura Premium foi cancelada.',
  'subscription.expired': 'Sua assinatura Premium terminou e o plano voltou ao Gratuito.',
}
const subscriptionStates = {
  'subscription.activated': ['active', 'cancellation_pending', 'past_due', 'non_renewing', 'cancelled', 'expired'],
  'subscription.refused': ['refused'],
  'subscription.cancelled': ['cancelled'],
  'subscription.expired': ['expired'],
}

const watchedActions = Object.freeze([
  'participation.approved',
  'match.result_recorded',
  'match.result_corrected',
  'match.status_synced',
  ...Object.keys(subscriptionMessages),
  'prize.completed',
])

const simulationNote = ' (simulação: nenhum dinheiro real foi movimentado)'

export function createNotificationsService(database, { logger = createLogger(), now = Date.now } = {}) {
  const nowIso = () => new Date(now()).toISOString()

  const insert = () => database.prepare(`
    INSERT INTO notifications (id, user_id, type, event_key, message, pool_id, reference_type, reference_id, simulated, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_key) DO NOTHING
  `)

  function notify(statement, { userId, type, key, message, poolId = null, reference, simulated = false }) {
    return statement.run(randomUUID(), userId, type, key, message, poolId, reference.type, reference.id, simulated ? 1 : 0, nowIso()).changes
  }

  const poolName = (poolId) => database.prepare('SELECT name FROM pools WHERE id = ?').get(poolId)?.name

  function matchLabel(matchId) {
    return database.prepare(`
      SELECT home.name AS home, away.name AS away, m.home_score, m.away_score, r.number AS round, m.round_id
      FROM sports_matches m
      JOIN sports_teams home ON home.id = m.home_team_id
      JOIN sports_teams away ON away.id = m.away_team_id
      JOIN sports_rounds r ON r.id = m.round_id
      WHERE m.id = ?
    `).get(matchId)
  }

  // Rodada encerrada no bolão: todas as partidas selecionadas da rodada estão encerradas ou
  // canceladas (mesma regra da SPEC-015/016).
  function roundClosed(poolId, roundId) {
    return database.prepare(`
      SELECT COUNT(*) AS total, SUM(CASE WHEN m.status IN ('finished', 'cancelled') THEN 1 ELSE 0 END) AS closed
      FROM pool_matches pm JOIN sports_matches m ON m.id = pm.match_id
      WHERE pm.pool_id = ? AND m.round_id = ?
    `).get(poolId, roundId)
  }

  function notifyRoundClosed(statement, matchId) {
    const match = matchLabel(matchId)
    let created = 0
    const pools = database.prepare('SELECT DISTINCT pool_id FROM pool_matches WHERE match_id = ?').all(matchId)
    for (const { pool_id: poolId } of pools) {
      const counts = roundClosed(poolId, match.round_id)
      if (!counts.total || counts.closed !== counts.total) continue
      const name = poolName(poolId)
      for (const participant of database.prepare(`
        SELECT id, user_id FROM pool_participations WHERE pool_id = ? AND status = 'confirmed'
      `).all(poolId)) {
        created += notify(statement, {
          userId: participant.user_id,
          type: 'round_closed',
          key: `round_closed:${poolId}:${match.round}:${participant.id}`,
          message: `A rodada ${match.round} do bolão "${name}" foi encerrada.`,
          poolId,
          reference: { type: 'round', id: String(match.round) },
        })
      }
    }
    return created
  }

  function handleAudit(statement, audit) {
    const action = audit.action
    if (action === 'participation.approved') {
      if (audit.result !== 'success') return 0
      const row = database.prepare(`
        SELECT part.user_id, part.status, p.id AS pool_id, p.name FROM pool_participations part
        JOIN pools p ON p.id = part.pool_id WHERE part.id = ?
      `).get(audit.object_id)
      if (!row || !['approved_awaiting_payment', 'confirmed', 'left'].includes(row.status)) return 0
      const awaiting = row.status === 'approved_awaiting_payment'
      return notify(statement, {
        userId: row.user_id,
        type: 'entry_approved',
        key: `entry_approved:${audit.object_id}`,
        message: `Sua entrada no bolão "${row.name}" foi aprovada.${awaiting ? ' Pague a taxa de entrada para confirmar a participação.' : ''}`,
        poolId: row.pool_id,
        reference: { type: 'participation', id: audit.object_id },
      })
    }

    if (action === 'match.result_recorded' || action === 'match.result_corrected') {
      if (audit.result !== 'success') return 0
      const match = matchLabel(audit.object_id)
      if (!match || match.home_score === null) return 0
      const corrected = action === 'match.result_corrected'
      const score = `${match.home} ${match.home_score} x ${match.away_score} ${match.away}`
      let created = 0
      // Só participantes confirmados com palpite na partida (OPEN-154).
      for (const row of database.prepare(`
        SELECT DISTINCT part.id, part.user_id, p.id AS pool_id, p.name
        FROM predictions pr
        JOIN pool_participations part ON part.id = pr.participation_id AND part.status = 'confirmed'
        JOIN pools p ON p.id = part.pool_id
        WHERE pr.match_id = ?
      `).all(audit.object_id)) {
        created += notify(statement, {
          userId: row.user_id,
          type: corrected ? 'result_corrected' : 'result_recorded',
          key: `${corrected ? 'result_corrected' : 'result_recorded'}:${audit.id}:${row.id}`,
          message: `${corrected ? 'Resultado oficial corrigido' : 'Resultado oficial'}: ${score} (bolão "${row.name}").`,
          poolId: row.pool_id,
          reference: { type: 'match', id: audit.object_id },
        })
      }
      return created + notifyRoundClosed(statement, audit.object_id)
    }

    // Cancelamento de partida também pode encerrar a rodada.
    if (action === 'match.status_synced') {
      if (audit.result !== 'success') return 0
      const status = database.prepare('SELECT status FROM sports_matches WHERE id = ?').get(audit.object_id)?.status
      return status === 'cancelled' ? notifyRoundClosed(statement, audit.object_id) : 0
    }

    if (subscriptionMessages[action]) {
      // A recusa é registrada com resultado falha; as demais mudanças, com sucesso.
      const expected = action === 'subscription.refused' ? 'failure' : 'success'
      if (audit.result !== expected) return 0
      const subscription = database.prepare('SELECT user_id, status, origin FROM subscriptions WHERE id = ?').get(audit.object_id)
      if (!subscription || !subscriptionStates[action].includes(subscription.status)) return 0
      const simulated = subscription.origin === 'simulator' && action !== 'subscription.expired'
      return notify(statement, {
        userId: subscription.user_id,
        type: 'subscription_changed',
        key: `subscription_changed:${audit.id}`,
        message: subscriptionMessages[action] + (simulated && action === 'subscription.activated' ? simulationNote : ''),
        reference: { type: 'subscription', id: audit.object_id },
        simulated,
      })
    }

    if (action === 'prize.completed') {
      if (audit.result !== 'success') return 0
      const row = database.prepare(`
        SELECT part.user_id, p.id AS pool_id, p.name FROM pool_participations part
        JOIN pools p ON p.id = part.pool_id WHERE part.id = ?
      `).get(audit.object_id)
      const payout = database.prepare(`
        SELECT origin FROM financial_movements WHERE type = 'payout' AND operation_id = ? AND status = 'confirmed'
        ORDER BY attempt_number DESC LIMIT 1
      `).get(audit.object_id)
      if (!row || !payout) return 0
      const simulated = payout.origin === 'simulator'
      return notify(statement, {
        userId: row.user_id,
        type: 'prize_completed',
        key: `prize_completed:${audit.object_id}`,
        message: `Sua premiação do bolão "${row.name}" foi paga.${simulated ? simulationNote : ''}`,
        poolId: row.pool_id,
        reference: { type: 'pool', id: row.pool_id },
        simulated,
      })
    }
    return 0
  }

  function handleMedal(statement, medal) {
    const row = database.prepare(`
      SELECT part.user_id, p.name FROM pool_participations part JOIN pools p ON p.id = part.pool_id WHERE part.id = ?
    `).get(medal.participation_id)
    if (!row) return 0
    return notify(statement, {
      userId: row.user_id,
      type: 'medal_awarded',
      key: `medal_awarded:${medal.participation_id}:${medal.round_number}`,
      message: `Você ganhou a medalha da rodada ${medal.round_number} no bolão "${row.name}"!`,
      poolId: medal.pool_id,
      reference: { type: 'round', id: String(medal.round_number) },
    })
  }

  // Processa um evento na sua própria transação; a falha fica para o ciclo seguinte e não impede os
  // demais (A3). A origem nunca é alterada.
  function processOne(source, id, run) {
    try {
      const created = database.transaction(() => {
        const count = run(insert())
        database.prepare('DELETE FROM notification_retries WHERE source = ? AND source_id = ?').run(source, id)
        return count
      })()
      return { created, failed: false }
    } catch {
      logger.error('notifications', 'event_failed')
      try {
        database.prepare('INSERT INTO notification_retries (source, source_id) VALUES (?, ?) ON CONFLICT DO NOTHING').run(source, id)
      } catch {
        logger.error('notifications', 'retry_not_recorded')
      }
      return { created: 0, failed: true }
    }
  }

  // Tarefa agendada (a cada 1 minuto): eventos novos desde o último ciclo e os que falharam antes.
  function generate() {
    const cursor = database.prepare('SELECT * FROM notification_cursor WHERE id = 1').get()
    const summary = { events: 0, created: 0, failed: 0 }
    const placeholders = watchedActions.map(() => '?').join(',')

    const retries = database.prepare('SELECT source, source_id FROM notification_retries ORDER BY source, source_id').all()
    // Janela de até batchSize registros de auditoria depois do marcador; o marcador avança até o
    // fim dessa janela, tenham ou não eventos observados.
    const maxAudit = database.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM (SELECT id FROM audit_records WHERE id > ? ORDER BY id LIMIT ?)')
      .get(cursor.last_audit_id, batchSize).id
    const audits = database.prepare(`
      SELECT * FROM audit_records WHERE id > ? AND id <= ? AND action IN (${placeholders}) ORDER BY id
    `).all(cursor.last_audit_id, maxAudit, ...watchedActions)
    const medals = database.prepare('SELECT rowid, * FROM pool_medals WHERE rowid > ? ORDER BY rowid LIMIT ?').all(cursor.last_medal_rowid, batchSize)

    const work = [
      ...retries.map((retry) => retry.source === 'audit'
        ? ['audit', retry.source_id, database.prepare('SELECT * FROM audit_records WHERE id = ?').get(retry.source_id)]
        : ['medal', retry.source_id, database.prepare('SELECT rowid, * FROM pool_medals WHERE rowid = ?').get(retry.source_id)]),
      ...audits.map((audit) => ['audit', audit.id, audit]),
      ...medals.map((medal) => ['medal', medal.rowid, medal]),
    ]
    for (const [source, id, row] of work) {
      if (!row) {
        database.prepare('DELETE FROM notification_retries WHERE source = ? AND source_id = ?').run(source, id)
        continue
      }
      summary.events += 1
      const outcome = processOne(source, id, (statement) => (source === 'audit' ? handleAudit(statement, row) : handleMedal(statement, row)))
      summary.created += outcome.created
      if (outcome.failed) summary.failed += 1
    }

    database.prepare('UPDATE notification_cursor SET last_audit_id = ?, last_medal_rowid = ? WHERE id = 1').run(
      Math.max(cursor.last_audit_id, maxAudit),
      medals.length ? medals.at(-1).rowid : cursor.last_medal_rowid,
    )
    if (summary.created > 0 || summary.failed > 0) logger.info('notifications', 'cycle_completed')
    return summary
  }

  function view(row) {
    return {
      id: row.id,
      type: row.type,
      message: row.message,
      poolId: row.pool_id,
      reference: { type: row.reference_type, id: row.reference_id },
      simulated: row.simulated === 1,
      createdAt: row.created_at,
      read: row.read_at !== null,
      readAt: row.read_at,
    }
  }

  const unreadCount = (userId) => database.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(userId).n

  // Lista própria, da mais recente para a mais antiga, com paginação por cursor (OPEN-156). Avisos do
  // mesmo ciclo têm o mesmo instante: a ordem de geração (eventos em ordem cronológica) desempata.
  function list(userId, { limit, before, unread } = {}) {
    const size = limit === undefined ? 20 : Number(limit)
    if (!Number.isInteger(size) || size < 1 || size > pageSizeMax) {
      throw new AppError(400, 'validation_error', 'Confira os parâmetros informados.', { limit: `Use um número de 1 a ${pageSizeMax}.` })
    }
    const conditions = ['user_id = ?']
    const params = [userId]
    if (unread === 'true') conditions.push('read_at IS NULL')
    if (before !== undefined) {
      const anchor = typeof before === 'string' ? database.prepare('SELECT created_at, rowid FROM notifications WHERE id = ? AND user_id = ?').get(before, userId) : undefined
      if (!anchor) throw new AppError(400, 'validation_error', 'Confira os parâmetros informados.', { before: 'Página inválida.' })
      conditions.push('(created_at < ? OR (created_at = ? AND rowid < ?))')
      params.push(anchor.created_at, anchor.created_at, anchor.rowid)
    }
    const rows = database.prepare(`
      SELECT * FROM notifications WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC, rowid DESC LIMIT ?
    `).all(...params, size + 1)
    const page = rows.slice(0, size)
    return {
      notifications: page.map(view),
      unreadCount: unreadCount(userId),
      nextBefore: rows.length > size ? page.at(-1).id : null,
    }
  }

  function markRead(userId, notificationId) {
    const row = typeof notificationId === 'string' && notificationId.length <= 100
      ? database.prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?').get(notificationId, userId)
      : undefined
    // Inexistente ou de outro usuário: a mesma resposta (CA-14).
    if (!row) throw new AppError(404, 'not_found', 'A notificação não foi encontrada.')
    if (row.read_at === null) {
      database.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND read_at IS NULL').run(nowIso(), row.id)
    }
    return { notification: view(database.prepare('SELECT * FROM notifications WHERE id = ?').get(row.id)), unreadCount: unreadCount(userId) }
  }

  function markAllRead(userId) {
    const updated = database.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(nowIso(), userId).changes
    return { updated, unreadCount: unreadCount(userId) }
  }

  return { generate, list, markRead, markAllRead }
}
