import { AppError } from '../../shared/app-error.js'
import { createLogger } from '../../shared/logger.js'
import { SportsProviderError } from './sports-provider.js'

// SPEC-021 — resultados ao vivo em bolões Premium.
// O dado ao vivo é guardado em sports_live_scores, separado do resultado oficial da SPEC-013
// (INV-001): esta Spec nunca escreve em sports_matches nem aciona pontuação, ranking ou medalhas.

const statuses = Object.freeze(['scheduled', 'in_progress', 'finished', 'postponed', 'cancelled'])
// Estados em que a partida ainda pode mudar e por isso continua sendo consultada (A2).
const openStatuses = Object.freeze(['scheduled', 'in_progress'])
const scoredStatuses = Object.freeze(['in_progress', 'finished'])
const failureCodes = Object.freeze(['timeout', 'response_error', 'invalid_response', 'proof_pending'])

function isScore(value) {
  return Number.isInteger(value) && value >= 0 && value <= 99
}

function isUtcInstant(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && /(Z|[+-]\d\d:\d\d)$/.test(value)
}

// Valida uma leitura do provedor (OPEN-101): partida conhecida (a pedida), status válido e placar
// inteiro não negativo nos dois lados enquanto a partida está em andamento ou encerrada. Queda de
// placar é aceita (correção do provedor). Devolve null para leitura inválida.
export function validateLiveReading(reading, providerId, fallbackInstant) {
  if (!reading || typeof reading !== 'object') return null
  const id = reading.id === undefined || reading.id === null ? '' : String(reading.id)
  if (id !== providerId || !statuses.includes(reading.status)) return null
  let score = null
  if (scoredStatuses.includes(reading.status)) {
    if (!isScore(reading.homeScore) || !isScore(reading.awayScore)) return null
    score = { home: reading.homeScore, away: reading.awayScore }
  }
  let observedAt = fallbackInstant
  if (reading.observedAt !== undefined && reading.observedAt !== null) {
    if (!isUtcInstant(reading.observedAt)) return null
    observedAt = new Date(reading.observedAt).toISOString()
  }
  return { status: reading.status, score, observedAt }
}

