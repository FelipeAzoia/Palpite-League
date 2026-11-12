import { useEffect, useState } from 'react'
import { CalendarDays, LoaderCircle, RefreshCw } from 'lucide-react'
import { fetchRoundMatches, fetchRounds } from './match-catalog-api.js'
import { isSessionRejected } from './account-api.js'

const statusLabels = {
  scheduled: 'Agendada',
  in_progress: 'Em andamento',
  finished: 'Encerrada',
  postponed: 'Adiada',
  cancelled: 'Cancelada',
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

function formatPeriod(round) {
  if (!round.startsOn) return 'Datas a definir'
  if (round.startsOn === round.endsOn) return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', dateStyle: 'medium' }).format(new Date(`${round.startsOn}T12:00:00Z`))
  const formatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: 'short' })
  return `${formatter.format(new Date(`${round.startsOn}T12:00:00Z`))} – ${formatter.format(new Date(`${round.endsOn}T12:00:00Z`))}`
}

export default function MatchCatalog({ token, onSessionRejected }) {
  const [catalog, setCatalog] = useState(null)
  const [selectedRound, setSelectedRound] = useState('')
  const [matches, setMatches] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadMatches(roundNumber, status = statusFilter) {
    if (!roundNumber) {
      setMatches([])
      return
    }
    const result = await fetchRoundMatches(token, roundNumber, status)
    setMatches(result.matches)
    setCatalog((current) => ({ ...current, ...result }))
  }

  async function loadCatalog() {
    setLoading(true)
    setError('')
    try {
      const result = await fetchRounds(token)
      setCatalog(result)
      const nextRound = result.rounds.find(({ number }) => number === Number(selectedRound)) ?? result.rounds[0]
      setSelectedRound(nextRound ? String(nextRound.number) : '')
      await loadMatches(nextRound?.number, statusFilter)
    } catch (requestError) {
      if (isSessionRejected(requestError)) onSessionRejected()
      else setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCatalog()
  }, [token])

  async function changeRound(event) {
    const roundNumber = event.target.value
    setSelectedRound(roundNumber)
    setLoading(true)
    setError('')
    try {
      await loadMatches(roundNumber)
    } catch (requestError) {
      if (isSessionRejected(requestError)) onSessionRejected()
      else setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function changeStatus(event) {
    const status = event.target.value
    setStatusFilter(status)
    setLoading(true)
    setError('')
    try {
      await loadMatches(selectedRound, status)
    } catch (requestError) {
      if (isSessionRejected(requestError)) onSessionRejected()
      else setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <p className="eyebrow">CATÁLOGO ESPORTIVO</p>
      <h2 id="auth-title">Rodadas e partidas</h2>
      <p className="form-copy">Consulte as partidas disponíveis na temporada.</p>

      {catalog?.source === 'simulated' && (
        <p className="catalog-notice" role="status">Dados simulados para desenvolvimento e testes.</p>
      )}
      {catalog?.lastAttemptFailed && (
        <p className="form-message" role="alert">Não foi possível atualizar a fonte. Exibindo o catálogo salvo.</p>
      )}
      {error && (
        <div className="catalog-error" role="alert">
          <p className="form-message">{error}</p>
          <button type="button" className="catalog-retry" onClick={loadCatalog}>
            <RefreshCw size={15} /> Tentar novamente
          </button>
        </div>
      )}

      {loading && <p className="form-copy" role="status"><LoaderCircle size={16} className="spin" /> Carregando catálogo...</p>}

      {catalog && (
        <>
          <div className="catalog-filters">
            <label className="field">
              <span>Rodada</span>
              <select value={selectedRound} onChange={changeRound} disabled={loading}>
                {catalog.rounds.map((round) => (
                  <option key={round.number} value={round.number}>
                    Rodada {round.number} · {formatPeriod(round)} · {round.matchCount} partidas
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select value={statusFilter} onChange={changeStatus} disabled={loading}>
                <option value="">Todos</option>
                {Object.entries(statusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
              </select>
            </label>
          </div>
          {catalog.lastUpdatedAt && (
            <p className="catalog-updated">Última atualização: {dateFormatter.format(new Date(catalog.lastUpdatedAt))}</p>
          )}
          <div className="match-list" aria-live="polite">
            {!loading && matches.length === 0 && <p className="form-copy">Nenhuma partida encontrada para este filtro.</p>}
            {matches.map((match, index) => (
              <article className="match-card" key={`${selectedRound}-${match.home.name}-${match.away.name}-${index}`}>
                <div className="match-teams">
                  <span>{match.home.name}</span>
                  <strong aria-hidden="true">×</strong>
                  <span>{match.away.name}</span>
                </div>
                <div className="match-details">
                  <span><CalendarDays size={14} /> {match.startsAt ? dateFormatter.format(new Date(match.startsAt)) : 'Data a definir'}</span>
                  <span className={`match-status status-${match.status}`}>{statusLabels[match.status]}</span>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <div className="mode-switch">
        <button type="button" onClick={loadCatalog} disabled={loading}><RefreshCw size={13} /> Atualizar catálogo</button>
      </div>
    </>
  )
}
