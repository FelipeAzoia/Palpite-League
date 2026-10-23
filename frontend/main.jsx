import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { fetchHealth } from './health.js'
import './styles.css'

export function App() {
  const [health, setHealth] = useState({ state: 'checking' })

  useEffect(() => {
    let active = true

    fetchHealth()
      .then((result) => {
        if (active) {
          setHealth(result.available
            ? { state: 'available' }
            : { state: 'unavailable', component: result.component })
        }
      })
      .catch(() => {
        if (active) {
          setHealth({ state: 'unavailable', component: 'backend' })
        }
      })

    return () => {
      active = false
    }
  }, [])

  const isAvailable = health.state === 'available'
  const message = health.state === 'checking'
    ? 'Verificando a conexão com o backend...'
    : isAvailable
      ? 'Backend e persistência local disponíveis.'
      : `Serviço indisponível${health.component ? `: ${health.component}` : ''}.`

  return (
    <main className="foundation">
      <section className="status-card" aria-labelledby="app-title">
        <p className="eyebrow">Palpite League</p>
        <h1 id="app-title">Fundação técnica</h1>
        <p className="description">
          Interface local mínima para verificar a comunicação HTTP com a aplicação.
        </p>
        <p
          className={`status status--${health.state}`}
          role="status"
          aria-live="polite"
        >
          <span className="status-indicator" aria-hidden="true" />
          {message}
        </p>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
