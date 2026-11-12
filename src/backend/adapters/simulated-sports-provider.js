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

export function createSimulatedSportsProvider({ catalog = null, failure = null } = {}) {
  let currentCatalog = catalog
  let currentFailure = failure
  let calls = 0

  return {
    source: 'simulated',
    async fetchCatalog(season = 2026) {
      calls += 1
      if (currentFailure) throw currentFailure
      return structuredClone(currentCatalog ?? createFixtures(season))
    },
    setCatalog(nextCatalog) {
      currentCatalog = nextCatalog
    },
    setFailure(nextFailure) {
      currentFailure = nextFailure
    },
    getCallCount() {
      return calls
    },
  }
}

export { SportsProviderError }
