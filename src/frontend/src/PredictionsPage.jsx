import { useEffect, useEffectEvent, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import { formatKickoff, initialRound } from './match-format.js'
import {
  blockedMessages,
  draftFrom,
  fetchPredictionMatches,
  predictionBody,
  savePrediction,
  situationHints,
  situationLabels,
} from './predictions-api.js'
import RoundPicker from './RoundPicker.jsx'
import { TeamLabel } from './TeamCrest.jsx'

const outcomeShort = { home: 'Mandante', draw: 'Empate', away: 'Visitante' }

// Palpite gravado, no centro da linha: placar em caixa ou o resultado escolhido.
export function PredictionMark({ prediction }) {
  if (!prediction) return <span className="mrow-vs" aria-label="sem palpite">×</span>
  if (prediction.type === 'exact_score') {
    return <span className="score-box score-box-pick" aria-label={`seu palpite: ${prediction.homeGoals} a ${prediction.awayGoals}`}>{prediction.homeGoals}<i>–</i>{prediction.awayGoals}</span>
  }
  return <span className="pick-chip">{outcomeShort[prediction.outcome] ?? prediction.outcome}</span>
}

function PredictionEditor({ match, pending, fieldErrors, message, onCancel, onSubmit }) {
  const [draft, setDraft] = useState(() => draftFrom(match.prediction))
  const name = `prediction-${match.id}`
  const set = (field, value) => setDraft((current) => ({ ...current, [field]: value }))

  function submit(event) {
    event.preventDefault()
    onSubmit(predictionBody(draft))
  }

  return (
    <form className="mrow-editor" onSubmit={submit} noValidate>
      <div className="segmented" role="radiogroup" aria-label="Modalidade do palpite">
        {[['result', 'Resultado'], ['exact_score', 'Placar exato']].map(([value, label]) => (
          <label key={value} className="segment">
            <input type="radio" name={`${name}-type`} value={value} checked={draft.type === value} onChange={() => set('type', value)} />
            <span>{label}</span>
          </label>
        ))}
      </div>

      {draft.type === 'result' ? (
        <div className="segmented segmented-wide" role="radiogroup" aria-label="Resultado previsto">
          {[['home', match.home.name], ['draw', 'Empate'], ['away', match.away.name]].map(([value, label]) => (
            <label key={value} className="segment">
              <input type="radio" name={`${name}-outcome`} value={value} checked={draft.outcome === value} onChange={() => set('outcome', value)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      ) : (
        <div className="score-inputs">
          <label>
            <span className="sr-only">Gols de {match.home.name}</span>
            <input type="number" inputMode="numeric" min="0" max="99" step="1" value={draft.homeGoals} onChange={(event) => set('homeGoals', event.target.value)} />
          </label>
          <i aria-hidden="true">–</i>
          <label>
            <span className="sr-only">Gols de {match.away.name}</span>
            <input type="number" inputMode="numeric" min="0" max="99" step="1" value={draft.awayGoals} onChange={(event) => set('awayGoals', event.target.value)} />
          </label>
        </div>
      )}

      <div className="mrow-editor-actions">
        <button className="small-button small-button-solid" type="submit" disabled={pending}>{pending ? 'Salvando...' : 'Salvar palpite'}</button>
        <button className="link-button" type="button" onClick={onCancel} disabled={pending}>Cancelar</button>
      </div>
      {Object.values(fieldErrors).filter(Boolean).map((text) => <small key={text} className="field-error">{text}</small>)}
      {message && <p className="form-message" role="alert">{message}</p>}
    </form>
  )
}

function situationTone(situation) {
  return situation === 'open' ? 'open' : situation === 'late_entry' ? 'warn' : 'muted'
}

// Aba de palpites do bolão (SPEC-012): uma rodada por vez, linhas compactas e edição em linha.
export default function PredictionsPage({ token, poolId, onSessionRejected, onChanged }) {
  const [data, setData] = useState(null)
  const [round, setRound] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [pending, setPending] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')

  const errorText = (error) => blockedMessages[error.type] ?? error.message

  function receive(result) {
    setData(result)
    setRound((current) => current ?? initialRound(result.rounds, (match) => match.situation === 'open', (match) => match.status === 'finished'))
  }

  const handleLoadError = useEffectEvent((error) => {
    if (isSessionRejected(error)) onSessionRejected()
    else setLoadError(errorText(error))
  })

  useEffect(() => {
    let active = true
    fetchPredictionMatches(token, poolId).then((result) => {
      if (active) receive(result)
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
        rounds: current.rounds.map((item) => ({
          ...item,
          matches: item.matches.map((entry) => (entry.id === match.id ? { ...entry, prediction: result.prediction } : entry)),
        })),
      }))
      setEditingId(null)
      setNotice(result.changed ? 'Palpite salvo.' : 'Esse palpite já estava salvo.')
      onChanged?.()
    } catch (error) {
      if (isSessionRejected(error)) {
        onSessionRejected()
        return
      }
      if (error.status === 409) {
        // A situação mudou no servidor (por exemplo, a partida começou): atualiza a lista.
        setEditingId(null)
        try {
          receive(await fetchPredictionMatches(token, poolId))
        } catch {
          // Mantém a lista atual; a mensagem abaixo explica o bloqueio.
        }
        setNotice(errorText(error))
        return
      }
      setFieldErrors(error.fields ?? {})
      setMessage(errorText(error))
    } finally {
      setPending(false)
    }
  }

  if (loadError) return <p className="form-message" role="alert">{loadError}</p>
  if (!data) return <p className="tab-loading" role="status"><LoaderCircle size={14} className="spin" /> Carregando partidas...</p>
  if (data.rounds.length === 0) return <p className="empty-state">Este bolão não tem partidas.</p>

  const current = data.rounds.find(({ number }) => number === round) ?? data.rounds[0]
  const pickerRounds = data.rounds.map(({ number, matches }) => {
    const open = matches.filter(({ situation }) => situation === 'open')
    const missing = open.filter(({ prediction }) => !prediction).length
    return {
      number,
      tone: missing > 0 ? 'open' : open.length === 0 ? 'done' : undefined,
      hint: missing > 0 ? `${missing} sem palpite` : open.length === 0 ? 'Palpites encerrados' : 'Palpites feitos',
    }
  })
  const openCount = current.matches.filter(({ situation }) => situation === 'open').length
  const doneCount = current.matches.filter(({ situation, prediction }) => situation === 'open' && prediction).length

  return (
    <div className="tab-body">
      <div className="tab-toolbar">
        <RoundPicker rounds={pickerRounds} value={current.number} onChange={(number) => { setRound(number); setEditingId(null) }} />
        <p className="toolbar-note">
          {openCount > 0 ? `${doneCount} de ${openCount} partidas abertas com palpite` : 'Todas as partidas desta rodada já começaram'}
        </p>
      </div>
      {notice && <p className="form-message form-message-success" role="status">{notice}</p>}

      <ol className="match-rows" aria-label={`Partidas da rodada ${current.number}`}>
        {current.matches.map((match) => {
          const { day, time } = formatKickoff(match.startsAt)
          const isOpen = match.situation === 'open'
          const editing = editingId === match.id
          return (
            <li key={match.id} className={editing ? 'mrow mrow-editing' : 'mrow'}>
              <span className="mrow-when"><b>{time}</b>{day}</span>
              <span className="mrow-home"><TeamLabel team={match.home} side="home" /></span>
              <span className="mrow-center"><PredictionMark prediction={match.prediction} /></span>
              <span className="mrow-away"><TeamLabel team={match.away} side="away" /></span>
              <span className="mrow-side">
                {isOpen && !editing && (
                  <button className="small-button" type="button" onClick={() => edit(match.id)}>{match.prediction ? 'Editar' : 'Palpitar'}</button>
                )}
                {!isOpen && (
                  <span className={`state state-${situationTone(match.situation)}`} title={situationHints[match.situation]}>
                    {situationLabels[match.situation] ?? match.situation}
                  </span>
                )}
              </span>
              {editing && (
                <PredictionEditor
                  match={match}
                  pending={pending}
                  fieldErrors={fieldErrors}
                  message={message}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(body) => submit(match, body)}
                />
              )}
            </li>
          )
        })}
      </ol>
      <p className="fine-print">Resultado certo vale 2 pontos; placar exato vale 5. Os palpites fecham no horário de início de cada partida.</p>
    </div>
  )
}
