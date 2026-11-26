import { useEffect, useEffectEvent, useState } from 'react'
import { CalendarDays, LoaderCircle, RefreshCw } from 'lucide-react'
import { fetchRoundMatches, fetchRounds } from './match-catalog-api.js'
import { isSessionRejected } from './account-api.js'
import { matchesForTeams } from './pool-selection.js'
import { TeamLabel } from './TeamCrest.jsx'

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

function isSelectable(match) {
  return match.status === 'scheduled' && Boolean(match.startsAt) && Date.parse(match.startsAt) > Date.now()
}

// Sem `selection`, é a consulta da SPEC-006. Com `selection`, o mesmo componente apoia a escolha
// de partidas na criação do bolão (SPEC-007): a validação definitiva é do backend.
export default function MatchCatalog({ token, onSessionRejected, selection, showHeader = true }) {
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
    await fetchCatalog()
  }

  // Busca o catálogo; quem chama decide se liga o indicador de carregamento antes.
  async function fetchCatalog() {
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

  const fetchInitialCatalog = useEffectEvent(() => fetchCatalog())

  // `loading` já começa verdadeiro, então basta buscar ao montar ou trocar de sessão.
  useEffect(() => {
    fetchInitialCatalog()
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

  // Filtro de times da criação do bolão (SPEC-031): só reduz a lista exibida.
  const visibleMatches = matchesForTeams(matches, selection?.teamIds)

  return (
    <>
      {!selection && showHeader && (
        <>
          <p className="eyebrow">CATÁLOGO ESPORTIVO</p>
          <h2 id="auth-title">Rodadas e partidas</h2>
          <p className="form-copy">Consulte as partidas disponíveis na temporada.</p>
        </>
      )}

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
          {selection?.onToggleRound && selectedRound && (
            <label className="check-field">
              <input
                type="checkbox"
                disabled={loading}
                checked={selection.roundNumbers.includes(Number(selectedRound))}
                onChange={() => selection.onToggleRound(Number(selectedRound))}
              />
              <span>Incluir todas as partidas elegíveis desta rodada</span>
            </label>
          )}
          <div className="match-list" aria-live="polite">
            {!loading && visibleMatches.length === 0 && <p className="form-copy">Nenhuma partida encontrada para este filtro.</p>}
            {visibleMatches.map((match, index) => (
              <article className="match-card" key={match.id ?? `${selectedRound}-${match.home.name}-${match.away.name}-${index}`}>
                <div className="match-teams">
                  <span className="team-label team-label-home"><TeamLabel team={match.home} side="home" /></span>
                  <strong aria-hidden="true">×</strong>
                  <span className="team-label team-label-away"><TeamLabel team={match.away} side="away" /></span>
                </div>
                <div className="match-details">
                  <span><CalendarDays size={14} /> {match.startsAt ? dateFormatter.format(new Date(match.startsAt)) : 'Data a definir'}</span>
                  <span className={`match-status status-${match.status}`}>{statusLabels[match.status]}</span>
                </div>
                {selection && (() => {
                  const roundIncluded = (selection.roundNumbers ?? []).includes(Number(selectedRound))
                  const selectable = isSelectable(match)
                  return (
                    <label className="check-field match-pick">
                      <input
                        type="checkbox"
                        disabled={loading || !selectable || roundIncluded}
                        checked={selection.matchIds.includes(match.id) || (roundIncluded && selectable)}
                        onChange={() => selection.onToggleMatch(match.id)}
                      />
                      <span>{selectable ? 'Incluir esta partida' : 'Indisponível para seleção'}</span>
                    </label>
                  )
                })()}
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
