import assert from 'node:assert/strict'
import test from 'node:test'
import { createApiFootballSportsProvider } from '../../src/backend/adapters/api-football-sports-provider.js'
import { simulatedTeamNames } from '../../src/backend/adapters/simulated-sports-provider.js'
import { expectCommonFormat, hour, withHttpApp } from './support/app-harness.js'

// SPEC-031 — escolha de partidas por modo e por times, e consulta somente leitura da API-Football 2024.
// Catálogo simulado: rodada N entre 20/11/2026 + 3·(N−1) dias e os dois dias seguintes; relógio em 14/11/2026.

async function teamId(context, owner, name) {
  const { teams } = (await context.call('GET', '/catalog/teams', { token: owner.token })).json
  return teams.find((team) => team.name === name).id
}

function createWith(context, owner, selection, period = {}) {
  return context.call('POST', '/pools', {
    token: owner.token,
    body: {
      name: 'Bolão', startsOn: '2026-11-14', endsOn: '2026-12-31', entryFee: 0,
      prizeModel: 'winner_takes_all', tiebreaker: 'exact_scores', selection, ...period,
    },
  })
}

const plays = (names) => (match) => names.includes(match.home.name) || names.includes(match.away.name)

test('TC-05: o catálogo lista os 20 clubes em ordem alfabética', async () => {
  await withHttpApp(async (context) => {
    const owner = await context.signUp('Ana')
    const response = await context.call('GET', '/catalog/teams', { token: owner.token })
    assert.equal(response.status, 200, response.text)
    assert.deepEqual(response.json.teams.map(({ name }) => name), [...simulatedTeamNames].sort((a, b) => a.localeCompare(b, 'pt-BR')))
    assert.equal((await context.call('GET', '/catalog/teams')).status, 401)
  })
})

test('TC-01: "todas as rodadas do período" inclui só as partidas elegíveis dentro do período', async () => {
  await withHttpApp(async (context) => {
    const owner = await context.signUp('Ana')
    // Rodadas 1 (20 a 22/11, com 1 partida adiada) e 2 (23 a 25/11): 9 + 10 partidas.
    const response = await createWith(context, owner, { mode: 'all_in_period' }, { endsOn: '2026-11-25' })
    assert.equal(response.status, 201, response.text)
    const { matches } = response.json.pool
    assert.equal(matches.length, 19)
    assert.ok(matches.every((match) => match.status === 'scheduled' && match.startsAt.slice(0, 10) <= '2026-11-25'))
  })
})

test('TC-02: o filtro de times inclui os jogos em que ao menos um time escolhido joga', async () => {
  await withHttpApp(async (context) => {
    const owner = await context.signUp('Ana')
    const flamengo = await teamId(context, owner, 'Flamengo')
    const palmeiras = await teamId(context, owner, 'Palmeiras')

    const all = await createWith(context, owner, { mode: 'all_in_period', teamIds: [flamengo] })
    assert.equal(all.status, 201, all.text)
    assert.ok(all.json.pool.matches.length >= 13)
    assert.ok(all.json.pool.matches.every(plays(['Flamengo'])))

    const other = await context.signUp('Bruno')
    const rounds = await createWith(context, other, { mode: 'rounds', roundNumbers: [2, 3], teamIds: [flamengo, palmeiras] })
    assert.equal(rounds.status, 201, rounds.text)
    assert.ok(rounds.json.pool.matches.length >= 2 && rounds.json.pool.matches.length <= 4)
    assert.ok(rounds.json.pool.matches.every(plays(['Flamengo', 'Palmeiras'])))
    assert.ok(rounds.json.pool.matches.every(({ roundNumber }) => [2, 3].includes(roundNumber)))
  })
})

test('TC-03: recusa escolha sem partidas, time inexistente e modo sem o que escolher', async () => {
  await withHttpApp(async (context) => {
    const owner = await context.signUp('Ana')
    const flamengo = await teamId(context, owner, 'Flamengo')

    const empty = await createWith(context, owner, { mode: 'all_in_period', teamIds: [flamengo] }, { endsOn: '2026-11-15' })
    expectCommonFormat(empty, 400, 'validation_error')
    assert.match(empty.json.fields.selection, /Não há partidas agendadas com os times escolhidos/)

    const unknown = await createWith(context, owner, { mode: 'all_in_period', teamIds: ['time-que-nao-existe'] })
    assert.match(unknown.json.fields.selection, /times escolhidos não existem/)

    const noRounds = await createWith(context, owner, { mode: 'rounds', roundNumbers: [] })
    assert.match(noRounds.json.fields.selection, /ao menos uma rodada/)

    const badMode = await createWith(context, owner, { mode: 'tudo' })
    assert.ok(badMode.json.fields.selection)
    assert.equal(context.database.prepare('SELECT COUNT(*) AS n FROM pools').get().n, 0)
  })
})

test('TC-04: o formato da SPEC-007 (partidas e rodadas, sem modo) continua aceito', async () => {
  await withHttpApp(async (context) => {
    const owner = await context.signUp('Ana')
    const response = await createWith(context, owner, { roundNumbers: [2] })
    assert.equal(response.status, 201, response.text)
    assert.equal(response.json.pool.matches.length, 10)
  })
})

