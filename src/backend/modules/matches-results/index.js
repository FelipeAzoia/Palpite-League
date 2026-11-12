import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/app-error.js'
import { runInTransaction } from '../../shared/database.js'
import { createLogger } from '../../shared/logger.js'
import { SportsProviderError } from './sports-provider.js'

export const moduleName = 'matches-results'

const matchStatuses = new Set(['scheduled', 'in_progress', 'finished', 'postponed', 'cancelled'])
const reschedulableStatuses = new Set(['scheduled', 'postponed', 'cancelled'])
const sourceNames = new Set(['simulated', 'api-football'])
const saopauloDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function providerFailure(code) {
  return new SportsProviderError(code)
}

function isValidDateTime(value) {
  const parts = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.(\d{1,3}))?)?(Z|([+-])(\d\d):(\d\d))$/.exec(value)
  if (!parts) return false
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0', fraction = '', zone, , offsetHourText, offsetMinuteText] = parts
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const milliseconds = Number(fraction.padEnd(3, '0'))
  const localDate = new Date(0)
  localDate.setUTCFullYear(year, month - 1, day)
  localDate.setUTCHours(hour, minute, second, milliseconds)

  if (localDate.getUTCFullYear() !== year || localDate.getUTCMonth() !== month - 1
    || localDate.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return false
  if (zone !== 'Z') {
    const offsetHours = Number(offsetHourText)
    const offsetMinutes = Number(offsetMinuteText)
    if (offsetHours > 14 || offsetMinutes > 59 || (offsetHours === 14 && offsetMinutes !== 0)) return false
  }
  return Number.isFinite(Date.parse(value))
}

function validateCatalog(catalog, source) {
  if (!catalog || !Array.isArray(catalog.teams) || !Array.isArray(catalog.rounds)
    || !Array.isArray(catalog.matches) || !sourceNames.has(source)
    || catalog.teams.length === 0 || catalog.rounds.length === 0 || catalog.matches.length === 0) {
    throw providerFailure('invalid_response')
  }

  const teams = new Map()
  for (const team of catalog.teams) {
    if (!team || team.id === undefined || team.id === null || String(team.id).trim() === ''
      || typeof team.name !== 'string' || team.name.trim() === ''
      || (team.crest !== undefined && team.crest !== null && typeof team.crest !== 'string')) {
      throw providerFailure('invalid_response')
    }
    const id = String(team.id)
    if (teams.has(id)) throw providerFailure('invalid_response')
    teams.set(id, { id, name: team.name, crest: team.crest ?? null })
  }

  const rounds = new Map()
  const roundNumbers = new Set()
  for (const round of catalog.rounds) {
    const number = Number(round?.number)
    if (round?.id === undefined || round.id === null || String(round.id).trim() === ''
      || !Number.isSafeInteger(number) || number < 1 || rounds.has(String(round.id))
      || roundNumbers.has(number)) {
      throw providerFailure('invalid_response')
    }
    roundNumbers.add(number)
    rounds.set(String(round.id), { id: String(round.id), number })
  }

  const matches = new Map()
  for (const match of catalog.matches) {
    const id = String(match?.id ?? '')
    const roundId = String(match?.roundId ?? '')
    const homeTeamId = String(match?.homeTeamId ?? '')
    const awayTeamId = String(match?.awayTeamId ?? '')
    if (!id.trim() || !rounds.has(roundId)
      || !teams.has(homeTeamId) || !teams.has(awayTeamId) || homeTeamId === awayTeamId
      || !matchStatuses.has(match.status)) {
      throw providerFailure('invalid_response')
    }
    if (matches.has(id)) throw providerFailure('invalid_response')

    let startsAt = null
    if (match.startsAt !== null && match.startsAt !== undefined) {
      if (typeof match.startsAt !== 'string' || !isValidDateTime(match.startsAt)) {
        throw providerFailure('invalid_response')
      }
      startsAt = new Date(match.startsAt).toISOString()
    } else if (match.status !== 'postponed') {
      throw providerFailure('invalid_response')
    }

    matches.set(id, { id, roundId, homeTeamId, awayTeamId, startsAt, status: match.status })
  }

  return { teams: [...teams.values()], rounds: [...rounds.values()], matches: [...matches.values()] }
}

