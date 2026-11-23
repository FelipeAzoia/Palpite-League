import { useEffect, useEffectEvent, useState } from 'react'
import { isSessionRejected } from './account-api.js'
import { formatBrl } from './financial-view.js'
import { formatInviteDate } from './invites-view.js'
import { decideRefund, fetchPendingRefunds, refundDecisionMessage } from './refunds-api.js'

// SPEC-023 — pedidos de devolução pendentes, para administrador e coadministrador. Aprovar só
// autoriza: a devolução é processada depois e nunca aparece aqui como concluída.
export default function RefundRequestsSection({ token, poolId, onSessionRejected }) {
  const [requests, setRequests] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirming, setConfirming] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const rejectSession = useEffectEvent(() => onSessionRejected())

  async function load() {
    try {
      setRequests((await fetchPendingRefunds(token, poolId)).requests)
    } catch (caught) {
      if (isSessionRejected(caught)) onSessionRejected()
      else setError(caught.message)
    }
  }

  useEffect(() => {
    let active = true
    fetchPendingRefunds(token, poolId).then((result) => {
      if (active) setRequests(result.requests)
    }).catch((caught) => {
      if (isSessionRejected(caught)) rejectSession()
      else if (active) setError(caught.message)
    })
    return () => { active = false }
  }, [token, poolId])

  async function decide(requestId, decision) {
    setBusyId(requestId)
    setError('')
    setNotice('')
    try {
      setNotice(refundDecisionMessage((await decideRefund(token, poolId, requestId, decision)).request))
    } catch (caught) {
      // Outro decisor pode ter decidido antes: a lista é recarregada com a mensagem (CA-11).
      if (isSessionRejected(caught)) onSessionRejected()
      else setError(caught.message)
    } finally {
      setConfirming(null)
      setBusyId(null)
      await load()
    }
  }

  // Sem pedidos e sem aviso, a seção não ocupa espaço na gestão.
  if (requests && requests.length === 0 && !notice && !error) return null

  return (
    <section aria-labelledby="refund-requests-title">
      <h3 id="refund-requests-title" className="block-title">
        Pedidos de devolução
        {requests && requests.length > 0 && <span className="count-pill">{requests.length}</span>}
      </h3>
      {notice && <p className="form-message form-message-success" role="status">{notice}</p>}
      {error && <p className="form-message" role="alert">{error}</p>}
      {!requests && !error && <p className="tab-loading" role="status">Carregando pedidos de devolução...</p>}
      {requests && requests.length > 0 && (
        <ul className="plain-rows">
          {requests.map((request) => (
            <li key={request.id}>
              <span className="plain-rows-main">
                {request.requesterName}
                <small>{formatBrl(request.amountCents)} · pediu em {formatInviteDate(request.requestedAt)}</small>
              </span>
              {confirming?.id !== request.id ? (
                <span className="invite-actions">
                  <button type="button" className="small-button" disabled={busyId === request.id} onClick={() => setConfirming({ id: request.id, decision: 'approve' })}>Aprovar</button>
                  <button type="button" className="small-button danger" disabled={busyId === request.id} onClick={() => setConfirming({ id: request.id, decision: 'reject' })}>Rejeitar</button>
                </span>
              ) : (
                <span className="invite-actions">
                  <button
                    type="button"
                    className={confirming.decision === 'approve' ? 'small-button small-button-solid' : 'small-button danger'}
                    disabled={busyId === request.id}
                    onClick={() => decide(request.id, confirming.decision)}
                  >
                    {busyId === request.id ? 'Enviando...' : confirming.decision === 'approve' ? 'Confirmar aprovação' : 'Confirmar rejeição'}
                  </button>
                  <button type="button" className="small-button" onClick={() => setConfirming(null)}>Cancelar</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="fine-print">A decisão é definitiva. Aprovar autoriza a devolução, que ainda precisa ser processada.</p>
    </section>
  )
}
