import { useEffect, useEffectEvent, useState } from 'react'
import { ArrowRight, LoaderCircle, LogOut } from 'lucide-react'
import { fetchProfile, isSessionRejected, updateProfileName } from './account-api.js'
import MatchCatalog from './MatchCatalog.jsx'
import PlanArea from './PlanArea.jsx'
import PoolsPanel from './PoolsPanel.jsx'
import FinancialHistory from './FinancialHistory.jsx'

const areas = [
  { id: 'home', label: 'Início' },
  { id: 'profile', label: 'Perfil' },
  { id: 'plan', label: 'Plano' },
  { id: 'matches', label: 'Partidas' },
  { id: 'pools', label: 'Bolões' },
  { id: 'financial', label: 'Financeiro' },
]


function AreaFooter({ pending, onBack, onLogout }) {
  return (
    <div className="mode-switch">
      <button type="button" onClick={onBack}>Voltar ao início</button>
      <button type="button" onClick={onLogout} disabled={pending}>Sair da conta</button>
    </div>
  )
}

function ProfileArea({ token, user, pending, onBack, onLogout, onSessionRejected, onUserChange }) {
  const [profile, setProfile] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [name, setName] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const rejectSession = useEffectEvent(() => onSessionRejected())

  useEffect(() => {
    let active = true
    fetchProfile(token).then(({ profile: loaded }) => {
      if (!active) return
      setProfile(loaded)
      setName(loaded.name)
    }).catch((error) => {
      if (isSessionRejected(error)) rejectSession()
      else if (active) setLoadError(error.message)
    })
    return () => { active = false }
  }, [token])

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    setSaved(false)
    setFieldErrors({})

    try {
      const { profile: updated } = await updateProfileName(token, name)
      setProfile(updated)
      setName(updated.name)
      onUserChange({ ...user, name: updated.name })
      setSaved(true)
      setMessage('Nome atualizado.')
    } catch (error) {
      if (isSessionRejected(error)) {
        onSessionRejected()
        return
      }
      setMessage(error.message)
      setFieldErrors(error.fields ?? {})
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <p className="eyebrow">MEU PERFIL</p>
      <h2 id="auth-title">Meu perfil</h2>
      <p className="form-copy">Veja seus dados e altere o nome exibido.</p>

      {loadError && <p className="form-message" role="alert">{loadError}</p>}
      {!profile && !loadError && <p className="form-copy" role="status">Carregando...</p>}

      {profile && (
        <>
          <dl className="info-list">
            <div><dt>E-mail</dt><dd>{profile.email}</dd></div>
            <div><dt>Plano</dt><dd>{profile.plan.name}</dd></div>
          </dl>

          <form className="auth-form" onSubmit={save} noValidate>
            <label className="field">
              <span>Nome</span>
              <input
                name="name"
                type="text"
                autoComplete="name"
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                aria-describedby={fieldErrors.name ? 'name-error' : undefined}
              />
              {fieldErrors.name && <small id="name-error" className="field-error">{fieldErrors.name}</small>}
            </label>

            {message && (
              <p className={saved ? 'form-message form-message-success' : 'form-message'} role={saved ? 'status' : 'alert'}>{message}</p>
            )}

            <button className="primary-button" type="submit" disabled={saving}>
              <span>{saving ? 'Salvando...' : 'Salvar nome'}</span>
              {saving ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}
            </button>
          </form>
        </>
      )}

      <AreaFooter pending={pending} onBack={onBack} onLogout={onLogout} />
    </>
  )
}

export function AreaNav({ area, onAreaChange }) {
  return (
    <nav className="area-nav" aria-label="Áreas da conta">
      {areas.map((item) => (
        <button key={item.id} type="button" aria-current={area === item.id ? 'page' : undefined} onClick={() => onAreaChange(item.id)}>
          {item.label}
        </button>
      ))}
    </nav>
  )
}

export default function AccountPanel({ token, user, pending, area, onAreaChange, onLogout, onSessionRejected, onUserChange }) {
  const setArea = onAreaChange

  return (
    <div className="authenticated-view">

      {area === 'home' && (
        <>
          <p className="eyebrow">ACESSO CONFIRMADO</p>
          <h2 id="auth-title">Olá, {user?.name}.</h2>
          <p className="form-copy">Sua conta está pronta para a próxima rodada.</p>
          <button className="primary-button" type="button" onClick={onLogout} disabled={pending}>
            <span>{pending ? 'Saindo...' : 'Sair da conta'}</span>
            {pending ? <LoaderCircle size={17} className="spin" /> : <LogOut size={17} />}
          </button>
          <p className="plan-note">Plano {user?.plan === 'free' ? 'Gratuito' : user?.plan}</p>
        </>
      )}

      {area === 'profile' && (
        <ProfileArea
          token={token}
          user={user}
          pending={pending}
          onBack={() => setArea('home')}
          onLogout={onLogout}
          onSessionRejected={onSessionRejected}
          onUserChange={onUserChange}
        />
      )}

      {area === 'plan' && (
        <PlanArea
          token={token}
          pending={pending}
          onBack={() => setArea('home')}
          onLogout={onLogout}
          onSessionRejected={onSessionRejected}
        />
      )}

      {area === 'matches' && (
        <MatchCatalog token={token} onSessionRejected={onSessionRejected} />
      )}

      {area === 'pools' && (
        <PoolsPanel token={token} onSessionRejected={onSessionRejected} />
      )}

      {area === 'financial' && (
        <FinancialHistory
          token={token}
          pending={pending}
          onBack={() => setArea('home')}
          onLogout={onLogout}
          onSessionRejected={onSessionRejected}
        />
      )}
    </div>
  )
}
