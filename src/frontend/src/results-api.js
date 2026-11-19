import { requestAuth } from './auth-api.js'

// SPEC-013 — resultados oficiais do bolão. A interface só consulta; nunca escreve resultados (INV-017).
export function fetchPoolResults(token, poolId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/results`, { token, ...options })
}

export const matchStatusLabels = {
  scheduled: 'Agendada',
  in_progress: 'Em andamento',
  finished: 'Encerrada',
  postponed: 'Adiada',
  cancelled: 'Cancelada',
}

// O placar só existe para partida encerrada (INV-012).
export function describeResult(match) {
  if (match.status === 'finished' && match.score) return `${match.score.home} × ${match.score.away}`
  if (match.status === 'finished') return 'Placar indisponível'
  return '–'
}

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

// Aviso da última sincronização: momento do último sucesso e indicação de falha.
export function syncNotice(sync) {
  if (!sync?.lastAttemptAt) return { failed: false, text: 'Os resultados ainda não foram sincronizados.' }
  const lastSuccess = sync.lastSuccessAt ? dateTimeFormatter.format(new Date(sync.lastSuccessAt)) : null
  if (sync.lastAttemptFailed) {
    return {
      failed: true,
      text: lastSuccess
        ? `A última tentativa de buscar os resultados falhou. Dados atualizados em ${lastSuccess}; uma nova tentativa será feita automaticamente.`
        : 'A última tentativa de buscar os resultados falhou; uma nova tentativa será feita automaticamente.',
    }
  }
  return { failed: false, text: `Resultados atualizados em ${lastSuccess}.` }
}
