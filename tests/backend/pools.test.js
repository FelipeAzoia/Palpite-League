import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import test from 'node:test'
import { createApp } from '../../src/backend/app.js'
import { createSimulatedSportsProvider } from '../../src/backend/adapters/simulated-sports-provider.js'
import { createAuditStore } from '../../src/backend/modules/notifications-audit/index.js'
import { SportsProviderError } from '../../src/backend/modules/matches-results/sports-provider.js'
import { createDatabase } from '../../src/backend/shared/database.js'
import { createLogger } from '../../src/backend/shared/logger.js'
import { runMigrations } from '../../src/backend/shared/migrations.js'

const password = 'senha-segura-123'
// 13/11/2026 12:00 em São Paulo; as partidas simuladas começam em 20/11/2026.
const startOfTests = Date.UTC(2026, 10, 13, 15, 0, 0)
const today = '2026-11-13'

async function withHttpApp(options, callback) {
  const database = createDatabase(':memory:')
  runMigrations(database)
  const events = []
  const logger = createLogger((event) => events.push(event))
  const clock = { current: startOfTests }
  const server = createServer(createApp(database, { logger, now: () => clock.current, ...options }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const responses = []

  async function call(method, route, { token, body } = {}) {
    const response = await fetch(`${origin}${route}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const text = await response.text()
    responses.push(text)
    let json
    try { json = JSON.parse(text) } catch { json = null }
    return { status: response.status, headers: response.headers, text, json }
  }

  async function signUp(name, email) {
    await call('POST', '/auth/register', { body: { name, email, password } })
    return (await call('POST', '/auth/login', { body: { email, password } })).json.token
  }

  async function scheduledMatchIds(token, roundNumber) {
    const response = await call('GET', `/catalog/rounds/${roundNumber}/matches?status=scheduled`, { token })
    return response.json.matches.map((match) => match.id)
  }

  const auditStore = createAuditStore(database, { logger })
  try {
    await callback({ call, signUp, scheduledMatchIds, database, events, responses, clock, auditStore })
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    database.close()
  }
}

function poolBody(matchIds, overrides = {}) {
  return {
    name: 'Bolão dos Amigos',
    startsOn: today,
    endsOn: '2026-12-31',
    entryFee: 0,
    prizeModel: 'winner_takes_all',
    tiebreaker: 'exact_scores',
    selection: { matchIds },
    ...overrides,
  }
}

// Desde a SPEC-019 o banco só aceita o Premium com uma assinatura ativa; o teste a cria diretamente.
function setPlan(database, email, plan) {
  const { id } = database.prepare('SELECT id FROM users WHERE normalized_email = ?').get(email)
  const hasActive = database.prepare("SELECT 1 FROM subscriptions WHERE user_id = ? AND status = 'active'").get(id)
  if (plan === 'premium' && !hasActive) {
    database.prepare(`
      INSERT INTO subscriptions (id, user_id, status, amount_cents, currency, recurrence, origin, starts_at, ends_at, created_at, updated_at)
      VALUES (?, ?, 'active', 1990, 'BRL', 'monthly', 'simulator', ?, ?, ?, ?)
    `).run(randomUUID(), id, '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')
  }
  database.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, id)
}

function counts(database) {
  return {
    pools: database.prepare('SELECT COUNT(*) AS count FROM pools').get().count,
    matches: database.prepare('SELECT COUNT(*) AS count FROM pool_matches').get().count,
    participations: database.prepare('SELECT COUNT(*) AS count FROM pool_participations').get().count,
  }
}

async function createPool(call, token, matchIds, overrides = {}) {
  return call('POST', '/pools', { token, body: poolBody(matchIds, overrides) })
}

test('TC-01: bolão válido sem taxa grava regras, status, participação do criador e auditoria', async () => {
  await withHttpApp({}, async ({ call, signUp, scheduledMatchIds, database, auditStore }) => {
    const token = await signUp('Ana', 'ana@example.com')
    const matchIds = (await scheduledMatchIds(token, 2)).slice(0, 3)

    const response = await createPool(call, token, matchIds, { name: '  Bolão da Turma  ' })

    assert.equal(response.status, 201)
    const { pool, participation } = response.json
    assert.equal(pool.name, 'Bolão da Turma')
    assert.equal(pool.status, 'active')
    assert.equal(pool.startsOn, today)
    assert.equal(pool.endsOn, '2026-12-31')
    assert.equal(pool.entryFee, '0.00')
    assert.equal(pool.prizeModel, 'winner_takes_all')
    assert.equal(pool.tiebreaker, 'exact_scores')
    assert.equal(pool.liveResults, false)
    assert.equal(pool.matches.length, 3)
    assert.deepEqual(participation, { role: 'administrator', status: 'confirmed', paymentConfirmed: true })
    assert.deepEqual(counts(database), { pools: 1, matches: 3, participations: 1 })

    const row = database.prepare('SELECT * FROM pool_participations').get()
    assert.equal(row.role, 'administrator')
    assert.equal(row.payment_confirmed, 1)
    assert.ok(row.rules_accepted_at)
    assert.equal(row.joined_at, row.rules_accepted_at)
    const records = auditStore.findByObject({ type: 'pool', id: pool.id })
    assert.equal(records.length, 1)
    assert.equal(records[0].action, 'pool.created')
    assert.equal(records[0].result, 'success')
    assert.equal(records[0].actor.type, 'user')
  })
})

test('TC-02: bolão com taxa deixa o criador aprovado aguardando pagamento', async () => {
  await withHttpApp({}, async ({ call, signUp, scheduledMatchIds, database }) => {
    const token = await signUp('Ana', 'ana@example.com')
    const matchIds = (await scheduledMatchIds(token, 2)).slice(0, 2)

    const response = await createPool(call, token, matchIds, { entryFee: 25 })

    assert.equal(response.status, 201)
    assert.equal(response.json.pool.entryFee, '25.00')
    assert.deepEqual(response.json.participation, { role: 'administrator', status: 'approved_awaiting_payment', paymentConfirmed: false })
    const row = database.prepare('SELECT * FROM pool_participations').get()
    assert.equal(row.payment_confirmed, 0)
    assert.equal(row.joined_at, null)
  })
})

test('TC-03: segundo bolão no Gratuito é impedido com 409, limite e orientação', async () => {
  await withHttpApp({}, async ({ call, signUp, scheduledMatchIds, database }) => {
    const token = await signUp('Ana', 'ana@example.com')
    const matchIds = (await scheduledMatchIds(token, 2)).slice(0, 2)
    assert.equal((await createPool(call, token, matchIds)).status, 201)

    const blocked = await createPool(call, token, matchIds)

    assert.equal(blocked.status, 409)
    assert.equal(blocked.json.type, 'pool_limit_reached')
    assert.deepEqual(blocked.json.details.plan, { id: 'free', name: 'Gratuito' })
    assert.equal(blocked.json.details.limit, 1)
    assert.equal(blocked.json.details.activePools, 1)
    assert.match(blocked.json.details.guidance, /Premium/)
    assert.equal(counts(database).pools, 1)
  })
})

test('TC-04: Premium cria o décimo bolão e é impedido no décimo primeiro', async () => {
  await withHttpApp({}, async ({ call, signUp, scheduledMatchIds, database }) => {
    const token = await signUp('Ana', 'ana@example.com')
    setPlan(database, 'ana@example.com', 'premium')
    const matchIds = (await scheduledMatchIds(token, 2)).slice(0, 2)

    for (let index = 1; index <= 9; index += 1) {
      assert.equal((await createPool(call, token, matchIds, { name: `Bolão ${index}` })).status, 201)
    }
    assert.equal((await createPool(call, token, matchIds, { name: 'Bolão 10' })).status, 201)
    const blocked = await createPool(call, token, matchIds, { name: 'Bolão 11' })

    assert.equal(blocked.status, 409)
    assert.equal(blocked.json.details.limit, 10)
    assert.equal(counts(database).pools, 10)
  })
})

test('TC-05: após voltar ao Gratuito, usuário com bolões ativos não cria e os bolões ficam intactos', async () => {
  await withHttpApp({}, async ({ call, signUp, scheduledMatchIds, database }) => {
    const token = await signUp('Ana', 'ana@example.com')
    setPlan(database, 'ana@example.com', 'premium')
    const matchIds = (await scheduledMatchIds(token, 2)).slice(0, 2)
    await createPool(call, token, matchIds, { name: 'Primeiro' })
    await createPool(call, token, matchIds, { name: 'Segundo' })
    const before = database.prepare('SELECT * FROM pools ORDER BY name').all()
    setPlan(database, 'ana@example.com', 'free')

    const blocked = await createPool(call, token, matchIds, { name: 'Terceiro' })

    assert.equal(blocked.status, 409)
    assert.equal(blocked.json.details.activePools, 2)
    assert.deepEqual(database.prepare('SELECT * FROM pools ORDER BY name').all(), before)
  })
})

test('TC-06: bolão encerrado não conta para o limite', async () => {
  await withHttpApp({}, async ({ call, signUp, scheduledMatchIds, database }) => {
    const token = await signUp('Ana', 'ana@example.com')
    const matchIds = (await scheduledMatchIds(token, 2)).slice(0, 2)
    await createPool(call, token, matchIds)
    database.prepare("UPDATE pools SET status = 'ended'").run()

    const response = await createPool(call, token, matchIds, { name: 'Novo bolão' })

    assert.equal(response.status, 201)
    assert.equal(counts(database).pools, 2)
  })
})

test('TC-07: duas criações simultâneas do mesmo usuário Gratuito concluem apenas uma', async () => {
  await withHttpApp({}, async ({ call, signUp, scheduledMatchIds, database }) => {
    const token = await signUp('Ana', 'ana@example.com')
    const matchIds = (await scheduledMatchIds(token, 2)).slice(0, 2)

    const results = await Promise.all([createPool(call, token, matchIds), createPool(call, token, matchIds)])

    assert.deepEqual(results.map(({ status }) => status).sort(), [201, 409])
    assert.equal(counts(database).pools, 1)
    assert.equal(counts(database).participations, 1)
  })
})

test('TC-08: recurso ao vivo segue o plano do criador na criação e não muda depois', async () => {
  await withHttpApp({}, async ({ call, signUp, scheduledMatchIds, database }) => {
    const token = await signUp('Ana', 'ana@example.com')
    setPlan(database, 'ana@example.com', 'premium')
    const matchIds = (await scheduledMatchIds(token, 2)).slice(0, 2)

    const created = await createPool(call, token, matchIds)
    assert.equal(created.json.pool.liveResults, true)
    setPlan(database, 'ana@example.com', 'free')

    const view = await call('GET', `/pools/${created.json.pool.id}`, { token })
    assert.equal(view.json.pool.liveResults, true)
  })
})

test('TC-09: cada campo obrigatório ausente é rejeitado e indicado, sem criar bolão', async () => {
  await withHttpApp({}, async ({ call, signUp, scheduledMatchIds, database }) => {
    const token = await signUp('Ana', 'ana@example.com')
    const matchIds = (await scheduledMatchIds(token, 2)).slice(0, 2)

    for (const field of ['name', 'startsOn', 'endsOn', 'entryFee', 'prizeModel', 'tiebreaker', 'selection']) {
      const body = poolBody(matchIds)
      delete body[field]
      const response = await call('POST', '/pools', { token, body })
      assert.equal(response.status, 400, field)
      assert.equal(response.json.type, 'validation_error')
      assert.ok(response.json.fields[field], `campo ${field} deve ser indicado`)
    }
    for (const body of [undefined, {}, []]) {
      const response = await call('POST', '/pools', { token, body })
      assert.equal(response.status, 400)
    }
    assert.deepEqual(counts(database), { pools: 0, matches: 0, participations: 0 })
  })
})

test('TC-10: nomes inválidos são rejeitados e espaços nas pontas são removidos', async () => {
  await withHttpApp({}, async ({ call, signUp, scheduledMatchIds, database }) => {
    const token = await signUp('Ana', 'ana@example.com')
    const matchIds = (await scheduledMatchIds(token, 2)).slice(0, 2)

    for (const name of ['', '   ', 'x'.repeat(101), 42, null]) {
      const response = await createPool(call, token, matchIds, { name })
      assert.equal(response.status, 400, String(name))
      assert.ok(response.json.fields.name)
    }
    assert.equal(counts(database).pools, 0)

    const accepted = await createPool(call, token, matchIds, { name: `  ${'x'.repeat(100)}  ` })
    assert.equal(accepted.status, 201)
    assert.equal(accepted.json.pool.name, 'x'.repeat(100))
  })
})

test('TC-11: período e partidas fora do período inválidos são rejeitados', async () => {
  await withHttpApp({}, async ({ call, signUp, scheduledMatchIds, database }) => {
    const token = await signUp('Ana', 'ana@example.com')
    const matchIds = (await scheduledMatchIds(token, 2)).slice(0, 2) // 23/11 a 25/11

    const cases = [
      [{ startsOn: '2026-11-12' }, 'startsOn'],
      [{ endsOn: '2026-11-12' }, 'endsOn'],
      [{ startsOn: '2026-12-01', endsOn: '2026-11-30' }, 'endsOn'],
      [{ startsOn: '2026-02-30' }, 'startsOn'],
      [{ endsOn: 'amanhã' }, 'endsOn'],
      [{ endsOn: '2026-11-22' }, 'selection'],
      [{ startsOn: '2026-11-26', endsOn: '2026-12-31' }, 'selection'],
    ]
    for (const [overrides, field] of cases) {
      const response = await createPool(call, token, matchIds, overrides)
      assert.equal(response.status, 400, JSON.stringify(overrides))
      assert.ok(response.json.fields[field], `${field} para ${JSON.stringify(overrides)}`)
    }
    assert.equal(counts(database).pools, 0)

    const accepted = await createPool(call, token, matchIds, { startsOn: today, endsOn: '2026-11-25' })
    assert.equal(accepted.status, 201)
  })
})

test('TC-12: taxas inválidas são rejeitadas e as válidas nos limites são aceitas', async () => {
  await withHttpApp({}, async ({ call, signUp, scheduledMatchIds, database }) => {
    const token = await signUp('Ana', 'ana@example.com')
    const matchIds = (await scheduledMatchIds(token, 2)).slice(0, 2)

    for (const entryFee of [-1, 0.5, 0.99, 500.01, 1000, 10.999, 12.345, '25,00', 'abc', Number.NaN, true, {}]) {
      const response = await createPool(call, token, matchIds, { entryFee })
      assert.equal(response.status, 400, String(entryFee))
      assert.ok(response.json.fields.entryFee)
    }
    assert.equal(counts(database).pools, 0)

    setPlan(database, 'ana@example.com', 'premium')
    for (const [entryFee, expected] of [[0, '0.00'], [1, '1.00'], [500, '500.00'], [12.5, '12.50'], ['25.75', '25.75'], [0.1 + 0.2 + 9.7, '10.00']]) {
      const response = await createPool(call, token, matchIds, { entryFee, name: `Taxa ${entryFee}` })
      assert.equal(response.status, 201, String(entryFee))
      assert.equal(response.json.pool.entryFee, expected)
    }
  })
})

test('TC-13: premiação e desempate fora do conjunto são rejeitados', async () => {
  await withHttpApp({}, async ({ call, signUp, scheduledMatchIds, database }) => {
    const token = await signUp('Ana', 'ana@example.com')
    const matchIds = (await scheduledMatchIds(token, 2)).slice(0, 2)

    for (const prizeModel of ['divisao_igual', '', 5, null]) {
      const response = await createPool(call, token, matchIds, { prizeModel })
      assert.equal(response.status, 400)
      assert.ok(response.json.fields.prizeModel)
    }
    for (const tiebreaker of ['sorteio', '', 5, null]) {
      const response = await createPool(call, token, matchIds, { tiebreaker })
      assert.equal(response.status, 400)
      assert.ok(response.json.fields.tiebreaker)
    }
    assert.equal(counts(database).pools, 0)

    setPlan(database, 'ana@example.com', 'premium')
    for (const tiebreaker of ['exact_scores', 'correct_results', 'last_round_points']) {
      assert.equal((await createPool(call, token, matchIds, { tiebreaker, name: tiebreaker })).status, 201)
    }
  })
})

test('TC-14: seleção individual, por rodada e combinada, e partidas inelegíveis', async () => {
  await withHttpApp({}, async ({ call, signUp, scheduledMatchIds, database }) => {
    const token = await signUp('Ana', 'ana@example.com')
    setPlan(database, 'ana@example.com', 'premium')
    const roundTwo = await scheduledMatchIds(token, 2)
    const roundThree = await scheduledMatchIds(token, 3)

    const individual = await createPool(call, token, [roundTwo[0], roundThree[0]], { name: 'Individual' })
    assert.equal(individual.status, 201)
    assert.deepEqual(individual.json.matchCountByRound, [{ roundNumber: 2, matchCount: 1 }, { roundNumber: 3, matchCount: 1 }])

    const byRound = await call('POST', '/pools', { token, body: poolBody(undefined, { name: 'Rodada', selection: { roundNumbers: [2] } }) })
    assert.equal(byRound.status, 201)
    assert.deepEqual(byRound.json.matchCountByRound, [{ roundNumber: 2, matchCount: 10 }])

    const combined = await call('POST', '/pools', {
      token,
      body: poolBody(undefined, { name: 'Combinado', selection: { matchIds: [roundTwo[0], roundThree[0], roundThree[0]], roundNumbers: [2, 2] } }),
    })
    assert.equal(combined.status, 201)
    assert.equal(combined.json.pool.matches.length, 11)
    assert.equal(new Set(combined.json.pool.matches.map(({ id }) => id)).size, 11)
    assert.deepEqual(combined.json.matchCountByRound, [{ roundNumber: 2, matchCount: 10 }, { roundNumber: 3, matchCount: 1 }])
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM pool_matches WHERE pool_id = ?').get(combined.json.pool.id).count, 11)

    // A rodada 1 tem uma partida adiada sem data: só as elegíveis entram.
    const roundOne = await call('POST', '/pools', { token, body: poolBody(undefined, { name: 'Rodada 1', selection: { roundNumbers: [1] } }) })
    assert.equal(roundOne.status, 201)
    assert.equal(roundOne.json.matchCountByRound[0].matchCount, 9)
    const created = counts(database).pools

    const [victim, other] = roundTwo
    const ineligible = [
      { matchIds: ['partida-inexistente'] },
      { matchIds: [victim, 'partida-inexistente'] },
      { matchIds: [] },
      { roundNumbers: [] },
      {},
      { roundNumbers: [999] },
      { roundNumbers: [0] },
      { matchIds: 'texto' },
    ]
    for (const selection of ineligible) {
      const response = await call('POST', '/pools', { token, body: poolBody(undefined, { selection }) })
      assert.equal(response.status, 400, JSON.stringify(selection))
      assert.ok(response.json.fields.selection)
    }
    for (const status of ['in_progress', 'finished', 'postponed', 'cancelled']) {
      database.prepare('UPDATE sports_matches SET status = ? WHERE id = ?').run(status, victim)
      const response = await call('POST', '/pools', { token, body: poolBody([victim, other]) })
      assert.equal(response.status, 400, status)
      assert.ok(response.json.fields.selection)
    }
    database.prepare("UPDATE sports_matches SET status = 'scheduled', starts_at = '2026-11-01T19:00:00.000Z' WHERE id = ?").run(victim)
    assert.equal((await call('POST', '/pools', { token, body: poolBody([victim]) })).status, 400)

    database.prepare("UPDATE sports_matches SET status = 'finished' WHERE round_id = (SELECT id FROM sports_rounds WHERE number = 3)").run()
    const emptyRound = await call('POST', '/pools', { token, body: poolBody(undefined, { selection: { roundNumbers: [3] } }) })
    assert.equal(emptyRound.status, 400)
    assert.match(emptyRound.json.fields.selection, /elegíveis/)
    assert.equal(counts(database).pools, created)
  })
})

test('TC-15: falha na participação ou na auditoria não deixa nada persistido', async () => {
  await withHttpApp({}, async ({ call, signUp, scheduledMatchIds, database }) => {
    const token = await signUp('Ana', 'ana@example.com')
    const matchIds = (await scheduledMatchIds(token, 2)).slice(0, 2)

    database.exec("CREATE TRIGGER fail_participation BEFORE INSERT ON pool_participations BEGIN SELECT RAISE(ABORT, 'falha simulada'); END")
    const first = await createPool(call, token, matchIds)
    assert.equal(first.status, 500)
    assert.equal(first.text.includes('falha simulada'), false)
    assert.deepEqual(counts(database), { pools: 0, matches: 0, participations: 0 })
    database.exec('DROP TRIGGER fail_participation')

    database.exec(`
      CREATE TRIGGER fail_pool_audit BEFORE INSERT ON audit_records
      WHEN NEW.action = 'pool.created' AND NEW.result = 'success'
      BEGIN SELECT RAISE(ABORT, 'falha simulada'); END
    `)
    const second = await createPool(call, token, matchIds)
    assert.equal(second.status, 500)
    assert.deepEqual(counts(database), { pools: 0, matches: 0, participations: 0 })
    database.exec('DROP TRIGGER fail_pool_audit')

    assert.equal((await createPool(call, token, matchIds)).status, 201)
  })
})

test('TC-16: nenhuma operação altera as regras e o conjunto de partidas fica fixo', async () => {
  await withHttpApp({}, async ({ call, signUp, scheduledMatchIds, database }) => {
    const token = await signUp('Ana', 'ana@example.com')
    const matchIds = (await scheduledMatchIds(token, 2)).slice(0, 3)
    const created = (await createPool(call, token, matchIds, { entryFee: 10 })).json.pool
    const rulesBefore = database.prepare('SELECT * FROM pools').get()

    for (const method of ['PUT', 'PATCH', 'DELETE', 'POST']) {
      for (const route of [`/pools/${created.id}`, `/pools/${created.id}/rules`, `/pools/${created.id}/matches`]) {
        const response = await call(method, route, { token, body: { entryFee: 1, name: 'Outro', startsOn: '2027-01-01', prizeModel: 'x' } })
        assert.equal(response.status, 404, `${method} ${route}`)
      }
    }
    assert.deepEqual(database.prepare('SELECT * FROM pools').get(), rulesBefore)

    for (const column of ['name', 'starts_on', 'ends_on', 'entry_fee_cents', 'prize_model', 'tiebreaker', 'live_results', 'creator_id']) {
      assert.throws(() => database.prepare(`UPDATE pools SET ${column} = ${column}`).run(), /immutable/, column)
    }
    assert.throws(() => database.prepare('DELETE FROM pool_matches').run(), /immutable/)
    assert.throws(() => database.prepare('UPDATE pool_matches SET match_id = match_id').run(), /immutable/)

    // O catálogo muda depois da criação: o conjunto de partidas permanece o mesmo.
    database.prepare("UPDATE sports_matches SET status = 'postponed', starts_at = NULL WHERE id = ?").run(matchIds[0])
    database.prepare("UPDATE sports_matches SET status = 'cancelled' WHERE id = ?").run(matchIds[1])
    const view = await call('GET', `/pools/${created.id}`, { token })
    assert.deepEqual(view.json.pool.matches.map(({ id }) => id).sort(), [...matchIds].sort())
    assert.deepEqual(database.prepare('SELECT match_id FROM pool_matches ORDER BY match_id').all().map(({ match_id: id }) => id), [...matchIds].sort())
  })
})

test('TC-17: consulta sem sessão e por não membro não devolve dados', async () => {
  await withHttpApp({}, async ({ call, signUp, scheduledMatchIds, database }) => {
    const anaToken = await signUp('Ana', 'ana@example.com')
    const biaToken = await signUp('Bia', 'bia@example.com')
    const matchIds = (await scheduledMatchIds(anaToken, 2)).slice(0, 2)
    const pool = (await createPool(call, anaToken, matchIds, { name: 'Segredo da Ana' })).json.pool
    const bia = database.prepare("SELECT id FROM users WHERE normalized_email = 'bia@example.com'").get()
    database.prepare(`
      INSERT INTO pool_participations (id, pool_id, user_id, role, status, payment_confirmed, rules_accepted_at)
      VALUES ('p-bia', ?, ?, 'participant', 'requested', 0, '2026-11-13T15:00:00.000Z')
    `).run(pool.id, bia.id)

    const noSession = await call('GET', `/pools/${pool.id}`)
    assert.equal(noSession.status, 401)
    assert.equal(noSession.text.includes('Segredo'), false)

    for (const id of [pool.id, 'inexistente', '../etc/passwd', 'x'.repeat(500)]) {
      const response = await call('GET', `/pools/${encodeURIComponent(id)}`, { token: biaToken })
      assert.equal(response.status, 404, id)
      assert.equal(response.json.type, 'not_found')
      assert.equal(/Segredo|startsOn|matches|entryFee/.test(response.text), false)
    }
  })
})

test('TC-18: criador consulta nome, status, período, taxa, premiação, desempate, partidas, ao vivo, condições e papel', async () => {
  await withHttpApp({}, async ({ call, signUp, scheduledMatchIds }) => {
    const token = await signUp('Ana', 'ana@example.com')
    const matchIds = (await scheduledMatchIds(token, 2)).slice(0, 2)
    const pool = (await createPool(call, token, matchIds, { name: 'Bolão da Turma', entryFee: 25, tiebreaker: 'correct_results' })).json.pool

    const response = await call('GET', `/pools/${pool.id}`, { token })

    assert.equal(response.status, 200)
    assert.equal(response.json.requesterRole, 'administrator')
    assert.equal(response.json.pool.name, 'Bolão da Turma')
    assert.equal(response.json.pool.status, 'active')
    assert.equal(response.json.pool.startsOn, today)
    assert.equal(response.json.pool.endsOn, '2026-12-31')
    assert.equal(response.json.pool.entryFee, '25.00')
    assert.equal(response.json.pool.prizeModel, 'winner_takes_all')
    assert.equal(response.json.pool.tiebreaker, 'correct_results')
    assert.equal(response.json.pool.liveResults, false)
    assert.equal(response.json.pool.matches.length, 2)
    assert.ok(response.json.pool.matches.every((match) => match.home.name && match.away.name && match.startsAt && match.roundNumber === 2))
    const conditions = response.json.participationConditions.join(' ')
    assert.match(conditions, /convite/)
    assert.match(conditions, /R\$ 25,00/)
    assert.match(conditions, /aceitar as regras/)
    assert.match(conditions, /depois do início/)
    assert.equal(/password|hash|salt|token/i.test(response.text), false)
  })
})

test('TC-19: lista de bolões mostra só os do usuário com nome, status e papel', async () => {
  await withHttpApp({}, async ({ call, signUp, scheduledMatchIds, database, clock }) => {
    const anaToken = await signUp('Ana', 'ana@example.com')
    const biaToken = await signUp('Bia', 'bia@example.com')
    setPlan(database, 'ana@example.com', 'premium')
    const matchIds = (await scheduledMatchIds(anaToken, 2)).slice(0, 2)
    await createPool(call, anaToken, matchIds, { name: 'Primeiro' })
    clock.current += 60 * 1000
    await createPool(call, anaToken, matchIds, { name: 'Segundo', entryFee: 10 })

    const ana = await call('GET', '/pools', { token: anaToken })
    const bia = await call('GET', '/pools', { token: biaToken })

    assert.equal(ana.status, 200)
    assert.deepEqual(ana.json.pools.map(({ name, status, role }) => ({ name, status, role })), [
      { name: 'Segundo', status: 'active', role: 'administrator' },
      { name: 'Primeiro', status: 'active', role: 'administrator' },
    ])
    assert.deepEqual(bia.json, { pools: [] })
    assert.equal((await call('GET', '/pools')).status, 401)
  })
})

test('TC-20: disponibilidade de criação com e sem bolão ativo', async () => {
  await withHttpApp({}, async ({ call, signUp, scheduledMatchIds }) => {
    const token = await signUp('Ana', 'ana@example.com')

    const before = await call('GET', '/pools/creation-availability', { token })
    assert.equal(before.status, 200)
    assert.deepEqual(before.json, { plan: { id: 'free', name: 'Gratuito' }, limit: 1, activePools: 0, canCreate: true })

    await createPool(call, token, (await scheduledMatchIds(token, 2)).slice(0, 2))
    const after = await call('GET', '/pools/creation-availability', { token })
    assert.deepEqual(after.json, { plan: { id: 'free', name: 'Gratuito' }, limit: 1, activePools: 1, canCreate: false })
    assert.equal((await call('GET', '/pools/creation-availability')).status, 401)
  })
})

test('TC-21: catálogo vazio com fonte indisponível devolve 503 e permite nova tentativa depois', async () => {
  let failing = true
  const simulated = createSimulatedSportsProvider()
  const provider = {
    source: simulated.source,
    async fetchCatalog(season) {
      if (failing) throw new SportsProviderError('request_failed')
      return simulated.fetchCatalog(season)
    },
  }
  await withHttpApp({ sportsProvider: provider }, async ({ call, signUp, database }) => {
    const token = await signUp('Ana', 'ana@example.com')

    const unavailable = await createPool(call, token, ['qualquer'])
    assert.equal(unavailable.status, 503)
    assert.equal(unavailable.json.type, 'sports_source_unavailable')
    assert.deepEqual(counts(database), { pools: 0, matches: 0, participations: 0 })

    failing = false
    const catalog = await call('GET', '/catalog/rounds/2/matches?status=scheduled', { token })
    assert.equal(catalog.status, 200)
    const retry = await createPool(call, token, catalog.json.matches.slice(0, 2).map(({ id }) => id))
    assert.equal(retry.status, 201)
  })
})

test('TC-22: requisições diretas com dados inválidos são rejeitadas sem depender da interface', async () => {
  await withHttpApp({}, async ({ call, signUp, scheduledMatchIds, database }) => {
    const token = await signUp('Ana', 'ana@example.com')
    const matchIds = (await scheduledMatchIds(token, 2)).slice(0, 2)
    const invalid = [
      poolBody(matchIds, { name: '' }),
      poolBody(matchIds, { entryFee: -10 }),
      poolBody(matchIds, { entryFee: 9999 }),
      poolBody(matchIds, { prizeModel: 'outro' }),
      poolBody(matchIds, { tiebreaker: 'outro' }),
      poolBody(matchIds, { startsOn: '2020-01-01' }),
      poolBody(matchIds, { selection: { matchIds: [] } }),
      { ...poolBody(matchIds), status: 'ended', creatorId: 'outro', liveResults: true },
    ]
    for (const body of invalid.slice(0, 7)) {
      const response = await call('POST', '/pools', { token, body })
      assert.equal(response.status, 400, JSON.stringify(body).slice(0, 80))
      assert.ok(response.json.fields)
    }
    assert.equal(counts(database).pools, 0)

    // Campos que não fazem parte das regras são ignorados e nunca controlam o resultado.
    const created = await call('POST', '/pools', { token, body: invalid[7] })
    assert.equal(created.status, 201)
    assert.equal(created.json.pool.status, 'active')
    assert.equal(created.json.pool.liveResults, false)
    const owner = database.prepare("SELECT id FROM users WHERE normalized_email = 'ana@example.com'").get().id
    assert.equal(database.prepare('SELECT creator_id FROM pools').get().creator_id, owner)

    const notJson = await call('POST', '/pools', { token, body: 'texto' })
    assert.equal(notJson.status, 400)
  })
})

test('TC-23: criação bem-sucedida gera registro de auditoria com o criador como ator', async () => {
  await withHttpApp({}, async ({ call, signUp, scheduledMatchIds, database, auditStore }) => {
    const token = await signUp('Ana', 'ana@example.com')
    const owner = database.prepare("SELECT id FROM users WHERE normalized_email = 'ana@example.com'").get().id
    const pool = (await createPool(call, token, (await scheduledMatchIds(token, 2)).slice(0, 2))).json.pool

    const records = auditStore.findByObject({ type: 'pool', id: pool.id })

    assert.equal(records.length, 1)
    assert.deepEqual(records[0].actor, { type: 'user', id: owner })
    assert.equal(records[0].action, 'pool.created')
    assert.equal(records[0].result, 'success')
    assert.equal(/Bolão dos Amigos|ana@example/.test(JSON.stringify(records)), false)
  })
})

function expectCommonFormat(response, status, type) {
  assert.equal(response.status, status)
  assert.equal(response.json.type, type)
  assert.equal(response.json.correlationId, response.headers.get('x-correlation-id'))
  assert.equal(/falha simulada|SQLITE|stack| at /.test(response.text), false)
}

test('TC-24: cada categoria de erro segue o formato comum, com correlação e sem detalhes internos', async () => {
  await withHttpApp({}, async ({ call, signUp, scheduledMatchIds, database }) => {
    const token = await signUp('Ana', 'ana@example.com')
    const matchIds = (await scheduledMatchIds(token, 2)).slice(0, 2)

    expectCommonFormat(await createPool(call, token, matchIds, { name: '' }), 400, 'validation_error')
    expectCommonFormat(await call('GET', '/pools'), 401, 'session_rejected')
    expectCommonFormat(await call('GET', '/pools/inexistente', { token }), 404, 'not_found')

    database.exec("CREATE TRIGGER fail_pool BEFORE INSERT ON pools BEGIN SELECT RAISE(ABORT, 'falha simulada'); END")
    const internal = await createPool(call, token, matchIds)
    expectCommonFormat(internal, 500, 'internal_error')
    assert.equal(internal.json.message, 'Ocorreu uma falha interna.')
    database.exec('DROP TRIGGER fail_pool')

    assert.equal((await createPool(call, token, matchIds)).status, 201)
    const limit = await createPool(call, token, matchIds)
    expectCommonFormat(limit, 409, 'pool_limit_reached')
    assert.deepEqual(Object.keys(limit.json).sort(), ['correlationId', 'details', 'message', 'type'])
  })

  const unavailableProvider = {
    source: 'simulated',
    async fetchCatalog() {
      throw new SportsProviderError('request_failed')
    },
  }
  await withHttpApp({ sportsProvider: unavailableProvider }, async ({ call, signUp }) => {
    const token = await signUp('Caio', 'caio@example.com')
    expectCommonFormat(await createPool(call, token, ['qualquer']), 503, 'sports_source_unavailable')
  })
})
