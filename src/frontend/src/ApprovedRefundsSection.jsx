import { useEffect, useEffectEvent, useState } from 'react'
import { isSessionRejected } from './account-api.js'
import { formatBrl } from './financial-view.js'
import { fetchApprovedRefunds, refusalReasonLabels, refundStatusLabels, retryRefund } from './refunds-api.js'

function situation(refund) {
  const parts = [refundStatusLabels[refund.state] ?? refund.state]
  if (refund.state === 'refused' && refund.refusalReason) parts[0] += `: ${refusalReasonLabels[refund.refusalReason] ?? refund.refusalReason}`
  if (refund.inconsistent) parts.push('resposta do provedor em verificação')
  if (refund.simulated) parts.push('simulação')
  if (refund.attempts > 1) parts.push(`${refund.attempts} tentativas`)
  return parts.join(' · ')
}

// SPEC-024 — devoluções aprovadas do bolão, para a administração: o andamento vem do backend e
// nova tentativa só aparece depois de uma recusa. Nada é repetido automaticamente.
export default function ApprovedRefundsSection({ token, poolId, onSessionRejected }) {
  const [refunds, setRefunds] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState(null)
  const rejectSession = useEffectEvent(() => onSessionRejected())

  useEffect(() => {
    let active = true
    fetchApprovedRefunds(token, poolId).then((result) => {
      if (active) setRefunds(result.refunds)
    }).catch((caught) => {
      if (isSessionRejected(caught)) rejectSession()
      else if (active) setError(caught.message)
    })
    return () => { active = false }
  }, [token, poolId])

  async function retry(requestId) {
    setBusyId(requestId)
    setError('')
    setNotice('')
    try {
      const { refund } = await retryRefund(token, poolId, requestId)
      setRefunds((current) => current.map((item) => (item.id === requestId ? refund : item)))
      setNotice(refund.state === 'completed' ? 'Devolução concluída.' : 'Nova tentativa enviada ao provedor.')
    } catch (caught) {
      if (isSessionRejected(caught)) onSessionRejected()
      else setError(caught.message)
    } finally {
      setBusyId(null)
    }
  }

  if (!refunds?.length && !error) return null

  return (
    <section aria-labelledby="approved-refunds-title">
      <h3 id="approved-refunds-title" className="block-title">Devoluções aprovadas</h3>
      {notice && <p className="form-message form-message-success" role="status">{notice}</p>}
      {error && <p className="form-message" role="alert">{error}</p>}
      {refunds && (
        <ul className="plain-rows">
          {refunds.map((refund) => (
            <li key={refund.id}>
              <span className="plain-rows-main">
                {refund.requesterName}
                <small>{formatBrl(refund.amountCents)} · {situation(refund)}</small>
              </span>
              {refund.canRetry && (
                <span className="invite-actions">
                  <button type="button" className="small-button" disabled={busyId === refund.id} onClick={() => retry(refund.id)}>
                    {busyId === refund.id ? 'Enviando...' : 'Tentar de novo'}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="fine-print">A devolução é feita no pagamento original, sem dinheiro real no ambiente de teste. Recusas não são repetidas automaticamente.</p>
    </section>
  )
}
