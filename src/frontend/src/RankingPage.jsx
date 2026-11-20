import { useEffect, useEffectEvent, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import { tiebreakerLabels } from './pools-form.js'
import { blockedMessages } from './predictions-api.js'
import { fetchPerformance, fetchRanking, positionLabel, roundSummary, tiebreakColumnLabels } from './ranking-api.js'

// Tela de ranking do bolão (SPEC-015): classificação, detalhe por rodada e desempenho próprio.
export default function RankingPage({ token, poolId, onSessionRejected, onBack }) {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const handleLoadError = useEffectEvent((error) => {
    if (isSessionRejected(error)) onSessionRejected()
    else setLoadError(blockedMessages[error.type] ?? error.message)
  })

  // A página é remontada por bolão (key no PoolsPanel), então o estado já começa limpo.
  useEffect(() => {
    let active = true
    Promise.all([fetchRanking(token, poolId), fetchPerformance(token, poolId)]).then(([ranking, performance]) => {
      if (active) setData({ ranking, performance })
    }).catch((error) => {
      if (active) handleLoadError(error)
    })
    return () => { active = false }
  }, [token, poolId])

  const ranking = data?.ranking
  const closedRounds = new Map(ranking?.rounds.map(({ number, closed }) => [number, closed]) ?? [])

  return (
    <>
      <p className="eyebrow">RANKING</p>
      <h2 id="auth-title">{ranking?.pool.name ?? 'Ranking do bolão'}</h2>
      {ranking && (
        <p className="form-copy">Desempate: {tiebreakerLabels[ranking.tiebreaker] ?? ranking.tiebreaker}.</p>
      )}

      {loadError && <p className="form-message" role="alert">{loadError}</p>}
      {!data && !loadError && <p className="form-copy" role="status"><LoaderCircle size={14} className="spin" /> Carregando...</p>}

      {ranking && (
        <ol className="ranking-list" aria-label="Classificação">
          {ranking.participants.map((participant) => {
            const expanded = expandedId === participant.id
            return (
              <li key={participant.id} className={participant.isRequester ? 'ranking-row ranking-row-own' : 'ranking-row'}>
                <button
                  type="button"
                  className="ranking-head"
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : participant.id)}
                >
                  <span className="ranking-position">{positionLabel(participant, ranking.participants)}</span>
                  <span className="ranking-name">{participant.name}{participant.isRequester ? ' (você)' : ''}</span>
                  <span className="ranking-points"><strong>{participant.totalPoints}</strong> pts</span>
                  <span className="ranking-tiebreak">{tiebreakColumnLabels[ranking.tiebreaker]}: {participant.tiebreakValue}</span>
                </button>
                {expanded && (
                  <ul className="ranking-rounds">
                    {participant.roundPoints.map(({ round, points }) => (
                      <li key={round}>
                        <span>Rodada {round}{closedRounds.get(round) ? '' : ' (em andamento)'}</span>
                        <strong>{points} pts</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {data && (
        <>
          <h3 className="section-title">MEU DESEMPENHO POR RODADA</h3>
          {data.performance.rounds.length === 0 && <p className="form-copy">Este bolão não tem rodadas.</p>}
          <ul className="feature-list">
            {data.performance.rounds.map((round) => (
              <li key={round.number}><span>Rodada {round.number}</span><strong>{roundSummary(round)}</strong></li>
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
