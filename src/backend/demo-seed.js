import { billingPolicyVersion } from './modules/payments-subscriptions/premium-subscription.js'

// Dados de demonstração do deploy (SEED_DEMO_DATA=true): na primeira subida, com o banco sem nenhum
// usuário, cria contas de teste, bolões, entradas, taxas pagas no simulador e palpites. Tudo passa
// pela API do próprio servidor, com as mesmas regras e validações da interface; nada de dados
// pessoais fica versionado no repositório.

export const demoPassword = '12345678'
const demoAccounts = Array.from({ length: 9 }, (_, index) => index + 2) // teste2..teste10
const classicTeams = ['Flamengo', 'Palmeiras', 'Corinthians', 'São Paulo']

const isoDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(new Date(ms))

function createRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

export function needsDemoSeed(database) {
  return database.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0
}

export async function seedDemoData({ baseUrl, now = Date.now, fetcher = fetch }) {
  async function call(method, route, { token, body } = {}) {
    const response = await fetcher(`${baseUrl}${route}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const json = await response.json().catch(() => null)
    if (!response.ok) throw new Error(`${method} ${route} ${response.status} ${json?.type ?? ''}`)
    return json
  }

  const tokens = {}
  for (const n of demoAccounts) {
    const email = `teste${n}@gmail.com`
    await call('POST', '/auth/register', { body: { name: `Teste ${n}`, email, password: demoPassword } })
    tokens[n] = (await call('POST', '/auth/login', { body: { email, password: demoPassword } })).token
  }

  // teste2 é Premium (pagamento no simulador), para administrar mais de um bolão.
  const subscription = (await call('POST', '/account/premium/subscription', {
    token: tokens[2], body: { confirm: true, billingPolicyVersion, billingCycle: 'monthly' },
  })).subscription
  await call('POST', `/payments/simulated-checkout/${subscription.movementId}/decision`, { token: tokens[2], body: { decision: 'approve' } })
  await call('POST', '/account/premium/subscription/check', { token: tokens[2] })

  // Rodadas ainda sem nenhum jogo iniciado, a partir de amanhã.
  const today = isoDay(now())
  const tomorrow = isoDay(now() + 24 * 60 * 60 * 1000)
  const { rounds } = await call('GET', '/catalog/rounds', { token: tokens[2] })
  const upcoming = rounds.filter((round) => round.startsOn && round.startsOn >= tomorrow).map(({ number }) => number)
  const { teams } = await call('GET', '/catalog/teams', { token: tokens[2] })
  const teamIds = teams.filter(({ name }) => classicTeams.includes(name)).map(({ id }) => id)
  const endsOn = isoDay(now() + 36 * 24 * 60 * 60 * 1000)

  const pools = [
    {
      admin: 2, members: [3, 4, 5, 6, 7, 8, 9, 10],
      body: { name: 'Bolão da Turma', entryFee: '0', prizeModel: 'podium_50_30_20', tiebreaker: 'exact_scores', selection: { mode: 'all_in_period' } },
    },
    {
      admin: 3, members: [2, 4, 5, 6, 7],
      body: { name: 'Bolão Valendo', entryFee: '10.00', prizeModel: 'winner_takes_all', tiebreaker: 'correct_results', selection: { mode: 'rounds', roundNumbers: upcoming.slice(0, 3) } },
    },
    {
      admin: 2, members: [5, 8, 9, 10],
      body: { name: 'Bolão dos Clássicos', entryFee: '0', prizeModel: 'podium_70_20_10', tiebreaker: 'last_round_points', selection: { mode: 'rounds', roundNumbers: upcoming.slice(0, 6), teamIds } },
    },
  ]

  const random = createRandom(2026)
  let predictions = 0
  for (const definition of pools) {
    const admin = tokens[definition.admin]
    const { pool } = await call('POST', '/pools', { token: admin, body: { startsOn: today, endsOn, ...definition.body } })
    const hasFee = Number(definition.body.entryFee) > 0

    async function payIfNeeded(n) {
      if (!hasFee) return
      const started = await call('POST', `/pools/${pool.id}/entry-fee/payment`, { token: tokens[n] })
      await call('POST', `/payments/simulated-checkout/${started.payment.id}/decision`, { token: tokens[n], body: { decision: 'approve' } })
      await call('POST', `/pools/${pool.id}/entry-fee/payment/check`, { token: tokens[n] })
    }

    await payIfNeeded(definition.admin)
    for (const n of definition.members) {
      const { invite } = await call('POST', `/pools/${pool.id}/invites`, { token: admin })
      const code = invite.link.split('#invite=')[1]
      const { participation } = await call('POST', '/invites/requests', { token: tokens[n], body: { code, rulesAccepted: true, lateEntryAcknowledged: true } })
      await call('POST', `/pools/${pool.id}/requests/${participation.id}/approve`, { token: admin })
      await payIfNeeded(n)
    }

    const open = pool.matches.filter((match) => match.status === 'scheduled' && Date.parse(match.startsAt) > now() + 60 * 1000)
    for (const n of [definition.admin, ...definition.members]) {
      for (const match of open) {
        if (random() < 0.2) continue
        const body = random() < 0.5
          ? { type: 'result', outcome: ['home', 'draw', 'away'][Math.floor(random() * 3)] }
          : { type: 'exact_score', homeGoals: Math.floor(random() * 4), awayGoals: Math.floor(random() * 3) }
        await call('PUT', `/pools/${pool.id}/matches/${match.id}/prediction`, { token: tokens[n], body })
        predictions += 1
      }
    }
  }

  // As sessões abertas para montar os dados não ficam ativas.
  for (const token of Object.values(tokens)) await call('POST', '/auth/logout', { token })
  return { accounts: demoAccounts.length, pools: pools.length, predictions }
}
