import { useEffect, useEffectEvent, useState } from 'react'
import { ArrowRight, ChevronRight, LoaderCircle, Plus } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import MatchCatalog from './MatchCatalog.jsx'
import PoolView from './PoolView.jsx'
import { createPool, fetchCreationAvailability, fetchPools } from './pools-api.js'
import {
  buildPoolRequest,
  poolStatusLabels,
  prizeModelLabels,
  roleLabels,
  tiebreakerLabels,
  todayInSaoPaulo,
  toggleValue,
} from './pools-form.js'

function FieldError({ id, message }) {
  return message ? <small id={id} className="field-error">{message}</small> : null
}

function useGuardedRequest(onSessionRejected) {
  return function handle(error, setMessage) {
    if (isSessionRejected(error)) onSessionRejected()
    else setMessage(error.message)
  }
}

function PoolList({ token, notice, onSessionRejected, onOpen, onCreate }) {
  const [pools, setPools] = useState(null)
  const [error, setError] = useState('')
  const handle = useGuardedRequest(onSessionRejected)

  const handleLoadError = useEffectEvent((requestError) => handle(requestError, setError))

  useEffect(() => {
    let active = true
    fetchPools(token).then((result) => {
      if (active) setPools(result.pools)
    }).catch((requestError) => {
      if (active) handleLoadError(requestError)
    })
    return () => { active = false }
  }, [token])

  return (
    <div className="pools-home">
      <div className="block-head pools-home-head">
        <div>
          <h2 id="auth-title">Meus bolões</h2>
          <p className="toolbar-note">Os bolões em que você participa ou que administra.</p>
        </div>
        <button className="small-button small-button-solid" type="button" onClick={onCreate}>
          <Plus size={14} aria-hidden="true" /> Criar bolão
        </button>
      </div>

      {notice && <p className="pool-notice" role="status">{notice}</p>}
      {error && <p className="form-message" role="alert">{error}</p>}
      {!pools && !error && <p className="tab-loading" role="status"><LoaderCircle size={14} className="spin" /> Carregando...</p>}
      {pools && pools.length === 0 && <p className="empty-state">Você ainda não participa de nenhum bolão. Crie um ou peça um convite a quem administra.</p>}
      {pools && pools.length > 0 && (
        <ul className="pool-list">
          {pools.map((pool) => (
            <li key={pool.id}>
              <button type="button" className="pool-item" onClick={() => onOpen(pool.id)}>
                <span className="pool-item-name">{pool.name}</span>
                <span className="pool-item-meta">
                  <span className={`state state-pool-${pool.status}`}>{poolStatusLabels[pool.status] ?? pool.status}</span>
                  {roleLabels[pool.role] ?? pool.role}
                </span>
                <ChevronRight className="pool-item-arrow" size={18} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function limitMessage(availability) {
  const noun = availability.limit === 1 ? 'bolão ativo' : 'bolões ativos'
  const base = `Você tem ${availability.activePools} de ${availability.limit} ${noun} do plano ${availability.plan.name}.`
  return availability.plan.id === 'free'
    ? `${base} Encerre um bolão ativo para criar outro ou conheça o plano Premium, que permite até 10 bolões simultâneos.`
    : `${base} Encerre um bolão ativo para criar outro.`
}

function PoolCreate({ token, onSessionRejected, onCreated, onBack }) {
  const [availability, setAvailability] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [values, setValues] = useState(() => ({
    name: '',
    startsOn: todayInSaoPaulo(),
    endsOn: '',
    entryFee: '0',
    prizeModel: 'winner_takes_all',
    tiebreaker: 'exact_scores',
    matchIds: [],
    roundNumbers: [],
  }))
  const [fieldErrors, setFieldErrors] = useState({})
  const [message, setMessage] = useState('')
  const [guidance, setGuidance] = useState('')
  const [saving, setSaving] = useState(false)
  const handle = useGuardedRequest(onSessionRejected)

  const handleLoadError = useEffectEvent((requestError) => handle(requestError, setLoadError))

  useEffect(() => {
    let active = true
    fetchCreationAvailability(token).then((result) => {
      if (active) setAvailability(result)
    }).catch((requestError) => {
      if (active) handleLoadError(requestError)
    })
    return () => { active = false }
  }, [token])

  // Ao editar um campo, o erro mostrado para ele deixa de valer; o backend valida de novo no envio.
  function clearError(field) {
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
    setMessage('')
    setGuidance('')
  }

  function change(field) {
    return (event) => {
      setValues((current) => ({ ...current, [field]: event.target.value }))
      clearError(field)
    }
  }

  const selection = {
    matchIds: values.matchIds,
    roundNumbers: values.roundNumbers,
    onToggleMatch: (id) => {
      setValues((current) => ({ ...current, matchIds: toggleValue(current.matchIds, id) }))
      clearError('selection')
    },
    onToggleRound: (number) => {
      setValues((current) => ({ ...current, roundNumbers: toggleValue(current.roundNumbers, number) }))
      clearError('selection')
    },
  }

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    setGuidance('')
    setFieldErrors({})
    try {
      onCreated(await createPool(token, buildPoolRequest(values)))
    } catch (requestError) {
      if (isSessionRejected(requestError)) {
        onSessionRejected()
        return
      }
      setMessage(requestError.message)
      setFieldErrors(requestError.fields ?? {})
      if (requestError.type === 'pool_limit_reached') setGuidance(requestError.details?.guidance ?? '')
    } finally {
      setSaving(false)
    }
  }

  const summary = [
    values.matchIds.length > 0 ? `${values.matchIds.length} ${values.matchIds.length === 1 ? 'partida escolhida' : 'partidas escolhidas'}` : null,
    values.roundNumbers.length > 0 ? `rodadas inteiras: ${[...values.roundNumbers].sort((a, b) => a - b).join(', ')}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <>
      <p className="eyebrow">NOVO BOLÃO</p>
      <h2 id="auth-title">Criar bolão</h2>
      <p className="form-copy">As regras não podem ser alteradas depois da criação.</p>

      {loadError && <p className="form-message" role="alert">{loadError}</p>}
      {!availability && !loadError && <p className="form-copy" role="status">Verificando seu plano...</p>}

      {availability && !availability.canCreate && (
        <p className="catalog-notice" role="status">{limitMessage(availability)}</p>
      )}

      {availability?.canCreate && (
        <form className="auth-form" onSubmit={submit} noValidate>
          <label className="field">
            <span>Nome do bolão</span>
            <input name="name" type="text" maxLength={100} value={values.name} onChange={change('name')} aria-describedby={fieldErrors.name ? 'pool-name-error' : undefined} />
            <FieldError id="pool-name-error" message={fieldErrors.name} />
          </label>

          <div className="field-row">
            <label className="field">
              <span>Início</span>
              <input name="startsOn" type="date" value={values.startsOn} onChange={change('startsOn')} aria-describedby={fieldErrors.startsOn ? 'pool-start-error' : undefined} />
              <FieldError id="pool-start-error" message={fieldErrors.startsOn} />
            </label>
            <label className="field">
              <span>Fim</span>
              <input name="endsOn" type="date" value={values.endsOn} onChange={change('endsOn')} aria-describedby={fieldErrors.endsOn ? 'pool-end-error' : undefined} />
              <FieldError id="pool-end-error" message={fieldErrors.endsOn} />
            </label>
          </div>

          <label className="field">
            <span>Taxa de entrada (R$)</span>
            <input name="entryFee" type="text" inputMode="decimal" value={values.entryFee} onChange={change('entryFee')} aria-describedby={fieldErrors.entryFee ? 'pool-fee-error' : 'pool-fee-hint'} />
            <small id="pool-fee-hint" className="field-hint">Use 0 para um bolão sem taxa. Com taxa: de R$ 1,00 a R$ 500,00.</small>
            <FieldError id="pool-fee-error" message={fieldErrors.entryFee} />
          </label>

          <label className="field">
            <span>Modelo de premiação</span>
            <select name="prizeModel" value={values.prizeModel} onChange={change('prizeModel')}>
              {Object.entries(prizeModelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <FieldError id="pool-prize-error" message={fieldErrors.prizeModel} />
          </label>

          <label className="field">
            <span>Critério de desempate</span>
            <select name="tiebreaker" value={values.tiebreaker} onChange={change('tiebreaker')}>
              {Object.entries(tiebreakerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <FieldError id="pool-tiebreaker-error" message={fieldErrors.tiebreaker} />
          </label>

          <fieldset className="match-fieldset">
            <legend>Partidas do bolão</legend>
            <MatchCatalog token={token} onSessionRejected={onSessionRejected} selection={selection} />
            <p className="selection-summary" role="status">{summary || 'Nenhuma partida escolhida ainda.'}</p>
            <FieldError id="pool-selection-error" message={fieldErrors.selection} />
          </fieldset>

          {message && <p className="form-message" role="alert">{message}</p>}
          {guidance && <p className="catalog-notice" role="status">{guidance}</p>}

          <button className="primary-button" type="submit" disabled={saving}>
            <span>{saving ? 'Criando...' : 'Criar bolão'}</span>
            {saving ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}
          </button>
        </form>
      )}

      <div className="mode-switch">
        <button type="button" onClick={onBack}>Voltar para meus bolões</button>
      </div>
    </>
  )
}

export default function PoolsPanel({ token, onSessionRejected }) {
  const [view, setView] = useState({ name: 'list' })

  // A chave muda a cada página interna (lista, criação, um bolão) e reinicia a transição;
  // trocar de aba dentro do bolão não remonta o cabeçalho.
  return (
    <div className="page-enter" key={view.poolId ? `pool-${view.poolId}` : view.name}>
      <PoolsPage view={view} setView={setView} token={token} onSessionRejected={onSessionRejected} />
    </div>
  )
}

function PoolsPage({ view, setView, token, onSessionRejected }) {
  if (view.name === 'create') {
    return (
      <PoolCreate
        token={token}
        onSessionRejected={onSessionRejected}
        onBack={() => setView({ name: 'list' })}
        onCreated={(result) => {
          const rounds = result.matchCountByRound.map((item) => `rodada ${item.roundNumber}: ${item.matchCount}`).join('; ')
          setView({
            name: 'pool',
            poolId: result.pool.id,
            notice: `Bolão criado com ${result.pool.matches.length} ${result.pool.matches.length === 1 ? 'partida' : 'partidas'} (${rounds}).`,
          })
        }}
      />
    )
  }

  if (view.name === 'pool') {
    return (
      <PoolView
        token={token}
        poolId={view.poolId}
        notice={view.notice}
        onSessionRejected={onSessionRejected}
        onBack={() => setView({ name: 'list' })}
        onLeft={(message) => setView({ name: 'list', notice: message })}
      />
    )
  }

  return (
    <PoolList
      token={token}
      notice={view.notice}
      onSessionRejected={onSessionRejected}
      onOpen={(poolId) => setView({ name: 'pool', poolId })}
      onCreate={() => setView({ name: 'create' })}
    />
  )
}
