import { useEffect, useState } from 'react'
import { Activity, ArrowRight, LoaderCircle, LogOut } from 'lucide-react'
import { requestAuth } from './src/auth-api.js'
import './styles.css'

const tokenKey = 'palpite-league-session'

function App() {
  const [view, setView] = useState('checking')
  const [user, setUser] = useState(null)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const token = sessionStorage.getItem(tokenKey)
    if (!token) {
      setView('login')
      return
    }

    let active = true
    requestAuth('/auth/me', { token }).then(({ user: currentUser }) => {
      if (!active) return
      setUser(currentUser)
      setView('authenticated')
    }).catch(() => {
      sessionStorage.removeItem(tokenKey)
      if (!active) return
      setMessage('Sua sessão terminou. Entre novamente.')
      setView('login')
    })

    return () => { active = false }
  }, [])

  async function submitForm(event) {
    event.preventDefault()
    setPending(true)
    setMessage('')
    setFieldErrors({})
    const formData = new FormData(event.currentTarget)
    const values = Object.fromEntries(formData.entries())

    try {
      if (view === 'register') {
        await requestAuth('/auth/register', { method: 'POST', body: values })
        setEmail(values.email)
        setView('login')
        setMessage('Conta criada. Agora entre com seu e-mail e senha.')
      } else {
        const result = await requestAuth('/auth/login', { method: 'POST', body: values })
        sessionStorage.setItem(tokenKey, result.token)
        setUser(result.user)
        setView('authenticated')
      }
    } catch (error) {
      setMessage(error.message)
      setFieldErrors(error.fields)
    } finally {
      setPending(false)
    }
  }

  async function logout() {
    const token = sessionStorage.getItem(tokenKey)
    setPending(true)
    try {
      if (token) await requestAuth('/auth/logout', { method: 'POST', token })
    } catch {
      // Discard the browser token even if the server session has already expired.
    } finally {
      sessionStorage.removeItem(tokenKey)
      setUser(null)
      setMessage('Você saiu da sua conta.')
      setView('login')
      setPending(false)
    }
  }

  function changeView(nextView) {
    setMessage('')
    setFieldErrors({})
    setView(nextView)
  }

  if (view === 'checking') {
    return <main className="auth-loading" aria-label="Verificando sessão"><LoaderCircle size={24} /></main>
  }

  return (
    <main className="auth-shell">
      <header className="auth-header">
        <a className="brand" href="/" aria-label="Palpite League">
          <span className="brand-symbol"><Activity size={18} strokeWidth={2.5} /></span>
          <span>palpite<span className="brand-dot">.</span></span>
        </a>
        <span className="environment"><span /> ambiente local</span>
      </header>

      <section className="auth-layout" aria-live="polite">
        <div className="auth-intro">
          <p className="eyebrow">PALPITE LEAGUE</p>
          <h1>O jogo começa<br />com um palpite.</h1>
          <div className="intro-rule"><span /><span /><span /></div>
          <p className="intro-index">TEMPORADA <strong>2026</strong></p>
        </div>

        <section className="auth-panel" aria-labelledby="auth-title">
          {view === 'authenticated' ? (
            <div className="authenticated-view">
              <p className="eyebrow">ACESSO CONFIRMADO</p>
              <h2 id="auth-title">Olá, {user?.name}.</h2>
              <p className="form-copy">Sua conta está pronta para a próxima rodada.</p>
              <button className="primary-button" type="button" onClick={logout} disabled={pending}>
                <span>{pending ? 'Saindo...' : 'Sair da conta'}</span>
                {pending ? <LoaderCircle size={17} className="spin" /> : <LogOut size={17} />}
              </button>
              <p className="plan-note">Plano {user?.plan === 'free' ? 'Gratuito' : user?.plan}</p>
            </div>
          ) : (
            <>
              <p className="eyebrow">{view === 'register' ? 'NOVA CONTA' : 'SUA CONTA'}</p>
              <h2 id="auth-title">{view === 'register' ? 'Criar cadastro' : 'Entrar'}</h2>
              <p className="form-copy">
                {view === 'register' ? 'Comece com seus dados de acesso.' : 'Bom ter você de volta.'}
              </p>

              <form className="auth-form" onSubmit={submitForm} noValidate>
                {view === 'register' && (
                  <label className="field">
                    <span>Nome</span>
                    <input name="name" type="text" autoComplete="name" maxLength={100} required aria-describedby={fieldErrors.name ? 'name-error' : undefined} />
                    {fieldErrors.name && <small id="name-error" className="field-error">{fieldErrors.name}</small>}
                  </label>
                )}
                <label className="field">
                  <span>E-mail</span>
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                  />
                  {fieldErrors.email && <small id="email-error" className="field-error">{fieldErrors.email}</small>}
                </label>
                <label className="field">
                  <span>Senha</span>
                  <input
                    name="password"
                    type="password"
                    autoComplete={view === 'register' ? 'new-password' : 'current-password'}
                    minLength={view === 'register' ? 8 : undefined}
                    maxLength={128}
                    required
                    aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                  />
                  {fieldErrors.password && <small id="password-error" className="field-error">{fieldErrors.password}</small>}
                </label>

                {message && <p className="form-message" role="alert">{message}</p>}

                <button className="primary-button" type="submit" disabled={pending}>
                  <span>{pending ? 'Aguarde...' : view === 'register' ? 'Criar conta' : 'Entrar'}</span>
                  {pending ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}
                </button>
              </form>

              <div className="mode-switch">
                {view === 'register' ? 'Já tem uma conta?' : 'Ainda não tem uma conta?'}
                <button type="button" onClick={() => changeView(view === 'register' ? 'login' : 'register')}>
                  {view === 'register' ? 'Entrar' : 'Criar cadastro'}
                </button>
              </div>
            </>
          )}
        </section>
      </section>

      <footer className="auth-footer"><span>PALPITE LEAGUE</span><span>Uma rodada de cada vez.</span></footer>
    </main>
  )
}

export default App