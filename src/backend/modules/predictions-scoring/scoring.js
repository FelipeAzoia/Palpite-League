import { createLogger } from '../../shared/logger.js'

// SPEC-014 — cálculo automático da pontuação.
// Consome o resultado oficial da SPEC-013 pela versão do resultado; não chama o provedor (INV-014).

export const resultPoints = 2
export const exactScorePoints = 5

export function outcomeOf(homeGoals, awayGoals) {
  if (homeGoals > awayGoals) return 'home'
  if (homeGoals < awayGoals) return 'away'
  return 'draw'
}

// Regra de pontuação (INV-002, INV-003, INV-015): função pura do palpite e do placar oficial.
// Resultado certo vale 2; placar exato certo vale 5; acertar só o resultado com placar errado vale 0.
export function scorePrediction(prediction, officialScore) {
  if (prediction.type === 'result') {
    return prediction.outcome === outcomeOf(officialScore.home, officialScore.away) ? resultPoints : 0
  }
  if (prediction.type === 'exact_score') {
    return prediction.homeGoals === officialScore.home && prediction.awayGoals === officialScore.away
      ? exactScorePoints
      : 0
  }
  throw new TypeError('unknown prediction type')
}

export function createScoringService(database, { logger = createLogger() } = {}) {
  // Partidas encerradas, com placar oficial, cuja versão do resultado ainda não foi pontuada (INV-006).
  function pendingMatches() {
    return database.prepare(`
      SELECT id, home_score, away_score, result_version
      FROM sports_matches
      WHERE status = 'finished' AND home_score IS NOT NULL AND result_version > scored_version
      ORDER BY result_version, id
    `).all()
  }

  // Processa uma partida numa transação própria (INV-007): pontos atribuídos, nunca somados
  // (INV-004); só palpites de bolões ativos (INV-009), de qualquer participação (OPEN-77).
  function scoreMatch(match) {
    return database.transaction(() => {
      const current = database.prepare(`
        SELECT home_score, away_score, result_version, scored_version, status FROM sports_matches WHERE id = ?
      `).get(match.id)
      if (!current || current.status !== 'finished' || current.home_score === null
        || current.result_version <= current.scored_version) {
        return 0
      }
      const official = { home: current.home_score, away: current.away_score }
      const predictions = database.prepare(`
        SELECT pr.id, pr.participation_id, pr.type, pr.predicted_outcome, pr.home_goals, pr.away_goals
        FROM predictions pr
        JOIN pool_participations part ON part.id = pr.participation_id
        JOIN pools p ON p.id = part.pool_id AND p.status = 'active'
        WHERE pr.match_id = ?
      `).all(match.id)

      const setPoints = database.prepare('UPDATE predictions SET points = ? WHERE id = ?')
      for (const prediction of predictions) {
        setPoints.run(scorePrediction({
          type: prediction.type,
          outcome: prediction.predicted_outcome,
          homeGoals: prediction.home_goals,
          awayGoals: prediction.away_goals,
        }, official), prediction.id)
      }

      // Pontuação acumulada derivada: soma dos pontos dos palpites da participação (INV-008).
      const recalculate = database.prepare(`
        UPDATE pool_participations
        SET total_points = (SELECT COALESCE(SUM(points), 0) FROM predictions WHERE participation_id = ?)
        WHERE id = ?
      `)
      for (const participationId of new Set(predictions.map(({ participation_id: id }) => id))) {
        recalculate.run(participationId, participationId)
      }

      database.prepare('UPDATE sports_matches SET scored_version = ? WHERE id = ?').run(current.result_version, match.id)
      return predictions.length
    })()
  }

  // Tarefa agendada: idempotente; a falha de uma partida não impede as demais (E2).
  function scorePendingMatches() {
    const summary = { processedMatches: 0, updatedPredictions: 0, failedMatches: [] }
    for (const match of pendingMatches()) {
      try {
        summary.updatedPredictions += scoreMatch(match)
        summary.processedMatches += 1
        logger.info('scoring', 'match_scored')
      } catch {
        logger.error('scoring', 'match_failed')
        summary.failedMatches.push(match.id)
      }
    }
    return summary
  }

  // Leitura interna para a SPEC-015.
  function totalPointsOf(participationId) {
    return database.prepare('SELECT total_points FROM pool_participations WHERE id = ?').get(participationId)?.total_points ?? null
  }

  return { scorePendingMatches, totalPointsOf }
}
