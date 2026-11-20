import { requireConfirmedParticipation } from './predictions.js'

// SPEC-015 — ranking acumulado, desempate e desempenho por rodada.
// Somente leitura (INV-013): a classificação é calculada na consulta a partir dos pontos
// persistidos pela SPEC-014, sem ranking gravado que possa divergir (INV-005, OPEN-78).

export const tiebreakers = Object.freeze(['exact_scores', 'correct_results', 'last_round_points'])
// Partidas "não computáveis" para o encerramento da rodada (OPEN-02).
const nonComputableStatuses = Object.freeze(['cancelled'])

const nameCollator = new Intl.Collator('pt-BR', { sensitivity: 'base' })

// Valor do critério de desempate do bolão (INV-003, INV-009).
export function tiebreakValue(participant, tiebreaker) {
  if (tiebreaker === 'exact_scores') return participant.exactScores
  if (tiebreaker === 'correct_results') return participant.correctResults
  if (tiebreaker === 'last_round_points') return participant.lastRoundPoints
  throw new TypeError('unknown tiebreaker')
}

// Função de classificação pura e reutilizável (INV-001, INV-003, INV-004, INV-012, INV-014):
// pontos decrescentes, depois o critério de desempate; empates não resolvidos recebem a mesma
// posição, com salto (1, 1, 3); a ordem de exibição entre eles é por nome e depois por id.
export function classify(participants, tiebreaker) {
  const rows = participants.map((participant) => ({
    ...participant,
    tiebreakValue: tiebreakValue(participant, tiebreaker),
  }))
  rows.sort((first, second) => second.totalPoints - first.totalPoints
    || second.tiebreakValue - first.tiebreakValue
    || nameCollator.compare(first.name, second.name)
    || (first.id < second.id ? -1 : first.id > second.id ? 1 : 0))

  let position = 0
  return rows.map((row, index) => {
    const previous = rows[index - 1]
    if (!previous || previous.totalPoints !== row.totalPoints || previous.tiebreakValue !== row.tiebreakValue) {
      position = index + 1
    }
    return { ...row, position }
  })
}

