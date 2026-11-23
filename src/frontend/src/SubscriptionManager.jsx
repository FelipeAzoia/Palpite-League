import { useState } from 'react'
import { isSessionRejected } from './account-api.js'
import { checkSubscriptionCancellation, requestSubscriptionCancellation, retryRenewalPayment } from './premium-api.js'
import { formatBrl } from './financial-view.js'
import { billingPolicyTitle } from './billing-policy.js'
import {
  cancellationBlockedMessage,
  cancellationNotice,
  cancellationResultMessage,
  cycleName,
  formatUtc,
  recurrenceLabel,
  retryResultMessage,
  subscriptionStatusLabel,
} from './premium-view.js'

// SPEC-020 — consulta da assinatura e cancelamento em dois passos, com o aviso fixo antes da
// confirmação (OPEN-94). O backend decide o estado: a tela nunca mostra "cancelada" antes da
// confirmação do provedor.
export default function SubscriptionManager({ token, subscription, activePools = 0, onOpenPolicy, onChanged, onSessionRejected }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const pending = subscription.status === 'cancellation_pending'
  const ended = subscription.status === 'cancelled' || subscription.status === 'expired'
  const pastDue = subscription.status === 'past_due'
  const attention = pending || pastDue
  // O backend também recusa (409); a tela só avisa antes, para a pessoa não tentar à toa.
  const blocked = cancellationBlockedMessage(activePools)

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
    setMessage(cancellationResultMessage(checked.status, checked))
    onChanged()
  })

  // Nova tentativa de pagar a renovação em atraso, só depois de uma recusa (SPEC-029, RF44).
  const retry = () => run(async () => {
    const { subscription: retried } = await retryRenewalPayment(token)
    setMessage(retryResultMessage(retried.status))
    onChanged()
  })

  return (
    <div className="subscription-manager">
      <dl className="info-list subscription-details">
        <div>
          <dt>Assinatura</dt>
          <dd className={attention ? 'profile-open' : undefined}>{subscriptionStatusLabel(subscription.status)}</dd>
        </div>
        <div>
          <dt>Plano</dt>
          <dd>{cycleName(subscription.billingCycle)} · {formatBrl(subscription.amountCents)} {recurrenceLabel(subscription.billingCycle)}</dd>
        </div>
        <div><dt>Início da vigência</dt><dd>{formatUtc(subscription.startsAt)}</dd></div>
        {subscription.nextChargeAt && <div><dt>Próxima cobrança</dt><dd>{formatUtc(subscription.nextChargeAt)}</dd></div>}
        {subscription.premiumUntil && <div><dt>Premium até</dt><dd>{formatUtc(subscription.premiumUntil)}</dd></div>}
        {pastDue && <div><dt>Regularize até</dt><dd className="profile-open">{formatUtc(subscription.graceEndsAt)}</dd></div>}
        {ended && <div><dt>Fim do período</dt><dd>{formatUtc(subscription.endsAt)}</dd></div>}
        {pending && <div><dt>Cancelamento pedido em</dt><dd>{formatUtc(subscription.cancellationRequestedAt)}</dd></div>}
        {ended && <div><dt>{subscription.status === 'expired' ? 'Expirou em' : 'Cancelada em'}</dt><dd>{formatUtc(subscription.endedAt)}</dd></div>}
        {subscription.simulated && <div><dt>Operação</dt><dd><span className="simulation-badge">SIMULAÇÃO</span></dd></div>}
      </dl>

      {message && <p className="form-message form-message-success" role="status">{message}</p>}
      {error && <p className="form-message" role="alert">{error}</p>}

      {subscription.status === 'active' && !confirming && (
        <>
          {blocked && <p className="catalog-notice" role="status">{blocked}</p>}
          <div className="premium-actions">
            <button className="small-button danger" type="button" disabled={Boolean(blocked)} onClick={() => setConfirming(true)}>
              Cancelar assinatura
            </button>
          </div>
        </>
      )}

      {subscription.status === 'active' && confirming && (
        <div className="premium-confirm cancellation-confirm" role="group" aria-label="Confirmar cancelamento">
          <p><strong>Antes de cancelar, confira:</strong></p>
          <ul>
            {cancellationNotice.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <p>
            Detalhes na{' '}
            <button className="policy-link" type="button" onClick={onOpenPolicy}>{billingPolicyTitle}</button>.
          </p>
          <div className="premium-actions">
            <button className="small-button danger" type="button" disabled={busy} onClick={cancel}>
              {busy ? 'Enviando...' : 'Confirmar cancelamento'}
            </button>
            <button className="small-button" type="button" disabled={busy} onClick={() => setConfirming(false)}>Manter assinatura</button>
          </div>
        </div>
      )}

      {pastDue && (
        <div className="premium-actions">
          {subscription.canRetryPayment ? (
            <button className="small-button small-button-solid" type="button" disabled={busy} onClick={retry}>
              {busy ? 'Tentando...' : 'Tentar pagar novamente'}
            </button>
          ) : (
            <p className="toolbar-note">A cobrança da renovação aguarda a resposta do provedor.</p>
          )}
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
