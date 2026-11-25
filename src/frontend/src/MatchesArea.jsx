import { useState } from 'react'
import ApiFootballShowcase from './ApiFootballShowcase.jsx'
import MatchCatalog from './MatchCatalog.jsx'
import SourceSwitch from './SourceSwitch.jsx'

// Aba de partidas: o catálogo do campeonato simulado (SPEC-006), usado nos bolões, ou a consulta
// somente leitura do Brasileirão 2024 pela API-Football (SPEC-031), pela mesma chave da criação.
export default function MatchesArea({ token, onSessionRejected }) {
  const [source, setSource] = useState('simulated')

  return (
    <>
      <div className="create-head">
        <div>
          <p className="eyebrow">CATÁLOGO ESPORTIVO</p>
          <h2 id="auth-title">Rodadas e partidas</h2>
        </div>
        <SourceSwitch token={token} value={source} onChange={setSource} />
      </div>
      {source === 'simulated' && (
        <>
          <p className="form-copy">Consulte as partidas disponíveis na temporada.</p>
          <MatchCatalog token={token} onSessionRejected={onSessionRejected} showHeader={false} />
        </>
      )}
      {source === 'api-football-2024' && <ApiFootballShowcase token={token} onSessionRejected={onSessionRejected} />}
    </>
  )
}
