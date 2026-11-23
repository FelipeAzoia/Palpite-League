import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import BrandIcon from './src/BrandIcon.jsx'
import AccountPanel, { AreaNav } from './src/AccountPanel.jsx'
import { requestAuth } from './src/auth-api.js'
import InvitePanel from './src/InvitePanel.jsx'
import { consumeInviteLink, discardInviteCode, pendingInviteCode } from './src/invite-link.js'
import { consumeRecoveryToken } from './src/recovery-link.js'
import './styles.css'
import './pool.css'

const tokenKey = 'palpite-league-session'
// Account tabs that keep the original two-column layout with the large slogan. The home page now
// shows the pools summary table, so it uses the wide layout.
const compactAreas = ['profile']
const initialRecoveryToken = typeof window === 'undefined'
  ? null
  : consumeRecoveryToken(window.location, window.history)
const initialInviteCode = typeof window === 'undefined'
  ? null
  : consumeInviteLink(window.location, window.history, window.sessionStorage) ?? pendingInviteCode(window.sessionStorage)

const viewCopy = {
  login: { eyebrow: 'SUA CONTA', title: 'Entrar', text: 'Bom ter você de volta.', action: 'Entrar' },
  register: { eyebrow: 'NOVA CONTA', title: 'Criar cadastro', text: 'Comece com seus dados de acesso.', action: 'Criar conta' },
  forgot: { eyebrow: 'RECUPERAR ACESSO', title: 'Esqueci minha senha', text: 'Informe seu e-mail para receber as instruções.', action: 'Enviar instruções' },
  reset: { eyebrow: 'NOVA SENHA', title: 'Definir nova senha', text: 'Escolha uma nova senha para sua conta.', action: 'Salvar nova senha' },
}

function initialView() {
  if (initialRecoveryToken) return 'reset'
  return sessionStorage.getItem(tokenKey) ? 'checking' : 'login'
}

