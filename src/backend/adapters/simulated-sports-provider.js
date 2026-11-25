import { SportsProviderError } from '../modules/matches-results/sports-provider.js'

// Campeonato simulado com os nomes dos 20 clubes da Série A do Brasileirão (SPEC-031), para que o
// filtro de times da criação do bolão faça sentido. Os identificadores sim-team-N não mudam.
export const simulatedTeamNames = Object.freeze([
  'Athletico-PR', 'Atlético-GO', 'Atlético-MG', 'Bahia', 'Botafogo',
  'Corinthians', 'Criciúma', 'Cruzeiro', 'Cuiabá', 'Flamengo',
  'Fluminense', 'Fortaleza', 'Grêmio', 'Internacional', 'Juventude',
  'Palmeiras', 'Red Bull Bragantino', 'São Paulo', 'Vasco da Gama', 'Vitória',
])
const teamNames = simulatedTeamNames
const teams = teamNames.map((name, index) => ({
  id: `sim-team-${index + 1}`,
  name,
  crest: null,
}))

function createFixtures(season) {
  const rotatingTeams = teams.map((team) => team.id)
  const rounds = []
  const matches = []
  const firstKickoff = Date.UTC(season, 10, 20, 19)

  for (let roundNumber = 1; roundNumber <= 19; roundNumber += 1) {
    const roundId = `sim-round-${roundNumber}`
    rounds.push({ id: roundId, number: roundNumber })
    for (let index = 0; index < 10; index += 1) {
      const first = rotatingTeams[index]
      const second = rotatingTeams[19 - index]
      const homeTeamId = (roundNumber + index) % 2 === 0 ? first : second
      const awayTeamId = homeTeamId === first ? second : first
      const matchNumber = index + 1
      const isPostponed = roundNumber === 1 && matchNumber === 1
      matches.push({
        id: `sim-match-${roundNumber}-${matchNumber}`,
        roundId,
        homeTeamId,
        awayTeamId,
        startsAt: isPostponed
          ? null
          : new Date(firstKickoff + ((roundNumber - 1) * 3 + index % 3) * 24 * 60 * 60 * 1000).toISOString(),
        status: isPostponed ? 'postponed' : 'scheduled',
      })
    }
    rotatingTeams.splice(1, 0, rotatingTeams.pop())
  }

  for (let firstHalfRound = 1; firstHalfRound <= 19; firstHalfRound += 1) {
    const roundNumber = firstHalfRound + 19
    const roundId = `sim-round-${roundNumber}`
    rounds.push({ id: roundId, number: roundNumber })
    const firstHalfMatches = matches.filter((match) => match.roundId === `sim-round-${firstHalfRound}`)
    firstHalfMatches.forEach((match, index) => {
      const matchNumber = index + 1
      const isCancelled = roundNumber === 20 && matchNumber === 2
      matches.push({
        id: `sim-match-${roundNumber}-${matchNumber}`,
        roundId,
        homeTeamId: match.awayTeamId,
        awayTeamId: match.homeTeamId,
        startsAt: new Date(firstKickoff + ((roundNumber - 1) * 3 + index % 3) * 24 * 60 * 60 * 1000).toISOString(),
        status: isCancelled ? 'cancelled' : 'scheduled',
      })
    })
  }

  return { teams, rounds, matches }
}

const simulatedMatchDurationMs = 2 * 60 * 60 * 1000

