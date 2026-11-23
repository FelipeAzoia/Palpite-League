import { useEffect, useEffectEvent, useState } from 'react'
import { isSessionRejected } from './account-api.js'
import { formatBrl } from './financial-view.js'
import { formatInviteDate } from './invites-view.js'
import { fetchOwnRefunds, refundReasonLabels, refundSituation, requestRefund } from './refunds-api.js'

// SPEC-023 — devoluções de quem saiu de bolões com taxa paga. A saída não gera devolução automática:
// a pessoa pede aqui e a administração do bolão decide.
export default function RefundsSection({ token, onSessionRejected }) {
  const [refunds, setRefunds] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState(null)
  const rejectSession = useEffectEvent(() => onSessionRejected())

  useEffect(() => {
    let active = true
    fetchOwnRefunds(token).then((result) => {
      if (active) setRefunds(result.refunds)
    }).catch((caught) => {
      if (isSessionRejected(caught)) rejectSession()
      else if (active) setError(caught.message)
    })
    return () => { active = false }
  }, [token])

  async function ask(poolId) {
    setBusyId(poolId)
    setError('')
    setNotice('')
    try {
      const updated = await requestRefund(token, poolId)
      setRefunds((current) => current.map((item) => (item.pool.id === poolId ? updated : item)))
      setNotice('Pedido de devolução enviado. Ele aguarda a decisão do administrador ou coadministrador do bolão.')
    } catch (caught) {
      if (isSessionRejected(caught)) onSessionRejected()
      else setError(caught.message)
    } finally {
      setBusyId(null)
    }
  }

  if (!refunds?.length && !error) return null

  return (
    <section className="refunds-block" aria-labelledby="refunds-title">
      <h3 id="refunds-title" className="block-title">Devoluções</h3>
      <p className="fine-print fine-print-top">Bolões que você deixou depois de pagar a taxa de entrada. A devolução não é automática: ela depende de pedido e da aprovação de quem administra o bolão.</p>
      {notice && <p className="form-message form-message-success" role="status">{notice}</p>}
      {error && <p className="form-message" role="alert">{error}</p>}
      {refunds && (
        <ul className="plain-rows">
          {refunds.map((item) => (
            <li key={item.pool.id}>
              <span className="plain-rows-main">
                {item.pool.name}
                <small>
                  {formatBrl(item.request?.amountCents ?? item.eligibleAmountCents)}
                  {item.request
                    ? ` · ${refundSituation(item.request)} · pedido em ${formatInviteDate(item.request.requestedAt)}`
                    : refundReasonLabels[item.reason] ? ` · ${refundReasonLabels[item.reason]}` : ''}
                </small>
              </span>
              {item.canRequest && (
                <span className="invite-actions">
                  <button type="button" className="small-button" disabled={busyId === item.pool.id} onClick={() => ask(item.pool.id)}>
                    {busyId === item.pool.id ? 'Enviando...' : 'Pedir devolução'}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
