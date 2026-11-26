import { useEffect, useEffectEvent, useState } from 'react'
import { LoaderCircle, Search, X } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import { fetchRounds, fetchTeams } from './match-catalog-api.js'
import MatchCatalog from './MatchCatalog.jsx'
import { modeHint, selectionModes, selectionSummary } from './pool-selection.js'
import { TeamCrest } from './TeamCrest.jsx'

const roundDay = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' })
const roundPeriod = (round) => (round.startsOn
  ? `${roundDay.format(new Date(`${round.startsOn}T12:00:00Z`))}${round.endsOn && round.endsOn !== round.startsOn ? ` a ${roundDay.format(new Date(`${round.endsOn}T12:00:00Z`))}` : ''}`
  : 'datas a definir')

// SPEC-031 — escolha das partidas do bolão: modo (todas do período, rodadas ou jogos) e filtro de
// times opcional. O backend resolve as partidas na criação.
export default function PoolMatchSelection({ token, onSessionRejected, values, onChange }) {
  const [teams, setTeams] = useState(null)
  const [rounds, setRounds] = useState(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  const handleError = useEffectEvent((caught) => {
    if (isSessionRejected(caught)) onSessionRejected()
    else setError(caught.message)
  })

  useEffect(() => {
    let active = true
    Promise.all([fetchTeams(token), fetchRounds(token)]).then(([teamList, roundList]) => {
      if (!active) return
      setTeams(teamList.teams)
      setRounds(roundList.rounds)
    }).catch((caught) => {
      if (active) handleError(caught)
    })
    return () => { active = false }
  }, [token])

  const toggle = (list, value) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value])
  const teamNames = (teams ?? []).filter(({ id }) => values.teamIds.includes(id)).map(({ name }) => name)
  const visibleTeams = (teams ?? []).filter(({ name }) => name.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')))
  const allRoundsChecked = rounds && rounds.length > 0 && rounds.every(({ number }) => values.roundNumbers.includes(number))

  return (
    <div className="pool-selection">
      <div className="selection-modes" role="radiogroup" aria-label="Como escolher as partidas">
        {selectionModes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            role="radio"
            aria-checked={values.selectionMode === mode.id}
            className={values.selectionMode === mode.id ? 'is-active' : undefined}
            onClick={() => onChange({ selectionMode: mode.id })}
          >
            {mode.label}
          </button>
        ))}
      </div>
      <p className="field-hint">{modeHint(values.selectionMode)}</p>

      {error && <p className="form-message" role="alert">{error}</p>}
      {!teams && !error && <p className="form-copy" role="status"><LoaderCircle size={14} className="spin" /> Carregando times e rodadas...</p>}

      {teams && (
        <section className="team-filter" aria-labelledby="team-filter-title">
          <div className="team-filter-head">
            <h4 id="team-filter-title">Times do bolão <small>(opcional)</small></h4>
            {values.teamIds.length > 0 && (
              <button type="button" className="catalog-retry" onClick={() => onChange({ teamIds: [] })}>
                <X size={13} aria-hidden="true" /> Todos os times
              </button>
            )}
          </div>
          <p className="field-hint">
            {values.teamIds.length === 0
              ? 'Sem times marcados, entram jogos de todos os times. Marque um ou mais para incluir só os jogos em que eles jogam.'
              : `${values.teamIds.length} ${values.teamIds.length === 1 ? 'time marcado' : 'times marcados'}: entram os jogos em que ao menos um deles joga.`}
          </p>
          <label className="team-search">
            <Search size={14} aria-hidden="true" />
            <input type="search" placeholder="Buscar time" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar time" />
          </label>
          <div className="team-chips">
            {visibleTeams.map((team) => {
              const checked = values.teamIds.includes(team.id)
              return (
                <label key={team.id} className={checked ? 'team-chip is-checked' : 'team-chip'}>
                  <input type="checkbox" checked={checked} onChange={() => onChange({ teamIds: toggle(values.teamIds, team.id) })} />
                  <TeamCrest team={team} size={16} />
                  <span>{team.name}</span>
                </label>
              )
            })}
            {visibleTeams.length === 0 && <p className="field-hint">Nenhum time com esse nome.</p>}
          </div>
        </section>
      )}

      {values.selectionMode === 'rounds' && rounds && (
        <section className="round-choice" aria-labelledby="round-choice-title">
          <div className="team-filter-head">
            <h4 id="round-choice-title">Rodadas</h4>
            <button
              type="button"
              className="catalog-retry"
              onClick={() => onChange({ roundNumbers: allRoundsChecked ? [] : rounds.map(({ number }) => number) })}
            >
              {allRoundsChecked ? 'Desmarcar todas' : 'Marcar todas'}
            </button>
          </div>
          <div className="round-grid">
            {rounds.map((round) => {
              const checked = values.roundNumbers.includes(round.number)
              return (
                <label key={round.number} className={checked ? 'round-cell is-checked' : 'round-cell'}>
                  <input type="checkbox" checked={checked} onChange={() => onChange({ roundNumbers: toggle(values.roundNumbers, round.number) })} />
                  <strong>{round.number}ª</strong>
                  <small>{roundPeriod(round)}</small>
                </label>
              )
            })}
          </div>
          <p className="field-hint">Só entram jogos ainda não iniciados, e todas as rodadas precisam caber no período do bolão.</p>
        </section>
      )}

      {values.selectionMode === 'matches' && (
        <MatchCatalog
          token={token}
          onSessionRejected={onSessionRejected}
          selection={{
            matchIds: values.matchIds,
            teamIds: values.teamIds,
            onToggleMatch: (id) => onChange({ matchIds: toggle(values.matchIds, id) }),
          }}
        />
      )}

      <p className="selection-summary" role="status">{selectionSummary(values, teamNames)}</p>
    </div>
  )
}
