import { useEffect, useEffectEvent, useState } from 'react'
import { isSessionRejected } from './account-api.js'
import { formatInviteDate } from './invites-view.js'
import { decideRequest, decisionMessage, fetchPendingRequests } from './requests-api.js'

// SPEC-010 — solicitações de entrada para administrador e coadministrador.
export default function RequestsSection({ token, poolId, onSessionRejected, onDecided }) {
  const [requests, setRequests] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmingId, setConfirmingId] = useState(null)
  const [busyId, setBusyId] = useState(null)

  function handleError(requestError) {
    if (isSessionRejected(requestError)) onSessionRejected()
    else setError(requestError.message)
  }

  async function load() {
    try {
      setRequests((await fetchPendingRequests(token, poolId)).requests)
    } catch (requestError) {
      handleError(requestError)
    }
  }

  const handleLoadError = useEffectEvent((requestError) => handleError(requestError))

  // A seção é remontada quando o bolão muda (key no PoolsPanel), então o estado já começa limpo.
  useEffect(() => {
    let active = true
    fetchPendingRequests(token, poolId).then((result) => {
      if (active) setRequests(result.requests)
    }).catch((requestError) => {
      if (active) handleLoadError(requestError)
    })
    return () => { active = false }
  }, [token, poolId])

  async function decide(participationId, decision) {
    setBusyId(participationId)
    setError('')
    setNotice('')
    try {
      const result = await decideRequest(token, poolId, participationId, decision)
      setNotice(decisionMessage(result.participation))
      onDecided?.()
    } catch (requestError) {
      // Se outro decisor já decidiu, a lista é atualizada com a mensagem de erro (CA-17).
      handleError(requestError)
    } finally {
      setConfirmingId(null)
      setBusyId(null)
      await load()
    }
  }

  return (
    <section aria-label="Solicitações de entrada">
      <h3 className="section-title">SOLICITAÇÕES DE ENTRADA</h3>
      {notice && <p className="form-message form-message-success" role="status">{notice}</p>}
      {error && <p className="form-message" role="alert">{error}</p>}
      {!requests && !error && <p className="form-copy" role="status">Carregando solicitações...</p>}
      {requests && requests.length === 0 && <p className="form-copy">Nenhuma solicitação pendente.</p>}
      {requests && requests.length > 0 && (
        <ul className="invite-list">
          {requests.map((request) => (
            <li key={request.id} className="invite-item">
              <div className="invite-item-head">
                <strong className="request-name">{request.name}</strong>
                {confirmingId !== request.id ? (
                  <span className="invite-actions">
                    <button type="button" className="small-button" disabled={busyId === request.id} onClick={() => decide(request.id, 'approve')}>
                      {busyId === request.id ? 'Aprovando...' : 'Aprovar'}
                    </button>
                    <button type="button" className="small-button danger" disabled={busyId === request.id} onClick={() => setConfirmingId(request.id)}>Rejeitar</button>
                  </span>
                ) : (
                  <span className="invite-actions">
                    <button type="button" className="small-button danger" disabled={busyId === request.id} onClick={() => decide(request.id, 'reject')}>
                      {busyId === request.id ? 'Rejeitando...' : 'Confirmar rejeição'}
                    </button>
                    <button type="button" className="small-button" onClick={() => setConfirmingId(null)}>Cancelar</button>
                  </span>
                )}
              </div>
              <p className="invite-meta">
                Solicitado em {formatInviteDate(request.requestedAt)}
                {request.lateEntry && <><br />Entrada tardia: não poderá palpitar nas partidas que já começaram.</>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
