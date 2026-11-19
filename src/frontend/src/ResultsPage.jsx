import { useEffect, useEffectEvent, useState } from 'react'
import { CalendarDays, LoaderCircle } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import { describeResult, fetchPoolResults, matchStatusLabels, syncNotice } from './results-api.js'

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

// Tela de resultados do bolão (SPEC-013): somente leitura, com o aviso da última sincronização.
export default function ResultsPage({ token, poolId, onSessionRejected, onBack }) {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')

  const handleLoadError = useEffectEvent((error) => {
    if (isSessionRejected(error)) onSessionRejected()
    else setLoadError(error.message)
  })

  // A página é remontada por bolão (key no PoolsPanel), então o estado já começa limpo.
  useEffect(() => {
    let active = true
    fetchPoolResults(token, poolId).then((result) => {
      if (active) setData(result)
    }).catch((error) => {
      if (active) handleLoadError(error)
    })
    return () => { active = false }
  }, [token, poolId])

  const notice = data ? syncNotice(data.sync) : null

  return (
    <>
      <p className="eyebrow">RESULTADOS</p>
      <h2 id="auth-title">{data?.pool.name ?? 'Resultados do bolão'}</h2>
      <p className="form-copy">Resultados oficiais, obtidos automaticamente da fonte esportiva.</p>

      {loadError && <p className="form-message" role="alert">{loadError}</p>}
      {!data && !loadError && <p className="form-copy" role="status"><LoaderCircle size={14} className="spin" /> Carregando...</p>}
      {notice && (
        <p className={notice.failed ? 'form-message' : 'catalog-updated'} role={notice.failed ? 'alert' : 'status'}>{notice.text}</p>
      )}

      {data && data.rounds.length === 0 && <p className="form-copy">Este bolão não tem partidas.</p>}
      {data && data.rounds.map((round) => (
        <section key={round.number} aria-label={`Rodada ${round.number}`}>
          <h3 className="section-title">RODADA {round.number}</h3>
          <div className="match-list">
            {round.matches.map((match) => (
              <article className="match-card" key={match.id}>
                <div className="match-teams">
                  <span>{match.home.name}</span>
                  <strong className="result-score">{describeResult(match)}</strong>
                  <span>{match.away.name}</span>
                </div>
                <div className="match-details">
                  <span><CalendarDays size={14} /> {match.startsAt ? dateFormatter.format(new Date(match.startsAt)) : 'Data a definir'}</span>
                  <span className={`match-status status-${match.status}`}>{matchStatusLabels[match.status] ?? match.status}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      <div className="mode-switch">
        <button type="button" onClick={onBack}>Voltar às regras do bolão</button>
      </div>
    </>
  )
}