function localDate(utcDate) {
  if (!utcDate) return null
  const parts = saopauloDate.formatToParts(new Date(utcDate))
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

function metadataView(database) {
  const metadata = database.prepare(`
    SELECT source, season, last_attempt_at, last_success_at, last_attempt_result
    FROM sports_catalog_metadata WHERE id = 1
  `).get()
  return {
    source: metadata?.source ?? null,
    lastAttemptAt: metadata?.last_attempt_at ?? null,
    lastUpdatedAt: metadata?.last_success_at ?? null,
    lastAttemptFailed: metadata?.last_attempt_result === 'failure',
  }
}

export function createSportsCatalogService(database, provider, {
  logger = createLogger(),
  now = Date.now,
  season = 2026,
  ttlMs = 6 * 60 * 60 * 1000,
} = {}) {
  if (!Number.isSafeInteger(season) || season < 1) throw new RangeError('Sports catalog season must be a positive integer')
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new RangeError('Sports catalog TTL must be positive')
  let refreshPromise = null

  function recordAttemptStart(attemptedAt) {
    database.prepare(`
      INSERT INTO sports_catalog_metadata (
        id, source, season, last_attempt_at, last_success_at, last_attempt_result
      ) VALUES (1, ?, ?, ?, NULL, 'pending')
      ON CONFLICT(id) DO UPDATE SET
        last_attempt_at = excluded.last_attempt_at,
        last_attempt_result = 'pending'
    `).run(provider.source, season, attemptedAt)
  }

  function recordFailure() {
    database.prepare(`
      UPDATE sports_catalog_metadata
      SET last_attempt_result = 'failure'
      WHERE id = 1
    `).run()
  }

  function persistCatalog(catalog, attemptedAt) {
    runInTransaction(database, () => {
      const previous = database.prepare('SELECT source, season FROM sports_catalog_metadata WHERE id = 1').get()
      if (previous && (previous.source !== provider.source || previous.season !== season)) {
        database.exec('DELETE FROM sports_matches; DELETE FROM sports_rounds; DELETE FROM sports_teams;')
      }

      const teamIdByProviderId = new Map()
      for (const team of catalog.teams) {
        const existing = database.prepare('SELECT id, name, crest FROM sports_teams WHERE provider_id = ?').get(team.id)
        const id = existing?.id ?? randomUUID()
        if (!existing) {
          database.prepare('INSERT INTO sports_teams (id, provider_id, name, crest) VALUES (?, ?, ?, ?)')
            .run(id, team.id, team.name, team.crest)
        } else if (existing.name !== team.name || existing.crest !== team.crest) {
          database.prepare('UPDATE sports_teams SET name = ?, crest = ? WHERE provider_id = ?')
            .run(team.name, team.crest, team.id)
        }
        teamIdByProviderId.set(team.id, id)
      }

      const roundIdByProviderId = new Map()
      for (const round of catalog.rounds) {
        const existing = database.prepare('SELECT id FROM sports_rounds WHERE provider_id = ?').get(round.id)
        const id = existing?.id ?? randomUUID()
        database.prepare(`
          INSERT INTO sports_rounds (id, provider_id, number, starts_on, ends_on)
          VALUES (?, ?, ?, NULL, NULL)
          ON CONFLICT(provider_id) DO UPDATE SET number = excluded.number
        `).run(id, round.id, round.number)
        roundIdByProviderId.set(round.id, id)
      }

      const saveMatch = database.prepare(`
        INSERT INTO sports_matches (
          id, provider_id, round_id, home_team_id, away_team_id, starts_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider_id) DO NOTHING
      `)
      const updateMatch = database.prepare(`
        UPDATE sports_matches SET starts_at = ?, status = ?
        WHERE provider_id = ? AND status IN ('scheduled', 'postponed', 'cancelled')
      `)
      const findMatch = database.prepare('SELECT status, starts_at FROM sports_matches WHERE provider_id = ?')
      for (const match of catalog.matches) {
        const existing = findMatch.get(match.id)
        if (existing) {
          if (reschedulableStatuses.has(existing.status) && reschedulableStatuses.has(match.status)
            && (existing.starts_at !== match.startsAt || existing.status !== match.status)) {
            updateMatch.run(match.startsAt, match.status, match.id)
          }
          continue
        }
        saveMatch.run(
          randomUUID(),
          match.id,
          roundIdByProviderId.get(match.roundId),
          teamIdByProviderId.get(match.homeTeamId),
          teamIdByProviderId.get(match.awayTeamId),
          match.startsAt,
          match.status,
        )
      }

      const datesByRound = new Map()
      for (const match of database.prepare('SELECT round_id, starts_at FROM sports_matches WHERE starts_at IS NOT NULL').all()) {
        const date = localDate(match.starts_at)
        const dates = datesByRound.get(match.round_id) ?? { startsOn: date, endsOn: date }
        dates.startsOn = date < dates.startsOn ? date : dates.startsOn
        dates.endsOn = date > dates.endsOn ? date : dates.endsOn
        datesByRound.set(match.round_id, dates)
      }
      const updateRoundDates = database.prepare('UPDATE sports_rounds SET starts_on = ?, ends_on = ? WHERE id = ?')
      for (const round of database.prepare('SELECT id FROM sports_rounds').all()) {
        const dates = datesByRound.get(round.id)
        updateRoundDates.run(dates?.startsOn ?? null, dates?.endsOn ?? null, round.id)
      }
      const successfulAt = new Date(now()).toISOString()
      database.prepare(`
        INSERT INTO sports_catalog_metadata (
          id, source, season, last_attempt_at, last_success_at, last_attempt_result
        ) VALUES (1, ?, ?, ?, ?, 'success')
        ON CONFLICT(id) DO UPDATE SET
          source = excluded.source,
          season = excluded.season,
          last_attempt_at = excluded.last_attempt_at,
          last_success_at = excluded.last_success_at,
          last_attempt_result = 'success'
      `).run(provider.source, season, attemptedAt, successfulAt)
    }, logger)
  }

  async function doRefresh() {
    const attemptedAt = new Date(now()).toISOString()
    recordAttemptStart(attemptedAt)

    let catalog
    try {
      const result = await provider.fetchCatalog(season)
      catalog = validateCatalog(result, provider.source)
    } catch (error) {
      const code = error instanceof SportsProviderError ? error.code : 'response_error'
      logger.error('sports-provider', code)
      recordFailure()
      const currentSeason = database.prepare('SELECT season FROM sports_catalog_metadata WHERE id = 1').get()?.season
      if (currentSeason === season && database.prepare('SELECT 1 FROM sports_matches LIMIT 1').get()) return
      throw new AppError(503, 'sports_source_unavailable', 'O catálogo esportivo está indisponível. Tente novamente mais tarde.')
    }

    try {
      persistCatalog(catalog, attemptedAt)
    } catch (error) {
      recordFailure()
      throw error
    }
  }

  async function ensureFresh() {
    const metadata = database.prepare('SELECT source, season, last_success_at FROM sports_catalog_metadata WHERE id = 1').get()
    const hasMatches = Boolean(database.prepare('SELECT 1 FROM sports_matches LIMIT 1').get())
    const lastSuccess = metadata?.last_success_at ? Date.parse(metadata.last_success_at) : NaN
    if (hasMatches && metadata.source === provider.source && metadata.season === season
      && Number.isFinite(lastSuccess) && now() - lastSuccess < ttlMs) return

    if (!refreshPromise) {
      refreshPromise = doRefresh().finally(() => {
        refreshPromise = null
      })
    }
    await refreshPromise
  }

  function requireCatalog() {
    if (!database.prepare('SELECT 1 FROM sports_matches LIMIT 1').get()) {
      throw new AppError(503, 'sports_source_unavailable', 'O catálogo esportivo está indisponível. Tente novamente mais tarde.')
    }
  }

  async function listRounds() {
    await ensureFresh()
    requireCatalog()

    const rounds = database.prepare(`
      SELECT r.number,
        MIN(m.starts_at) AS first_match,
        MAX(m.starts_at) AS last_match,
        COUNT(m.id) AS match_count
      FROM sports_rounds r
      LEFT JOIN sports_matches m ON m.round_id = r.id
      GROUP BY r.id
      ORDER BY r.number
    `).all().map((round) => ({
      number: round.number,
      startsOn: localDate(round.first_match),
      endsOn: localDate(round.last_match),
      matchCount: round.match_count,
    }))

    return { rounds, ...metadataView(database) }
  }

  async function listMatches(roundNumberInput, status) {
    await ensureFresh()
    requireCatalog()
    if (!/^\d+$/.test(String(roundNumberInput))) {
      throw new AppError(404, 'not_found', 'A rodada solicitada não foi encontrada.')
    }
    const roundNumber = Number(roundNumberInput)
    const round = database.prepare('SELECT id, number FROM sports_rounds WHERE number = ?').get(roundNumber)
    if (!round) throw new AppError(404, 'not_found', 'A rodada solicitada não foi encontrada.')
    if (status !== undefined && (typeof status !== 'string' || !matchStatuses.has(status))) {
      throw new AppError(400, 'validation_error', 'O status informado não é válido.', { status: 'Selecione um status válido.' })
    }

    const matches = database.prepare(`
      SELECT home.name AS home_name, home.crest AS home_crest,
        away.name AS away_name, away.crest AS away_crest,
        m.starts_at, m.status
      FROM sports_matches m
      JOIN sports_teams home ON home.id = m.home_team_id
      JOIN sports_teams away ON away.id = m.away_team_id
      WHERE m.round_id = ? AND (? IS NULL OR m.status = ?)
      ORDER BY m.starts_at IS NULL, m.starts_at, m.id
    `).all(round.id, status ?? null, status ?? null).map((match) => ({
      home: { name: match.home_name, crest: match.home_crest },
      away: { name: match.away_name, crest: match.away_crest },
      startsAt: match.starts_at,
      status: match.status,
    }))

    return { round: { number: round.number }, matches, ...metadataView(database) }
  }

  return { listRounds, listMatches }
}