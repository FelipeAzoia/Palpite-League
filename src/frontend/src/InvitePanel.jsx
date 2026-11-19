import { useEffect, useEffectEvent, useState } from 'react'
import { ArrowRight, CalendarDays, LoaderCircle } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import { canRequestEntry, canSubmitEntry, openInvite, requestEntry, situationLabels } from './invite-link.js'
import { formatBrl, formatDay, poolStatusLabels, prizeModelLabels, tiebreakerLabels } from './pools-form.js'

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

function MatchItem({ match }) {
  return (
    <article className="match-card">
      <div className="match-teams">
        <span>{match.home.name}</span>
        <strong aria-hidden="true">×</strong>
        <span>{match.away.name}</span>
      </div>
      <div className="match-details">
        <span><CalendarDays size={14} /> {match.startsAt ? dateFormatter.format(new Date(match.startsAt)) : 'Data a definir'}</span>
        <span>Rodada {match.roundNumber}</span>
      </div>
    </article>
  )
}

// Tela do convite (SPEC-009): regras do bolão, aviso de entrada tardia, aceites e situação da solicitação.
export default function InvitePanel({ token, code, onSessionRejected, onRequested, onClose }) {
  const [invite, setInvite] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [values, setValues] = useState({ rulesAccepted: false, lateEntryAcknowledged: false })
  const [fieldErrors, setFieldErrors] = useState({})
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)

  function handle(error, setText) {
    if (isSessionRejected(error)) onSessionRejected()
    else setText(error.message)
  }

  async function load() {
    try {
      setInvite(await openInvite(token, code))
    } catch (error) {
      handle(error, setLoadError)
    }
  }

  const handleLoadError = useEffectEvent((error) => handle(error, setLoadError))

  // O pai remonta este painel (key) quando o código do convite muda, então o estado já começa limpo.
  useEffect(() => {
    let active = true
    openInvite(token, code).then((result) => {
      if (active) setInvite(result)
    }).catch((error) => {
      if (active) handleLoadError(error)
    })
    return () => { active = false }
  }, [token, code])

  function toggle(field) {
    return (event) => {
      setValues((current) => ({ ...current, [field]: event.target.checked }))
      setFieldErrors((current) => ({ ...current, [field]: undefined }))
    }
  }

  async function submit(event) {
    event.preventDefault()
    setPending(true)
    setMessage('')
    setFieldErrors({})
    try {
      const result = await requestEntry(token, { code, ...values })
      setNotice(result.message)
      onRequested?.()
      await load()
    } catch (error) {
      if (error.status === 400 && error.fields?.lateEntryAcknowledged) {
        // Uma partida pode ter começado depois da abertura: recarrega o aviso de entrada tardia (CA-09).
        await load()
      }
      if (error.status === 409) await load()
      setFieldErrors(error.fields ?? {})
      handle(error, setMessage)
    } finally {
      setPending(false)
    }
  }

  const pool = invite?.pool
  const lateEntry = invite?.lateEntry
  const lateEntryRequired = lateEntry?.acknowledgementRequired === true

  return (
    <div className="invite-view">
      <p className="eyebrow">CONVITE PARA O BOLÃO</p>
      <h2 id="auth-title">{pool?.name ?? 'Convite'}</h2>

      {!invite && !loadError && <p className="form-copy" role="status">Abrindo o convite...</p>}
      {loadError && (
        <>
          <p className="form-message" role="alert">{loadError} Peça um novo link a quem convidou você.</p>
          <div className="mode-switch"><button type="button" onClick={onClose}>Ir para minha conta</button></div>
        </>
      )}

      {invite && (
        <>
          {notice && <p className="form-message form-message-success" role="status">{notice}</p>}
          <p className={`invite-situation invite-situation-${invite.situation.status}`} role="status">
            {situationLabels[invite.situation.status] ?? invite.situation.status}
          </p>

          <div className="invite-grid">
            <section aria-labelledby="invite-rules-title">
              <h3 className="section-title" id="invite-rules-title">REGRAS</h3>
              <dl className="info-list">
                <div><dt>Status</dt><dd>{poolStatusLabels[pool.status] ?? pool.status}</dd></div>
                <div><dt>Período</dt><dd>{formatDay(pool.startsOn)} a {formatDay(pool.endsOn)}</dd></div>
                <div><dt>Taxa de entrada</dt><dd>{Number(pool.entryFee) === 0 ? 'Sem taxa' : formatBrl(pool.entryFee)}</dd></div>
                <div><dt>Premiação</dt><dd>{prizeModelLabels[pool.prizeModel] ?? pool.prizeModel}</dd></div>
                <div><dt>Desempate</dt><dd>{tiebreakerLabels[pool.tiebreaker] ?? pool.tiebreaker}</dd></div>
                <div><dt>Resultados ao vivo</dt><dd>{pool.liveResults ? 'Sim' : 'Não'}</dd></div>
              </dl>

              <h3 className="section-title">CONDIÇÕES DE PARTICIPAÇÃO</h3>
              <ul className="rule-list">
                {invite.participationConditions.map((condition) => <li key={condition}>{condition}</li>)}
              </ul>
            </section>

            <section aria-labelledby="invite-matches-title">
              <h3 className="section-title" id="invite-matches-title">PARTIDAS ({pool.matches.length})</h3>
              <div className="match-list">
                {pool.matches.map((match) => <MatchItem key={match.id} match={match} />)}
              </div>
            </section>
          </div>

          {canRequestEntry(invite.situation) && lateEntryRequired && (
            <section className="late-entry" aria-labelledby="late-entry-title">
              <h3 className="section-title" id="late-entry-title">ENTRADA TARDIA</h3>
              <p className="form-copy">
                {lateEntry.closedMatches.length === 1 ? 'Esta partida já começou' : `Estas ${lateEntry.closedMatches.length} partidas já começaram`}.
                {' '}Se você entrar, não poderá palpitar {lateEntry.closedMatches.length === 1 ? 'nela' : 'nelas'}.
              </p>
              <div className="match-list">
                {lateEntry.closedMatches.map((match) => <MatchItem key={match.id} match={match} />)}
              </div>
            </section>
          )}

          {canRequestEntry(invite.situation) && (
            <form className="invite-form" onSubmit={submit} noValidate>
              <label className="check-field">
                <input type="checkbox" checked={values.rulesAccepted} onChange={toggle('rulesAccepted')} aria-describedby={fieldErrors.rulesAccepted ? 'rules-error' : undefined} />
                <span>Li e aceito as regras deste bolão.</span>
              </label>
              {fieldErrors.rulesAccepted && <small id="rules-error" className="field-error">{fieldErrors.rulesAccepted}</small>}

              {(lateEntryRequired || fieldErrors.lateEntryAcknowledged) && (
                <label className="check-field">
                  <input type="checkbox" checked={values.lateEntryAcknowledged} onChange={toggle('lateEntryAcknowledged')} aria-describedby={fieldErrors.lateEntryAcknowledged ? 'late-error' : undefined} />
                  <span>Estou ciente de que não poderei palpitar nas partidas que já começaram.</span>
                </label>
              )}
              {fieldErrors.lateEntryAcknowledged && <small id="late-error" className="field-error">{fieldErrors.lateEntryAcknowledged}</small>}

              {message && <p className="form-message" role="alert">{message}</p>}

              <button className="primary-button" type="submit" disabled={pending || !canSubmitEntry(values, lateEntryRequired)}>
                <span>{pending ? 'Enviando...' : 'Solicitar entrada'}</span>
                {pending ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}
              </button>
            </form>
          )}

          <div className="mode-switch">
            <button type="button" onClick={onClose}>{canRequestEntry(invite.situation) ? 'Agora não' : 'Ir para minha conta'}</button>
          </div>
        </>
      )}
    </div>
  )
}
