import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import { canLeave, confirmExit, discardedLabel, fetchExitPreview } from './exit-api.js'
import { formatKickoff } from './match-format.js'
import { PredictionMark } from './PredictionsPage.jsx'

const visibleDiscarded = 5

function DiscardedRows({ items }) {
  return (
    <ol className="match-rows match-rows-compact">
      {items.map(({ match, prediction }) => {
        const { day, time } = formatKickoff(match.startsAt)
        return (
          <li key={match.id} className="mrow">
            <span className="mrow-when"><b>{time}</b>{day}</span>
            <span className="mrow-home">{match.home.name}</span>
            <span className="mrow-center"><PredictionMark prediction={prediction} /></span>
            <span className="mrow-away">{match.away.name}</span>
          </li>
        )
      })}
    </ol>
  )
}

// Mostra os próximos palpites a descartar e recolhe o restante.
function DiscardedList({ items }) {
  const rest = items.slice(visibleDiscarded)
  return (
    <>
      <DiscardedRows items={items.slice(0, visibleDiscarded)} />
      {rest.length > 0 && (
        <details className="history">
          <summary>Ver os outros {rest.length} {rest.length === 1 ? 'palpite' : 'palpites'}</summary>
          <DiscardedRows items={rest} />
        </details>
      )}
    </>
  )
}

// Saída voluntária do bolão (SPEC-017): consequências, confirmação explícita e mensagem final.
export default function LeaveSection({ token, poolId, role, poolStatus, onSessionRejected, onLeft }) {
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [understood, setUnderstood] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  if (poolStatus !== 'active') return null

  if (!canLeave(role, poolStatus)) {
    return (
      <section aria-labelledby="leave-title" className="leave-block">
        <h3 id="leave-title" className="block-title">Sair do bolão</h3>
        <p className="fine-print fine-print-top">Como administrador, você não pode sair enquanto o bolão estiver ativo.</p>
      </section>
    )
  }

  function fail(requestError) {
    if (isSessionRejected(requestError)) onSessionRejected()
    else setError(requestError.message)
  }

  async function open() {
    setLoading(true)
    setError('')
    try {
      setPreview(await fetchExitPreview(token, poolId))
    } catch (requestError) {
      fail(requestError)
    } finally {
      setLoading(false)
    }
  }

  async function leave() {
    setPending(true)
    setError('')
    try {
      const result = await confirmExit(token, poolId)
      onLeft(result.message)
    } catch (requestError) {
      fail(requestError)
      setPending(false)
    }
  }

  function cancel() {
    setPreview(null)
    setUnderstood(false)
    setError('')
  }

  return (
    <section aria-labelledby="leave-title" className="leave-block">
      <h3 id="leave-title" className="block-title">Sair do bolão</h3>
      {!preview && (
        <>
          <p className="fine-print fine-print-top">Você pode sair quando quiser. Antes de confirmar, mostramos o que acontece.</p>
          <button type="button" className="small-button danger" onClick={open} disabled={loading}>
            {loading ? <><LoaderCircle size={13} className="spin" /> Carregando...</> : 'Ver consequências da saída'}
          </button>
        </>
      )}

      {preview && (
        <div className="leave-panel" role="region" aria-label="Consequências da saída">
          <ul className="rule-list">
            {preview.consequences.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <p className="leave-count">{discardedLabel(preview.discardedPredictions.length)}</p>
          {preview.discardedPredictions.length > 0 && (
            <DiscardedList items={preview.discardedPredictions} />
          )}
          <label className="check-field leave-check">
            <input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} />
            <span>Entendi as consequências e quero sair deste bolão.</span>
          </label>
          <div className="invite-actions">
            <button type="button" className="small-button danger-solid" onClick={leave} disabled={!understood || pending}>
              {pending ? 'Saindo...' : 'Confirmar saída'}
            </button>
            <button type="button" className="link-button" onClick={cancel} disabled={pending}>Cancelar</button>
          </div>
        </div>
      )}
      {error && <p className="form-message" role="alert">{error}</p>}
    </section>
  )
}
