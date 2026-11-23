import { useEffect, useEffectEvent, useState } from 'react'
import { LoaderCircle, Trophy } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import { fetchFinalResult, formatEndedAt, winnersHeadline } from './final-result-api.js'

// SPEC-025 — resultado final congelado do bolão encerrado: vencedores (ou a ausência deles) e a
// classificação final registrada no encerramento.
export default function FinalResultSection({ token, poolId, onSessionRejected }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const handleError = useEffectEvent((caught) => {
    if (isSessionRejected(caught)) onSessionRejected()
    else setError(caught.message)
  })

  useEffect(() => {
    let active = true
    fetchFinalResult(token, poolId).then((loaded) => {
      if (active) setResult(loaded)
    }).catch((caught) => {
      if (active) handleError(caught)
    })
    return () => { active = false }
  }, [token, poolId])

  if (error) return <p className="form-message" role="alert">{error}</p>
  if (!result) return <p className="tab-loading" role="status"><LoaderCircle size={14} className="spin" /> Carregando resultado final...</p>

  return (
    <section aria-labelledby="final-result-title" className="final-result">
      <div className="final-result-head">
        <Trophy size={20} aria-hidden="true" />
        <div>
          <h3 id="final-result-title" className="block-title">Resultado final</h3>
          <p className={result.hasWinner ? 'final-winners' : 'final-winners final-winners-none'}>{winnersHeadline(result)}</p>
          <p className="fine-print fine-print-top">Bolão encerrado automaticamente em {formatEndedAt(result.endedAt)}. O resultado não muda mais.</p>
        </div>
      </div>
      {result.standings.length > 0 && (
        <ol className="plain-rows standings-mini">
          {result.standings.map((row) => (
            <li key={row.id} className={row.isRequester ? 'is-own' : undefined}>
              <span className="mini-pos">{row.position}</span>
              <span className="plain-rows-main">
                {row.name}
                {row.isRequester && <span className="you-tag">você</span>}
                {row.winner && <span className="winner-tag">vencedor</span>}
              </span>
              <strong className="mini-points">{row.totalPoints}<small> pts</small></strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
