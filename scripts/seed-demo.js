// Popula o banco local de desenvolvimento com dados de demonstração (bolões, participantes,
// palpites, resultados, pontos, ranking e medalhas) ligados a uma conta já existente.
//
// Uso: npm run seed:demo -- [email-da-conta]   (padrão: teste@gmail.com)
//
// - Faz backup do banco em data/ antes de alterar qualquer coisa.
// - Usa a própria API do backend (mesmas regras e validações), com um relógio de demonstração:
//   em 14/11/2026 cria bolões, entradas e palpites; em 26/11/2026 sincroniza os resultados
//   simulados das rodadas 1 e 2, pontua e concede medalhas. Da rodada 3 em diante tudo fica
//   aberto para palpites pela interface.
// - Não precisa da senha da conta: cria uma sessão temporária para ela e a revoga ao terminar.
// - Recusa rodar de novo se os usuários de demonstração já existirem.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import path from 'node:path'
import { createApp } from '../src/backend/app.js'
import { createSimulatedSportsProvider } from '../src/backend/adapters/simulated-sports-provider.js'
import { createDatabase, defaultDatabasePath } from '../src/backend/shared/database.js'
import { createLogger } from '../src/backend/shared/logger.js'
import { runMigrations } from '../src/backend/shared/migrations.js'

const accountEmail = (process.argv[2] || 'teste@gmail.com').trim().toLowerCase()
const demoPassword = 'demo-palpite-2026'
const preparationTime = Date.UTC(2026, 10, 14, 12, 0, 0)
const resultsTime = Date.UTC(2026, 10, 26, 6, 0, 0)

const demoUsers = [
  { key: 'ana', name: 'Ana Souza', skill: 0.75 },
  { key: 'bruno', name: 'Bruno Lima', skill: 0.55 },
  { key: 'carla', name: 'Carla Mendes', skill: 0.6 },
  { key: 'diego', name: 'Diego Rocha', skill: 0.4 },
  { key: 'elisa', name: 'Elisa Prado', skill: 0.5 },
  { key: 'fabio', name: 'Fábio Nunes', skill: 0.45 },
]

function fail(message) {
  console.error(`\n✖ ${message}`)
  process.exit(1)
}

// Gerador pseudoaleatório determinístico, para que a demonstração seja sempre a mesma.
function createRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

const database = createDatabase()
runMigrations(database)

const account = database.prepare("SELECT id, name FROM users WHERE normalized_email = ? AND status = 'active'").get(accountEmail)
if (!account) fail(`A conta ${accountEmail} não existe neste banco. Cadastre-a pela interface e rode de novo.`)
const alreadySeeded = database.prepare('SELECT COUNT(*) AS count FROM users WHERE normalized_email LIKE ?').get('%.demo@example.com').count
if (alreadySeeded > 0) fail('Os dados de demonstração já existem neste banco. Restaure o backup em data/ para popular de novo.')
const ownedActive = database.prepare("SELECT COUNT(*) AS count FROM pools WHERE creator_id = ? AND status = 'active'").get(account.id).count
if (ownedActive > 0) fail(`A conta ${accountEmail} já administra um bolão ativo; o plano gratuito permite só um.`)

const backupPath = path.join(path.dirname(defaultDatabasePath), `palpite-league.backup-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
await database.backup(process.env.DATABASE_PATH ? path.resolve(process.env.DATABASE_PATH + '.backup') : backupPath)
console.log(`Backup do banco salvo em ${process.env.DATABASE_PATH ? process.env.DATABASE_PATH + '.backup' : backupPath}`)

const clock = { current: preparationTime }
const now = () => clock.current
const provider = createSimulatedSportsProvider({ now })
const app = createApp(database, { logger: createLogger(() => {}), now, sportsProvider: provider, interfaceBaseUrl: 'http://localhost:5173' })
const server = createServer(app)
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const createdSessions = []

async function call(method, route, { token, body } = {}) {
  const response = await fetch(`${origin}${route}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const json = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`${method} ${route} → ${response.status} ${json?.type ?? ''} ${json?.message ?? ''}`)
  return json
}

