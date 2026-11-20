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
    <section aria-labelledby="requests-title">
      <h3 id="requests-title" className="block-title">
        Solicitações de entrada
        {requests && requests.length > 0 && <span className="count-pill">{requests.length}</span>}
      </h3>
      {notice && <p className="form-message form-message-success" role="status">{notice}</p>}
      {error && <p className="form-message" role="alert">{error}</p>}
      {!requests && !error && <p className="tab-loading" role="status">Carregando solicitações...</p>}
      {requests && requests.length === 0 && <p className="empty-state">Nenhuma solicitação pendente.</p>}
      {requests && requests.length > 0 && (
        <ul className="plain-rows">
          {requests.map((request) => (
            <li key={request.id}>
              <span className="plain-rows-main">
                {request.name}
                <small>
                  Pediu em {formatInviteDate(request.requestedAt)}
                  {request.lateEntry && ' · entrada tardia: não palpita nas partidas já iniciadas'}
                </small>
              </span>
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
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
