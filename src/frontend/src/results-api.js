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

// SPEC-021 — dados ao vivo do bolão. Só leitura; o backend decide elegibilidade e acesso (INV-011).
export function fetchPoolLive(token, poolId, options = {}) {
  return requestAuth(`/pools/${encodeURIComponent(poolId)}/live`, { token, ...options })
}

// A tela repete a consulta neste intervalo enquanto o recurso está disponível (OPEN-103).
export const liveRefreshIntervalMs = 30 * 1000

const timeFormatter = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

// Situação ao vivo de uma partida da aba de resultados. Partida com resultado oficial ignora o dado
// ao vivo (INV-008); sem entrada ao vivo, não há o que mostrar.
export function liveStateFor(match, live) {
  if (!live?.available || match.status === 'finished') return null
  const entry = live.matches.find(({ id }) => id === match.id)
  if (!entry) return null
  if (!entry.hasData) return { status: entry.status, score: null, caption: ['Sem dados ao vivo', 'no momento'] }
  const updated = `atualizado às ${timeFormatter.format(new Date(entry.updatedAt))}`
  return { status: entry.status, score: entry.score, caption: entry.score ? ['Parcial, não oficial', updated] : [updated] }
}

// Aviso do recurso: indisponível no bolão, só quando há partida em andamento (UC05 A3).
export function liveNotice(live, rounds) {
  const hasMatchInProgress = rounds.some(({ matches }) => matches.some(({ status }) => status === 'in_progress'))
  if (live?.available || !hasMatchInProgress) return null
  if (live?.reason === 'not_enabled') return 'Resultados ao vivo não estão disponíveis neste bolão; os placares aparecem quando o resultado oficial é publicado.'
  return null
}
