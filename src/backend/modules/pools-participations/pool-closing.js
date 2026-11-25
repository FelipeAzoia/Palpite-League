import { AppError } from '../../shared/app-error.js'
import { createLogger } from '../../shared/logger.js'
import { poolNotFound } from './pool-access.js'
import { computePrizeShares } from './prize-models.js'

// SPEC-025 — encerramento automático e determinação do vencedor.
// - só a tarefa agendada encerra; não existe operação manual (INV-001);
// - o bolão encerra quando o período terminou (fim do dia da data final, em UTC) e toda partida
//   selecionada está apurável: encerrada com o resultado oficial já pontuado, ou cancelada (INV-002,
//   INV-010, OPEN-135);
// - classificação final pela regra da SPEC-015, só com participações elegíveis; vencedores são os
//   elegíveis na primeira posição com pontuação positiva (INV-004 a INV-006, OPEN-137);
// - encerramento, classificação, vencedores e auditoria numa única transação, uma única vez
//   (INV-003, INV-007); nenhuma movimentação financeira (INV-009).

export const closingActions = Object.freeze({
  ended: 'pool.ended',
  winnersRecorded: 'pool.winners_recorded',
})

export const closingAuditDetailSchemas = Object.freeze({
  [closingActions.ended]: {
    eligibleCount: { type: 'integer' },
    winnerCount: { type: 'integer' },
    noWinnerReason: { type: 'enum', values: ['no_eligible', 'zero_points'] },
  },
  [closingActions.winnersRecorded]: { winnerCount: { type: 'integer' } },
})

const systemActor = Object.freeze({ type: 'system' })
const dayMs = 24 * 60 * 60 * 1000

// Fim do período: o fim do dia da data final, em UTC (OPEN-135).
export function periodEndMs(endsOn) {
  return Date.parse(`${endsOn}T00:00:00.000Z`) + dayMs
}

