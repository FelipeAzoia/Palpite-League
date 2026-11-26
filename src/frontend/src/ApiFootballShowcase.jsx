import { useEffect, useEffectEvent, useState } from 'react'
import { CalendarDays, LoaderCircle, RefreshCw } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import { fetchApiFootball2024 } from './match-catalog-api.js'
import { showcaseScore } from './pool-selection.js'
import { TeamCrest } from './TeamCrest.jsx'

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })
const Crest = ({ team }) => <TeamCrest team={team} size={22} />
// SPEC-031 — dados reais do Brasileirão 2024 obtidos da API-Football, só para consulta. Não há
// criação de bolão aqui: todos esses jogos já aconteceram.
export default function ApiFootballShowcase({ token, onSessionRejected }) {
  const [data, setData] = useState(null)
  const [round, setRound] = useState(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  function apply(result) {
    setData(result)
    setRound((current) => (result.rounds.some(({ number }) => number === current) ? current : result.rounds[0]?.number ?? 1))
    setLoading(false)
  }

  function fail(caught) {
    setLoading(false)
    if (isSessionRejected(caught)) onSessionRejected()
    else setError(caught.message)
  }

  const applyLoaded = useEffectEvent(apply)
  const failLoading = useEffectEvent(fail)

  // `loading` já começa verdadeiro, então basta buscar ao montar ou trocar de sessão.
  useEffect(() => {
    let active = true
    fetchApiFootball2024(token).then((result) => {
      if (active) applyLoaded(result)
    }).catch((caught) => {
      if (active) failLoading(caught)
    })
    return () => { active = false }
  }, [token])

  function load() {
    setLoading(true)
    setError('')
    fetchApiFootball2024(token).then(apply).catch(fail)
  }

  const current = data?.rounds.find(({ number }) => number === round)

  return (
    <section className="showcase" aria-labelledby="showcase-title">
      <p className="catalog-notice" role="note">
        Dados reais da temporada 2024 do Brasileirão Série A, obtidos da API-Football (API-Sports). A temporada atual exige o
        plano pago, por isso os bolões usam o campeonato simulado. Esta tela é só para consulta.
      </p>
      <h3 id="showcase-title" className="block-title">Brasileirão 2024 · API-Football</h3>

      {loading && <p className="form-copy" role="status"><LoaderCircle size={14} className="spin" /> Consultando a API-Football...</p>}
      {error && (
        <div className="catalog-error" role="alert">
          <p className="form-message">{error}</p>
          <button type="button" className="catalog-retry" onClick={load}><RefreshCw size={15} /> Tentar novamente</button>
        </div>
      )}

      {data && (
        <>
          <div className="catalog-filters">
            <label className="field">
              <span>Rodada</span>
              <select value={round} onChange={(event) => setRound(Number(event.target.value))}>
                {data.rounds.map(({ number, matches }) => (
                  <option key={number} value={number}>Rodada {number} · {matches.length} jogos</option>
                ))}
              </select>
            </label>
          </div>
          <p className="catalog-updated">
            Obtido da API em {dateFormatter.format(new Date(data.fetchedAt))}
            {data.stale && ' · a API não respondeu agora, exibindo a última consulta'}
          </p>
          <div className="match-list">
            {current?.matches.map((match) => (
              <article className="match-card showcase-card" key={match.id}>
                <div className="showcase-teams">
                  <span className="showcase-team"><Crest team={match.home} />{match.home.name}</span>
                  <strong className="showcase-score">{showcaseScore(match)}</strong>
                  <span className="showcase-team showcase-team-away">{match.away.name}<Crest team={match.away} /></span>
                </div>
                <div className="match-details">
                  <span><CalendarDays size={14} /> {match.startsAt ? dateFormatter.format(new Date(match.startsAt)) : 'Data a definir'}</span>
                  <span className={`match-status status-${match.status ?? 'unknown'}`}>{match.status === 'finished' ? 'Encerrada' : match.status ?? '—'}</span>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
