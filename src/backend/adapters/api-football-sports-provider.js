import { SportsProviderError } from '../modules/matches-results/sports-provider.js'

const apiBaseUrl = 'https://v3.football.api-sports.io'
const brasileiraoLeagueId = 71

function mapStatus(status) {
  if (status === 'NS') return 'scheduled'
  if (['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE'].includes(status)) return 'in_progress'
  if (['FT', 'AET', 'PEN'].includes(status)) return 'finished'
  if (status === 'PST') return 'postponed'
  if (['CANC', 'ABD', 'AWD', 'WO'].includes(status)) return 'cancelled'
  throw new SportsProviderError('invalid_response')
}

function parseResponse(body) {
  if (!body || !Array.isArray(body.response)) throw new SportsProviderError('invalid_response')

  const teamsById = new Map()
  const roundsByNumber = new Map()
  function addTeam(team, id) {
    if (typeof team.name !== 'string' || team.name.trim() === ''
      || (team.logo !== undefined && team.logo !== null && typeof team.logo !== 'string')) {
      throw new SportsProviderError('invalid_response')
    }
    const crest = typeof team.logo === 'string' && team.logo !== '' ? team.logo : null
    const existing = teamsById.get(id)
    if (existing && (existing.name !== team.name || (existing.crest && crest && existing.crest !== crest))) {
      throw new SportsProviderError('invalid_response')
    }
    teamsById.set(id, { id, name: team.name, crest: existing?.crest ?? crest })
  }

  const matches = body.response.map((fixture) => {
    const roundNumber = Number(/(\d+)$/.exec(fixture?.league?.round ?? '')?.[1])
    const home = fixture?.teams?.home
    const away = fixture?.teams?.away
    const fixtureId = fixture?.fixture?.id
    const startsAt = fixture?.fixture?.date

    if (!Number.isInteger(roundNumber) || roundNumber < 1
      || fixtureId === undefined || fixtureId === null
      || home?.id === undefined || home.id === null
      || away?.id === undefined || away.id === null
      || String(home.id).trim() === '' || String(away.id).trim() === '') {
      throw new SportsProviderError('invalid_response')
    }

    const homeId = String(home.id)
    const awayId = String(away.id)
    addTeam(home, homeId)
    addTeam(away, awayId)
    roundsByNumber.set(roundNumber, { id: String(roundNumber), number: roundNumber })
    return {
      id: String(fixtureId),
      roundId: String(roundNumber),
      homeTeamId: homeId,
      awayTeamId: awayId,
      startsAt,
      status: mapStatus(fixture?.fixture?.status?.short),
    }
  })

  return {
    teams: [...teamsById.values()],
    rounds: [...roundsByNumber.values()],
    matches,
  }
}

export function createApiFootballSportsProvider({
  apiKey,
  timeoutMs = 10000,
  fetcher = fetch,
  baseUrl = apiBaseUrl,
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('Sports provider timeout must be positive')

  return {
    source: 'api-football',
    async fetchCatalog(season) {
      if (!apiKey) throw new SportsProviderError('response_error')

      const url = new URL('/fixtures', baseUrl)
      url.searchParams.set('league', String(brasileiraoLeagueId))
      url.searchParams.set('season', String(season))

      let response
      try {
        response = await fetcher(url, {
          headers: { 'x-apisports-key': apiKey },
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch (error) {
        throw new SportsProviderError(error?.name === 'TimeoutError' || error?.name === 'AbortError'
          ? 'timeout'
          : 'response_error')
      }

      if (!response.ok) throw new SportsProviderError('response_error')
      let body
      try {
        body = await response.json()
      } catch {
        throw new SportsProviderError('invalid_response')
      }
      if (Array.isArray(body?.errors) && body.errors.length > 0) {
        throw new SportsProviderError('response_error')
      }
      return parseResponse(body)
    },
  }
}
