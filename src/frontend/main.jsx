import { useEffect, useState } from 'react'
import { Activity, ArrowUpRight, CircleCheck, CircleX, RefreshCw } from 'lucide-react'
import { checkAvailability } from './src/availability.js'
import './styles.css'

function App() {
  const [health, setHealth] = useState({ state: 'checking' })

  async function refreshHealth() {
    setHealth({ state: 'checking' })
    try {
      const result = await checkAvailability()
      setHealth({ state: 'available', checkedAt: new Date(), result })
    } catch {
      setHealth({ state: 'unavailable', checkedAt: new Date() })
    }
  }

  useEffect(() => {
    refreshHealth()
  }, [])

  const isAvailable = health.state === 'available'
  const isChecking = health.state === 'checking'

  return (
    <main className="foundation-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Palpite League, início">
          <span className="brand-symbol"><Activity size={18} strokeWidth={2.5} /></span>
          <span>palpite<span className="brand-dot">.</span></span>
        </a>
        <span className="environment"><span /> ambiente local</span>
      </header>

      <section className="status-view" aria-live="polite">
        <div className={`status-mark status-mark--${health.state}`}>
          {isChecking ? <RefreshCw size={22} /> : isAvailable ? <CircleCheck size={24} /> : <CircleX size={24} />}
        </div>
        <p className="eyebrow">Fundação técnica</p>
        <h1>{isChecking ? 'Verificando serviços' : isAvailable ? 'Tudo está operando' : 'Backend indisponível'}</h1>
        <p className="status-copy">
          {isChecking ? 'Aguardando resposta do backend.' : isAvailable ? 'A aplicação respondeu à verificação de disponibilidade.' : 'Não foi possível acessar a aplicação neste momento.'}
        </p>

        <div className="service-row">
          <div className="service-icon"><Activity size={17} /></div>
          <div className="service-details"><strong>API Palpite League</strong><span>GET /health</span></div>
          <span className={`service-state ${isAvailable ? 'service-state--up' : isChecking ? 'service-state--checking' : 'service-state--down'}`}>
            {isChecking ? 'Verificando' : isAvailable ? 'Disponível' : 'Indisponível'}
          </span>
        </div>

        <div className="status-actions">
          <span className="checked-at">
            {health.checkedAt ? `Verificado às ${health.checkedAt.toLocaleTimeString('pt-BR')}` : 'Aguardando verificação'}
          </span>
          <button type="button" className="refresh-button" onClick={refreshHealth} disabled={isChecking} title="Verificar novamente" aria-label="Verificar novamente">
            <RefreshCw size={16} />
          </button>
        </div>
        <a className="api-link" href="/health" target="_blank" rel="noreferrer">Abrir resposta HTTP <ArrowUpRight size={14} /></a>
      </section>

      <footer className="footer"><span>PALPITE LEAGUE</span><span>Node.js · Express · SQLite</span></footer>
    </main>
  )
}

export default App