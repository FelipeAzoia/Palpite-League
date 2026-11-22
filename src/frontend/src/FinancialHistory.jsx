import { useEffect, useEffectEvent, useState } from 'react'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { fetchFinancialHistory, isSessionRejected } from './account-api.js'

const labels = {
  entry_fee: 'Taxa de entrada',
  subscription: 'Assinatura',
  refund: 'Devolução',
  payout: 'Premiação',
}

const states = {
  pending: 'Pendente',
  confirmed: 'Confirmada',
  refused: 'Recusada',
}

export default function FinancialHistory({ token, onBack, onLogout, onSessionRejected, pending = false }) {
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
      <p className="eyebrow">AMBIENTE DE TESTE</p>
      <h2 id="financial-history-title">Histórico financeiro</h2>
      <p className="test-environment-warning" role="status">
        Operações de teste sem movimentação de dinheiro real. Movimentações simuladas nunca são comprovantes de pagamento.
      </p>

      {loadError && <p className="form-message" role="alert">{loadError}</p>}
      {!movements && !loadError && <p className="form-copy" role="status"><LoaderCircle size={17} className="spin" /> Carregando histórico...</p>}
      {movements?.length === 0 && <p className="form-copy">Você ainda não possui movimentações financeiras.</p>}

      {movements?.length > 0 && (
        <div className="financial-list">
          {movements.map((movement) => (
            <article className="financial-movement" key={movement.id}>
              <div>
                <strong>{labels[movement.type] ?? movement.type}</strong>
                <span>{new Date(movement.createdAt).toLocaleString('pt-BR')}</span>
              </div>
              <div className="financial-movement-value">
                <strong>R$ {movement.amount}</strong>
                <span className={`financial-state financial-state--${movement.status}`}>
                  {movement.origin === 'simulator' ? 'Simulada · ' : 'Teste · '}
                  {states[movement.status] ?? movement.status}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="mode-switch">
        <button type="button" onClick={onBack}>Voltar ao início</button>
        <button type="button" onClick={onLogout} disabled={pending}>
          <span>{pending ? 'Saindo...' : 'Sair da conta'}</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </section>
  )
}
