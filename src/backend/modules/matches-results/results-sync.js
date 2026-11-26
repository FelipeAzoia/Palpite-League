import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/app-error.js'
import { createLogger } from '../../shared/logger.js'
import { SportsProviderError } from './sports-provider.js'

// SPEC-013 — sincronização de resultados oficiais.
// O resultado oficial vem exclusivamente do provedor, pela porta fetchResults (INV-001); esta é a
// única escrita de status e placar das partidas acompanhadas, e não existe operação manual.

const statuses = Object.freeze(['scheduled', 'in_progress', 'finished', 'postponed', 'cancelled'])
const trackedStatuses = Object.freeze(['scheduled', 'in_progress', 'postponed'])
const failureCodes = Object.freeze(['timeout', 'response_error', 'invalid_response', 'persistence_error'])
const memberStatuses = Object.freeze(['approved_awaiting_payment', 'confirmed'])

export const resultActions = Object.freeze({
  statusSynced: 'match.status_synced',
  resultRecorded: 'match.result_recorded',
  resultCorrected: 'match.result_corrected',
  resultDivergence: 'match.result_divergence',
  syncFailed: 'results.sync_failed',
})

const statusSchema = { type: 'enum', values: statuses }

export const resultsAuditDetailSchemas = Object.freeze({
  [resultActions.statusSynced]: { previousStatus: statusSchema, newStatus: statusSchema },
  [resultActions.resultRecorded]: { previousStatus: statusSchema, newStatus: statusSchema, newScore: { type: 'score' } },
  [resultActions.resultCorrected]: { previousScore: { type: 'score' }, newScore: { type: 'score' } },
  [resultActions.resultDivergence]: { receivedScore: { type: 'score' }, keptScore: { type: 'score' } },
  [resultActions.syncFailed]: { reason: { type: 'enum', values: failureCodes } },
})

const system = Object.freeze({ type: 'system' })

function isScore(value) {
  return Number.isInteger(value) && value >= 0 && value <= 99
}

function scoreText(home, away) {
  return `${home}-${away}`
}

function invalidResponse() {
  return new SportsProviderError('invalid_response')
}

// Valida a resposta só para as partidas comparadas (por id do fornecedor). Itens de partidas não
// acompanhadas ou desconhecidas são ignorados; item inválido de partida acompanhada rejeita a
// resposta inteira (OPEN-75, INV-004).
export function validateResults(response, comparedProviderIds) {
  if (!response || !Array.isArray(response.matches)) throw invalidResponse()
  const items = new Map()
  for (const item of response.matches) {
    const id = item?.id === undefined || item?.id === null ? '' : String(item.id)
    if (!comparedProviderIds.has(id)) continue
    if (items.has(id) || !statuses.includes(item.status)) throw invalidResponse()
    const hasHome = item.homeScore !== null && item.homeScore !== undefined
    const hasAway = item.awayScore !== null && item.awayScore !== undefined
    let score = null
    if (item.status === 'finished' && (hasHome || hasAway)) {
      if (!isScore(item.homeScore) || !isScore(item.awayScore)) throw invalidResponse()
      score = { home: item.homeScore, away: item.awayScore }
    }
    items.set(id, { status: item.status, score })
  }
  return items
}

