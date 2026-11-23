import { useEffect, useEffectEvent, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, LoaderCircle, Minus } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import { fetchPoolsSummary, paginate, pointsLabel, positionChange, positionLabel } from './home-summary.js'

const changeIcons = { up: ArrowUp, down: ArrowDown, same: Minus }

// Seta de variação da colocação: verde se subiu, vermelha se caiu, traço se manteve.
function PositionChange({ position, previousPosition }) {
  const change = positionChange(position, previousPosition)
  if (change.direction === 'none') return <span className="position-change position-change-none" title={change.label}>—<span className="sr-only">{change.label}</span></span>
  const Icon = changeIcons[change.direction]
  return (
    <span className={`position-change position-change-${change.direction}`} title={change.label}>
      <Icon size={18} strokeWidth={2.4} aria-hidden="true" />
      {change.places > 0 && <span aria-hidden="true">{change.places}</span>}
      <span className="sr-only">{change.label}</span>
    </span>
  )
}

function PoolCell({ pool, onOpenPool }) {
  return (
    <th scope="row">
      <button className="home-pool-link" type="button" onClick={() => onOpenPool(pool.poolId)}>{pool.name}</button>
    </th>
  )
}

const views = [
  ['points', 'Pontos'],
  ['position', 'Colocação'],
]

// Página inicial (cartão da direita, ao lado do slogan): saudação e o desempenho do usuário em cada
// bolão, 5 por página, alternando entre pontos e colocação. Clicar num bolão abre o bolão.
export default function HomeArea({ token, user, onOpenPool, onBrowsePools, onSessionRejected }) {
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
        <p className="eyebrow">INÍCIO</p>
        <h2 id="auth-title">Olá, {user?.name}.</h2>
        <p className="toolbar-note">Veja o que há de novo em cada bolão!</p>
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
        {!pools && !loadError && <p className="tab-loading" role="status"><LoaderCircle size={18} className="spin" /> Carregando seus bolões...</p>}

        {pools?.length === 0 && (
          <div className="empty-state">
            <p>Você ainda não participa de nenhum bolão confirmado.</p>
            <button className="small-button small-button-solid" type="button" onClick={onBrowsePools}>Ver bolões</button>
          </div>
        )}

        {current && current.total > 0 && (
          <>
            <div className="table-wrap">
              {view === 'points' ? (
                <table className="standings home-table">
                  <thead>
                    <tr>
                      <th scope="col">Bolão</th>
                      <th scope="col" className="col-num">Pontos ganhos</th>
                      <th scope="col" className="col-num">Pontuação total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.items.map((pool) => (
                      <tr key={pool.poolId}>
                        <PoolCell pool={pool} onOpenPool={onOpenPool} />
                        <td className="col-num"><strong>{pointsLabel(pool.roundPoints)}</strong></td>
                        <td className="col-num"><strong>{pointsLabel(pool.totalPoints)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="standings home-table">
                  <thead>
                    <tr>
                      <th scope="col">Bolão</th>
                      <th scope="col" className="col-num">Colocação</th>
                      <th scope="col" className="col-num">Variação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.items.map((pool) => (
                      <tr key={pool.poolId}>
                        <PoolCell pool={pool} onOpenPool={onOpenPool} />
                        <td className="col-num"><strong>{positionLabel(pool.position, pool.participants)}</strong></td>
                        <td className="col-num"><PositionChange position={pool.position} previousPosition={pool.previousPosition} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <p className="fine-print">
              {view === 'points'
                ? 'Pontos ganhos: os da rodada mais recente com partida encerrada em cada bolão.'
                : 'A seta compara sua colocação com a de antes da rodada mais recente.'}
            </p>

            {current.totalPages > 1 && (
              <nav className="pager" aria-label="Páginas dos seus bolões">
                <button className="small-button" type="button" disabled={!current.hasPrevious} onClick={() => setPage(current.page - 1)}>
                  <ChevronLeft size={18} aria-hidden="true" /> Anterior
                </button>
                <span aria-live="polite">{current.from}–{current.to} de {current.total}</span>
                <button className="small-button" type="button" disabled={!current.hasNext} onClick={() => setPage(current.page + 1)}>
                  Próxima <ChevronRight size={18} aria-hidden="true" />
                </button>
              </nav>
            )}
          </>
        )}
      </section>
    </div>
  )
}
