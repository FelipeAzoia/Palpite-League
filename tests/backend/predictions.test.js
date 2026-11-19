import assert from 'node:assert/strict'
import test from 'node:test'
import { expectCommonFormat, hour, withHttpApp } from './support/app-harness.js'

// Bolão sem taxa com administradora (Ana) e um participante confirmado (Bruno).
async function setup(context, poolOptions) {
  const admin = await context.signUp('Ana')
  const participant = await context.signUp('Bruno')
  const pool = await context.createPool(admin, poolOptions)
  const participantId = await context.joinPool(admin, participant, pool.poolId)
  const [match, otherMatch, thirdMatch] = pool.matches
  return { admin, participant, participantId, match, otherMatch, thirdMatch, ...pool }
}

const route = (poolId, matchId) => `/pools/${poolId}/matches/${matchId}/prediction`

function predictionsOf(database, matchId) {
  return database.prepare('SELECT * FROM predictions WHERE match_id = ?').all(matchId)
}

function auditOf(context, action) {
  return context.database.prepare('SELECT * FROM audit_records WHERE action = ? ORDER BY id').all(action)
    .map((row) => ({ ...row, details: row.details_json === null ? null : JSON.parse(row.details_json) }))
}

function setMatch(database, matchId, fields) {
  for (const [column, value] of Object.entries(fields)) {
    database.prepare(`UPDATE sports_matches SET ${column} = ? WHERE id = ?`).run(value, matchId)
  }
}

test('TC-01: registra palpite de resultado e de placar exato com data em UTC, sem pontos e com auditoria', async () => {
  await withHttpApp(async (context) => {
    const { participant, poolId, match, otherMatch } = await setup(context)

    const result = await context.call('PUT', route(poolId, match.id), {
      token: participant.token,
      body: { type: 'result', outcome: 'home' },
    })
    assert.equal(result.status, 200, result.text)
    assert.deepEqual(result.json, {
      prediction: { type: 'result', outcome: 'home', submittedAt: new Date(context.clock.current).toISOString() },
      changed: true,
    })

    const exact = await context.call('PUT', route(poolId, otherMatch.id), {
      token: participant.token,
      body: { type: 'exact_score', homeGoals: 2, awayGoals: 1 },
    })
    assert.equal(exact.status, 200, exact.text)
    assert.deepEqual(exact.json.prediction, { type: 'exact_score', homeGoals: 2, awayGoals: 1, submittedAt: exact.json.prediction.submittedAt })

    const [stored] = predictionsOf(context.database, match.id)
    assert.equal(stored.points, null)
    assert.equal(stored.submitted_at.endsWith('Z'), true)

    const records = auditOf(context, 'prediction.submitted')
    assert.equal(records.length, 2)
    assert.equal(records.every(({ result: outcome, actor_id: actorId }) => outcome === 'success' && actorId === participant.id), true)
    assert.deepEqual(records.map(({ details }) => details), [
      { type: 'result', outcome: 'home' },
      { type: 'exact_score', score: '2-1' },
    ])
    assert.equal(records[0].object_type, 'prediction')
    assert.equal(records[0].object_id, stored.id)
  })
})

test('TC-02 e TC-15: alterar e trocar a modalidade mantém um único palpite e audita valores anterior e novo', async () => {
  await withHttpApp(async (context) => {
    const { participant, poolId, match } = await setup(context)
    await context.call('PUT', route(poolId, match.id), { token: participant.token, body: { type: 'result', outcome: 'home' } })
    context.clock.current += 1000

    const changed = await context.call('PUT', route(poolId, match.id), { token: participant.token, body: { type: 'result', outcome: 'draw' } })
    assert.equal(changed.status, 200, changed.text)
    context.clock.current += 1000
    const switched = await context.call('PUT', route(poolId, match.id), {
      token: participant.token,
      body: { type: 'exact_score', homeGoals: 0, awayGoals: 3 },
    })
    assert.equal(switched.status, 200, switched.text)

    const rows = predictionsOf(context.database, match.id)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].type, 'exact_score')
    assert.equal(rows[0].predicted_outcome, null)
    assert.deepEqual([rows[0].home_goals, rows[0].away_goals], [0, 3])
    assert.equal(rows[0].submitted_at, new Date(context.clock.current).toISOString())

    const records = auditOf(context, 'prediction.changed')
    assert.deepEqual(records.map(({ details }) => details), [
      { previousType: 'result', previousOutcome: 'home', type: 'result', outcome: 'draw' },
      { previousType: 'result', previousOutcome: 'draw', type: 'exact_score', score: '0-3' },
    ])
    assert.equal(records.every(({ object_id: objectId, actor_id: actorId }) => objectId === rows[0].id && actorId === participant.id), true)
  })
})

