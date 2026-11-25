import { useEffect, useEffectEvent, useState } from 'react'
import { isSessionRejected } from './account-api.js'
import { formatBrl } from './financial-view.js'
import { awardeeLabel, fetchPrize, prizeSituation, prizeStateLabels, requestPrize, shareLabel } from './prize-api.js'

// SPEC-026 e SPEC-030 — premiação do bolão encerrado: cada premiado vê a própria parte e solicita; a
// administração vê só a colocação e o estado por premiado. Não há aprovação administrativa.
export default function PrizeSection({ token, poolId, onSessionRejected }) {
  const [view, setView] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const handleError = useEffectEvent((caught) => {
    if (isSessionRejected(caught)) onSessionRejected()
    else setError(caught.message)
  })

  useEffect(() => {
    let active = true
    fetchPrize(token, poolId).then((loaded) => {
      if (active) setView(loaded)
    }).catch((caught) => {
      if (active) handleError(caught)
    })
    return () => { active = false }
  }, [token, poolId])

  async function ask() {
    setBusy(true)
    setError('')
    try {
      setView(await requestPrize(token, poolId))
    } catch (caught) {
      if (isSessionRejected(caught)) onSessionRejected()
      else setError(caught.message)
      fetchPrize(token, poolId).then(setView).catch(() => {})
    } finally {
      setBusy(false)
    }
  }

  if (!view) return error ? <p className="form-message" role="alert">{error}</p> : null
  const isWinner = view.shareCents !== null

  return (
    <section aria-labelledby="prize-title" className="prize-block">
      <div className="block-head">
        <h3 id="prize-title" className="block-title">Premiação</h3>
        {view.simulated && <span className="simulation-badge">SIMULAÇÃO</span>}
      </div>
      {isWinner ? (
        <div className="prize-card">
          <p className="prize-amount">{formatBrl(view.shareCents)}</p>
          {shareLabel(view) && <p className="prize-state">{shareLabel(view)}</p>}
          <p className="prize-state">{prizeSituation(view)}</p>
          {view.canRequest && (
            <button type="button" className="small-button small-button-solid" disabled={busy} onClick={ask}>
              {busy ? 'Solicitando...' : view.state === 'refused' ? 'Solicitar de novo' : 'Solicitar premiação'}
            </button>
          )}
        </div>
      ) : (
        <p className="empty-state">{prizeStateLabels[view.state] ?? view.state}.</p>
      )}
      {error && <p className="form-message" role="alert">{error}</p>}
      {view.awardees && (
        <ul className="plain-rows">
          {view.awardees.map((awardee) => (
            <li key={`${awardee.place}-${awardee.name}`}>
              <span className="plain-rows-main">{awardeeLabel(view, awardee)}<small>{prizeStateLabels[awardee.state] ?? awardee.state}</small></span>
            </li>
          ))}
        </ul>
      )}
      <p className="fine-print">
        Ambiente de teste, sem dinheiro real.
        {!view.integration.attended && ' O repasse real da premiação ainda não foi validado com o provedor: os pagamentos são simulados.'}
      </p>
    </section>
  )
}
