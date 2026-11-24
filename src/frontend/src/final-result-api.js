import { requestAuth } from './auth-api.js'
import { formatPrizePercent } from './pools-form.js'

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

// Marca de premiado com a porcentagem do montante, só nos bolões com pódio (SPEC-030): no
// "vencedor leva tudo" a marca de vencedor já diz tudo.
export function prizeTag(result, row) {
  if (!row.awarded || !result.prizeModel || result.prizeModel === 'winner_takes_all') return ''
  return `premiado · ${formatPrizePercent(row.prizePercent)}`
}