test('TC-03: aceita 1 ms antes do início e recusa no instante do início e depois, preservando o palpite', async () => {
  await withHttpApp(async (context) => {
    const { participant, poolId, match } = await setup(context)
    const startsAtMs = Date.parse(match.startsAt)

    context.clock.current = startsAtMs - 1
    const accepted = await context.call('PUT', route(poolId, match.id), { token: participant.token, body: { type: 'result', outcome: 'away' } })
    assert.equal(accepted.status, 200, accepted.text)

    for (const instant of [startsAtMs, startsAtMs + hour]) {
      context.clock.current = instant
      const refused = await context.call('PUT', route(poolId, match.id), { token: participant.token, body: { type: 'result', outcome: 'home' } })
      expectCommonFormat(refused, 409, 'prediction_deadline_passed')
    }
    const [stored] = predictionsOf(context.database, match.id)
    assert.equal(stored.predicted_outcome, 'away')
    assert.equal(stored.submitted_at, new Date(startsAtMs - 1).toISOString())
    assert.equal(auditOf(context, 'prediction.changed').length, 0)
  })
})

test('TC-04: partida remarcada passa a ter o novo início como prazo', async () => {
  await withHttpApp(async (context) => {
    const { participant, poolId, match } = await setup(context)
    const oldStart = Date.parse(match.startsAt)
    setMatch(context.database, match.id, { starts_at: new Date(oldStart + 2 * hour).toISOString() })

    context.clock.current = oldStart + hour
    const response = await context.call('PUT', route(poolId, match.id), { token: participant.token, body: { type: 'result', outcome: 'draw' } })
    assert.equal(response.status, 200, response.text)
  })
})

test('TC-05: reenvio idêntico é aceito sem mudar a data de envio nem criar auditoria', async () => {
  await withHttpApp(async (context) => {
    const { participant, poolId, match } = await setup(context)
    const body = { type: 'exact_score', homeGoals: 1, awayGoals: 1 }
    const first = await context.call('PUT', route(poolId, match.id), { token: participant.token, body })
    context.clock.current += 60_000

    const again = await context.call('PUT', route(poolId, match.id), { token: participant.token, body })
    assert.equal(again.status, 200, again.text)
    assert.equal(again.json.changed, false)
    assert.equal(again.json.prediction.submittedAt, first.json.prediction.submittedAt)
    assert.equal(predictionsOf(context.database, match.id)[0].submitted_at, first.json.prediction.submittedAt)
    assert.equal(auditOf(context, 'prediction.submitted').length, 1)
    assert.equal(auditOf(context, 'prediction.changed').length, 0)
  })
})

test('TC-06: partidas adiada, cancelada, sem data e em andamento não aceitam palpite e mantêm os existentes', async () => {
  await withHttpApp(async (context) => {
    const { participant, poolId, match, otherMatch, thirdMatch } = await setup(context)
    const body = { type: 'result', outcome: 'home' }
    await context.call('PUT', route(poolId, match.id), { token: participant.token, body })
    await context.call('PUT', route(poolId, otherMatch.id), { token: participant.token, body })

    setMatch(context.database, match.id, { status: 'postponed' })
    expectCommonFormat(await context.call('PUT', route(poolId, match.id), { token: participant.token, body: { type: 'result', outcome: 'away' } }), 409, 'match_unavailable')
    setMatch(context.database, match.id, { starts_at: null })
    expectCommonFormat(await context.call('PUT', route(poolId, match.id), { token: participant.token, body: { type: 'result', outcome: 'away' } }), 409, 'match_unavailable')

    setMatch(context.database, otherMatch.id, { status: 'cancelled' })
    expectCommonFormat(await context.call('PUT', route(poolId, otherMatch.id), { token: participant.token, body: { type: 'result', outcome: 'away' } }), 409, 'match_unavailable')

    setMatch(context.database, thirdMatch.id, { status: 'in_progress' })
    expectCommonFormat(await context.call('PUT', route(poolId, thirdMatch.id), { token: participant.token, body }), 409, 'prediction_deadline_passed')

    assert.equal(predictionsOf(context.database, match.id)[0].predicted_outcome, 'home')
    assert.equal(predictionsOf(context.database, otherMatch.id)[0].predicted_outcome, 'home')
    assert.equal(predictionsOf(context.database, thirdMatch.id).length, 0)
  })
})

