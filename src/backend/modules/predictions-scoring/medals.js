import { randomUUID } from 'node:crypto'
import { createLogger } from '../../shared/logger.js'
import { requireConfirmedParticipation } from './predictions.js'

// SPEC-016 — melhor jogador da rodada e medalhas.
// A medalha é exclusivamente visual (INV-006): esta Spec só lê pontos e classificação e escreve
// apenas em pool_medals. Usa somente dados locais (INV-014).

// Melhores jogadores de uma rodada: todos os elegíveis empatados na maior pontuação, desde que
// ela seja maior que zero (INV-002). Função pura.
export function roundWinners(scores) {
  const best = Math.max(0, ...scores.map(({ points }) => points))
  return best > 0 ? scores.filter(({ points }) => points === best).map(({ participationId }) => participationId) : []
}

export function createMedalsService(database, { ranking, logger = createLogger(), now = Date.now } = {}) {
  // Rodadas prontas do bolão (INV-001): encerradas para o bolão (SPEC-015) e com todos os
  // resultados das partidas encerradas pontuados na versão atual (SPEC-014).
  function readyRounds(poolId) {
    const pending = new Set(database.prepare(`
      SELECT DISTINCT r.number
      FROM pool_matches pm
      JOIN sports_matches m ON m.id = pm.match_id
      JOIN sports_rounds r ON r.id = m.round_id
      WHERE pm.pool_id = ? AND m.status = 'finished' AND m.scored_version < m.result_version
    `).all(poolId).map(({ number }) => number))
    return ranking.poolRounds(poolId).filter((round) => round.closed && !pending.has(round.number)).map(({ number }) => number)
  }

  function confirmedParticipations(poolId) {
    return database.prepare("SELECT id FROM pool_participations WHERE pool_id = ? AND status = 'confirmed'")
      .all(poolId).map(({ id }) => id)
  }

  // Reconcilia as medalhas de uma rodada numa transação própria (INV-007, INV-009): concede as
  // faltantes, retira as que deixaram de valer e preserva a data de concessão de quem continua.
  // Medalhas de quem não está mais confirmado (por exemplo, saiu) permanecem gravadas (INV-012).
  function reconcileRound(poolId, roundNumber) {
    return database.transaction(() => {
      const pool = database.prepare('SELECT status FROM pools WHERE id = ?').get(poolId)
      if (pool?.status !== 'active') return { awarded: 0, revoked: 0 }
      const perRound = ranking.roundPoints(poolId)
      const eligible = confirmedParticipations(poolId)
      const winners = new Set(roundWinners(eligible.map((participationId) => ({
        participationId,
        points: perRound.get(participationId)?.get(roundNumber)?.points ?? 0,
      }))))

      const current = database.prepare(`
        SELECT medal.id, medal.participation_id, part.status
        FROM pool_medals medal JOIN pool_participations part ON part.id = medal.participation_id
        WHERE medal.pool_id = ? AND medal.round_number = ?
      `).all(poolId, roundNumber)
      const holders = new Set(current.map(({ participation_id: id }) => id))

      let revoked = 0
      const remove = database.prepare('DELETE FROM pool_medals WHERE id = ?')
      for (const medal of current) {
        if (medal.status === 'confirmed' && !winners.has(medal.participation_id)) {
          remove.run(medal.id)
          revoked += 1
        }
      }

      let awarded = 0
      const awardedAt = new Date(now()).toISOString()
      const insert = database.prepare(`
        INSERT INTO pool_medals (id, pool_id, participation_id, round_number, awarded_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (participation_id, round_number) DO NOTHING
      `)
      for (const participationId of winners) {
        if (holders.has(participationId)) continue
        awarded += insert.run(randomUUID(), poolId, participationId, roundNumber, awardedAt).changes
      }
      return { awarded, revoked }
    })()
  }

  // Tarefa agendada: idempotente e isolada de falhas por rodada (INV-010, E3). Bolões encerrados
  // não são recalculados (INV-008).
  function reconcileMedals() {
    const summary = { processedRounds: 0, awarded: 0, revoked: 0, failedRounds: [] }
    const pools = database.prepare("SELECT id FROM pools WHERE status = 'active' ORDER BY id").all()
    for (const { id: poolId } of pools) {
      for (const roundNumber of readyRounds(poolId)) {
        try {
          const result = reconcileRound(poolId, roundNumber)
          summary.processedRounds += 1
          summary.awarded += result.awarded
          summary.revoked += result.revoked
          if (result.awarded || result.revoked) logger.info('medals', 'round_reconciled')
        } catch {
          logger.error('medals', 'round_failed')
          summary.failedRounds.push({ poolId, roundNumber })
        }
      }
    }
    return summary
  }

  // Medalhas exibidas: só de participações confirmadas (INV-012).
  function displayedMedals(poolId) {
    return database.prepare(`
      SELECT medal.participation_id, medal.round_number, medal.awarded_at, u.name
      FROM pool_medals medal
      JOIN pool_participations part ON part.id = medal.participation_id AND part.status = 'confirmed'
      JOIN users u ON u.id = part.user_id
      WHERE medal.pool_id = ?
      ORDER BY medal.round_number, u.name, medal.participation_id
    `).all(poolId)
  }

  function medalCounts(poolId) {
    const counts = new Map()
    for (const medal of displayedMedals(poolId)) counts.set(medal.participation_id, (counts.get(medal.participation_id) ?? 0) + 1)
    return counts
  }

  // Consulta das medalhas do bolão (OPEN-81): mesma regra de acesso do ranking.
  function getPoolMedals(userId, poolId) {
    const member = requireConfirmedParticipation(database, userId, poolId)
    const medals = displayedMedals(member.poolId)
    const perRound = ranking.roundPoints(member.poolId)
    const closedRounds = ranking.poolRounds(member.poolId).filter(({ closed }) => closed)

    const participants = database.prepare(`
      SELECT part.id, u.name FROM pool_participations part JOIN users u ON u.id = part.user_id
      WHERE part.pool_id = ? AND part.status = 'confirmed'
    `).all(member.poolId)
    const nameCollator = new Intl.Collator('pt-BR', { sensitivity: 'base' })

    return {
      pool: { id: member.poolId, name: member.poolName, status: member.poolStatus },
      rounds: closedRounds.map(({ number }) => ({
        number,
        winners: medals.filter(({ round_number: round }) => round === number).map((medal) => ({
          participationId: medal.participation_id,
          name: medal.name,
          points: perRound.get(medal.participation_id)?.get(number)?.points ?? 0,
          awardedAt: medal.awarded_at,
          isRequester: medal.participation_id === member.participationId,
        })),
      })),
      participants: participants
        .map((participant) => {
          const rounds = medals.filter(({ participation_id: id }) => id === participant.id).map(({ round_number: round }) => round)
          return {
            participationId: participant.id,
            name: participant.name,
            medalRounds: rounds,
            count: rounds.length,
            isRequester: participant.id === member.participationId,
          }
        })
        .filter(({ count }) => count > 0)
        .sort((first, second) => second.count - first.count || nameCollator.compare(first.name, second.name)
          || (first.participationId < second.participationId ? -1 : 1)),
    }
  }

  return { reconcileMedals, getPoolMedals, medalCounts, readyRounds }
}
