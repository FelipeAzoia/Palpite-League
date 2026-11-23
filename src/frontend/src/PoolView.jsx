import { useEffect, useEffectEvent, useState } from 'react'
import { ArrowLeft, ArrowRight, LoaderCircle } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import EntryFeeSection from './EntryFeeSection.jsx'
import { canManageInvites } from './invites-view.js'
import InvitesSection from './InvitesSection.jsx'
import LeaveSection from './LeaveSection.jsx'
import { formatDeadline, formatKickoff } from './match-format.js'
import MedalsPage from './MedalsPage.jsx'
import ParticipantsSection from './ParticipantsSection.jsx'
import PointsPage from './PointsPage.jsx'
import { fetchPoolRules } from './pools-api.js'
import { formatBrl, formatDay, poolStatusLabels, prizeModelLabels, roleLabels, tiebreakerLabels } from './pools-form.js'
import { fetchPredictionMatches } from './predictions-api.js'
import PredictionsPage, { PredictionMark } from './PredictionsPage.jsx'
import { fetchRanking } from './ranking-api.js'
import RankingPage, { MedalMark } from './RankingPage.jsx'
import RequestsSection from './RequestsSection.jsx'
import { fetchPendingRequests } from './requests-api.js'
import ResultsPage from './ResultsPage.jsx'

const tabs = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'predictions', label: 'Palpites', member: true },
  { id: 'results', label: 'Resultados' },
  { id: 'points', label: 'Pontos', member: true },
  { id: 'ranking', label: 'Ranking', member: true },
  { id: 'medals', label: 'Medalhas', member: true },
  { id: 'manage', label: 'Gestão', manager: true },
]

const settle = (promise) => promise.then((value) => ({ value }), (error) => ({ error }))

// Resumo do bolão para o cabeçalho e a visão geral: regras, classificação, partidas para palpite
// e solicitações pendentes (só para quem administra). Ranking e palpites exigem participação
// confirmada; quem aguarda pagamento recebe 409 e vê o aviso no lugar dos números.
async function loadSummary(token, poolId) {
  const rules = await fetchPoolRules(token, poolId)
  const manager = canManageInvites(rules.requesterRole)
  const [ranking, predictions, requests] = await Promise.all([
    settle(fetchRanking(token, poolId)),
    settle(fetchPredictionMatches(token, poolId)),
    manager ? settle(fetchPendingRequests(token, poolId)) : Promise.resolve({ value: null }),
  ])
  for (const result of [ranking, predictions, requests]) {
    if (result.error && isSessionRejected(result.error)) throw result.error
  }
  return {
    rules,
    manager,
    ranking: ranking.value ?? null,
    predictions: predictions.value ?? null,
    awaitingPayment: ranking.error?.type === 'participation_not_confirmed',
    pendingRequests: requests.value?.requests.length ?? 0,
  }
}

function openMatches(predictions) {
  return (predictions?.rounds ?? []).flatMap(({ matches }) => matches).filter(({ situation }) => situation === 'open')
    .sort((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt))
}

function PoolHeader({ summary, onBack, payment }) {
  const { rules, ranking } = summary
  const pool = rules.pool
  const me = ranking?.participants.find(({ isRequester }) => isRequester)
  const open = openMatches(summary.predictions)
  const missing = open.filter(({ prediction }) => !prediction).length
  const fee = Number(pool.entryFee) === 0 ? 'Sem taxa' : `Taxa ${formatBrl(pool.entryFee)}`

  return (
    <header className="pool-head">
      <button type="button" className="back-link" onClick={onBack}><ArrowLeft size={14} aria-hidden="true" /> Meus bolões</button>
      <div className="pool-head-title">
        <h2 id="auth-title">{pool.name}</h2>
        <p className="pool-meta">
          <span className={`state state-pool-${pool.status}`}>{poolStatusLabels[pool.status] ?? pool.status}</span>
          <span>{roleLabels[rules.requesterRole] ?? rules.requesterRole}</span>
          <span>{fee}</span>
          <span>{formatDay(pool.startsOn)} – {formatDay(pool.endsOn)}</span>
        </p>
      </div>

      {summary.awaitingPayment ? (
        <>
          <p className="pool-alert">Sua participação está aprovada e aguarda o pagamento da taxa de entrada. Depois da confirmação você poderá palpitar e aparecerá no ranking.</p>
          <EntryFeeSection {...payment} />
        </>
      ) : (
        <dl className="pool-figures">
          <div>
            <dt>Sua posição</dt>
            <dd>{me ? <>{me.position}<small>º de {ranking.participants.length}</small></> : '—'}</dd>
          </div>
          <div>
            <dt>Pontos</dt>
            <dd>{me ? me.totalPoints : '—'}</dd>
          </div>
          <div>
            <dt>Medalhas</dt>
            <dd>{me ? me.medals : '—'}</dd>
          </div>
          <div>
            <dt>Próximo prazo</dt>
            <dd className="figure-text">
              {open.length ? formatDeadline(open[0].startsAt) : 'Nenhum'}
              {missing > 0 && <small>{missing} {missing === 1 ? 'partida' : 'partidas'} sem palpite</small>}
            </dd>
          </div>
        </dl>
      )}
    </header>
  )
}