test('TC-07: entrada tardia impede palpite nas partidas que começaram antes da entrada e permite nas demais', async () => {
  await withHttpApp(async (context) => {
    const admin = await context.signUp('Ana')
    const { poolId, matches } = await context.createPool(admin)
    const [started, later] = matches
    context.clock.current += 2 * hour
    context.startMatch(started.id, { status: 'scheduled' })
    const latecomer = await context.signUp('Carla')
    await context.joinPool(admin, latecomer, poolId)
    const body = { type: 'result', outcome: 'home' }

    expectCommonFormat(await context.call('PUT', route(poolId, started.id), { token: latecomer.token, body }), 409, 'late_entry_not_allowed')
    // Quem entrou antes recebe o prazo encerrado, não a falta de direito.
    expectCommonFormat(await context.call('PUT', route(poolId, started.id), { token: admin.token, body }), 409, 'prediction_deadline_passed')
    const accepted = await context.call('PUT', route(poolId, later.id), { token: latecomer.token, body })
    assert.equal(accepted.status, 200, accepted.text)

    const list = await context.call('GET', `/pools/${poolId}/predictions`, { token: latecomer.token })
    const situations = Object.fromEntries(list.json.rounds.flatMap(({ matches: items }) => items).map(({ id, situation }) => [id, situation]))
    assert.equal(situations[started.id], 'late_entry')
    assert.equal(situations[later.id], 'open')
  })
})

test('TC-08: aprovada aguardando pagamento recebe 409; solicitada, rejeitada, que saiu e sem vínculo recebem 404', async () => {
  await withHttpApp(async (context) => {
    const admin = await context.signUp('Ana')
    const paid = await context.createPool(admin, { entryFee: 10 })
    const freeAdmin = await context.signUp('Fernanda')
    const free = await context.createPool(freeAdmin, { round: 3 })
    const body = { type: 'result', outcome: 'home' }

    // A própria administradora do bolão com taxa ainda não pagou.
    expectCommonFormat(await context.call('PUT', route(paid.poolId, paid.matches[0].id), { token: admin.token, body }), 409, 'participation_not_confirmed')
    expectCommonFormat(await context.call('GET', `/pools/${paid.poolId}/predictions`, { token: admin.token }), 409, 'participation_not_confirmed')

    const requested = await context.signUp('Bruno')
    await context.requestEntry(freeAdmin, requested, free.poolId)
    const rejected = await context.signUp('Carla')
    const rejectedId = await context.requestEntry(freeAdmin, rejected, free.poolId)
    await context.call('POST', `/pools/${free.poolId}/requests/${rejectedId}/reject`, { token: freeAdmin.token })
    const leaver = await context.signUp('Diego')
    const leaverId = await context.joinPool(freeAdmin, leaver, free.poolId)
    context.database.prepare("UPDATE pool_participations SET status = 'left' WHERE id = ?").run(leaverId)
    const outsider = await context.signUp('Elisa')

    for (const user of [requested, rejected, leaver, outsider]) {
      expectCommonFormat(await context.call('PUT', route(free.poolId, free.matches[0].id), { token: user.token, body }), 404, 'not_found')
      expectCommonFormat(await context.call('GET', `/pools/${free.poolId}/predictions`, { token: user.token }), 404, 'not_found')
    }
    expectCommonFormat(await context.call('PUT', route('inexistente', free.matches[0].id), { token: freeAdmin.token, body }), 404, 'not_found')
    assert.equal(context.database.prepare('SELECT COUNT(*) AS count FROM predictions').get().count, 0)
  })
})

