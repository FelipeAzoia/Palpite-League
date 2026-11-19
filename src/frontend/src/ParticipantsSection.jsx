import { useEffect, useEffectEvent, useState } from 'react'
import { isSessionRejected } from './account-api.js'
import {
  canPromote,
  fetchParticipants,
  participantRoleLabel,
  participationStatusLabels,
  promoteParticipant,
} from './participants-api.js'

// SPEC-011 — lista de participantes para administrador e coadministrador; só o administrador promove.
export default function ParticipantsSection({ token, poolId, onSessionRejected }) {
  const [data, setData] = useState(null)
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
      setData(await fetchParticipants(token, poolId))
    } catch (requestError) {
      handleError(requestError)
    }
  }

  const handleLoadError = useEffectEvent((requestError) => handleError(requestError))

  // O PoolsPanel remonta esta seção (key) quando o bolão muda ou há nova decisão de entrada,
  // então o estado já começa limpo e a lista é recarregada.
  useEffect(() => {
    let active = true
    fetchParticipants(token, poolId).then((result) => {
      if (active) setData(result)
    }).catch((requestError) => {
      if (active) handleLoadError(requestError)
    })
    return () => { active = false }
  }, [token, poolId])

  async function promote(participant) {
    setBusyId(participant.id)
    setError('')
    setNotice('')
    try {
      await promoteParticipant(token, poolId, participant.id)
      setNotice(`${participant.name} agora é coadministrador.`)
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setConfirmingId(null)
      setBusyId(null)
      await load()
    }
  }

  return (
    <section aria-label="Participantes do bolão">
      <h3 className="section-title">PARTICIPANTES{data ? ` (${data.participants.length})` : ''}</h3>
      {notice && <p className="form-message form-message-success" role="status">{notice}</p>}
      {error && <p className="form-message" role="alert">{error}</p>}
      {!data && !error && <p className="form-copy" role="status">Carregando participantes...</p>}
      {data && (
        <ul className="invite-list">
          {data.participants.map((participant) => (
            <li key={participant.id} className="invite-item">
              <div className="invite-item-head">
                <strong className="request-name">{participant.name}</strong>
                {canPromote(data.requesterRole, participant) && confirmingId !== participant.id && (
                  <button type="button" className="small-button" onClick={() => setConfirmingId(participant.id)}>Promover</button>
                )}
                {confirmingId === participant.id && (
                  <span className="invite-actions">
                    <button type="button" className="small-button" disabled={busyId === participant.id} onClick={() => promote(participant)}>
                      {busyId === participant.id ? 'Promovendo...' : 'Confirmar promoção'}
                    </button>
                    <button type="button" className="small-button" onClick={() => setConfirmingId(null)}>Cancelar</button>
                  </span>
                )}
              </div>
              <p className="invite-meta">
                {participantRoleLabel(participant.role)} · {participationStatusLabels[participant.status] ?? participant.status}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