export function createResultsSyncService(database, provider, {
  auditStore,
  logger = createLogger(),
  now = Date.now,
  season = 2026,
} = {}) {
  // Partidas acompanhadas (INV-007): selecionadas por bolão ativo, já iniciadas e com status
  // agendada, em andamento ou adiada.
  function trackedMatches(nowIso) {
    return database.prepare(`
      SELECT DISTINCT m.id, m.provider_id, m.status, m.home_score, m.away_score
      FROM sports_matches m
      JOIN pool_matches pm ON pm.match_id = m.id
      JOIN pools p ON p.id = pm.pool_id AND p.status = 'active'
      WHERE m.starts_at IS NOT NULL AND m.starts_at <= ?
        AND m.status IN (${trackedStatuses.map(() => '?').join(',')})
    `).all(nowIso, ...trackedStatuses)
  }

  // Partidas encerradas de algum bolão, comparadas para correção ou divergência (OPEN-04).
  function finishedPoolMatches() {
    return database.prepare(`
      SELECT m.id, m.provider_id, m.status, m.home_score, m.away_score,
        EXISTS (
          SELECT 1 FROM pool_matches pm JOIN pools p ON p.id = pm.pool_id
          WHERE pm.match_id = m.id AND p.status = 'active'
        ) AS has_active_pool,
        d.home_score AS divergent_home, d.away_score AS divergent_away
      FROM sports_matches m
      LEFT JOIN sports_result_divergences d ON d.match_id = m.id
      WHERE m.status = 'finished' AND m.home_score IS NOT NULL
        AND EXISTS (SELECT 1 FROM pool_matches pm WHERE pm.match_id = m.id)
    `).all()
  }

  // Decide o que muda em cada partida comparada; não grava nada.
  function planChanges(tracked, finished, items) {
    const changes = []
    for (const match of tracked) {
      const item = items.get(match.provider_id)
      if (!item) continue
      if (item.status === 'finished') {
        // Encerrada sem placar: resultado indisponível, mantém os dados (E1).
        if (item.score) changes.push({ kind: 'record', match, status: 'finished', score: item.score })
      } else if (item.status !== 'scheduled' && item.status !== match.status) {
        // Em andamento, adiada ou cancelada; nunca placar parcial (INV-002).
        changes.push({ kind: 'status', match, status: item.status })
      }
    }
    for (const match of finished) {
      const item = items.get(match.provider_id)
      // Encerrada nunca regride (INV-010): só um novo placar final é considerado.
      if (!item || item.status !== 'finished' || !item.score) continue
      if (item.score.home === match.home_score && item.score.away === match.away_score) continue
      if (match.has_active_pool) {
        changes.push({ kind: 'correct', match, score: item.score })
      } else if (item.score.home !== match.divergent_home || item.score.away !== match.divergent_away) {
        changes.push({ kind: 'divergence', match, score: item.score })
      }
    }
    return changes
  }

  function auditEntry(change) {
    const object = { type: 'match', id: change.match.id }
    if (change.kind === 'status') {
      return { actor: system, action: resultActions.statusSynced, object, details: { previousStatus: change.match.status, newStatus: change.status } }
    }
    if (change.kind === 'record') {
      return {
        actor: system,
        action: resultActions.resultRecorded,
        object,
        details: { previousStatus: change.match.status, newStatus: 'finished', newScore: scoreText(change.score.home, change.score.away) },
      }
    }
    const kept = scoreText(change.match.home_score, change.match.away_score)
    const received = scoreText(change.score.home, change.score.away)
    return change.kind === 'correct'
      ? { actor: system, action: resultActions.resultCorrected, object, details: { previousScore: kept, newScore: received } }
      : { actor: system, action: resultActions.resultDivergence, object, details: { receivedScore: received, keptScore: kept } }
  }

  function applyChanges(changes, atIso) {
    const nextVersion = () => database.prepare('SELECT COALESCE(MAX(result_version), 0) + 1 AS version FROM sports_matches').get().version
    for (const change of changes) {
      const { match } = change
      if (change.kind === 'status') {
        const updated = database.prepare(`
          UPDATE sports_matches SET status = ? WHERE id = ? AND status = ?
        `).run(change.status, match.id, match.status)
        if (updated.changes !== 1) throw new Error('match changed during sync')
      } else if (change.kind === 'record' || change.kind === 'correct') {
        const updated = database.prepare(`
          UPDATE sports_matches
          SET status = 'finished', home_score = ?, away_score = ?, result_version = ?, result_recorded_at = ?
          WHERE id = ? AND status = ?
        `).run(change.score.home, change.score.away, nextVersion(), atIso, match.id, match.status)
        if (updated.changes !== 1) throw new Error('match changed during sync')
      } else {
        database.prepare(`
          INSERT INTO sports_result_divergences (match_id, home_score, away_score, recorded_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(match_id) DO UPDATE SET
            home_score = excluded.home_score, away_score = excluded.away_score, recorded_at = excluded.recorded_at
        `).run(match.id, change.score.home, change.score.away, atIso)
      }
    }
  }

  function writeMetadata(atIso, result, failureCode = null) {
    database.prepare(`
      INSERT INTO results_sync_metadata (id, last_attempt_at, last_success_at, last_attempt_result, last_failure_code)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        last_attempt_at = excluded.last_attempt_at,
        last_success_at = COALESCE(excluded.last_success_at, results_sync_metadata.last_success_at),
        last_attempt_result = excluded.last_attempt_result,
        last_failure_code = excluded.last_failure_code
    `).run(atIso, result === 'success' ? atIso : null, result, failureCode)
  }

  function recordFailure(atIso, code) {
    logger.error('results-sync', code)
    try {
      database.transaction(() => writeMetadata(atIso, 'failure', code))()
    } catch {
      logger.error('results-sync', 'metadata_failed')
    }
    try {
      auditStore.recordOutcome({
        actor: system,
        action: resultActions.syncFailed,
        object: { type: 'results_sync', id: randomUUID() },
        details: { reason: code },
      }, 'failure')
    } catch {
      // O registro técnico acima já indica a falha.
    }
    return { ok: false, failure: code }
  }

  function summary(changes) {
    const count = (kind) => changes.filter((change) => change.kind === kind).length
    return {
      ok: true,
      queried: true,
      statusChanges: count('status'),
      recorded: count('record'),
      corrected: count('correct'),
      divergences: count('divergence'),
    }
  }

  // Uma execução: no máximo uma consulta ao provedor (INV-015), gravação atômica (INV-004).
  async function syncResults() {
    const atIso = new Date(now()).toISOString()
    const tracked = trackedMatches(atIso)
    if (tracked.length === 0) {
      database.transaction(() => writeMetadata(atIso, 'success'))()
      return { ok: true, queried: false, statusChanges: 0, recorded: 0, corrected: 0, divergences: 0 }
    }
    const finished = finishedPoolMatches()
    const compared = new Set([...tracked, ...finished].map(({ provider_id: id }) => id))

    let items
    try {
      items = validateResults(await provider.fetchResults(season), compared)
    } catch (error) {
      const code = error instanceof SportsProviderError && failureCodes.includes(error.code) ? error.code : 'response_error'
      return recordFailure(atIso, code)
    }

    // Revalida contra o estado atual, porque a consulta ao provedor é assíncrona.
    const changes = planChanges(trackedMatches(atIso), finishedPoolMatches(), items)
    try {
      if (changes.length === 0) {
        // Sem mudanças: nada é gravado além da situação da sincronização, e sem auditoria (A2).
        database.transaction(() => writeMetadata(atIso, 'success'))()
      } else {
        auditStore.runAuditedOperation(changes.map(auditEntry), () => {
          applyChanges(changes, atIso)
          writeMetadata(atIso, 'success')
        })
      }
    } catch {
      return recordFailure(atIso, 'persistence_error')
    }
    return summary(changes)
  }

  // Gatilho da pontuação (SPEC-014, INV-009): partidas com versão do resultado maior que a última
  // processada, em ordem crescente de versão.
  function findResultsAfter(version = 0) {
    return database.prepare(`
      SELECT id, home_score, away_score, result_version, result_recorded_at
      FROM sports_matches
      WHERE status = 'finished' AND home_score IS NOT NULL AND result_version > ?
      ORDER BY result_version
    `).all(version).map((row) => ({
      matchId: row.id,
      homeScore: row.home_score,
      awayScore: row.away_score,
      resultVersion: row.result_version,
      recordedAt: row.result_recorded_at,
    }))
  }

  function lastSync() {
    const row = database.prepare('SELECT * FROM results_sync_metadata WHERE id = 1').get()
    return {
      lastAttemptAt: row?.last_attempt_at ?? null,
      lastSuccessAt: row?.last_success_at ?? null,
      lastAttemptFailed: row?.last_attempt_result === 'failure',
    }
  }

  // Resultados do bolão para membros (participação aprovada ou confirmada; INV-012).
  // O placar só aparece em partida encerrada.
  function getPoolResults(userId, poolId) {
    const member = typeof poolId === 'string' && poolId.length <= 100
      ? database.prepare(`
        SELECT p.id, p.name, p.status FROM pools p
        JOIN pool_participations part ON part.pool_id = p.id AND part.user_id = ?
        WHERE p.id = ? AND part.status IN (${memberStatuses.map(() => '?').join(',')})
      `).get(userId, poolId, ...memberStatuses)
      : undefined
    if (!member) throw new AppError(404, 'not_found', 'O bolão solicitado não foi encontrado.')

    const rows = database.prepare(`
      SELECT m.id, r.number AS round_number, home.name AS home_name, away.name AS away_name,
        home.crest AS home_crest, away.crest AS away_crest,
        m.starts_at, m.status, m.home_score, m.away_score
      FROM pool_matches pm
      JOIN sports_matches m ON m.id = pm.match_id
      JOIN sports_rounds r ON r.id = m.round_id
      JOIN sports_teams home ON home.id = m.home_team_id
      JOIN sports_teams away ON away.id = m.away_team_id
      WHERE pm.pool_id = ?
      ORDER BY r.number, m.starts_at IS NULL, m.starts_at, m.id
    `).all(member.id)

    const rounds = new Map()
    for (const row of rows) {
      if (!rounds.has(row.round_number)) rounds.set(row.round_number, [])
      rounds.get(row.round_number).push({
        id: row.id,
        roundNumber: row.round_number,
        home: { name: row.home_name, crest: row.home_crest },
        away: { name: row.away_name, crest: row.away_crest },
        startsAt: row.starts_at,
        status: row.status,
        score: row.status === 'finished' && row.home_score !== null
          ? { home: row.home_score, away: row.away_score }
          : null,
      })
    }
    return {
      pool: { id: member.id, name: member.name, status: member.status },
      rounds: [...rounds.entries()].map(([number, matches]) => ({ number, matches })),
      sync: lastSync(),
    }
  }

  return { syncResults, findResultsAfter, getPoolResults, lastSync }
}