test('TC-09: partida que o bolão não selecionou recebe 404', async () => {
  await withHttpApp(async (context) => {
    const { participant, poolId } = await setup(context, { matchCount: 1 })
    const outside = (await context.call('GET', '/catalog/rounds/2/matches?status=scheduled', { token: participant.token })).json.matches[1]

    expectCommonFormat(await context.call('PUT', route(poolId, outside.id), { token: participant.token, body: { type: 'result', outcome: 'home' } }), 404, 'not_found')
    expectCommonFormat(await context.call('GET', route(poolId, outside.id), { token: participant.token }), 404, 'not_found')
    assert.equal(predictionsOf(context.database, outside.id).length, 0)
  })
})

test('TC-10: palpites inválidos são recusados com 400 indicando o campo e preservam o anterior', async () => {
  await withHttpApp(async (context) => {
    const { participant, poolId, match } = await setup(context)
    await context.call('PUT', route(poolId, match.id), { token: participant.token, body: { type: 'result', outcome: 'draw' } })

    const invalid = [
      [{}, 'type'],
      [{ type: 'palpite' }, 'type'],
      [{ type: 'result', outcome: 'home', homeGoals: 1, awayGoals: 0 }, 'type'],
      [{ type: 'exact_score', outcome: 'home', homeGoals: 1, awayGoals: 0 }, 'type'],
      [{ type: 'result', outcome: 'mandante' }, 'outcome'],
      [{ type: 'result' }, 'outcome'],
      [{ type: 'exact_score', homeGoals: -1, awayGoals: 0 }, 'homeGoals'],
      [{ type: 'exact_score', homeGoals: 1, awayGoals: 100 }, 'awayGoals'],
      [{ type: 'exact_score', homeGoals: 1.5, awayGoals: 0 }, 'homeGoals'],
      [{ type: 'exact_score', homeGoals: '2', awayGoals: 0 }, 'homeGoals'],
      [{ type: 'exact_score', homeGoals: 2 }, 'awayGoals'],
    ]
    for (const [body, field] of invalid) {
      const response = await context.call('PUT', route(poolId, match.id), { token: participant.token, body })
      expectCommonFormat(response, 400, 'validation_error')
      assert.ok(response.json.fields[field], `${JSON.stringify(body)} deveria apontar ${field}`)
    }
    const rows = predictionsOf(context.database, match.id)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].predicted_outcome, 'draw')
  })
})

test('TC-11: bolão encerrado não aceita palpite (409)', async () => {
  await withHttpApp(async (context) => {
    const { participant, poolId, match } = await setup(context)
    context.database.prepare("UPDATE pools SET status = 'ended' WHERE id = ?").run(poolId)

    expectCommonFormat(await context.call('PUT', route(poolId, match.id), { token: participant.token, body: { type: 'result', outcome: 'home' } }), 409, 'pool_ended')
    const list = await context.call('GET', `/pools/${poolId}/predictions`, { token: participant.token })
    assert.equal(list.status, 200)
    assert.equal(list.json.rounds.flatMap(({ matches }) => matches).every(({ situation }) => situation === 'closed'), true)
  })
})

test('TC-12: cada participante só vê e altera o próprio palpite, antes e depois do início', async () => {
  await withHttpApp(async (context) => {
    const { admin, participant, poolId, match } = await setup(context)
    await context.call('PUT', route(poolId, match.id), { token: admin.token, body: { type: 'exact_score', homeGoals: 4, awayGoals: 4 } })
    await context.call('PUT', route(poolId, match.id), { token: participant.token, body: { type: 'result', outcome: 'away' } })

    for (const instant of [context.clock.current, Date.parse(match.startsAt) + hour]) {
      context.clock.current = instant
      const list = await context.call('GET', `/pools/${poolId}/predictions`, { token: participant.token })
      const direct = await context.call('GET', route(poolId, match.id), { token: participant.token })
      for (const response of [list, direct]) {
        assert.equal(response.status, 200)
        assert.equal(/"homeGoals":4/.test(response.text), false)
      }
      assert.deepEqual(direct.json.match.prediction.outcome, 'away')
    }
    const rows = predictionsOf(context.database, match.id)
    assert.equal(rows.length, 2)
  })
})

