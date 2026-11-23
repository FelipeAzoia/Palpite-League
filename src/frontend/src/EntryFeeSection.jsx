import { useEffect, useEffectEvent, useState } from 'react'
import { ExternalLink, LoaderCircle } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import {
  checkEntryFeePayment,
  entryFeeResultMessage,
  entryFeeSituation,
  fetchEntryFee,
  startEntryFeePayment,
} from './entry-fee-api.js'
import { formatBrl } from './financial-view.js'
import { decideSimulatedPayment } from './premium-api.js'

// SPEC-022 — pagamento da taxa de entrada pelo titular da participação aprovada. A tela só inicia,
// mostra e confere; quem confirma a participação é o backend, depois da confirmação do pagamento.
export default function EntryFeeSection({ token, poolId, onConfirmed, onSessionRejected }) {
  const [view, setView] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const rejectSession = useEffectEvent(() => onSessionRejected())

  useEffect(() => {
    let active = true
    fetchEntryFee(token, poolId).then((loaded) => {
      if (active) setView(loaded)
    }).catch((caught) => {
      if (isSessionRejected(caught)) rejectSession()
      else if (active) setError(caught.message)
    })
    return () => { active = false }
  }, [token, poolId])

  async function run(action) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const next = await action()
      setView(next)
      return next
    } catch (caught) {
      if (isSessionRejected(caught)) onSessionRejected()
      else {
        setError(caught.message)
        // Indisponibilidade ou conflito: recarrega a situação real do backend.
        fetchEntryFee(token, poolId).then(setView).catch(() => {})
      }
      return null
    } finally {
      setBusy(false)
    }
  }

  async function check() {
    const next = await run(() => checkEntryFeePayment(token, poolId))
    if (!next) return
    setMessage(entryFeeResultMessage(next))
    if (next.participation.status === 'confirmed') onConfirmed()
  }

  // Página de pagamento simulado: a decisão só vale do lado do "provedor"; a confirmação vem da
  // conferência do backend, logo em seguida.
  async function decideSimulated(decision) {
    setBusy(true)
    setError('')
    try {
      await decideSimulatedPayment(token, view.payment.id, decision)
    } catch (caught) {
      if (isSessionRejected(caught)) onSessionRejected()
      else setError(caught.message)
      setBusy(false)
      return
    }
    await check()
  }

  if (!view) {
    return (
      <section className="entry-fee" aria-label="Taxa de entrada">
        {error ? <p className="form-message" role="alert">{error}</p>
          : <p className="tab-loading" role="status"><LoaderCircle size={14} className="spin" /> Carregando pagamento...</p>}
      </section>
    )
  }

  const situation = entryFeeSituation(view)
  const pending = view.payment?.status === 'pending'
  const continuation = pending ? view.payment.continuation : null

  return (
    <section className="entry-fee" aria-labelledby="entry-fee-title">
      <div className="entry-fee-head">
        <div>
          <p className="eyebrow">TAXA DE ENTRADA</p>
          <h3 id="entry-fee-title">{formatBrl(view.entryFee.amountCents)}</h3>
        </div>
        {view.simulated && <span className="simulation-badge">SIMULAÇÃO</span>}
      </div>
      <p className={`entry-fee-status entry-fee-${situation.tone}`} role="status">{situation.text}</p>
      <p className="test-environment-warning" role="note">
        Ambiente de teste: nenhum dinheiro real é movimentado.
        {view.simulated && ' Os pagamentos são feitos por um simulador, não por um provedor real.'}
      </p>

      {error && <p className="form-message" role="alert">{error}</p>}
      {message && <p className="form-message form-message-success" role="status">{message}</p>}

      {continuation?.kind === 'simulated_checkout' && (
        <div className="simulated-checkout">
          <p className="simulated-amount">Página de pagamento simulado — <strong>{formatBrl(view.payment.amountCents)}</strong></p>
          <div className="premium-actions">
            <button className="small-button small-button-solid" type="button" disabled={busy} onClick={() => decideSimulated('approve')}>
              Aprovar pagamento simulado
            </button>
            <button className="small-button" type="button" disabled={busy} onClick={() => decideSimulated('refuse')}>
              Recusar pagamento simulado
            </button>
          </div>
        </div>
      )}

      <div className="premium-actions">
        {view.canPay && (
          <button className="small-button small-button-solid" type="button" disabled={busy} onClick={() => run(() => startEntryFeePayment(token, poolId))}>
            {busy ? <LoaderCircle size={14} className="spin" /> : null}
            {view.payment ? 'Tentar pagar de novo' : 'Pagar taxa de entrada'}
          </button>
        )}
        {continuation?.kind === 'checkout' && (
          <a className="small-button small-button-solid" href={continuation.url} target="_blank" rel="noreferrer">
            Ir para o pagamento <ExternalLink size={13} aria-hidden="true" />
          </a>
        )}
        {pending && (
          <button className="small-button" type="button" disabled={busy} onClick={check}>Conferir pagamento</button>
        )}
      </div>
    </section>
  )
}
