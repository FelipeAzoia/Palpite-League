import { useEffect, useEffectEvent, useState } from 'react'
import { ExternalLink, LoaderCircle } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import { formatBrl, testEnvironmentNotice } from './financial-view.js'
import {
  checkPremiumSubscription,
  decideSimulatedPayment,
  fetchSimulatedPayment,
  subscribePremium,
} from './premium-api.js'
import {
  checkResultMessage,
  cycleHighlight,
  cycleName,
  premiumAdvantages,
  premiumStage,
  priceLabel,
  stageMessage,
} from './premium-view.js'
import SubscriptionManager from './SubscriptionManager.jsx'
import BillingPolicyDialog from './BillingPolicyDialog.jsx'
import { billingPolicyTitle, billingPolicyVersion } from './billing-policy.js'

// Página de pagamento simulado (SPEC-019, OPEN-86): faz o papel do checkout quando o simulador está
// ativo. Aprovar ou recusar só decide do lado do "provedor"; quem ativa é a conferência do backend.
function SimulatedPayment({ token, movementId, onDone, onCancel, onSessionRejected }) {
  const [payment, setPayment] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const rejectSession = useEffectEvent(() => onSessionRejected())

  useEffect(() => {
    let active = true
    fetchSimulatedPayment(token, movementId).then(({ payment: loaded }) => {
      if (active) setPayment(loaded)
    }).catch((caught) => {
      if (isSessionRejected(caught)) rejectSession()
      else if (active) setError(caught.message)
    })
    return () => { active = false }
  }, [token, movementId])

  async function decide(decision) {
    setBusy(true)
    setError('')
    try {
      await decideSimulatedPayment(token, movementId, decision)
      // Volta do "checkout": a situação é conferida na hora.
      const { subscription } = await checkPremiumSubscription(token)
      onDone(checkResultMessage(subscription.status))
    } catch (caught) {
      if (isSessionRejected(caught)) onSessionRejected()
      else setError(caught.message)
      setBusy(false)
    }
  }

  return (
    <section className="simulated-checkout" aria-labelledby="simulated-checkout-title">
      <span className="simulation-badge">SIMULAÇÃO</span>
      <h3 id="simulated-checkout-title">Página de pagamento simulado</h3>
      <p className="test-environment-warning" role="note">
        Esta página simula o provedor de pagamentos. Nenhum cartão é pedido e nenhum dinheiro real é movimentado.
      </p>
      {error && <p className="form-message" role="alert">{error}</p>}
      {!payment && !error && <p className="tab-loading" role="status"><LoaderCircle size={14} className="spin" /> Carregando...</p>}
      {payment && (
        <>
          <p className="simulated-amount">Premium — <strong>{formatBrl(payment.amountCents)}</strong></p>
          <div className="premium-actions">
            <button className="small-button small-button-solid" type="button" disabled={busy} onClick={() => decide('approve')}>
              Aprovar pagamento simulado
            </button>
            <button className="small-button" type="button" disabled={busy} onClick={() => decide('refuse')}>
              Recusar pagamento simulado
            </button>
            <button className="catalog-retry" type="button" disabled={busy} onClick={onCancel}>Voltar</button>
          </div>
        </>
      )}
    </section>
  )
}