// Placar simulado determinístico, derivado do identificador da partida.
function simulatedScore(matchId) {
  let hash = 0
  for (const character of matchId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return { homeScore: hash % 4, awayScore: (hash >>> 3) % 3 }
}

// Estado simulado pelo relógio: em andamento após o início e encerrada duas horas depois.
function simulatedResults(catalog, nowMs) {
  return {
    matches: catalog.matches.map((match) => {
      const startsAtMs = match.startsAt ? Date.parse(match.startsAt) : NaN
      if (['postponed', 'cancelled'].includes(match.status) || !Number.isFinite(startsAtMs) || nowMs < startsAtMs) {
        return { id: match.id, status: match.status, homeScore: null, awayScore: null }
      }
      if (nowMs < startsAtMs + simulatedMatchDurationMs) {
        return { id: match.id, status: 'in_progress', homeScore: null, awayScore: null }
      }
      return { id: match.id, status: 'finished', ...simulatedScore(match.id) }
    }),
  }
}

// Leitura ao vivo simulada (SPEC-021): antes do início, agendada; durante as duas horas de jogo,
// em andamento com o placar parcial crescendo até o final; depois, encerrada com o placar final.
function simulatedLiveScore(catalog, providerId, nowMs) {
  const match = catalog.matches.find(({ id }) => id === providerId)
  if (!match) throw new SportsProviderError('invalid_response')
  const observedAt = new Date(nowMs).toISOString()
  const startsAtMs = match.startsAt ? Date.parse(match.startsAt) : NaN
  if (['postponed', 'cancelled'].includes(match.status) || !Number.isFinite(startsAtMs) || nowMs < startsAtMs) {
    return { id: match.id, status: match.status, homeScore: null, awayScore: null, observedAt }
  }
  const final = simulatedScore(match.id)
  const elapsed = nowMs - startsAtMs
  if (elapsed >= simulatedMatchDurationMs) return { id: match.id, status: 'finished', ...final, observedAt }
  const progress = elapsed / simulatedMatchDurationMs
  return {
    id: match.id,
    status: 'in_progress',
    homeScore: Math.floor(final.homeScore * progress),
    awayScore: Math.floor(final.awayScore * progress),
    observedAt,
  }
}

export function createSimulatedSportsProvider({
  catalog = null,
  failure = null,
  results = null,
  resultsFailure = null,
  now = Date.now,
} = {}) {
  let currentCatalog = catalog
  let currentFailure = failure
  let currentResults = results
  let currentResultsFailure = resultsFailure
  let calls = 0
  let resultCalls = 0
  // Cenários ao vivo controlados pelos testes: leitura fixa por partida, falha geral ou por
  // partida, e atraso artificial da resposta.
  const liveReadings = new Map()
  const liveFailures = new Map()
  let liveFailure = null
  let liveDelayMs = 0
  const liveCalls = []

  return {
    source: 'simulated',
    async fetchCatalog(season = 2026) {
      calls += 1
      if (currentFailure) throw currentFailure
      return structuredClone(currentCatalog ?? createFixtures(season))
    },
    // Porta de resultados (SPEC-013): estado e placar final das partidas da temporada.
    async fetchResults(season = 2026) {
      resultCalls += 1
      if (currentResultsFailure) throw currentResultsFailure
      if (currentResults) return structuredClone(currentResults)
      return simulatedResults(currentCatalog ?? createFixtures(season), now())
    },
    // Porta ao vivo (SPEC-021): status e placar parcial de uma partida, pelo id do fornecedor.
    async fetchLiveScore(providerId) {
      liveCalls.push(providerId)
      if (liveDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, liveDelayMs))
      if (liveFailures.has(providerId)) throw liveFailures.get(providerId)
      if (liveFailure) throw liveFailure
      if (liveReadings.has(providerId)) return structuredClone(liveReadings.get(providerId))
      return simulatedLiveScore(currentCatalog ?? createFixtures(2026), providerId, now())
    },
    setLiveReading(providerId, reading) {
      if (reading === null) liveReadings.delete(providerId)
      else liveReadings.set(providerId, reading)
    },
    setLiveFailure(nextFailure, providerId = null) {
      if (providerId === null) liveFailure = nextFailure
      else if (nextFailure === null) liveFailures.delete(providerId)
      else liveFailures.set(providerId, nextFailure)
    },
    setLiveDelay(ms) {
      liveDelayMs = ms
    },
    getLiveCalls() {
      return [...liveCalls]
    },
    setCatalog(nextCatalog) {
      currentCatalog = nextCatalog
    },
    setFailure(nextFailure) {
      currentFailure = nextFailure
    },
    setResults(nextResults) {
      currentResults = nextResults
    },
    setResultsFailure(nextFailure) {
      currentResultsFailure = nextFailure
    },
    getCallCount() {
      return calls
    },
    getResultCallCount() {
      return resultCalls
    },
  }
}

export { SportsProviderError }
