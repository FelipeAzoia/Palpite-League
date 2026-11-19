import { useEffect, useEffectEvent, useState } from 'react'
import { CalendarDays, LoaderCircle } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import {
  blockedMessages,
  describePrediction,
  draftFrom,
  fetchPredictionMatches,
  outcomeLabels,
  predictionBody,
  savePrediction,
  situationHints,
  situationLabels,
} from './predictions-api.js'

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

function PredictionForm({ match, pending, fieldErrors, message, onCancel, onSubmit }) {
  const [draft, setDraft] = useState(() => draftFrom(match.prediction))
  const idPrefix = `prediction-${match.id}`

  function change(field) {
    return (event) => setDraft((current) => ({ ...current, [field]: event.target.value }))
  }

  function submit(event) {
    event.preventDefault()
    onSubmit(predictionBody(draft))
  }

  return (
    <form className="prediction-form" onSubmit={submit} noValidate>
      <fieldset className="prediction-modes">
        <legend>Modalidade</legend>
        <label className="check-field">
          <input type="radio" name={`${idPrefix}-type`} value="result" checked={draft.type === 'result'} onChange={change('type')} />
          <span>Resultado</span>
        </label>
        <label className="check-field">
          <input type="radio" name={`${idPrefix}-type`} value="exact_score" checked={draft.type === 'exact_score'} onChange={change('type')} />
          <span>Placar exato</span>
        </label>
        {fieldErrors.type && <small className="field-error">{fieldErrors.type}</small>}
      </fieldset>

      {draft.type === 'result' ? (
        <label className="field">
          <span>Resultado</span>
          <select value={draft.outcome} onChange={change('outcome')} aria-describedby={fieldErrors.outcome ? `${idPrefix}-outcome-error` : undefined}>
            <option value="">Selecione</option>
            {Object.entries(outcomeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {fieldErrors.outcome && <small id={`${idPrefix}-outcome-error`} className="field-error">{fieldErrors.outcome}</small>}
        </label>
      ) : (
        <div className="score-row">
          <label className="field">
            <span>{match.home.name}</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max="99"
              step="1"
              value={draft.homeGoals}
              onChange={change('homeGoals')}
              aria-describedby={fieldErrors.homeGoals ? `${idPrefix}-home-error` : undefined}
            />
            {fieldErrors.homeGoals && <small id={`${idPrefix}-home-error`} className="field-error">{fieldErrors.homeGoals}</small>}
          </label>
          <strong aria-hidden="true">×</strong>
          <label className="field">
            <span>{match.away.name}</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max="99"
              step="1"
              value={draft.awayGoals}
              onChange={change('awayGoals')}
              aria-describedby={fieldErrors.awayGoals ? `${idPrefix}-away-error` : undefined}
            />
            {fieldErrors.awayGoals && <small id={`${idPrefix}-away-error`} className="field-error">{fieldErrors.awayGoals}</small>}
          </label>
        </div>
      )}

      {message && <p className="form-message" role="alert">{message}</p>}

      <div className="invite-actions">
        <button className="small-button" type="submit" disabled={pending}>
          {pending ? 'Salvando...' : 'Salvar palpite'}
        </button>
        <button className="small-button" type="button" onClick={onCancel} disabled={pending}>Cancelar</button>
      </div>
    </form>
  )
}

function MatchPrediction({ match, editing, pending, fieldErrors, message, onEdit, onCancel, onSubmit }) {
  const isOpen = match.situation === 'open'
  return (
    <article className="match-card">
      <div className="match-teams">
        <span>{match.home.name}</span>
        <strong aria-hidden="true">×</strong>
        <span>{match.away.name}</span>
      </div>
      <div className="match-details">
        <span><CalendarDays size={14} /> {match.startsAt ? dateFormatter.format(new Date(match.startsAt)) : 'Data a definir'}</span>
        <span className={`plan-tag prediction-situation-${match.situation}`}>{situationLabels[match.situation] ?? match.situation}</span>
      </div>
      <p className="prediction-own">{describePrediction(match.prediction, match)}</p>
      {!isOpen && situationHints[match.situation] && <p className="field-hint">{situationHints[match.situation]}</p>}

      {isOpen && !editing && (
        <button className="small-button" type="button" onClick={onEdit}>
          {match.prediction ? 'Alterar palpite' : 'Palpitar'}
        </button>
      )}
      {isOpen && editing && (
        <PredictionForm
          match={match}
          pending={pending}
          fieldErrors={fieldErrors}
          message={message}
          onCancel={onCancel}
          onSubmit={onSubmit}
        />
      )}
    </article>
  )
}

// Tela de palpites do bolão (SPEC-012): partidas por rodada, situação de cada uma e palpite próprio.
export default function PredictionsPage({ token, poolId, onSessionRejected, onBack }) {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [pending, setPending] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')

  function errorText(error) {
    return blockedMessages[error.type] ?? error.message
  }

  async function reload() {
    try {
      setData(await fetchPredictionMatches(token, poolId))
    } catch (error) {
      if (isSessionRejected(error)) onSessionRejected()
      else setLoadError(errorText(error))
    }
  }

  const handleLoadError = useEffectEvent((error) => {
    if (isSessionRejected(error)) onSessionRejected()
    else setLoadError(errorText(error))
  })

  // A página é remontada por bolão (key no PoolsPanel), então o estado já começa limpo.
  useEffect(() => {
    let active = true
    fetchPredictionMatches(token, poolId).then((result) => {
      if (active) setData(result)
    }).catch((error) => {
      if (active) handleLoadError(error)
    })
    return () => { active = false }
  }, [token, poolId])

  function edit(matchId) {
    setEditingId(matchId)
    setFieldErrors({})
    setMessage('')
    setNotice('')
  }

  async function submit(match, body) {
    setPending(true)
    setFieldErrors({})
    setMessage('')
    try {
      const result = await savePrediction(token, poolId, match.id, body)
      setData((current) => ({
        ...current,
        rounds: current.rounds.map((round) => ({
          ...round,
          matches: round.matches.map((item) => (item.id === match.id ? { ...item, prediction: result.prediction } : item)),
        })),
      }))
      setEditingId(null)
      setNotice(result.changed ? 'Palpite salvo.' : 'Esse palpite já estava salvo.')
    } catch (error) {
      if (isSessionRejected(error)) {
        onSessionRejected()
        return
      }
      if (error.status === 409) {
        // A situação mudou no servidor (por exemplo, a partida começou): atualiza a lista.
        setEditingId(null)
        setNotice('')
        setMessage('')
        setLoadError('')
        await reload()
        setNotice(errorText(error))
        return
      }
      setFieldErrors(error.fields ?? {})
      setMessage(errorText(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <p className="eyebrow">PALPITES</p>
      <h2 id="auth-title">{data?.pool.name ?? 'Palpites do bolão'}</h2>
      <p className="form-copy">Palpite no resultado ou no placar exato até o início de cada partida.</p>

      {notice && <p className="form-message form-message-success" role="status">{notice}</p>}
      {loadError && <p className="form-message" role="alert">{loadError}</p>}
      {!data && !loadError && <p className="form-copy" role="status"><LoaderCircle size={14} className="spin" /> Carregando...</p>}

      {data && data.rounds.length === 0 && <p className="form-copy">Este bolão não tem partidas.</p>}
      {data && data.rounds.map((round) => (
        <section key={round.number} aria-label={`Rodada ${round.number}`}>
          <h3 className="section-title">RODADA {round.number}</h3>
          <div className="match-list">
            {round.matches.map((match) => (
              <MatchPrediction
                key={match.id}
                match={match}
                editing={editingId === match.id}
                pending={pending}
                fieldErrors={fieldErrors}
                message={message}
                onEdit={() => edit(match.id)}
                onCancel={() => setEditingId(null)}
                onSubmit={(body) => submit(match, body)}
              />
            ))}
          </div>
        </section>
      ))}

      <div className="mode-switch">
        <button type="button" onClick={onBack}>Voltar às regras do bolão</button>
      </div>
    </>
  )
}
