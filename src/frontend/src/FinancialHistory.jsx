import { useEffect, useEffectEvent, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { fetchFinancialHistory, isSessionRejected } from './account-api.js'
import {
  formatBrl,
  formatMovementDate,
  movementStatusLabel,
  movementTypeLabel,
  originBadge,
  testEnvironmentNotice,
} from './financial-view.js'

// SPEC-018 — histórico financeiro próprio (RF41), do mais recente para o mais antigo, sem filtros,
// com o aviso permanente de ambiente de teste e o selo de origem em cada movimentação.
export default function FinancialHistory({ token, pending = false, onBack, onLogout, onSessionRejected }) {
  const [movements, setMovements] = useState(null)
  const [loadError, setLoadError] = useState('')
  const rejectSession = useEffectEvent(() => onSessionRejected())

  useEffect(() => {
    let active = true
    fetchFinancialHistory(token).then(({ movements: loaded }) => {
      if (active) setMovements(loaded)
    }).catch((error) => {
      if (isSessionRejected(error)) rejectSession()
      else if (active) setLoadError(error.message)
    })
    return () => { active = false }
  }, [token])

  return (
    <section className="financial-history" aria-labelledby="financial-history-title">
      <p className="eyebrow">FINANCEIRO</p>
      <h2 id="financial-history-title">Histórico financeiro</h2>
      <p className="test-environment-warning" role="note">{testEnvironmentNotice}</p>

      {loadError && <p className="form-message" role="alert">{loadError}</p>}
      {!movements && !loadError && (
        <p className="form-copy" role="status"><LoaderCircle size={17} className="spin" /> Carregando histórico...</p>
      )}
      {movements?.length === 0 && <p className="form-copy">Você ainda não tem movimentações financeiras.</p>}

      {movements?.length > 0 && (
        <ul className="financial-list">
          {movements.map((movement) => (
            <li className="financial-movement" key={movement.id}>
              <div className="financial-movement-main">
                <strong>{movementTypeLabel(movement.type)}</strong>
                <time dateTime={movement.createdAt}>{formatMovementDate(movement.createdAt)}</time>
              </div>
              <div className="financial-movement-value">
                <strong>{formatBrl(movement.amountCents)}</strong>
                <span className={`financial-state financial-state--${movement.status}`}>
                  {movementStatusLabel(movement.status)}
                </span>
              </div>
              <span className={`financial-origin${movement.origin === 'simulator' ? ' financial-origin--simulated' : ''}`}>
                {originBadge(movement)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mode-switch">
        <button type="button" onClick={onBack}>Voltar ao início</button>
        <button type="button" onClick={onLogout} disabled={pending}>Sair da conta</button>
      </div>
    </section>
  )
}