export function createRankingService(database) {
  // Rodadas do bolão: rodadas oficiais com ao menos uma partida selecionada (INV-007), com o
  // indicador de encerrada para o bolão (INV-008).
  function poolRounds(poolId) {
    return database.prepare(`
      SELECT r.number,
        COUNT(*) AS total_matches,
        SUM(CASE WHEN m.status = 'finished' THEN 1 ELSE 0 END) AS finished_matches,
        SUM(CASE WHEN m.status = 'finished' OR m.status IN (${nonComputableStatuses.map(() => '?').join(',')}) THEN 1 ELSE 0 END) AS closed_matches
      FROM pool_matches pm
      JOIN sports_matches m ON m.id = pm.match_id
      JOIN sports_rounds r ON r.id = m.round_id
      WHERE pm.pool_id = ?
      GROUP BY r.number
      ORDER BY r.number
    `).all(...nonComputableStatuses, poolId).map((row) => ({
      number: row.number,
      totalMatches: row.total_matches,
      finishedMatches: row.finished_matches,
      closed: row.closed_matches === row.total_matches,
    }))
  }

  // Pontuação por rodada (função reutilizável pelas medalhas, SPEC-016): soma dos pontos dos
  // palpites de cada participação nas partidas selecionadas do bolão, por rodada.
  function roundPoints(poolId) {
    const rows = database.prepare(`
      SELECT pr.participation_id, r.number AS round_number,
        COALESCE(SUM(pr.points), 0) AS points,
        SUM(CASE WHEN pr.points = 5 THEN 1 ELSE 0 END) AS exact_scores,
        SUM(CASE WHEN pr.points IN (2, 5) THEN 1 ELSE 0 END) AS correct_results,
        COUNT(*) AS predictions
      FROM predictions pr
      JOIN pool_participations part ON part.id = pr.participation_id AND part.pool_id = ?
      JOIN pool_matches pm ON pm.pool_id = part.pool_id AND pm.match_id = pr.match_id
      JOIN sports_matches m ON m.id = pr.match_id
      JOIN sports_rounds r ON r.id = m.round_id
      GROUP BY pr.participation_id, r.number
    `).all(poolId)
    const byParticipation = new Map()
    for (const row of rows) {
      if (!byParticipation.has(row.participation_id)) byParticipation.set(row.participation_id, new Map())
      byParticipation.get(row.participation_id).set(row.round_number, {
        points: row.points,
        exactScores: row.exact_scores,
        correctResults: row.correct_results,
        predictions: row.predictions,
      })
    }
    return byParticipation
  }

  // Classificação interna do bolão (CA-15): mesma base para a consulta, as medalhas e o encerramento.
  function computeRanking(poolId, tiebreaker) {
    const rounds = poolRounds(poolId)
    const lastRound = rounds.at(-1)?.number ?? null
    const perRound = roundPoints(poolId)
    // Só participações confirmadas entram (INV-002), inclusive o administrador.
    const participations = database.prepare(`
      SELECT part.id, u.name, part.total_points
      FROM pool_participations part JOIN users u ON u.id = part.user_id
      WHERE part.pool_id = ? AND part.status = 'confirmed'
    `).all(poolId)

    const participants = participations.map((row) => {
      const stats = perRound.get(row.id) ?? new Map()
      const sum = (field) => [...stats.values()].reduce((total, round) => total + round[field], 0)
      return {
        id: row.id,
        name: row.name,
        totalPoints: row.total_points,
        exactScores: sum('exactScores'),
        correctResults: sum('correctResults'),
        lastRoundPoints: lastRound === null ? 0 : stats.get(lastRound)?.points ?? 0,
        roundPoints: rounds.map(({ number }) => ({ round: number, points: stats.get(number)?.points ?? 0 })),
      }
    })
    return { rounds, ranking: classify(participants, tiebreaker) }
  }

  function getRanking(userId, poolId) {
    const member = requireConfirmedParticipation(database, userId, poolId)
    const { rounds, ranking } = computeRanking(member.poolId, member.tiebreaker)
    // Só posição, nome, total, valor do desempate e pontos por rodada (INV-011).
    return {
      pool: { id: member.poolId, name: member.poolName, status: member.poolStatus },
      tiebreaker: member.tiebreaker,
      rounds: rounds.map(({ number, closed }) => ({ number, closed })),
      participants: ranking.map((row) => ({
        id: row.id,
        position: row.position,
        name: row.name,
        totalPoints: row.totalPoints,
        tiebreakValue: row.tiebreakValue,
        roundPoints: row.roundPoints,
        isRequester: row.id === member.participationId,
      })),
    }
  }

  // Desempenho do próprio participante por rodada (OPEN-79).
  function getMyPerformance(userId, poolId) {
    const member = requireConfirmedParticipation(database, userId, poolId)
    const stats = roundPoints(member.poolId).get(member.participationId) ?? new Map()
    return {
      pool: { id: member.poolId, name: member.poolName, status: member.poolStatus },
      rounds: poolRounds(member.poolId).map((round) => ({
        number: round.number,
        points: stats.get(round.number)?.points ?? 0,
        hits: stats.get(round.number)?.correctResults ?? 0,
        predictions: stats.get(round.number)?.predictions ?? 0,
        finishedMatches: round.finishedMatches,
        totalMatches: round.totalMatches,
        closed: round.closed,
      })),
    }
  }

  function poolTiebreaker(poolId) {
    return database.prepare('SELECT tiebreaker FROM pools WHERE id = ?').get(poolId)?.tiebreaker
  }

  return {
    getRanking,
    getMyPerformance,
    computeRanking: (poolId) => computeRanking(poolId, poolTiebreaker(poolId)),
    roundPoints,
    poolRounds,
  }
}