try {
  // Sessão temporária para a conta existente, revogada no fim.
  const accountToken = randomBytes(32).toString('base64url')
  const accountSessionId = randomUUID()
  database.prepare(`
    INSERT INTO auth_sessions (id, user_id, token_hash, issued_at, expires_at) VALUES (?, ?, ?, ?, ?)
  `).run(accountSessionId, account.id, createHash('sha256').update(accountToken).digest('hex'), clock.current, Number.MAX_SAFE_INTEGER)
  createdSessions.push(accountSessionId)
  const me = { key: 'me', name: account.name, id: account.id, token: accountToken, skill: 0.7 }

  const users = { me }
  for (const demo of demoUsers) {
    const email = `${demo.key}.demo@example.com`
    await call('POST', '/auth/register', { body: { name: demo.name, email, password: demoPassword } })
    const login = await call('POST', '/auth/login', { body: { email, password: demoPassword } })
    users[demo.key] = { ...demo, token: login.token, id: login.user?.id ?? database.prepare('SELECT id FROM users WHERE normalized_email = ?').get(email).id }
  }

  async function createPool(owner, { name, rounds, tiebreaker, entryFee = 0 }) {
    const result = await call('POST', '/pools', {
      token: owner.token,
      body: {
        name,
        startsOn: '2026-11-14',
        endsOn: '2026-12-31',
        entryFee,
        prizeModel: 'winner_takes_all',
        tiebreaker,
        selection: { roundNumbers: rounds },
      },
    })
    return { id: result.pool.id, name, matches: result.pool.matches, owner }
  }

  async function invite(manager, poolId) {
    const link = (await call('POST', `/pools/${poolId}/invites`, { token: manager.token })).invite.link
    return new URL(link).hash.replace('#invite=', '')
  }

  async function requestEntry(manager, user, poolId) {
    const code = await invite(manager, poolId)
    const result = await call('POST', '/invites/requests', { token: user.token, body: { code, rulesAccepted: true, lateEntryAcknowledged: true } })
    return result.participation.id
  }

  async function join(manager, user, poolId) {
    const participationId = await requestEntry(manager, user, poolId)
    await call('POST', `/pools/${poolId}/requests/${participationId}/approve`, { token: manager.token })
    return participationId
  }

  console.log('Criando bolões e participações...')
  const firma = await createPool(me, { name: 'Bolão da Firma', rounds: [1, 2, 3, 4], tiebreaker: 'exact_scores' })
  const anaInFirma = await join(me, users.ana, firma.id)
  for (const key of ['bruno', 'carla', 'diego']) await join(me, users[key], firma.id)
  await call('POST', `/pools/${firma.id}/participants/${anaInFirma}/promote`, { token: me.token })
  await requestEntry(me, users.elisa, firma.id)
  await invite(me, firma.id)

  const familia = await createPool(users.ana, { name: 'Bolão da Família', rounds: [2, 3], tiebreaker: 'correct_results' })
  for (const key of ['me', 'bruno', 'fabio']) await join(users.ana, users[key], familia.id)

  const valendo = await createPool(users.bruno, { name: 'Bolão Valendo (com taxa)', rounds: [3, 4], tiebreaker: 'last_round_points', entryFee: 20 })
  for (const key of ['me', 'carla']) await join(users.bruno, users[key], valendo.id)

  // Placares que o provedor simulado vai informar em 26/11, para calibrar a "habilidade" de cada um.
  const finalScores = new Map((await createSimulatedSportsProvider({ now: () => resultsTime }).fetchResults(2026)).matches
    .filter(({ status }) => status === 'finished').map(({ id, homeScore, awayScore }) => [id, { home: homeScore, away: awayScore }]))
  const providerIdOf = (matchId) => database.prepare('SELECT provider_id FROM sports_matches WHERE id = ?').get(matchId).provider_id
  const outcome = ({ home, away }) => (home > away ? 'home' : home < away ? 'away' : 'draw')
  const otherOutcome = (value) => ({ home: 'draw', draw: 'away', away: 'home' })[value]

  function predictionFor(user, match, random) {
    if (random() < 0.15) return null
    const actual = finalScores.get(providerIdOf(match.id))
    const guessResult = random() < 0.55
    if (!actual) {
      return guessResult
        ? { type: 'result', outcome: ['home', 'draw', 'away'][Math.floor(random() * 3)] }
        : { type: 'exact_score', homeGoals: Math.floor(random() * 4), awayGoals: Math.floor(random() * 3) }
    }
    const hit = random() < user.skill
    if (guessResult) return { type: 'result', outcome: hit ? outcome(actual) : otherOutcome(outcome(actual)) }
    if (hit && random() < 0.5) return { type: 'exact_score', homeGoals: actual.home, awayGoals: actual.away }
    return { type: 'exact_score', homeGoals: (actual.home + 1) % 4, awayGoals: actual.away }
  }

  console.log('Registrando palpites...')
  let predictionCount = 0
  const random = createRandom(2026)
  for (const pool of [firma, familia]) {
    const members = pool === firma ? ['me', 'ana', 'bruno', 'carla', 'diego'] : ['ana', 'me', 'bruno', 'fabio']
    for (const key of members) {
      for (const match of pool.matches) {
        const prediction = predictionFor(users[key], match, random)
        if (!prediction) continue
        await call('PUT', `/pools/${pool.id}/matches/${match.id}/prediction`, { token: users[key].token, body: prediction })
        predictionCount += 1
      }
    }
  }

  console.log('Avançando o relógio de demonstração para 26/11/2026 e processando resultados...')
  clock.current = resultsTime
  const sync = await app.locals.tasks.syncResults()
  if (!sync.ok) throw new Error(`Sincronização de resultados falhou: ${sync.failure}`)
  const scoring = app.locals.tasks.scorePredictions()
  const medals = app.locals.tasks.reconcileMedals()

  console.log('\n✔ Banco populado.')
  console.log(`  Bolões: "${firma.name}" (você administra), "${familia.name}" (você participa), "${valendo.name}" (você aguarda pagamento)`)
  console.log(`  Palpites: ${predictionCount} · resultados registrados: ${sync.recorded} · partidas pontuadas: ${scoring.processedMatches} · medalhas: ${medals.awarded}`)
  console.log(`  Usuários de demonstração: ${demoUsers.map(({ key }) => `${key}.demo@example.com`).join(', ')}`)
  console.log(`  Senha deles: ${demoPassword}`)
} catch (error) {
  console.error(`\n✖ ${error.message}`)
  console.error('  O banco pode ter ficado parcialmente populado; restaure o backup indicado acima se precisar.')
  process.exitCode = 1
} finally {
  // Revoga as sessões abertas pelo script (inclusive a temporária da sua conta).
  database.prepare(`
    UPDATE auth_sessions SET revoked_at = ?
    WHERE revoked_at IS NULL AND (id IN (${createdSessions.map(() => '?').join(',') || "''"})
      OR user_id IN (SELECT id FROM users WHERE normalized_email LIKE '%.demo@example.com'))
  `).run(Date.now(), ...createdSessions)
  await new Promise((resolve) => server.close(resolve))
  database.close()
}