function OverviewTab({ summary, onTab, leave }) {
  const { rules, ranking } = summary
  const pool = rules.pool
  const rounds = new Set(pool.matches.map(({ roundNumber }) => roundNumber))
  const upcoming = openMatches(summary.predictions).slice(0, 5)

  return (
    <div className="tab-body tab-split">
      <div className="stack">
        <section aria-labelledby="overview-standings">
          <div className="block-head">
            <h3 id="overview-standings" className="block-title">Classificação</h3>
            {ranking && <button type="button" className="link-button" onClick={() => onTab('ranking')}>Ranking completo <ArrowRight size={13} aria-hidden="true" /></button>}
          </div>
          {ranking ? (
            <ol className="plain-rows standings-mini">
              {ranking.participants.slice(0, 5).map((participant) => (
                <li key={participant.id} className={participant.isRequester ? 'is-own' : undefined}>
                  <span className="mini-pos">{participant.position}</span>
                  <span className="plain-rows-main">
                    {participant.name}
                    {participant.isRequester && <span className="you-tag">você</span>}
                    <MedalMark count={participant.medals} />
                  </span>
                  <strong className="mini-points">{participant.totalPoints}<small> pts</small></strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-state">A classificação aparece para participantes confirmados.</p>
          )}
        </section>

        <section aria-labelledby="overview-next">
          <div className="block-head">
            <h3 id="overview-next" className="block-title">Próximos palpites</h3>
            {summary.predictions && <button type="button" className="link-button" onClick={() => onTab('predictions')}>Todos os palpites <ArrowRight size={13} aria-hidden="true" /></button>}
          </div>
          {upcoming.length === 0 ? (
            <p className="empty-state">Nenhuma partida aberta para palpite agora.</p>
          ) : (
            <ol className="match-rows match-rows-compact">
              {upcoming.map((match) => {
                const { day, time } = formatKickoff(match.startsAt)
                return (
                  <li key={match.id} className="mrow">
                    <span className="mrow-when"><b>{time}</b>{day}</span>
                    <span className="mrow-home">{match.home.name}</span>
                    <span className="mrow-center"><PredictionMark prediction={match.prediction} /></span>
                    <span className="mrow-away">{match.away.name}</span>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>

      <aside className="stack" aria-label="Regras do bolão">
        <section aria-labelledby="overview-rules">
          <h3 id="overview-rules" className="block-title">Regras</h3>
          <dl className="facts">
            <div><dt>Partidas</dt><dd>{pool.matches.length} em {rounds.size} {rounds.size === 1 ? 'rodada' : 'rodadas'}</dd></div>
            <div><dt>Taxa de entrada</dt><dd>{Number(pool.entryFee) === 0 ? 'Sem taxa' : formatBrl(pool.entryFee)}</dd></div>
            <div><dt>Premiação</dt><dd>{prizeModelLabels[pool.prizeModel] ?? pool.prizeModel}</dd></div>
            <div><dt>Desempate</dt><dd>{tiebreakerLabels[pool.tiebreaker] ?? pool.tiebreaker}</dd></div>
            <div><dt>Pontuação</dt><dd>Resultado 2 · placar exato 5</dd></div>
            <div><dt>Resultados ao vivo</dt><dd>{pool.liveResults ? 'Sim' : 'Não'}</dd></div>
          </dl>
        </section>
        <section aria-labelledby="overview-conditions">
          <h3 id="overview-conditions" className="block-title">Condições de participação</h3>
          <ul className="rule-list">
            {rules.participationConditions.map((condition) => <li key={condition}>{condition}</li>)}
          </ul>
        </section>
        {!summary.awaitingPayment && <LeaveSection {...leave} role={rules.requesterRole} poolStatus={pool.status} />}
      </aside>
    </div>
  )
}

function ManageTab({ token, poolId, onSessionRejected, onChanged }) {
  // Incrementado a cada decisão de entrada, para recarregar a lista de participantes.
  const [membersVersion, setMembersVersion] = useState(0)
  return (
    <div className="tab-body tab-split">
      <div className="stack">
        <RequestsSection
          token={token}
          poolId={poolId}
          onSessionRejected={onSessionRejected}
          onDecided={() => { setMembersVersion((current) => current + 1); onChanged() }}
        />
        <ParticipantsSection key={membersVersion} token={token} poolId={poolId} onSessionRejected={onSessionRejected} />
      </div>
      <InvitesSection token={token} poolId={poolId} onSessionRejected={onSessionRejected} />
    </div>
  )
}

// Página de um bolão: cabeçalho com os números do participante e navegação por abas.
export default function PoolView({ token, poolId, initialTab = 'overview', notice, onSessionRejected, onBack, onLeft }) {
  const [summary, setSummary] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState(initialTab)
  const [version, setVersion] = useState(0)

  const handleLoadError = useEffectEvent((error) => {
    if (isSessionRejected(error)) onSessionRejected()
    else setLoadError(error.message)
  })

  // Recarrega o resumo ao abrir o bolão e depois de mudanças nas abas (palpite salvo, decisão).
  useEffect(() => {
    let active = true
    loadSummary(token, poolId).then((result) => {
      if (active) setSummary(result)
    }).catch((error) => {
      if (active) handleLoadError(error)
    })
    return () => { active = false }
  }, [token, poolId, version])

  if (loadError) {
    return (
      <>
        <button type="button" className="back-link" onClick={onBack}><ArrowLeft size={14} aria-hidden="true" /> Meus bolões</button>
        <h2 id="auth-title" className="sr-only">Bolão</h2>
        <p className="form-message" role="alert">{loadError}</p>
      </>
    )
  }
  if (!summary) {
    return <p className="tab-loading" role="status"><LoaderCircle size={14} className="spin" /> <span id="auth-title">Carregando bolão...</span></p>
  }

  const visibleTabs = tabs.filter((item) => (!item.member || !summary.awaitingPayment) && (!item.manager || summary.manager))
  const activeTab = visibleTabs.some(({ id }) => id === tab) ? tab : 'overview'
  const missing = openMatches(summary.predictions).filter(({ prediction }) => !prediction).length
  const badges = { predictions: missing, manage: summary.pendingRequests }
  const shared = { token, poolId, onSessionRejected }
  const refresh = () => setVersion((current) => current + 1)

  return (
    <div className="pool-view">
      <PoolHeader summary={summary} onBack={onBack} payment={{ ...shared, onConfirmed: refresh }} />
      {notice && <p className="form-message form-message-success" role="status">{notice}</p>}

      <nav className="pool-tabs" aria-label="Seções do bolão">
        {visibleTabs.map((item) => (
          <button key={item.id} type="button" aria-current={activeTab === item.id ? 'page' : undefined} onClick={() => setTab(item.id)}>
            {item.label}
            {badges[item.id] > 0 && <span className="tab-badge" aria-label={`${badges[item.id]} pendentes`}>{badges[item.id]}</span>}
          </button>
        ))}
      </nav>

      <div className="tab-panel" key={activeTab}>
        {activeTab === 'overview' && <OverviewTab summary={summary} onTab={setTab} leave={{ token, poolId, onSessionRejected, onLeft }} />}
        {activeTab === 'predictions' && <PredictionsPage {...shared} onChanged={refresh} />}
        {activeTab === 'results' && <ResultsPage {...shared} />}
        {activeTab === 'points' && <PointsPage {...shared} />}
        {activeTab === 'ranking' && <RankingPage {...shared} />}
        {activeTab === 'medals' && <MedalsPage {...shared} />}
        {activeTab === 'manage' && <ManageTab {...shared} onChanged={refresh} />}
      </div>
    </div>
  )
}