// Resposta gravada da API-Football (formato de /fixtures), sem acesso à rede (RNF18).
const recordedFixtures = {
  errors: [],
  response: [
    {
      fixture: { id: 1180002, date: '2024-04-14T21:00:00+00:00', status: { short: 'FT' } },
      league: { round: 'Regular Season - 1' },
      teams: { home: { id: 127, name: 'Flamengo', logo: 'https://media.api-sports.io/football/teams/127.png' }, away: { id: 134, name: 'Atletico Paranaense', logo: 'https://media.api-sports.io/football/teams/134.png' } },
      goals: { home: 2, away: 0 },
    },
    {
      fixture: { id: 1180001, date: '2024-04-13T21:30:00+00:00', status: { short: 'FT' } },
      league: { round: 'Regular Season - 1' },
      teams: { home: { id: 121, name: 'Palmeiras', logo: 'https://media.api-sports.io/football/teams/121.png' }, away: { id: 794, name: 'Vitoria', logo: '' } },
      goals: { home: 0, away: 0 },
    },
    {
      fixture: { id: 1180400, date: '2024-12-08T19:00:00+00:00', status: { short: 'FT' } },
      league: { round: 'Regular Season - 38' },
      teams: { home: { id: 121, name: 'Palmeiras', logo: null }, away: { id: 127, name: 'Flamengo', logo: null } },
      goals: { home: 0, away: 1 },
    },
  ],
}

test('TC-06: a consulta de 2024 mostra rodadas, jogos e placares reais, com uma chamada por janela de cache', async () => {
  const requests = []
  const showcaseProvider = createApiFootballSportsProvider({
    apiKey: 'chave-secreta-de-teste',
    fetcher: async (url, options) => {
      requests.push({ url: String(url), key: options.headers['x-apisports-key'] })
      return { ok: true, json: async () => recordedFixtures }
    },
  })
  await withHttpApp(async (context) => {
    const owner = await context.signUp('Ana')
    const status = await context.call('GET', '/catalog/showcase', { token: owner.token })
    assert.deepEqual(status.json, { apiFootball2024: { configured: true, season: 2024 } })

    const first = await context.call('GET', '/catalog/showcase/api-football-2024', { token: owner.token })
    assert.equal(first.status, 200, first.text)
    assert.equal(first.json.season, 2024)
    assert.equal(first.json.stale, false)
    assert.deepEqual(first.json.rounds.map(({ number }) => number), [1, 38])
    assert.deepEqual(first.json.rounds[0].matches.map(({ id }) => id), ['1180001', '1180002'])
    assert.deepEqual(first.json.rounds[0].matches[1].home, { name: 'Flamengo', crest: 'https://media.api-sports.io/football/teams/127.png', score: 2 })
    assert.deepEqual(first.json.rounds[0].matches[0].away, { name: 'Vitoria', crest: null, score: 0 })
    assert.equal(first.json.rounds[1].matches[0].status, 'finished')

    await context.call('GET', '/catalog/showcase/api-football-2024', { token: owner.token })
    assert.equal(requests.length, 1)
    assert.match(requests[0].url, /league=71/)
    assert.match(requests[0].url, /season=2024/)

    context.clock.current += 25 * hour
    await context.call('GET', '/catalog/showcase/api-football-2024', { token: owner.token })
    assert.equal(requests.length, 2)

    // Nada vai para o catálogo dos bolões (INV-004) e a chave nunca aparece nas respostas.
    assert.equal(context.database.prepare("SELECT COUNT(*) AS n FROM sports_teams WHERE name = 'Atletico Paranaense'").get().n, 0)
    assert.equal(context.responses.join('').includes('chave-secreta-de-teste'), false)
  }, { showcaseProvider })
})

test('TC-07: sem chave configurada a consulta fica indisponível; com falha, usa a cópia anterior', async () => {
  await withHttpApp(async (context) => {
    const owner = await context.signUp('Ana')
    assert.equal((await context.call('GET', '/catalog/showcase', { token: owner.token })).json.apiFootball2024.configured, false)
    expectCommonFormat(await context.call('GET', '/catalog/showcase/api-football-2024', { token: owner.token }), 503, 'showcase_not_configured')
  }, { showcaseProvider: null })

  let fail = false
  const showcaseProvider = {
    async fetchSeasonShowcase() {
      if (fail) throw new Error('limite diário atingido')
      return { rounds: [{ number: 1, matches: [] }] }
    },
  }
  await withHttpApp(async (context) => {
    const owner = await context.signUp('Ana')
    const fresh = await context.call('GET', '/catalog/showcase/api-football-2024', { token: owner.token })
    assert.equal(fresh.json.stale, false)
    fail = true
    context.clock.current += 25 * hour
    const stale = await context.call('GET', '/catalog/showcase/api-football-2024', { token: owner.token })
    assert.equal(stale.status, 200, stale.text)
    assert.equal(stale.json.stale, true)
    assert.equal(stale.json.fetchedAt, fresh.json.fetchedAt)
  }, { showcaseProvider })

  await withHttpApp(async (context) => {
    const owner = await context.signUp('Ana')
    expectCommonFormat(await context.call('GET', '/catalog/showcase/api-football-2024', { token: owner.token }), 503, 'showcase_unavailable')
  }, { showcaseProvider: { async fetchSeasonShowcase() { throw new Error('sem rede') } } })
})