function App() {
  const [view, setView] = useState(initialView)
  const [user, setUser] = useState(null)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [pending, setPending] = useState(false)
  const [recoveryToken, setRecoveryToken] = useState(initialRecoveryToken)
  const [recoverySent, setRecoverySent] = useState(false)
  const [accountArea, setAccountArea] = useState('home')
  const [inviteCode, setInviteCode] = useState(initialInviteCode)

  useEffect(() => {
    if (initialRecoveryToken) return undefined
    const token = sessionStorage.getItem(tokenKey)
    if (!token) return undefined

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

  useEffect(() => {
    function openRecoveryLink() {
      const invite = consumeInviteLink(window.location, window.history, window.sessionStorage)
      if (invite) {
        setInviteCode(invite)
        return
      }
      const token = consumeRecoveryToken(window.location, window.history)
      if (!token) return
      setRecoveryToken(token)
      setMessage('')
      setFieldErrors({})
      setRecoverySent(false)
      setView('reset')
    }

    window.addEventListener('hashchange', openRecoveryLink)
    return () => window.removeEventListener('hashchange', openRecoveryLink)
  }, [])

  async function submitForm(event) {
    event.preventDefault()
    setPending(true)
    setMessage('')
    setFieldErrors({})
    const formData = new FormData(event.currentTarget)
    const values = Object.fromEntries(formData.entries())

    try {
      if (view === 'forgot') {
        const result = await requestAuth('/auth/password-recovery', { method: 'POST', body: { email: values.email } })
        setEmail(values.email)
        setRecoverySent(true)
        setMessage(result.message)
      } else if (view === 'reset') {
        await requestAuth('/auth/password-reset', { method: 'POST', body: { token: recoveryToken, password: values.password } })
        sessionStorage.removeItem(tokenKey)
        setRecoveryToken(null)
        setView('login')
        setMessage('Senha redefinida. Entre com a nova senha.')
      } else if (view === 'register') {
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
      discardInviteCode(sessionStorage)
      setInviteCode(null)
      setUser(null)
      setAccountArea('home')
      setMessage('Você saiu da sua conta.')
      setView('login')
      setPending(false)
    }
  }

  function rejectSession() {
    sessionStorage.removeItem(tokenKey)
    setUser(null)
    setAccountArea('home')
    setMessage('Sua sessão terminou. Entre novamente.')
    setView('login')
  }

  function changeView(nextView) {
    setMessage('')
    setFieldErrors({})
    setRecoverySent(false)
    if (nextView !== 'reset') setRecoveryToken(null)
    setView(nextView)
  }

  if (view === 'checking') {
    return <main className="auth-loading" aria-label="Verificando sessão"><LoaderCircle size={24} /></main>
  }

  const copy = viewCopy[view]
  const showInvite = view === 'authenticated' && Boolean(inviteCode)
  const isAccount = view === 'authenticated' && (showInvite || !compactAreas.includes(accountArea))

  // Cada página tem sua chave; quando ela muda, o conteúdo é remontado e a transição roda de novo.
  const pageKey = showInvite ? 'invite' : view === 'authenticated' ? `account-${accountArea}` : view

  function closeInvite() {
    discardInviteCode(sessionStorage)
    setInviteCode(null)
  }

  return (
    <main className={['auth-shell', view === 'authenticated' && !showInvite && 'auth-shell-nav', isAccount && 'auth-shell-account'].filter(Boolean).join(' ')}>
      <header className="auth-header">
        <a className="brand" href="/" aria-label="Palpite League">
          <span className="brand-symbol"><BrandIcon size={22} strokeWidth={1.8} /></span>
          <span>Palpite League</span>
        </a>
        {isAccount && <p className="header-slogan">O jogo começa com um palpite!</p>}
        <span className="environment"><span /> ambiente local</span>
      </header>

      {view === 'authenticated' && !showInvite && <AreaNav area={accountArea} onAreaChange={setAccountArea} />}

      <section key={isAccount ? 'wide' : 'compact'} className={isAccount ? 'auth-layout auth-layout-account' : 'auth-layout'} aria-live="polite">
        {!isAccount && (
          <div className="auth-intro">
            <p className="eyebrow">PALPITE LEAGUE</p>
            <h1>O jogo começa<br />com um palpite!</h1>
            <div className="intro-rule"><span /><span /><span /></div>
            <p className="intro-index">TEMPORADA <strong>2026</strong></p>
          </div>
        )}

        <section className="auth-panel" aria-labelledby="auth-title">
          <div className="page-enter" key={pageKey}>
          {showInvite ? (
            <InvitePanel
              key={inviteCode}
              token={sessionStorage.getItem(tokenKey)}
              code={inviteCode}
              onSessionRejected={rejectSession}
              onRequested={() => discardInviteCode(sessionStorage)}
              onClose={closeInvite}
            />
          ) : view === 'authenticated' ? (
            <AccountPanel
              area={accountArea}
              onAreaChange={setAccountArea}
              token={sessionStorage.getItem(tokenKey)}
              user={user}
              pending={pending}
              onLogout={logout}
              onSessionRejected={rejectSession}
              onUserChange={setUser}
            />
          ) : (
            <>
              <p className="eyebrow">{copy.eyebrow}</p>
              <h2 id="auth-title">{copy.title}</h2>
              <p className="form-copy">{copy.text}</p>
              {inviteCode && (view === 'login' || view === 'register') && (
                <p className="form-message form-message-success" role="status">Você recebeu um convite. Entre ou crie sua conta para abri-lo.</p>
              )}

              <form className="auth-form" onSubmit={submitForm} noValidate>
                {view === 'register' && (
                  <label className="field">
                    <span>Nome</span>
                    <input name="name" type="text" autoComplete="name" maxLength={100} required aria-describedby={fieldErrors.name ? 'name-error' : undefined} />
                    {fieldErrors.name && <small id="name-error" className="field-error">{fieldErrors.name}</small>}
                  </label>
                )}
                {view !== 'reset' && (
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
                )}
                {view !== 'forgot' && (
                <label className="field">
                  <span>{view === 'reset' ? 'Nova senha' : 'Senha'}</span>
                  <input
                    name="password"
                    type="password"
                    autoComplete={view === 'login' ? 'current-password' : 'new-password'}
                    minLength={view === 'register' || view === 'reset' ? 8 : undefined}
                    maxLength={128}
                    required
                    aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                  />
                  {fieldErrors.password && <small id="password-error" className="field-error">{fieldErrors.password}</small>}
                </label>
                )}

                {message && (
                  <p className={recoverySent ? 'form-message form-message-success' : 'form-message'} role={recoverySent ? 'status' : 'alert'}>{message}</p>
                )}

                <button className="primary-button" type="submit" disabled={pending}>
                  <span>{pending ? 'Aguarde...' : copy.action}</span>
                  {pending ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}
                </button>
              </form>

              {view === 'login' && (
                <div className="mode-switch">
                  <button type="button" onClick={() => changeView('forgot')}>Esqueci minha senha</button>
                </div>
              )}

              {view === 'forgot' || view === 'reset' ? (
                <div className="mode-switch">
                  Lembrou a senha?
                  <button type="button" onClick={() => changeView('login')}>Voltar ao login</button>
                  {view === 'reset' && <button type="button" onClick={() => changeView('forgot')}>Solicitar novo link</button>}
                </div>
              ) : (
                <div className="mode-switch">
                  {view === 'register' ? 'Já tem uma conta?' : 'Ainda não tem uma conta?'}
                  <button type="button" onClick={() => changeView(view === 'register' ? 'login' : 'register')}>
                    {view === 'register' ? 'Entrar' : 'Criar cadastro'}
                  </button>
                </div>
              )}
            </>
          )}
          </div>
        </section>
      </section>

    </main>
  )
}

export default App

createRoot(document.getElementById('root')).render(<App />)
