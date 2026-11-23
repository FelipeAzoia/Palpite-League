import { requestAuth } from './auth-api.js'

// SPEC-025 — resultado final do bolão encerrado, somente leitura. O encerramento e os vencedores
// são decididos pelo backend; a interface só mostra.
export function fetchFinalResult(token, poolId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/final-result`, { token, ...options })
}

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

export function formatEndedAt(iso) {
  return dateTimeFormatter.format(new Date(iso))
}

// Frase dos vencedores: vencedor único, co-vencedores ou ausência registrada explicitamente.
export function winnersHeadline(result) {
  const winners = result.standings.filter(({ winner }) => winner).map(({ name }) => name)
  if (winners.length === 1) return `Vencedor: ${winners[0]}`
  if (winners.length > 1) return `Co-vencedores: ${winners.slice(0, -1).join(', ')} e ${winners.at(-1)}`
  return result.noWinnerReason === 'no_eligible'
    ? 'Sem vencedor: nenhum participante confirmado no encerramento.'
    : 'Sem vencedor: ninguém pontuou no bolão.'
}
