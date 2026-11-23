import { useEffect, useEffectEvent, useState } from 'react'
import { ArrowLeft, LoaderCircle } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import { fetchHistory, historyStatusLabels, matchPointsLabel, summaryHeadline } from './history-api.js'
import { formatKickoff } from './match-format.js'
import { PredictionMark } from './PredictionsPage.jsx'

const pageSize = 10

// SPEC-028 — histórico do bolão por rodada: partidas, resultado oficial, o próprio palpite e pontos;
// por rodada, pontos, acumulado e posição. Somente leitura.
export default function HistoryPage({ token, poolId, onSessionRejected, onBack }) {
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const handleError = useEffectEvent((caught) => {
    if (isSessionRejected(caught)) onSessionRejected()
    else setError(caught.message)
  })

  useEffect(() => {
    let active = true
    fetchHistory(token, poolId, { page, pageSize }).then((loaded) => {
      if (active) setData(loaded)
    }).catch((caught) => {
      if (active) handleError(caught)
    })
    return () => { active = false }
  }, [token, poolId, page])

  if (error) return <p className="form-message" role="alert">{error}</p>
  if (!data) return <p className="tab-loading" role="status"><LoaderCircle size={14} className="spin" /> Carregando histórico...</p>

  const pages = Math.max(1, Math.ceil(data.totalRounds / data.pageSize))

  return (
    <div className="tab-body history">
      {onBack && (
        <>
          <button type="button" className="back-link" onClick={onBack}><ArrowLeft size={14} aria-hidden="true" /> Meus bolões</button>
          <h2 id="auth-title" className="history-title">{data.pool.name}</h2>
        </>
      )}
      <dl className="history-summary">
        <div><dt>Situação</dt><dd>{summaryHeadline(data.summary)}</dd></div>
        <div><dt>Pontos</dt><dd>{data.summary.totalPoints}</dd></div>
      </dl>
      {data.participation.status === 'left' && (
        <p className="fine-print fine-print-top">Você saiu deste bolão. Aqui aparece só o período em que participou, em somente leitura.</p>
      )}
      {data.rounds.length === 0 && <p className="empty-state">Ainda não há partidas no seu período de participação.</p>}
      {data.rounds.map((round) => (
        <section key={round.number} className="history-round" aria-labelledby={`history-round-${round.number}`}>
          <header className="history-round-head">
            <h3 id={`history-round-${round.number}`} className="block-title">Rodada {round.number}</h3>
            <p className="history-round-figures">
              <span><b>{round.points}</b> pts na rodada</span>
              <span><b>{round.cumulativePoints}</b> acumulados</span>
              <span><b>{round.position}º</b> de {round.participants}{round.closed ? '' : ' até agora'}</span>
            </p>
          </header>
          <ol className="match-rows match-rows-points">
            {round.matches.map((match) => {
              const { day, time } = formatKickoff(match.startsAt)
              return (
                <li key={match.id} className="mrow">
                  <span className="mrow-when"><b>{time}</b>{day}</span>
                  <span className="mrow-home">{match.home.name}</span>
                  <span className="mrow-center">
                    {match.result
                      ? <span className="score-box">{match.result.home}<i>–</i>{match.result.away}</span>
                      : <span className="state">{historyStatusLabels[match.status] ?? match.status}</span>}
                  </span>
                  <span className="mrow-away">{match.away.name}</span>
                  <span className="mrow-pick">{match.prediction ? <PredictionMark prediction={match.prediction} /> : <span className="muted-text">sem palpite</span>}</span>
                  <span className="mrow-side"><strong>{matchPointsLabel(match)}</strong></span>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
      {pages > 1 && (
        <div className="invite-actions">
          <button type="button" className="small-button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Rodadas anteriores</button>
          <span className="muted-text">Página {page} de {pages}</span>
          <button type="button" className="small-button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Próximas rodadas</button>
        </div>
      )}
      <p className="fine-print">Só resultados oficiais e o seu próprio palpite aparecem aqui. Placares ao vivo nunca entram no histórico.</p>
    </div>
  )
}
