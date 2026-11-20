// Formatação compartilhada das telas do bolão (horário de Brasília).
const kickoffFormatter = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})

// Devolve { day: 'sex. 20/11', time: '16:00' }, ou textos de "a definir" sem data.
export function formatKickoff(startsAt) {
  if (!startsAt) return { day: 'Data', time: 'a definir' }
  const parts = Object.fromEntries(kickoffFormatter.formatToParts(new Date(startsAt)).map(({ type, value }) => [type, value]))
  return { day: `${parts.weekday.replace('.', '')} ${parts.day}/${parts.month}`, time: `${parts.hour}:${parts.minute}` }
}

export function formatDeadline(startsAt) {
  const { day, time } = formatKickoff(startsAt)
  return `${day}, ${time}`
}

// Rodada inicial do seletor: a primeira com partida aberta, senão a última com partida encerrada,
// senão a primeira.
export function initialRound(rounds, isOpen, isFinished) {
  return rounds.find((round) => round.matches.some(isOpen))?.number
    ?? [...rounds].reverse().find((round) => round.matches.some(isFinished))?.number
    ?? rounds[0]?.number
    ?? null
}
