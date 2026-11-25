import { useEffect, useState } from 'react'
import { fetchShowcaseStatus } from './match-catalog-api.js'

// SPEC-031 — chave "Campeonato simulado / API-Football · 2024", usada na criação do bolão e na aba de
// partidas. A opção 2024 é só consulta e fica desabilitada quando a API não está configurada.
export default function SourceSwitch({ token, value, onChange }) {
  const [configured, setConfigured] = useState(null)

  useEffect(() => {
    let active = true
    fetchShowcaseStatus(token).then((result) => {
      if (active) setConfigured(result.apiFootball2024.configured)
    }).catch(() => {
      if (active) setConfigured(false)
    })
    return () => { active = false }
  }, [token])

  return (
    <div className="source-switch-wrap">
      <div className="source-switch" role="radiogroup" aria-label="Fonte do campeonato">
        <button type="button" role="radio" aria-checked={value === 'simulated'} className={value === 'simulated' ? 'is-active' : undefined} onClick={() => onChange('simulated')}>
          Campeonato simulado
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value === 'api-football-2024'}
          className={value === 'api-football-2024' ? 'is-active' : undefined}
          disabled={configured === false}
          title={configured === false ? 'API-Football não configurada neste ambiente' : 'Dados reais de 2024, só para consulta'}
          onClick={() => onChange('api-football-2024')}
        >
          API-Football · 2024
        </button>
      </div>
      {configured === false && <p className="field-hint source-note">API-Football não configurada neste ambiente.</p>}
    </div>
  )
}
