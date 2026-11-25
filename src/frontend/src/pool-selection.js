// SPEC-031 — escolha das partidas do bolão: modo, rodadas, jogos e filtro de times. Quem resolve as
// partidas de verdade é o backend; aqui só montamos o pedido e os textos da tela.

export const selectionModes = Object.freeze([
  { id: 'all_in_period', label: 'Todas as rodadas do período', hint: 'Entram todos os jogos agendados entre o início e o fim do bolão.' },
  { id: 'rounds', label: 'Escolher rodadas', hint: 'Entram os jogos agendados das rodadas marcadas.' },
  { id: 'matches', label: 'Escolher jogos', hint: 'Marque jogo a jogo. O filtro de times só reduz a lista exibida.' },
])

export function modeHint(mode) {
  return selectionModes.find(({ id }) => id === mode)?.hint ?? ''
}

// Corpo de `selection` para o backend, só com o que vale no modo escolhido.
export function buildSelection({ selectionMode, roundNumbers = [], matchIds = [], teamIds = [] }) {
  const teams = teamIds.length > 0 ? { teamIds: [...teamIds] } : {}
  if (selectionMode === 'all_in_period') return { mode: 'all_in_period', ...teams }
  if (selectionMode === 'rounds') {
    return { mode: 'rounds', roundNumbers: [...roundNumbers].sort((first, second) => first - second), ...teams }
  }
  return { mode: 'matches', matchIds: [...matchIds] }
}

// Filtro de times na lista exibida: o jogo aparece se ao menos um dos times escolhidos joga.
export function matchesForTeams(matches, teamIds) {
  if (!teamIds || teamIds.length === 0) return matches
  const teams = new Set(teamIds)
  return matches.filter((match) => teams.has(match.home?.id) || teams.has(match.away?.id))
}

const dayFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' })
const formatDay = (isoDay) => dayFormatter.format(new Date(`${isoDay}T12:00:00Z`))

function teamsPhrase(teamNames) {
  if (teamNames.length === 0) return ''
  if (teamNames.length === 1) return ` em que ${teamNames[0]} joga`
  return ` em que ${teamNames.slice(0, -1).join(', ')} ou ${teamNames.at(-1)} jogam`
}

// Resumo do que vai entrar no bolão, mostrado antes de criar.
export function selectionSummary({ selectionMode, roundNumbers = [], matchIds = [], startsOn, endsOn }, teamNames = []) {
  if (selectionMode === 'all_in_period') {
    if (!startsOn || !endsOn) return 'Informe o início e o fim para incluir todas as rodadas do período.'
    return `Todos os jogos agendados de ${formatDay(startsOn)} a ${formatDay(endsOn)}${teamsPhrase(teamNames)}.`
  }
  if (selectionMode === 'rounds') {
    if (roundNumbers.length === 0) return 'Nenhuma rodada escolhida ainda.'
    const sorted = [...roundNumbers].sort((first, second) => first - second)
    const label = sorted.length === 1 ? `Rodada ${sorted[0]}` : `Rodadas ${sorted.slice(0, -1).join(', ')} e ${sorted.at(-1)}`
    return `${label}: jogos agendados${teamsPhrase(teamNames)}.`
  }
  if (matchIds.length === 0) return 'Nenhum jogo escolhido ainda.'
  return matchIds.length === 1 ? '1 jogo escolhido.' : `${matchIds.length} jogos escolhidos.`
}

// Consulta da API-Football 2024: placar ou situação de um jogo.
export function showcaseScore(match) {
  if (Number.isInteger(match.home?.score) && Number.isInteger(match.away?.score)) return `${match.home.score} × ${match.away.score}`
  return '×'
}
