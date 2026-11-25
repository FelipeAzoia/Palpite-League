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

function showcaseTeam(team, goals, scored) {
  if (!team || typeof team.name !== 'string' || team.name.trim() === '') throw new SportsProviderError('invalid_response')
  return {
    name: team.name,
    crest: typeof team.logo === 'string' && team.logo !== '' ? team.logo : null,
    score: scored && Number.isInteger(goals) ? goals : null,
  }
}

function parseShowcase(body) {
  if (!body || !Array.isArray(body.response)) throw new SportsProviderError('invalid_response')
  const rounds = new Map()
  for (const fixture of body.response) {
    const number = Number(/(\d+)$/.exec(fixture?.league?.round ?? '')?.[1])
    if (!Number.isInteger(number) || number < 1 || fixture?.fixture?.id === undefined || fixture?.fixture?.id === null) {
      throw new SportsProviderError('invalid_response')
    }
    let status
    try {
      status = mapStatus(fixture?.fixture?.status?.short)
    } catch {
      status = null
    }
    const scored = status === 'finished' || status === 'in_progress'
    const matches = rounds.get(number) ?? []
    matches.push({
      id: String(fixture.fixture.id),
      startsAt: typeof fixture?.fixture?.date === 'string' ? fixture.fixture.date : null,
      status,
      home: showcaseTeam(fixture?.teams?.home, fixture?.goals?.home, scored),
      away: showcaseTeam(fixture?.teams?.away, fixture?.goals?.away, scored),
    })
    rounds.set(number, matches)
  }
  return {
    rounds: [...rounds.entries()]
      .sort(([first], [second]) => first - second)
      .map(([number, matches]) => ({
        number,
        matches: matches.sort((first, second) => String(first.startsAt).localeCompare(String(second.startsAt)) || first.id.localeCompare(second.id)),
      })),
  }
}

export function createApiFootballSportsProvider({
  apiKey,
  timeoutMs = 10000,
  fetcher = fetch,
  baseUrl = apiBaseUrl,
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('Sports provider timeout must be positive')

  async function requestFixtures(season, fixtureId = null) {
    if (!apiKey) throw new SportsProviderError('response_error')

    const url = new URL('/fixtures', baseUrl)
    if (fixtureId === null) {
      url.searchParams.set('league', String(brasileiraoLeagueId))
      url.searchParams.set('season', String(season))
    } else {
      url.searchParams.set('id', String(fixtureId))
    }

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
    return body
  }

  return {
    source: 'api-football',
    async fetchCatalog(season) {
      return parseResponse(await requestFixtures(season))
    },
    // Consulta somente leitura de uma temporada inteira (SPEC-031): times com escudo, rodadas, data,
    // situação e placar. Uma única chamada à API; nada é gravado no catálogo dos bolões.
    async fetchSeasonShowcase(season) {
      return parseShowcase(await requestFixtures(season))
    },
    // Porta ao vivo (SPEC-021): uma partida por consulta, com o placar parcial em andamento. O
    // instante da leitura é o da resposta; a validação do domínio decide se a leitura serve.
    async fetchLiveScore(providerId) {
      const body = await requestFixtures(null, providerId)
      if (!body || !Array.isArray(body.response) || body.response.length !== 1) throw new SportsProviderError('invalid_response')
      const [fixture] = body.response
      let status
      try {
        status = mapStatus(fixture?.fixture?.status?.short)
      } catch {
        status = null
      }
      const scored = status === 'in_progress' || status === 'finished'
      return {
        id: fixture?.fixture?.id === undefined || fixture?.fixture?.id === null ? null : String(fixture.fixture.id),
        status,
        homeScore: scored ? fixture?.goals?.home ?? null : null,
        awayScore: scored ? fixture?.goals?.away ?? null : null,
        observedAt: new Date().toISOString(),
      }
    },
    // Porta de resultados (SPEC-013). Status desconhecido vira null: o domínio decide se o item
    // é de partida acompanhada (rejeita a resposta) ou não (ignora), conforme a OPEN-75.
    async fetchResults(season) {
      const body = await requestFixtures(season)
      if (!body || !Array.isArray(body.response)) throw new SportsProviderError('invalid_response')
      return {
        matches: body.response.map((fixture) => {
          let status
          try {
            status = mapStatus(fixture?.fixture?.status?.short)
          } catch {
            status = null
          }
          return {
            id: fixture?.fixture?.id === undefined || fixture?.fixture?.id === null ? null : String(fixture.fixture.id),
            status,
            homeScore: status === 'finished' ? fixture?.goals?.home ?? null : null,
            awayScore: status === 'finished' ? fixture?.goals?.away ?? null : null,
          }
        }),
      }
    },
  }
}
