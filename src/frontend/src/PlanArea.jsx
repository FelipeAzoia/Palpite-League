import { useEffect, useEffectEvent, useState } from 'react'
import { ArrowLeft, Check, LoaderCircle, Minus } from 'lucide-react'
import { fetchAccountPlan, fetchAvailablePlans, isSessionRejected } from './account-api.js'
import { describeFeatures, planStatusLabel, planTagline, usageSummary } from './plan-features.js'
import { fetchCreationAvailability } from './pools-api.js'
import { fetchPremiumConditions } from './premium-api.js'
import PremiumSection from './PremiumSection.jsx'

function FeatureValue({ feature }) {
  if (feature.enabled === true) return <span className="plan-yes"><Check size={16} aria-hidden="true" /><span className="sr-only">Sim</span></span>
  if (feature.enabled === false) return <span className="plan-no"><Minus size={16} aria-hidden="true" /><span className="sr-only">Não</span></span>
  return <span>{feature.value}</span>
}

// Página de planos (SPEC-005), aberta pelo Perfil ou pela criação de bolão: plano atual com o uso do
// limite e comparação dos planos; a contratação do Premium (SPEC-019) fica logo abaixo.
export default function PlanArea({ token, onBack, onSessionRejected }) {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const handleLoadError = useEffectEvent((error) => {
    if (isSessionRejected(error)) onSessionRejected()
    else setLoadError(error.message)
  })

  useEffect(() => {
    let active = true
    Promise.all([fetchAccountPlan(token), fetchAvailablePlans(token), fetchCreationAvailability(token), fetchPremiumConditions(token)])
      .then(([current, available, availability, premium]) => {
        if (active) setData({ current, plans: available.plans, availability, premium })
      })
      .catch((error) => {
        if (active) handleLoadError(error)
      })
    return () => { active = false }
  }, [token, reloadKey])

  const usage = data ? usageSummary(data.availability) : null
  const rows = data ? describeFeatures(data.plans[0].features).map(({ id, label }) => ({ id, label })) : []

  return (
    <div className="plan-page">
      <div>
        <button className="back-link" type="button" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden="true" /> Voltar ao perfil
        </button>
        <h2 id="auth-title">Meu plano</h2>
        <p className="toolbar-note">O que sua conta permite hoje e o que muda entre os planos.</p>
      </div>

      {loadError && <p className="form-message" role="alert">{loadError}</p>}
      {!data && !loadError && <p className="tab-loading" role="status"><LoaderCircle size={14} className="spin" /> Carregando...</p>}

      {data && (
        <section className="plan-hero" aria-label="Plano atual">
          <div className="plan-hero-main">
            <span className="plan-kicker">Seu plano</span>
            <p className="plan-hero-name">{data.current.plan.name}</p>
            <span className={`state ${data.current.status === 'active' ? 'state-open' : ''}`}>{planStatusLabel(data.current.status)}</span>
            <p className="plan-hero-copy">{planTagline(data.current.plan)}</p>
          </div>
          <div className="plan-usage">
            <span className="plan-kicker">Bolões ativos que você administra</span>
            <p className="plan-usage-figure">
              {data.availability.activePools}<small> de {data.availability.limit}</small>
            </p>
            <div className={usage.full ? 'meter meter-full' : 'meter'} role="meter" aria-valuemin={0} aria-valuemax={data.availability.limit} aria-valuenow={data.availability.activePools} aria-label="Uso do limite de bolões ativos">
              <span style={{ width: `${Math.round(usage.ratio * 100)}%` }} />
            </div>
            <p className="toolbar-note">{usage.text}</p>
          </div>
        </section>
      )}

      {data && (
        <section aria-labelledby="plan-compare">
          <h3 id="plan-compare" className="block-title">Comparar planos</h3>
          <div className="table-wrap">
            <table className="plan-table">
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Recurso</span></th>
                  {data.plans.map((plan) => (
                    <th key={plan.id} scope="col" className={plan.id === data.current.plan.id ? 'is-current' : undefined}>
                      <span className="plan-col-name">{plan.name}</span>
                      {plan.id === data.current.plan.id && <span className="you-tag">seu plano</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{row.label}</th>
                    {data.plans.map((plan) => {
                      const feature = describeFeatures(plan.features).find(({ id }) => id === row.id)
                      return (
                        <td key={plan.id} className={plan.id === data.current.plan.id ? 'is-current' : undefined}>
                          <FeatureValue feature={feature} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data && (
        <PremiumSection
          token={token}
          conditions={data.premium}
          onChanged={() => setReloadKey((key) => key + 1)}
          onSessionRejected={onSessionRejected}
        />
      )}
    </div>
  )
}
