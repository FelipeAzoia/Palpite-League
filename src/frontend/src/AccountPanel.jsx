import { useEffect, useEffectEvent, useState } from 'react'
import { ArrowRight, LoaderCircle, LogOut } from 'lucide-react'
import { fetchFinancialHistory, fetchProfile, isSessionRejected, updateProfileName } from './account-api.js'
import { openMovementsSummary } from './financial-view.js'
import MatchesArea from './MatchesArea.jsx'
import PlanArea from './PlanArea.jsx'
import PoolsPanel from './PoolsPanel.jsx'
import FinancialHistory from './FinancialHistory.jsx'
import HomeArea from './HomeArea.jsx'
import NotificationsArea from './NotificationsArea.jsx'
import { fetchNotifications, unreadBadge, unreadRefreshIntervalMs } from './notifications-api.js'

const areas = [
  { id: 'home', label: 'Início' },
  { id: 'profile', label: 'Perfil' },
  { id: 'matches', label: 'Partidas' },
  { id: 'pools', label: 'Bolões' },
  { id: 'notifications', label: 'Avisos' },
]

// Planos e Financeiro não têm aba própria: são abertos pelo Perfil (planos também pela criação de
// bolão), e enquanto estão abertos a aba Perfil fica destacada.
const profileSubAreas = ['plan', 'financial']
const navAreaOf = (area) => (profileSubAreas.includes(area) ? 'profile' : area)

function ProfileArea({ token, user, pending, onOpenPlans, onOpenFinancial, onLogout, onSessionRejected, onUserChange }) {
  const [profile, setProfile] = useState(null)
  const [loadError, setLoadError] = useState('')
  // Situação do financeiro: carregada à parte, para uma falha aqui não esconder o perfil.
  const [financial, setFinancial] = useState(null)
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
    fetchFinancialHistory(token).then(({ movements }) => {
      if (active) setFinancial(openMovementsSummary(movements))
    }).catch((error) => {
      if (isSessionRejected(error)) rejectSession()
      else if (active) setFinancial({ count: 0, label: 'Não foi possível consultar agora' })
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
      <div className="profile-head">
        <div>
          <p className="eyebrow">MEU PERFIL</p>
          <h2 id="auth-title">Meu perfil</h2>
        </div>
        <button className="small-button profile-logout" type="button" onClick={onLogout} disabled={pending}>
          <LogOut size={18} aria-hidden="true" /> {pending ? 'Saindo...' : 'Sair da conta'}
        </button>
      </div>
      <p className="form-copy">Veja seus dados e altere o nome exibido.</p>

      {loadError && <p className="form-message" role="alert">{loadError}</p>}
      {!profile && !loadError && <p className="form-copy" role="status">Carregando...</p>}

      {profile && (
        <>
          <dl className="info-list profile-info">
            <div><dt>E-mail</dt><dd>{profile.email}</dd></div>
            <div>
              <dt>Plano</dt>
              <dd className="profile-action">
                {profile.plan.name}
                <button className="small-button" type="button" onClick={onOpenPlans}>Ver planos</button>
              </dd>
            </div>
            <div>
              <dt>Financeiro</dt>
              <dd className="profile-action">
                <span className={financial?.count ? 'profile-open' : undefined}>{financial ? financial.label : 'Consultando...'}</span>
                <button className="small-button" type="button" onClick={onOpenFinancial}>Ver financeiro</button>
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

// Contagem de não lidas do indicador da aba Avisos (SPEC-027): carregada ao trocar de área e a cada
// minuto; uma falha aqui só esconde o indicador.
function useUnreadCount(token, area) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!token) return undefined
    let active = true
    const load = () => fetchNotifications(token, { unread: true, limit: 1 })
      .then((result) => { if (active) setCount(result.unreadCount) })
      .catch(() => {})
    load()
    const timer = setInterval(load, unreadRefreshIntervalMs)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [token, area])
  return [count, setCount]
}

export function AreaNav({ token, area, onAreaChange, unreadOverride }) {
  const [unread] = useUnreadCount(token, area)
  const badge = unreadBadge(unreadOverride ?? unread)
  return (
    <nav className="area-nav" aria-label="Áreas da conta">
      {areas.map((item) => (
        <button key={item.id} type="button" aria-current={navAreaOf(area) === item.id ? 'page' : undefined} onClick={() => onAreaChange(item.id)}>
          {item.label}
          {item.id === 'notifications' && badge && <span className="nav-badge" aria-label={`${badge} não lidos`}>{badge}</span>}
        </button>
      ))}
    </nav>
  )
}

export default function AccountPanel({ token, user, pending, area, onAreaChange, onLogout, onSessionRejected, onUserChange, onUnreadChange }) {
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
          onOpenPool={openPool}
          onBrowsePools={() => openPool(null)}
          onSessionRejected={onSessionRejected}
        />
      )}

      {area === 'profile' && (
        <ProfileArea
          token={token}
          user={user}
          pending={pending}
          onOpenPlans={() => setArea('plan')}
          onOpenFinancial={() => setArea('financial')}
          onLogout={onLogout}
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
        <MatchesArea token={token} onSessionRejected={onSessionRejected} />
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

      {area === 'notifications' && (
        <NotificationsArea token={token} onSessionRejected={onSessionRejected} onUnreadChange={onUnreadChange} />
      )}

      {area === 'financial' && (
        <FinancialHistory token={token} onBack={() => setArea('profile')} onSessionRejected={onSessionRejected} />
      )}
    </div>
  )
}
