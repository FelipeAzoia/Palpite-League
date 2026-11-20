import { useEffect, useEffectEvent, useState } from 'react'
import { LoaderCircle, Medal } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import { medalCountLabel } from './medals-api.js'
import { tiebreakerLabels } from './pools-form.js'
import { blockedMessages } from './predictions-api.js'
import { fetchPerformance, fetchRanking, tiebreakColumnLabels } from './ranking-api.js'

export function MedalMark({ count }) {
  if (!count) return null
  return (
    <span className="medal-mark" title={medalCountLabel(count)}>
      <Medal size={13} aria-hidden="true" />
      <span className="sr-only">{medalCountLabel(count)}</span>
      {count > 1 && <span aria-hidden="true">{count}</span>}
    </span>
  )
}

// Aba de ranking (SPEC-015): classificação em tabela, pontos por rodada e desempenho próprio.
export default function RankingPage({ token, poolId, onSessionRejected }) {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')

  const handleLoadError = useEffectEvent((error) => {
    if (isSessionRejected(error)) onSessionRejected()
    else setLoadError(blockedMessages[error.type] ?? error.message)
  })

  useEffect(() => {
    let active = true
    Promise.all([fetchRanking(token, poolId), fetchPerformance(token, poolId)]).then(([ranking, performance]) => {
      if (active) setData({ ranking, performance })
    }).catch((error) => {
      if (active) handleLoadError(error)
    })
    return () => { active = false }
  }, [token, poolId])

  if (loadError) return <p className="form-message" role="alert">{loadError}</p>
  if (!data) return <p className="tab-loading" role="status"><LoaderCircle size={14} className="spin" /> Carregando ranking...</p>

  const { ranking, performance } = data
  const tied = (participant) => ranking.participants.filter(({ position }) => position === participant.position).length > 1

  return (
    <div className="tab-body">
      <p className="toolbar-note">Empate em pontos é decidido por: <strong>{tiebreakerLabels[ranking.tiebreaker] ?? ranking.tiebreaker}</strong>.</p>

      <div className="table-wrap">
        <table className="standings">
          <thead>
            <tr>
              <th scope="col" className="col-pos">#</th>
              <th scope="col">Participante</th>
              {ranking.rounds.map(({ number, closed }) => (
                <th key={number} scope="col" className="col-round" title={closed ? 'Rodada encerrada' : 'Rodada em andamento'}>
                  R{number}{closed ? '' : '*'}
                </th>
              ))}
              <th scope="col" className="col-num">{tiebreakColumnLabels[ranking.tiebreaker]}</th>
              <th scope="col" className="col-num col-total">Pts</th>
            </tr>
          </thead>
          <tbody>
            {ranking.participants.map((participant) => (
              <tr key={participant.id} className={participant.isRequester ? 'is-own' : undefined}>
                <td className="col-pos">{participant.position}{tied(participant) && <span className="tie-mark" title="Empatado">=</span>}</td>
                <td className="col-name">
                  <span>{participant.name}</span>
                  {participant.isRequester && <span className="you-tag">você</span>}
                  <MedalMark count={participant.medals} />
                </td>
                {participant.roundPoints.map(({ round, points }) => <td key={round} className="col-round">{points}</td>)}
                <td className="col-num">{participant.tiebreakValue}</td>
                <td className="col-num col-total">{participant.totalPoints}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ranking.rounds.some(({ closed }) => !closed) && <p className="fine-print">* rodada ainda em andamento.</p>}

      <h3 className="block-title">Seu desempenho por rodada</h3>
      <ul className="round-cards">
        {performance.rounds.map((round) => (
          <li key={round.number} className={round.closed ? 'round-card' : 'round-card round-card-open'}>
            <span className="round-card-label">Rodada {round.number}</span>
            <strong>{round.points}<small> pts</small></strong>
            <span>{round.hits} de {round.predictions} palpites certos</span>
            <span className="muted-text">{round.closed ? 'Encerrada' : `${round.finishedMatches} de ${round.totalMatches} partidas encerradas`}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
