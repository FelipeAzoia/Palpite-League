import { useEffect, useEffectEvent, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import { formatKickoff, initialRound } from './match-format.js'
import {
  fetchPoolLive,
  fetchPoolResults,
  liveNotice,
  liveRefreshIntervalMs,
  liveStateFor,
  matchStatusLabels,
  syncNotice,
} from './results-api.js'
import RoundPicker from './RoundPicker.jsx'

const statusTone = { finished: 'done', in_progress: 'live', postponed: 'muted', cancelled: 'muted', scheduled: 'muted' }

// Aba de resultados oficiais (SPEC-013): somente leitura, com a situação da última sincronização.
// Em bolões com o recurso ao vivo (SPEC-021), as partidas em andamento mostram o placar parcial,
// sempre rotulado como não oficial, e a tela se atualiza sozinha.
export default function ResultsPage({ token, poolId, onSessionRejected }) {
  const [data, setData] = useState(null)
  const [round, setRound] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [live, setLive] = useState(null)

  const handleLoadError = useEffectEvent((error) => {
    if (isSessionRejected(error)) onSessionRejected()
    else setLoadError(error.message)
  })

  useEffect(() => {
    let active = true
    fetchPoolResults(token, poolId).then((result) => {
      if (!active) return
      setData(result)
      // Começa pela última rodada com partida encerrada ou em andamento.
      const played = [...result.rounds].reverse().find(({ matches }) => matches.some(({ status }) => status === 'finished' || status === 'in_progress'))
      setRound(played?.number ?? initialRound(result.rounds, () => false, () => false))
    }).catch((error) => {
      if (active) handleLoadError(error)
    })
    return () => { active = false }
  }, [token, poolId])

  const handleLiveError = useEffectEvent((error) => {
    if (isSessionRejected(error)) onSessionRejected()
    else setLive((current) => current ?? { available: false, matches: [] })
  })

  // Dados ao vivo: qualquer negativa (por exemplo, participação ainda não confirmada) só esconde o
  // recurso, sem atrapalhar os resultados oficiais.
  const refreshLive = useEffectEvent(async () => {
    try {
      const [nextLive, nextResults] = await Promise.all([
        fetchPoolLive(token, poolId),
        live?.available ? fetchPoolResults(token, poolId) : Promise.resolve(null),
      ])
      setLive(nextLive)
      if (nextResults) setData(nextResults)
    } catch (error) {
      handleLiveError(error)
    }
  })

  // Carga inicial dos dados ao vivo; as atualizações seguintes vêm do intervalo abaixo.
  useEffect(() => {
    let active = true
    fetchPoolLive(token, poolId).then((result) => {
      if (active) setLive(result)
    }).catch((error) => {
      if (active) handleLiveError(error)
    })
    return () => { active = false }
  }, [token, poolId])

  useEffect(() => {
    if (!live?.available) return undefined
    const timer = setInterval(() => refreshLive(), liveRefreshIntervalMs)
    return () => clearInterval(timer)
  }, [live?.available])

  if (loadError) return <p className="form-message" role="alert">{loadError}</p>
  if (!data) return <p className="tab-loading" role="status"><LoaderCircle size={14} className="spin" /> Carregando resultados...</p>
  if (data.rounds.length === 0) return <p className="empty-state">Este bolão não tem partidas.</p>

  const notice = syncNotice(data.sync)
  const unavailableNotice = liveNotice(live, data.rounds)
  const current = data.rounds.find(({ number }) => number === round) ?? data.rounds[0]
  const pickerRounds = data.rounds.map(({ number, matches }) => {
    const finished = matches.filter(({ status }) => status === 'finished').length
    return { number, tone: finished === matches.length ? 'done' : undefined, hint: `${finished} de ${matches.length} encerradas` }
  })

  return (
    <div className="tab-body">
      <div className="tab-toolbar">
        <RoundPicker rounds={pickerRounds} value={current.number} onChange={setRound} />
        <p className={notice.failed ? 'toolbar-note toolbar-note-alert' : 'toolbar-note'} role={notice.failed ? 'alert' : undefined}>{notice.text}</p>
      </div>

      <ol className="match-rows" aria-label={`Resultados da rodada ${current.number}`}>
        {current.matches.map((match) => {
          const { day, time } = formatKickoff(match.startsAt)
          const liveState = liveStateFor(match, live)
          const shownStatus = liveState?.status ?? match.status
          return (
            <li key={match.id} className={liveState ? 'mrow mrow-live' : 'mrow'}>
              <span className="mrow-when"><b>{time}</b>{day}</span>
              <span className="mrow-home">{match.home.name}</span>
              <span className="mrow-center">
                {match.score && <span className="score-box">{match.score.home}<i>–</i>{match.score.away}</span>}
                {!match.score && liveState?.score && (
                  <span className="score-box score-box-live" aria-label={`Placar parcial, não oficial: ${liveState.score.home} a ${liveState.score.away}`}>
                    {liveState.score.home}<i>–</i>{liveState.score.away}
                  </span>
                )}
                {!match.score && !liveState?.score && <span className="mrow-vs">×</span>}
              </span>
              <span className="mrow-away">{match.away.name}</span>
              <span className="mrow-side">
                <span className={`state state-${statusTone[shownStatus] ?? 'muted'}`}>
                  {liveState && shownStatus === 'in_progress' ? 'Ao vivo' : matchStatusLabels[shownStatus] ?? shownStatus}
                </span>
                {liveState && <span className="live-caption">{liveState.caption.map((line) => <span key={line}>{line}</span>)}</span>}
              </span>
            </li>
          )
        })}
      </ol>
      {unavailableNotice && <p className="toolbar-note">{unavailableNotice}</p>}
      <p className="fine-print">
        Os placares vêm automaticamente da fonte esportiva e não podem ser editados por ninguém.
        {live?.available && ' Placares ao vivo são parciais e não contam pontos; só o resultado oficial vale para o ranking.'}
      </p>
    </div>
  )
}
