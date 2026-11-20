import { useEffect, useEffectEvent, useState } from 'react'
import { LoaderCircle, Medal } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import { blockedMessages } from './predictions-api.js'
import { fetchPoolMedals, medalCountLabel, winnersLabel } from './medals-api.js'

// Tela de medalhas do bolão (SPEC-016): melhores jogadores por rodada encerrada e medalhas de cada um.
export default function MedalsPage({ token, poolId, onSessionRejected, onBack }) {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')

  const handleLoadError = useEffectEvent((error) => {
    if (isSessionRejected(error)) onSessionRejected()
    else setLoadError(blockedMessages[error.type] ?? error.message)
  })

  // A página é remontada por bolão (key no PoolsPanel), então o estado já começa limpo.
  useEffect(() => {
    let active = true
    fetchPoolMedals(token, poolId).then((result) => {
      if (active) setData(result)
    }).catch((error) => {
      if (active) handleLoadError(error)
    })
    return () => { active = false }
  }, [token, poolId])

  return (
    <>
      <p className="eyebrow">MEDALHAS</p>
      <h2 id="auth-title">{data?.pool.name ?? 'Medalhas do bolão'}</h2>
      <p className="form-copy">Ao fim de cada rodada, quem fez mais pontos ganha uma medalha. Ela não muda pontos nem ranking.</p>

      {loadError && <p className="form-message" role="alert">{loadError}</p>}
      {!data && !loadError && <p className="form-copy" role="status"><LoaderCircle size={14} className="spin" /> Carregando...</p>}

      {data && (
        <>
          <h3 className="section-title">MELHORES DA RODADA</h3>
          {data.rounds.length === 0 && <p className="form-copy">Nenhuma rodada deste bolão terminou ainda.</p>}
          <ul className="feature-list">
            {data.rounds.map((round) => (
              <li key={round.number}>
                <span>Rodada {round.number}</span>
                <strong>{winnersLabel(round)}</strong>
              </li>
            ))}
          </ul>

          <h3 className="section-title">QUADRO DE MEDALHAS</h3>
          {data.participants.length === 0 && <p className="form-copy">Ainda não há medalhas neste bolão.</p>}
          <ul className="feature-list">
            {data.participants.map((participant) => (
              <li key={participant.participationId} className={participant.isRequester ? 'medal-own' : undefined}>
                <span className="medal-name"><Medal size={14} aria-hidden="true" /> {participant.name}{participant.isRequester ? ' (você)' : ''}</span>
                <strong>{medalCountLabel(participant.count)} · rodadas {participant.medalRounds.join(', ')}</strong>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mode-switch">
        <button type="button" onClick={onBack}>Voltar às regras do bolão</button>
      </div>
    </>
  )
}
