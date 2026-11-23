import { useState } from 'react'
import { isSessionRejected } from './account-api.js'
import { checkSubscriptionCancellation, requestSubscriptionCancellation } from './premium-api.js'
import { cancellationNotice, cancellationResultMessage, formatUtc, subscriptionStatusLabel } from './premium-view.js'

// SPEC-020 — consulta da assinatura e cancelamento em dois passos, com o aviso fixo antes da
// confirmação (OPEN-94). O backend decide o estado: a tela nunca mostra "cancelada" antes da
// confirmação do provedor.
export default function SubscriptionManager({ token, subscription, onChanged, onSessionRejected }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const pending = subscription.status === 'cancellation_pending'
  const ended = subscription.status === 'cancelled' || subscription.status === 'expired'

  async function run(action) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await action()
    } catch (caught) {
      if (isSessionRejected(caught)) {
        onSessionRejected()
        return
      }
      setError(caught.message)
      // Com o provedor fora do ar o pedido fica registrado como pendente: a tela passa a mostrá-lo.
      if (caught.status === 503) {
        setConfirming(false)
        onChanged()
      }
    } finally {
      setBusy(false)
    }
  }

  const cancel = () => run(async () => {
    await requestSubscriptionCancellation(token)
    setConfirming(false)
    setMessage('Cancelamento solicitado. Ele aguarda a confirmação do provedor; seu Premium continua valendo até lá.')
    onChanged()
  })

  const check = () => run(async () => {
    const { subscription: checked } = await checkSubscriptionCancellation(token)
    setMessage(cancellationResultMessage(checked.status))
    onChanged()
  })

  return (
    <div className="subscription-manager">
      <dl className="info-list subscription-details">
        <div>
          <dt>Assinatura</dt>
          <dd className={pending ? 'profile-open' : undefined}>{subscriptionStatusLabel(subscription.status)}</dd>
        </div>
        <div><dt>Início da vigência</dt><dd>{formatUtc(subscription.startsAt)}</dd></div>
        <div><dt>Fim da vigência</dt><dd>{formatUtc(subscription.endsAt)}</dd></div>
        {pending && <div><dt>Cancelamento pedido em</dt><dd>{formatUtc(subscription.cancellationRequestedAt)}</dd></div>}
        {ended && <div><dt>{subscription.status === 'expired' ? 'Expirou em' : 'Cancelada em'}</dt><dd>{formatUtc(subscription.endedAt)}</dd></div>}
        {subscription.simulated && <div><dt>Operação</dt><dd><span className="simulation-badge">SIMULAÇÃO</span></dd></div>}
      </dl>

      {message && <p className="form-message form-message-success" role="status">{message}</p>}
      {error && <p className="form-message" role="alert">{error}</p>}

      {subscription.status === 'active' && !confirming && (
        <div className="premium-actions">
          <button className="small-button danger" type="button" onClick={() => setConfirming(true)}>Cancelar assinatura</button>
        </div>
      )}

      {subscription.status === 'active' && confirming && (
        <div className="premium-confirm cancellation-confirm" role="group" aria-label="Confirmar cancelamento">
          <p><strong>Antes de cancelar, confira:</strong></p>
          <ul>
            {cancellationNotice.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <div className="premium-actions">
            <button className="small-button danger" type="button" disabled={busy} onClick={cancel}>
              {busy ? 'Enviando...' : 'Confirmar cancelamento'}
            </button>
            <button className="small-button" type="button" disabled={busy} onClick={() => setConfirming(false)}>Manter assinatura</button>
          </div>
        </div>
      )}

      {pending && (
        <div className="premium-actions">
          <button className="small-button" type="button" disabled={busy} onClick={check}>
            {busy ? 'Conferindo...' : 'Conferir cancelamento'}
          </button>
        </div>
      )}
    </div>
  )
}
