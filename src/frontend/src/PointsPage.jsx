import { useEffect, useEffectEvent, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import { formatKickoff } from './match-format.js'
import { blockedMessages } from './predictions-api.js'
import { fetchMyPoints } from './points-api.js'
import { PredictionMark } from './PredictionsPage.jsx'

function pointsBadge({ points, prediction }) {
  if (!prediction) return <span className="muted-text">—</span>
  if (points === null || points === undefined) return <span className="points-badge points-badge-pending" title="Aguardando pontuação">…</span>
  return <span className={`points-badge points-badge-${points}`}>+{points}</span>
}

// Aba "Pontos" (SPEC-014): resumo e, por partida encerrada, palpite, placar oficial e pontos.
export default function PointsPage({ token, poolId, onSessionRejected }) {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')

  const handleLoadError = useEffectEvent((error) => {
    if (isSessionRejected(error)) onSessionRejected()
    else setLoadError(blockedMessages[error.type] ?? error.message)
  })

  useEffect(() => {
    let active = true
    fetchMyPoints(token, poolId).then((result) => {
      if (active) setData(result)
    }).catch((error) => {
      if (active) handleLoadError(error)
    })
    return () => { active = false }
  }, [token, poolId])

  if (loadError) return <p className="form-message" role="alert">{loadError}</p>
  if (!data) return <p className="tab-loading" role="status"><LoaderCircle size={14} className="spin" /> Carregando pontos...</p>

  const predicted = data.matches.filter(({ prediction }) => prediction)
  const exact = data.matches.filter(({ points }) => points === 5).length
  const correct = data.matches.filter(({ points }) => points === 2).length
  const matches = [...data.matches].sort((first, second) => Date.parse(second.startsAt) - Date.parse(first.startsAt))

  return (
    <div className="tab-body">
      <dl className="stat-tiles">
        <div><dt>Total no bolão</dt><dd>{data.totalPoints}<small>pts</small></dd></div>
        <div><dt>Placares exatos</dt><dd>{exact}<small>× 5</small></dd></div>
        <div><dt>Resultados certos</dt><dd>{correct}<small>× 2</small></dd></div>
        <div><dt>Aproveitamento</dt><dd>{predicted.length ? Math.round(((exact + correct) / predicted.length) * 100) : 0}<small>%</small></dd></div>
      </dl>

      {matches.length === 0 ? (
        <p className="empty-state">Ainda não há partidas encerradas neste bolão.</p>
      ) : (
        <ol className="match-rows match-rows-points" aria-label="Pontos por partida encerrada">
          <li className="mrow mrow-head" aria-hidden="true">
            <span className="mrow-when">Partida</span>
            <span className="mrow-home" />
            <span className="mrow-center">Placar</span>
            <span className="mrow-away" />
            <span className="mrow-pick">Seu palpite</span>
            <span className="mrow-side">Pontos</span>
          </li>
          {matches.map((match) => {
            const { day, time } = formatKickoff(match.startsAt)
            return (
              <li key={match.id} className="mrow">
                <span className="mrow-when"><b>{day}</b>{time} · R{match.roundNumber}</span>
                <span className="mrow-home">{match.home.name}</span>
                <span className="mrow-center"><span className="score-box">{match.officialScore.home}<i>–</i>{match.officialScore.away}</span></span>
                <span className="mrow-away">{match.away.name}</span>
                <span className="mrow-pick">{match.prediction ? <PredictionMark prediction={match.prediction} /> : <span className="muted-text">sem palpite</span>}</span>
                <span className="mrow-side">{pointsBadge(match)}</span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
