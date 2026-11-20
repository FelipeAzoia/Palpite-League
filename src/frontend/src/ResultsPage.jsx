import { useEffect, useEffectEvent, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import { formatKickoff, initialRound } from './match-format.js'
import { fetchPoolResults, matchStatusLabels, syncNotice } from './results-api.js'
import RoundPicker from './RoundPicker.jsx'

const statusTone = { finished: 'done', in_progress: 'live', postponed: 'muted', cancelled: 'muted', scheduled: 'muted' }

// Aba de resultados oficiais (SPEC-013): somente leitura, com a situação da última sincronização.
export default function ResultsPage({ token, poolId, onSessionRejected }) {
  const [data, setData] = useState(null)
  const [round, setRound] = useState(null)
  const [loadError, setLoadError] = useState('')

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

  if (loadError) return <p className="form-message" role="alert">{loadError}</p>
  if (!data) return <p className="tab-loading" role="status"><LoaderCircle size={14} className="spin" /> Carregando resultados...</p>
  if (data.rounds.length === 0) return <p className="empty-state">Este bolão não tem partidas.</p>

  const notice = syncNotice(data.sync)
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
          return (
            <li key={match.id} className="mrow">
              <span className="mrow-when"><b>{time}</b>{day}</span>
              <span className="mrow-home">{match.home.name}</span>
              <span className="mrow-center">
                {match.score
                  ? <span className="score-box">{match.score.home}<i>–</i>{match.score.away}</span>
                  : <span className="mrow-vs">×</span>}
              </span>
              <span className="mrow-away">{match.away.name}</span>
              <span className="mrow-side">
                <span className={`state state-${statusTone[match.status] ?? 'muted'}`}>{matchStatusLabels[match.status] ?? match.status}</span>
              </span>
            </li>
          )
        })}
      </ol>
      <p className="fine-print">Os placares vêm automaticamente da fonte esportiva e não podem ser editados por ninguém.</p>
    </div>
  )
}
