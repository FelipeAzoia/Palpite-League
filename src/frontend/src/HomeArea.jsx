import { useEffect, useEffectEvent, useState } from 'react'
import { ChevronLeft, ChevronRight, LoaderCircle, LogOut } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import { fetchPoolsSummary, paginate, pointsLabel, poolStatusLabel, positionLabel } from './home-summary.js'

const views = [
  ['points', 'Pontos'],
  ['position', 'Colocação'],
]

// Página inicial: saudação e o desempenho do usuário em cada bolão, 5 por página, alternando entre
// pontos e colocação. Clicar num bolão abre o bolão.
export default function HomeArea({ token, user, pending, onLogout, onOpenPool, onBrowsePools, onSessionRejected }) {
  const [pools, setPools] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [view, setView] = useState('points')
  const [page, setPage] = useState(1)
  const rejectSession = useEffectEvent(() => onSessionRejected())

  useEffect(() => {
    let active = true
    fetchPoolsSummary(token).then(({ pools: loaded }) => {
      if (active) setPools(loaded)
    }).catch((error) => {
      if (isSessionRejected(error)) rejectSession()
      else if (active) setLoadError(error.message)
    })
    return () => { active = false }
  }, [token])

  const current = pools ? paginate(pools, page) : null

  return (
    <div className="home-page">
      <div className="home-head">
        <div>
          <p className="eyebrow">INÍCIO</p>
          <h2 id="auth-title">Olá, {user?.name}.</h2>
          <p className="toolbar-note">Veja como você está em cada bolão.</p>
        </div>
        <button className="small-button" type="button" onClick={onLogout} disabled={pending}>
          <LogOut size={14} aria-hidden="true" /> {pending ? 'Saindo...' : 'Sair da conta'}
        </button>
      </div>

      <section className="home-summary" aria-labelledby="home-summary-title">
        <div className="block-head">
          <h3 id="home-summary-title" className="block-title">Meus bolões</h3>
          <div className="segmented" role="radiogroup" aria-label="O que mostrar">
            {views.map(([value, label]) => (
              <label key={value} className="segment">
                <input type="radio" name="home-summary-view" value={value} checked={view === value} onChange={() => setView(value)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {loadError && <p className="form-message" role="alert">{loadError}</p>}
        {!pools && !loadError && <p className="tab-loading" role="status"><LoaderCircle size={14} className="spin" /> Carregando seus bolões...</p>}

        {pools?.length === 0 && (
          <div className="empty-state">
            <p>Você ainda não participa de nenhum bolão confirmado.</p>
            <button className="small-button small-button-solid" type="button" onClick={onBrowsePools}>Ver bolões</button>
          </div>
        )}

        {current && current.total > 0 && (
          <>
            <div className="table-wrap">
              <table className="standings home-table">
                <thead>
                  <tr>
                    <th scope="col">Bolão</th>
                    <th scope="col" className="col-num">{view === 'points' ? 'Pontos' : 'Colocação'}</th>
                  </tr>
                </thead>
                <tbody>
                  {current.items.map((pool) => (
                    <tr key={pool.poolId}>
                      <th scope="row">
                        <button className="home-pool-link" type="button" onClick={() => onOpenPool(pool.poolId)}>
                          {pool.name}
                        </button>
                        <span className={`state ${pool.status === 'active' ? 'state-open' : ''}`}>{poolStatusLabel(pool.status)}</span>
                      </th>
                      <td className="col-num">
                        <strong>{view === 'points' ? pointsLabel(pool.totalPoints) : positionLabel(pool.position, pool.participants)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {current.totalPages > 1 && (
              <nav className="pager" aria-label="Páginas dos seus bolões">
                <button className="small-button" type="button" disabled={!current.hasPrevious} onClick={() => setPage(current.page - 1)}>
                  <ChevronLeft size={14} aria-hidden="true" /> Anterior
                </button>
                <span aria-live="polite">{current.from}–{current.to} de {current.total}</span>
                <button className="small-button" type="button" disabled={!current.hasNext} onClick={() => setPage(current.page + 1)}>
                  Próxima <ChevronRight size={14} aria-hidden="true" />
                </button>
              </nav>
            )}
          </>
        )}
      </section>
    </div>
  )
}
