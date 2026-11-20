import { useEffect, useEffectEvent, useState } from 'react'
import { LoaderCircle, Medal } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import { blockedMessages } from './predictions-api.js'
import { fetchPoolMedals, medalCountLabel } from './medals-api.js'

// Aba de medalhas (SPEC-016): melhores de cada rodada encerrada e quadro de medalhas.
export default function MedalsPage({ token, poolId, onSessionRejected }) {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')

  const handleLoadError = useEffectEvent((error) => {
    if (isSessionRejected(error)) onSessionRejected()
    else setLoadError(blockedMessages[error.type] ?? error.message)
  })

  useEffect(() => {
    let active = true
    fetchPoolMedals(token, poolId).then((result) => {
      if (active) setData(result)
    }).catch((error) => {
      if (active) handleLoadError(error)
    })
    return () => { active = false }
  }, [token, poolId])

  if (loadError) return <p className="form-message" role="alert">{loadError}</p>
  if (!data) return <p className="tab-loading" role="status"><LoaderCircle size={14} className="spin" /> Carregando medalhas...</p>

  return (
    <div className="tab-body tab-split">
      <section aria-labelledby="medals-rounds">
        <h3 id="medals-rounds" className="block-title">Melhores de cada rodada</h3>
        {data.rounds.length === 0 ? (
          <p className="empty-state">Nenhuma rodada deste bolão terminou ainda. Ao fim de cada uma, quem fizer mais pontos ganha uma medalha.</p>
        ) : (
          <ol className="medal-rounds">
            {data.rounds.map((round) => (
              <li key={round.number} className={round.winners.length ? 'medal-round' : 'medal-round medal-round-empty'}>
                <span className="medal-round-number">R{round.number}</span>
                <div>
                  {round.winners.length ? (
                    <>
                      <strong>{round.winners.map(({ name, isRequester }) => (isRequester ? `${name} (você)` : name)).join(', ')}</strong>
                      <span>{round.winners[0].points} pts na rodada{round.winners.length > 1 ? ' · empate' : ''}</span>
                    </>
                  ) : (
                    <span>Sem medalha: ninguém pontuou</span>
                  )}
                </div>
                {round.winners.length > 0 && <Medal className="medal-round-icon" size={18} aria-hidden="true" />}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="medals-board">
        <h3 id="medals-board" className="block-title">Quadro de medalhas</h3>
        {data.participants.length === 0 ? (
          <p className="empty-state">Ainda não há medalhas neste bolão.</p>
        ) : (
          <ol className="plain-rows">
            {data.participants.map((participant) => (
              <li key={participant.participationId} className={participant.isRequester ? 'is-own' : undefined}>
                <span className="plain-rows-main">{participant.name}{participant.isRequester && <span className="you-tag">você</span>}</span>
                <span className="muted-text">rodadas {participant.medalRounds.join(', ')}</span>
                <strong className="medal-count"><Medal size={14} aria-hidden="true" /> {participant.count}<span className="sr-only"> ({medalCountLabel(participant.count)})</span></strong>
              </li>
            ))}
          </ol>
        )}
        <p className="fine-print">Medalhas são só um reconhecimento: não mudam pontos, ranking nem premiação.</p>
      </section>
    </div>
  )
}
