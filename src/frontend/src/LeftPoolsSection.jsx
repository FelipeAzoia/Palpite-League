import { useEffect, useEffectEvent, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import { fetchLeftPools } from './history-api.js'

// SPEC-028 — bolões que a pessoa deixou: eles saem da lista principal, mas o histórico do período em
// que ela participou continua disponível, em somente leitura.
export default function LeftPoolsSection({ token, onSessionRejected, onOpenHistory }) {
  const [pools, setPools] = useState([])
  const rejectSession = useEffectEvent(() => onSessionRejected())

  useEffect(() => {
    let active = true
    fetchLeftPools(token).then((result) => {
      if (active) setPools(result.pools)
    }).catch((caught) => {
      if (isSessionRejected(caught)) rejectSession()
    })
    return () => { active = false }
  }, [token])

  if (pools.length === 0) return null
  return (
    <section className="refunds-block" aria-labelledby="left-pools-title">
      <h3 id="left-pools-title" className="block-title">Bolões que você deixou</h3>
      <ul className="pool-list">
        {pools.map((pool) => (
          <li key={pool.id}>
            <button type="button" className="pool-item" onClick={() => onOpenHistory(pool.id)}>
              <span className="pool-item-name">{pool.name}</span>
              <span className="pool-item-meta">Ver histórico</span>
              <ChevronRight className="pool-item-arrow" size={18} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
