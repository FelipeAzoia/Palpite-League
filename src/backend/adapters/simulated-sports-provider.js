import { SportsProviderError } from '../modules/matches-results/sports-provider.js'

const teamNames = Array.from({ length: 20 }, (_, index) => `Clube Simulado ${String(index + 1).padStart(2, '0')}`)
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
