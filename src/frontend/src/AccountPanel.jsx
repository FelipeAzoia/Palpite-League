import { useEffect, useEffectEvent, useState } from 'react'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { fetchProfile, isSessionRejected, updateProfileName } from './account-api.js'
import MatchCatalog from './MatchCatalog.jsx'
import PlanArea from './PlanArea.jsx'
import PoolsPanel from './PoolsPanel.jsx'
import FinancialHistory from './FinancialHistory.jsx'
import HomeArea from './HomeArea.jsx'

const areas = [
  { id: 'home', label: 'Início' },
  { id: 'profile', label: 'Perfil' },
  { id: 'matches', label: 'Partidas' },
  { id: 'pools', label: 'Bolões' },
  { id: 'financial', label: 'Financeiro' },
]


// A página de planos não tem aba própria: ela é aberta pelo Perfil e pela criação de bolão.
const navAreaOf = (area) => (area === 'plan' ? 'profile' : area)

function ProfileArea({ token, user, onOpenPlans, onSessionRejected, onUserChange }) {
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
            <div>
              <dt>Plano</dt>
              <dd className="profile-plan">
                {profile.plan.name}
                <button className="small-button" type="button" onClick={onOpenPlans}>Ver planos</button>
              </dd>
            </div>
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

    </>
  )
}

export function AreaNav({ area, onAreaChange }) {
  return (
    <nav className="area-nav" aria-label="Áreas da conta">
      {areas.map((item) => (
        <button key={item.id} type="button" aria-current={navAreaOf(area) === item.id ? 'page' : undefined} onClick={() => onAreaChange(item.id)}>
          {item.label}
        </button>
      ))}
    </nav>
  )
}

export default function AccountPanel({ token, user, pending, area, onAreaChange, onLogout, onSessionRejected, onUserChange }) {
  const setArea = onAreaChange
  // Bolão a abrir quando o usuário vem da página inicial; a aba Bolões abre direto nele.
  const [poolToOpen, setPoolToOpen] = useState(null)
  // Ao sair da aba, a próxima visita a Bolões volta para a lista.
  if (area !== 'pools' && poolToOpen !== null) setPoolToOpen(null)

  function openPool(poolId) {
    setPoolToOpen(poolId)
    setArea('pools')
  }

  return (
    <div className="authenticated-view">

      {area === 'home' && (
        <HomeArea
          token={token}
          user={user}
          pending={pending}
          onLogout={onLogout}
          onOpenPool={openPool}
          onBrowsePools={() => openPool(null)}
          onSessionRejected={onSessionRejected}
        />
      )}

      {area === 'profile' && (
        <ProfileArea
          token={token}
          user={user}
          onOpenPlans={() => setArea('plan')}
          onSessionRejected={onSessionRejected}
          onUserChange={onUserChange}
        />
      )}

      {area === 'plan' && (
        <PlanArea
          token={token}
          onBack={() => setArea('profile')}
          onSessionRejected={onSessionRejected}
        />
      )}

      {area === 'matches' && (
        <MatchCatalog token={token} onSessionRejected={onSessionRejected} />
      )}

      {area === 'pools' && (
        <PoolsPanel
          key={poolToOpen ?? 'list'}
          token={token}
          initialPoolId={poolToOpen}
          onUpgrade={() => setArea('plan')}
          onSessionRejected={onSessionRejected}
        />
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
