import { useEffect, useEffectEvent, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import { blockedMessages } from './predictions-api.js'
import { fetchMyPoints, pointsLabel, predictionSummary } from './points-api.js'

// Tela de pontos do participante (SPEC-014): palpite, placar oficial e pontos de cada partida encerrada.
export default function PointsPage({ token, poolId, onSessionRejected, onBack }) {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')

  const handleLoadError = useEffectEvent((error) => {
    if (isSessionRejected(error)) onSessionRejected()
    else setLoadError(blockedMessages[error.type] ?? error.message)
  })

  // A página é remontada por bolão (key no PoolsPanel), então o estado já começa limpo.
  useEffect(() => {
    let active = true
    fetchMyPoints(token, poolId).then((result) => {
      if (active) setData(result)
    }).catch((error) => {
      if (active) handleLoadError(error)
    })
    return () => { active = false }
  }, [token, poolId])

  return (
    <>
      <p className="eyebrow">MEUS PONTOS</p>
      <h2 id="auth-title">{data?.pool.name ?? 'Meus pontos'}</h2>
      <p className="form-copy">Resultado certo vale 2 pontos; placar exato vale 5. Os pontos são calculados automaticamente.</p>

      {loadError && <p className="form-message" role="alert">{loadError}</p>}
      {!data && !loadError && <p className="form-copy" role="status"><LoaderCircle size={14} className="spin" /> Carregando...</p>}

      {data && (
        <section className="plan-card" aria-label="Pontuação acumulada">
          <div className="plan-card-head">
            <h3>Total no bolão</h3>
            <span className="plan-tag points-total">{pointsLabel(data.totalPoints)}</span>
          </div>
        </section>
      )}

      {data && data.matches.length === 0 && <p className="form-copy">Ainda não há partidas encerradas neste bolão.</p>}
      {data && data.matches.length > 0 && (
        <>
          <h3 className="section-title">PARTIDAS ENCERRADAS</h3>
          <div className="match-list">
            {data.matches.map((match) => (
              <article className="match-card" key={match.id}>
                <div className="match-teams">
                  <span>{match.home.name}</span>
                  <strong className="result-score">{match.officialScore.home} × {match.officialScore.away}</strong>
                  <span>{match.away.name}</span>
                </div>
                <p className="prediction-own">{predictionSummary(match)}</p>
                <div className="match-details">
                  <span>Rodada {match.roundNumber}</span>
                  <span className={`plan-tag ${match.points > 0 ? '' : 'points-zero'}`}>{pointsLabel(match.points)}</span>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <div className="mode-switch">
        <button type="button" onClick={onBack}>Voltar às regras do bolão</button>
      </div>
    </>
  )
}