// Contratação do Premium na aba "Meu plano": condições, confirmação explícita, acompanhamento da
// operação pendente e resultado. O plano só muda quando o backend confirma o pagamento.
export default function PremiumSection({ token, conditions, activePools = 0, onChanged, onSessionRejected }) {
  const [confirming, setConfirming] = useState(false)
  // Aceite da Política de Cobrança e Cancelamento: obrigatório antes de contratar (SPEC-019, CA-22).
  const [policyAccepted, setPolicyAccepted] = useState(false)
  const [policyOpen, setPolicyOpen] = useState(false)
  // Ciclo escolhido: mensal ou anual com desconto (SPEC-029).
  const [cycle, setCycle] = useState('monthly')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [simulatedMovementId, setSimulatedMovementId] = useState(null)
  const stage = premiumStage(conditions)
  const subscription = conditions.subscription

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
      // Mesmo com falha do provedor, a contratação pendente passa a aparecer (E1).
      if (caught.status === 503) onChanged()
    } finally {
      setBusy(false)
    }
  }

  const subscribe = () => run(async () => {
    const { subscription: created } = await subscribePremium(token, billingPolicyVersion, cycle)
    setConfirming(false)
    setPolicyAccepted(false)
    onChanged()
    if (created.payment?.kind === 'simulated_checkout') setSimulatedMovementId(created.movementId)
  })

  const check = () => run(async () => {
    const { subscription: checked } = await checkPremiumSubscription(token)
    setMessage(checkResultMessage(checked.status))
    onChanged()
  })

  if (simulatedMovementId) {
    return (
      <SimulatedPayment
        token={token}
        movementId={simulatedMovementId}
        onSessionRejected={onSessionRejected}
        onCancel={() => setSimulatedMovementId(null)}
        onDone={(result) => {
          setSimulatedMovementId(null)
          setMessage(result)
          onChanged()
        }}
      />
    )
  }

  // Depois de cancelada ou expirada, a pessoa pode contratar de novo (SPEC-019).
  const canOffer = stage === 'offer' || stage === 'refused' || stage === 'ended'
  const hasSubscriptionDetails = ['active', 'cancellation_pending', 'non_renewing', 'past_due', 'ended'].includes(stage) && subscription?.startsAt

  return (
    <section className="premium-section" aria-labelledby="premium-title">
      <div className="plan-card-head">
        <h3 id="premium-title" className="block-title">Premium</h3>
        {conditions.simulated && <span className="simulation-badge">SIMULAÇÃO</span>}
      </div>
      <p className="test-environment-warning" role="note">{testEnvironmentNotice}</p>

      {message && <p className="form-message form-message-success" role="status">{message}</p>}
      {error && <p className="form-message" role="alert">{error}</p>}
      {stage !== 'offer' && <p className="toolbar-note">{stageMessage(stage, subscription)}</p>}

      {hasSubscriptionDetails && (
        <SubscriptionManager
          token={token}
          subscription={subscription}
          activePools={activePools}
          onOpenPolicy={() => setPolicyOpen(true)}
          onChanged={onChanged}
          onSessionRejected={onSessionRejected}
        />
      )}

      {canOffer && (
        <div className="premium-offer">
          <div className="cycle-options" role="radiogroup" aria-label="Plano de cobrança">
            {(conditions.cycles ?? []).map((option) => (
              <label key={option.id} className={`cycle-option${cycle === option.id ? ' is-selected' : ''}`}>
                <input type="radio" name="premium-cycle" value={option.id} checked={cycle === option.id} onChange={() => setCycle(option.id)} />
                <span className="cycle-name">
                  {cycleName(option.id)}
                  {option.savingsCents > 0 && <span className="cycle-badge">2 meses grátis</span>}
                </span>
                <strong>{priceLabel(conditions, option.id)}</strong>
                <small>{cycleHighlight(option) || 'Renovação automática todo mês'}</small>
              </label>
            ))}
          </div>
          <ul className="feature-list">
            {premiumAdvantages(conditions.plan.features).map((feature) => (
              <li key={feature.id}><span>{feature.label}</span><strong>{feature.value}</strong></li>
            ))}
          </ul>
          {!confirming && (
            <button className="primary-button" type="button" onClick={() => setConfirming(true)}>Contratar Premium</button>
          )}
          {confirming && (
            <div className="premium-confirm" role="group" aria-label="Confirmar contratação">
              <p>
                Você vai contratar o Premium {cycleName(cycle).toLowerCase()} por <strong>{priceLabel(conditions, cycle)}</strong>,
                com renovação automática {cycle === 'annual' ? 'a cada ano' : 'a cada mês'} até você cancelar.
                Os recursos só são ativados depois da confirmação do pagamento de teste.
              </p>
              <label className="policy-accept">
                <input type="checkbox" checked={policyAccepted} onChange={(event) => setPolicyAccepted(event.target.checked)} />
                <span>
                  Li e aceito a{' '}
                  <button className="policy-link" type="button" onClick={() => setPolicyOpen(true)}>{billingPolicyTitle}</button>.
                </span>
              </label>
              <div className="premium-actions">
                <button className="small-button small-button-solid" type="button" disabled={busy || !policyAccepted} onClick={subscribe}>
                  {busy ? 'Iniciando...' : 'Confirmar contratação'}
                </button>
                <button className="small-button" type="button" disabled={busy} onClick={() => setConfirming(false)}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {(stage === 'pending' || stage === 'pending_unstarted') && (
        <div className="premium-actions">
          {subscription.payment?.kind === 'checkout' && (
            <a className="small-button small-button-solid" href={subscription.payment.url} target="_blank" rel="noopener noreferrer">
              Ir para o pagamento de teste <ExternalLink size={13} aria-hidden="true" />
            </a>
          )}
          {subscription.simulated && subscription.movementId && (
            <button className="small-button small-button-solid" type="button" disabled={busy} onClick={() => setSimulatedMovementId(subscription.movementId)}>
              Abrir pagamento simulado
            </button>
          )}
          <button className="small-button" type="button" disabled={busy} onClick={check}>
            {busy ? 'Conferindo...' : 'Já concluí o pagamento — conferir'}
          </button>
        </div>
      )}

      {policyOpen && <BillingPolicyDialog onClose={() => setPolicyOpen(false)} />}
    </section>
  )
}