test('TC-13: falha na auditoria não cria palpite novo e mantém o anterior', async () => {
  await withHttpApp(async (context) => {
    const { participant, poolId, match, otherMatch } = await setup(context)
    await context.call('PUT', route(poolId, match.id), { token: participant.token, body: { type: 'result', outcome: 'home' } })
    context.database.exec(`
      CREATE TRIGGER fail_prediction_audit BEFORE INSERT ON audit_records
      WHEN NEW.action LIKE 'prediction.%' AND NEW.result = 'success'
      BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;
    `)

    expectCommonFormat(await context.call('PUT', route(poolId, match.id), { token: participant.token, body: { type: 'result', outcome: 'away' } }), 500, 'internal_error')
    expectCommonFormat(await context.call('PUT', route(poolId, otherMatch.id), { token: participant.token, body: { type: 'result', outcome: 'away' } }), 500, 'internal_error')

    assert.equal(predictionsOf(context.database, match.id)[0].predicted_outcome, 'home')
    assert.equal(predictionsOf(context.database, otherMatch.id).length, 0)
  })
})

test('TC-14: a lista por rodada e a consulta direta apresentam o mesmo estado e a situação de cada partida', async () => {
  await withHttpApp(async (context) => {
    const { participant, poolId, match, otherMatch, thirdMatch } = await setup(context)
    const saved = await context.call('PUT', route(poolId, match.id), { token: participant.token, body: { type: 'exact_score', homeGoals: 3, awayGoals: 2 } })
    setMatch(context.database, otherMatch.id, { status: 'cancelled' })
    context.clock.current += 2 * hour
    context.startMatch(thirdMatch.id)

    const list = await context.call('GET', `/pools/${poolId}/predictions`, { token: participant.token })
    assert.equal(list.status, 200, list.text)
    assert.deepEqual(list.json.rounds.map(({ number }) => number), [2])
    const byId = Object.fromEntries(list.json.rounds[0].matches.map((item) => [item.id, item]))
    assert.equal(byId[match.id].situation, 'open')
    assert.equal(byId[otherMatch.id].situation, 'unavailable')
    assert.equal(byId[thirdMatch.id].situation, 'closed')
    assert.deepEqual(byId[match.id].prediction, saved.json.prediction)
    assert.equal(byId[otherMatch.id].prediction, null)
    assert.ok(byId[match.id].home.name && byId[match.id].away.name)

    const direct = await context.call('GET', route(poolId, match.id), { token: participant.token })
    assert.deepEqual(direct.json.match, byId[match.id])
  })
})

test('TC-16: envios simultâneos para a mesma partida deixam um único palpite', async () => {
  await withHttpApp(async (context) => {
    const { participant, poolId, match } = await setup(context)
    const responses = await Promise.all([
      context.call('PUT', route(poolId, match.id), { token: participant.token, body: { type: 'result', outcome: 'home' } }),
      context.call('PUT', route(poolId, match.id), { token: participant.token, body: { type: 'exact_score', homeGoals: 1, awayGoals: 0 } }),
    ])

    assert.deepEqual(responses.map(({ status }) => status), [200, 200])
    const rows = predictionsOf(context.database, match.id)
    assert.equal(rows.length, 1)
    assert.ok(['result', 'exact_score'].includes(rows[0].type))
  })
})

test('TC-17: funciona com o fornecedor esportivo indisponível, exige sessão e segue o formato de erros', async () => {
  let failing = false
  const { createSimulatedSportsProvider } = await import('../../src/backend/adapters/simulated-sports-provider.js')
  const simulated = createSimulatedSportsProvider()
  const sportsProvider = {
    source: 'simulated',
    async fetchCatalog(...args) {
      if (failing) throw new Error('fornecedor indisponível')
      return simulated.fetchCatalog(...args)
    },
  }
  await withHttpApp(async (context) => {
    const { participant, poolId, match } = await setup(context)
    failing = true

    const list = await context.call('GET', `/pools/${poolId}/predictions`, { token: participant.token })
    assert.equal(list.status, 200, list.text)
    const saved = await context.call('PUT', route(poolId, match.id), { token: participant.token, body: { type: 'result', outcome: 'home' } })
    assert.equal(saved.status, 200, saved.text)

    expectCommonFormat(await context.call('PUT', route(poolId, match.id), { body: { type: 'result', outcome: 'home' } }), 401, 'session_rejected')
    expectCommonFormat(await context.call('GET', `/pools/${poolId}/predictions`, { token: 'token-invalido' }), 401, 'session_rejected')
  }, { sportsProvider })
})