export function createLiveResultsService(database, provider, {
  logger = createLogger(),
  now = Date.now,
} = {}) {
  // Partidas elegíveis (INV-002, INV-009): selecionadas por bolão ativo com o recurso habilitado,
  // já iniciadas, sem resultado oficial e ainda abertas na última leitura ao vivo. DISTINCT garante
  // uma consulta por partida, mesmo quando ela está em vários bolões (INV-007).
  function eligibleMatches(nowIso) {
    return database.prepare(`
      SELECT DISTINCT m.id, m.provider_id
      FROM sports_matches m
      JOIN pool_matches pm ON pm.match_id = m.id
      JOIN pools p ON p.id = pm.pool_id AND p.status = 'active' AND p.live_results = 1
      LEFT JOIN sports_live_scores l ON l.match_id = m.id
      WHERE m.starts_at IS NOT NULL AND m.starts_at <= ?
        AND m.status IN (${openStatuses.map(() => '?').join(',')})
        AND (l.status IS NULL OR l.status IN (${openStatuses.map(() => '?').join(',')}))
      ORDER BY m.starts_at, m.id
    `).all(nowIso, ...openStatuses, ...openStatuses)
  }

  async function readMatch(match, nowIso) {
    try {
      const reading = validateLiveReading(await provider.fetchLiveScore(match.provider_id), match.provider_id, nowIso)
      return reading ? { match, reading } : { match, failure: 'invalid_response' }
    } catch (error) {
      const code = error instanceof SportsProviderError && failureCodes.includes(error.code) ? error.code : 'response_error'
      return { match, failure: code }
    }
  }

  // Grava a leitura só se ela não for mais antiga que a já registrada (INV-010); reexecutar com a
  // mesma leitura não duplica nada, porque há uma linha por partida.
  const upsert = () => database.prepare(`
    INSERT INTO sports_live_scores (match_id, status, home_score, away_score, observed_at, source)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(match_id) DO UPDATE SET
      status = excluded.status,
      home_score = excluded.home_score,
      away_score = excluded.away_score,
      observed_at = excluded.observed_at,
      source = excluded.source
    WHERE excluded.observed_at >= sports_live_scores.observed_at
  `)

  // Um ciclo da tarefa agendada (OPEN-99): sem partidas elegíveis, o provedor não é consultado
  // (A1); falhas mantêm o último dado válido e vão só ao log técnico, sem repetição imediata e sem
  // auditoria (E1, OPEN-104).
  async function refreshLiveScores() {
    const nowIso = new Date(now()).toISOString()
    const matches = eligibleMatches(nowIso)
    if (matches.length === 0) return { ok: true, queried: 0, updated: 0, discarded: 0, failures: 0 }

    const outcomes = await Promise.all(matches.map((match) => readMatch(match, nowIso)))
    const failures = outcomes.filter(({ failure }) => failure)
    for (const { failure } of failures) logger.error('live-results', failure)

    let updated = 0
    const readings = outcomes.filter(({ reading }) => reading)
    try {
      database.transaction(() => {
        const statement = upsert()
        for (const { match, reading } of readings) {
          const result = statement.run(
            match.id, reading.status, reading.score?.home ?? null, reading.score?.away ?? null,
            reading.observedAt, provider.source === 'api-football' ? 'api-football' : 'simulated',
          )
          updated += result.changes
        }
      })()
    } catch {
      logger.error('live-results', 'persistence_error')
      return { ok: false, queried: matches.length, updated: 0, discarded: 0, failures: matches.length }
    }

    logger.info('live-results', failures.length > 0 ? 'cycle_completed_with_failures' : 'cycle_completed')
    return {
      ok: failures.length === 0,
      queried: matches.length,
      updated,
      discarded: readings.length - updated,
      failures: failures.length,
    }
  }

  function notFound() {
    return new AppError(404, 'not_found', 'O bolão solicitado não foi encontrado.')
  }

  // Consulta do participante (INV-006, OPEN-102): somente participação confirmada; os demais casos
  // recebem o mesmo 404, sem revelar o bolão.
  function getPoolLive(userId, poolId) {
    const pool = typeof poolId === 'string' && poolId.length <= 100
      ? database.prepare(`
        SELECT p.id, p.name, p.status, p.live_results FROM pools p
        JOIN pool_participations part ON part.pool_id = p.id AND part.user_id = ? AND part.status = 'confirmed'
        WHERE p.id = ?
      `).get(userId, poolId)
      : undefined
    if (!pool) throw notFound()

    const poolView = { id: pool.id, name: pool.name, status: pool.status }
    // Bolão sem o recurso (A4, INV-002) ou já encerrado (OPEN-102): nenhum dado parcial sai do backend.
    if (pool.live_results !== 1) return { pool: poolView, available: false, reason: 'not_enabled', matches: [] }
    if (pool.status !== 'active') return { pool: poolView, available: false, reason: 'pool_closed', matches: [] }

    const nowIso = new Date(now()).toISOString()
    // Partidas iniciadas e sem resultado oficial; com resultado oficial, ele prevalece (A6, INV-008).
    const rows = database.prepare(`
      SELECT m.id, m.status AS official_status, m.starts_at,
        l.status AS live_status, l.home_score, l.away_score, l.observed_at
      FROM pool_matches pm
      JOIN sports_matches m ON m.id = pm.match_id
      LEFT JOIN sports_live_scores l ON l.match_id = m.id
      WHERE pm.pool_id = ? AND m.starts_at IS NOT NULL AND m.starts_at <= ? AND m.status <> 'finished'
        AND (m.status IN (${openStatuses.map(() => '?').join(',')}) OR l.match_id IS NOT NULL)
      ORDER BY m.starts_at, m.id
    `).all(pool.id, nowIso, ...openStatuses)

    return {
      pool: poolView,
      available: true,
      matches: rows.map((row) => {
        // Adiada ou cancelada pela fonte oficial: o status vem dela, sem placar (CA-14).
        const officialClosed = !openStatuses.includes(row.official_status)
        // Leitura "agendada" de partida já iniciada é atraso do provedor: vale o status oficial.
        const liveStatus = row.live_status === 'scheduled' ? null : row.live_status
        const status = officialClosed ? row.official_status : liveStatus ?? row.official_status
        const score = !officialClosed && row.home_score !== null && scoredStatuses.includes(row.live_status)
          ? { home: row.home_score, away: row.away_score }
          : null
        return {
          id: row.id,
          status,
          score,
          official: false,
          hasData: row.live_status !== null,
          updatedAt: row.observed_at ?? null,
        }
      }),
    }
  }

  return { refreshLiveScores, getPoolLive }
}