export function createPoolClosingService(database, { auditStore, ranking, logger = createLogger(), now = Date.now }) {
  if (!auditStore || !ranking) throw new TypeError('auditStore and ranking are required')

  // Partida apurável: encerrada com resultado oficial pontuado, ou cancelada (sem resultado).
  // Adiada, em andamento, agendada ou encerrada sem placar mantêm o bolão ativo (A1, INV-010).
  function unresolvedMatches(poolId) {
    return database.prepare(`
      SELECT COUNT(*) AS n FROM pool_matches pm JOIN sports_matches m ON m.id = pm.match_id
      WHERE pm.pool_id = ?
        AND NOT (
          m.status = 'cancelled'
          OR (m.status = 'finished' AND m.home_score IS NOT NULL AND m.result_version > 0
              AND m.scored_version = m.result_version)
        )
    `).get(poolId).n
  }

  function candidates(nowMs) {
    return database.prepare("SELECT id, ends_on, entry_fee_cents, tiebreaker FROM pools WHERE status = 'active' ORDER BY ends_on, id")
      .all()
      .filter((pool) => nowMs >= periodEndMs(pool.ends_on))
  }

  // Elegíveis (INV-005, RB63): confirmadas, com pagamento confirmado quando há taxa, e que não
  // saíram. A classificação interna da SPEC-015 já considera só as confirmadas.
  function finalStandings(pool) {
    const eligible = new Set(database.prepare(`
      SELECT id FROM pool_participations
      WHERE pool_id = ? AND status = 'confirmed' AND (? = 0 OR payment_confirmed = 1)
    `).all(pool.id, pool.entry_fee_cents > 0 ? 1 : 0).map(({ id }) => id))
    const { ranking: standings } = ranking.computeRanking(pool.id)
    return standings.filter((row) => eligible.has(row.id))
  }

  function closePool(pool, atIso) {
    const standings = finalStandings(pool)
    const top = standings.filter((row) => row.position === 1 && row.totalPoints > 0)
    let noWinnerReason = null
    if (standings.length === 0) noWinnerReason = 'no_eligible'
    else if (top.length === 0) noWinnerReason = 'zero_points'
    const winners = new Set(top.map(({ id }) => id))

    const entries = [{
      actor: systemActor,
      action: closingActions.ended,
      object: { type: 'pool', id: pool.id },
      details: {
        eligibleCount: standings.length,
        winnerCount: winners.size,
        ...(noWinnerReason ? { noWinnerReason } : {}),
      },
    }]
    if (winners.size > 0) {
      entries.push({
        actor: systemActor,
        action: closingActions.winnersRecorded,
        object: { type: 'pool', id: pool.id },
        details: { winnerCount: winners.size },
      })
    }

    auditStore.runAuditedOperation(entries, () => {
      // Revalida na transação: ainda ativo e ainda apurável (A6, A7).
      const updated = database.prepare(`
        UPDATE pools SET status = 'ended', ended_at = ? WHERE id = ? AND status = 'active'
      `).run(atIso, pool.id)
      if (updated.changes !== 1 || unresolvedMatches(pool.id) > 0) throw new Error('pool changed during closing')
      database.prepare(`
        INSERT INTO pool_final_results (pool_id, ended_at, tiebreaker, eligible_count, winner_count, no_winner_reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(pool.id, atIso, pool.tiebreaker, standings.length, winners.size, noWinnerReason)
      const insert = database.prepare(`
        INSERT INTO pool_final_standings (pool_id, participation_id, position, total_points, tiebreak_value, winner)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      for (const row of standings) {
        insert.run(pool.id, row.id, row.position, row.totalPoints, row.tiebreakValue, winners.has(row.id) ? 1 : 0)
      }
    })
    return { poolId: pool.id, winners: winners.size, noWinnerReason }
  }

  // Tarefa agendada (a cada 1 minuto): cada bolão na sua transação; a falha de um não impede os
  // demais e o próximo ciclo tenta de novo (A7).
  function closeDuePools() {
    const nowMs = now()
    const atIso = new Date(nowMs).toISOString()
    const summary = { checked: 0, closed: 0, waiting: 0, failed: 0 }
    for (const pool of candidates(nowMs)) {
      summary.checked += 1
      if (unresolvedMatches(pool.id) > 0) {
        summary.waiting += 1
        continue
      }
      try {
        closePool(pool, atIso)
        summary.closed += 1
      } catch {
        logger.error('pool-closing', 'close_failed')
        summary.failed += 1
      }
    }
    if (summary.closed > 0 || summary.failed > 0) logger.info('pool-closing', 'cycle_completed')
    return summary
  }

  // Resultado final (OPEN-140): mesma regra de acesso do ranking — participante confirmado; os
  // demais recebem o 404 de bolão inexistente; bolão ativo recebe conflito.
  function getFinalResult(userId, poolId) {
    const member = typeof poolId === 'string' && poolId.length <= 100
      ? database.prepare(`
        SELECT p.id, p.name, p.status, p.prize_model, part.id AS participation_id, part.status AS participation_status
        FROM pools p JOIN pool_participations part ON part.pool_id = p.id AND part.user_id = ?
        WHERE p.id = ?
      `).get(userId, poolId)
      : undefined
    if (!member || member.participation_status !== 'confirmed') throw poolNotFound()
    if (member.status !== 'ended') {
      throw new AppError(409, 'pool_not_ended', 'O resultado final fica disponível quando o bolão for encerrado.')
    }
    const result = database.prepare('SELECT * FROM pool_final_results WHERE pool_id = ?').get(member.id)
    const standings = database.prepare(`
      SELECT s.participation_id, s.position, s.total_points, s.tiebreak_value, s.winner, u.name
      FROM pool_final_standings s
      JOIN pool_participations part ON part.id = s.participation_id
      JOIN users u ON u.id = part.user_id
      WHERE s.pool_id = ?
      ORDER BY s.position, u.name COLLATE NOCASE, s.participation_id
    `).all(member.id)
    // Premiados e porcentagem efetiva de cada um pelo modelo do bolão (SPEC-030).
    const shares = new Map(computePrizeShares(member.prize_model, standings.map((row) => ({
      participationId: row.participation_id, position: row.position, totalPoints: row.total_points,
    })), 0).map((share) => [share.participationId, share]))
    return {
      pool: { id: member.id, name: member.name, status: member.status },
      prizeModel: member.prize_model,
      endedAt: result.ended_at,
      tiebreaker: result.tiebreaker,
      hasWinner: result.winner_count > 0,
      noWinnerReason: result.no_winner_reason,
      standings: standings.map((row) => ({
        id: row.participation_id,
        position: row.position,
        name: row.name,
        totalPoints: row.total_points,
        tiebreakValue: row.tiebreak_value,
        winner: row.winner === 1,
        awarded: shares.has(row.participation_id),
        prizePercent: shares.has(row.participation_id) ? shares.get(row.participation_id).percentBasisPoints / 100 : null,
        isRequester: row.participation_id === member.participation_id,
      })),
    }
  }

  return { closeDuePools, getFinalResult }
}
