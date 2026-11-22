import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { createSimulatedSportsProvider } from '../../src/backend/adapters/simulated-sports-provider.js'
import { expectCommonFormat, withHttpApp } from './support/app-harness.js'

// Bolão com Ana (administradora), Bruno (participante) e Carla (coadministradora), três partidas.
// Bruno palpita nas três; a primeira começa e termina 1 a 0 (Bruno acerta o resultado: 2 pontos),
// a segunda é adiada sem data e a terceira continua no futuro.
function withExit(callback) {
  const provider = createSimulatedSportsProvider()
  return withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const bruno = await context.signUp('Bruno')
    const carla = await context.signUp('Carla')
    const { poolId, matches } = await context.createPool(ana)
    const brunoId = await context.joinPool(ana, bruno, poolId)
    const carlaId = await context.joinPool(ana, carla, poolId)
    const promoted = await context.call('POST', `/pools/${poolId}/participants/${carlaId}/promote`, { token: ana.token })
    assert.equal(promoted.status, 200, promoted.text)
    const [started, postponed, future] = matches

    async function predict(user, matchId, body) {
      const response = await context.call('PUT', `/pools/${poolId}/matches/${matchId}/prediction`, { token: user.token, body })
      assert.equal(response.status, 200, response.text)
    }
    for (const match of matches) await predict(bruno, match.id, { type: 'result', outcome: 'home' })
    await predict(carla, future.id, { type: 'exact_score', homeGoals: 2, awayGoals: 2 })
    await predict(ana, started.id, { type: 'exact_score', homeGoals: 1, awayGoals: 0 })

    context.startMatch(started.id, { status: 'scheduled' })
    const providerId = context.database.prepare('SELECT provider_id FROM sports_matches WHERE id = ?').get(started.id).provider_id
    provider.setResults({ matches: [{ id: providerId, status: 'finished', homeScore: 1, awayScore: 0 }] })
    assert.equal((await context.app.locals.tasks.syncResults()).recorded, 1)
    context.app.locals.tasks.scorePredictions()
    context.database.prepare("UPDATE sports_matches SET status = 'postponed', starts_at = NULL WHERE id = ?").run(postponed.id)

    const route = `/pools/${poolId}/exit`
    const predictionsOf = (participationId) => context.database.prepare('SELECT match_id, points FROM predictions WHERE participation_id = ? ORDER BY match_id').all(participationId)
    const participation = (id) => context.database.prepare('SELECT status, role, total_points FROM pool_participations WHERE id = ?').get(id)

    await callback({
      ...context, ana, bruno, carla, poolId, brunoId, carlaId, started, postponed, future, route, predict, predictionsOf, participation,
    })
  }, { sportsProvider: provider })
}

const confirm = { confirm: true }

test('TC-01: as consequências listam os palpites de partidas não iniciadas, inclusive a adiada sem data, e os avisos', async () => {
  await withExit(async (context) => {
    const response = await context.call('GET', context.route, { token: context.bruno.token })

    assert.equal(response.status, 200, response.text)
    assert.deepEqual(response.json.discardedPredictions.map(({ match }) => match.id).sort(), [context.postponed.id, context.future.id].sort())
    assert.deepEqual(response.json.discardedPredictions[0].prediction, { type: 'result', outcome: 'home' })
    assert.ok(response.json.discardedPredictions.every(({ match }) => match.home.name && match.away.name))
    assert.equal(response.json.consequences.length, 5)
    assert.match(response.json.consequences.join(' '), /pontos que você já obteve permanecem/)
    assert.match(response.json.consequences.join(' '), /classificação/)
    assert.match(response.json.consequences.join(' '), /não gera devolução automática/)
    assert.equal(context.participation(context.brunoId).status, 'confirmed', 'consultar não altera nada')
  })
})

test('TC-02 e TC-04: a saída encerra a participação, remove só os palpites futuros, preserva os pontos e é auditada', async () => {
  await withExit(async (context) => {
    const response = await context.call('POST', context.route, { token: context.bruno.token, body: confirm })

    assert.equal(response.status, 200, response.text)
    assert.deepEqual(response.json.participation, { id: context.brunoId, status: 'left' })
    assert.equal(response.json.discardedPredictions, 2)
    assert.match(response.json.message, /não gera devolução automática.*solicitação formal/)
    assert.deepEqual(context.predictionsOf(context.brunoId), [{ match_id: context.started.id, points: 2 }])
    assert.deepEqual(context.participation(context.brunoId), { status: 'left', role: 'participant', total_points: 2 })

    const records = context.auditStore.findByObject({ type: 'participation', id: context.brunoId })
      .filter(({ action }) => action === 'participation.left')
    assert.equal(records.length, 1)
    assert.equal(records[0].result, 'success')
    assert.equal(records[0].actor.id, context.bruno.id)
    assert.deepEqual(records[0].details, { previousStatus: 'confirmed', removedPredictions: 2 })
  })
})

test('regressão: partida encerrada ou em andamento pelo provedor é tratada como iniciada mesmo com horário futuro', async () => {
  await withExit(async (context) => {
    // Divergência de relógio: o provedor já encerrou a partida, mas o horário gravado está no futuro.
    const later = new Date(context.clock.current + 48 * 60 * 60 * 1000).toISOString()
    context.database.prepare('UPDATE sports_matches SET starts_at = ? WHERE id = ?').run(later, context.started.id)
    context.database.prepare("UPDATE sports_matches SET status = 'in_progress' WHERE id = ?").run(context.future.id)

    const preview = await context.call('GET', context.route, { token: context.bruno.token })
    assert.deepEqual(preview.json.discardedPredictions.map(({ match }) => match.id), [context.postponed.id])

    const response = await context.call('POST', context.route, { token: context.bruno.token, body: confirm })
    assert.equal(response.json.discardedPredictions, 1)
    assert.deepEqual(context.predictionsOf(context.brunoId).map(({ match_id: id }) => id).sort(), [context.started.id, context.future.id].sort())
    assert.equal(context.participation(context.brunoId).total_points, 2)
  })
})

test('TC-03: a coadministradora que sai perde as permissões administrativas', async () => {
  await withExit(async (context) => {
    const response = await context.call('POST', context.route, { token: context.carla.token, body: confirm })
    assert.equal(response.status, 200, response.text)

    expectCommonFormat(await context.call('POST', `/pools/${context.poolId}/invites`, { token: context.carla.token }), 404, 'not_found')
    expectCommonFormat(await context.call('GET', `/pools/${context.poolId}/participants`, { token: context.carla.token }), 404, 'not_found')
    expectCommonFormat(await context.call('GET', `/pools/${context.poolId}/requests`, { token: context.carla.token }), 404, 'not_found')
  })
})

test('TC-05: a administradora de um bolão ativo não pode sair', async () => {
  await withExit(async (context) => {
    expectCommonFormat(await context.call('GET', context.route, { token: context.ana.token }), 409, 'administrator_cannot_leave')
    expectCommonFormat(await context.call('POST', context.route, { token: context.ana.token, body: confirm }), 409, 'administrator_cannot_leave')
    assert.equal(context.participation(context.database.prepare('SELECT id FROM pool_participations WHERE user_id = ?').get(context.ana.id).id).status, 'confirmed')
  })
})

test('TC-06, TC-13 e TC-16: sem confirmação 400; estados não aplicáveis 409, 404 e 401, sem alterar nada', async () => {
  await withExit(async (context) => {
    for (const body of [undefined, {}, { confirm: false }, { confirm: 'true' }, { confirm: 1 }]) {
      const response = await context.call('POST', context.route, { token: context.bruno.token, body })
      expectCommonFormat(response, 400, 'validation_error')
      assert.ok(response.json.fields.confirm)
    }
    assert.equal(context.participation(context.brunoId).status, 'confirmed')

    const awaiting = await context.signUp('Diego')
    const awaitingId = await context.requestEntry(context.ana, awaiting, context.poolId)
    context.database.prepare("UPDATE pool_participations SET status = 'approved_awaiting_payment' WHERE id = ?").run(awaitingId)
    expectCommonFormat(await context.call('POST', context.route, { token: awaiting.token, body: confirm }), 409, 'participation_not_confirmed')
    expectCommonFormat(await context.call('GET', context.route, { token: awaiting.token }), 409, 'participation_not_confirmed')

    const requested = await context.signUp('Elisa')
    await context.requestEntry(context.ana, requested, context.poolId)
    const rejected = await context.signUp('Fábio')
    const rejectedId = await context.requestEntry(context.ana, rejected, context.poolId)
    await context.call('POST', `/pools/${context.poolId}/requests/${rejectedId}/reject`, { token: context.ana.token })
    for (const user of [requested, rejected, await context.signUp('Gabi')]) {
      expectCommonFormat(await context.call('POST', context.route, { token: user.token, body: confirm }), 404, 'not_found')
    }
    expectCommonFormat(await context.call('POST', '/pools/inexistente/exit', { token: context.bruno.token, body: confirm }), 404, 'not_found')
    expectCommonFormat(await context.call('POST', context.route, { body: confirm }), 401, 'session_rejected')

    context.database.prepare("UPDATE pools SET status = 'ended' WHERE id = ?").run(context.poolId)
    expectCommonFormat(await context.call('POST', context.route, { token: context.bruno.token, body: confirm }), 409, 'pool_ended')
    assert.equal(context.participation(context.brunoId).status, 'confirmed')
    assert.equal(context.predictionsOf(context.brunoId).length, 3)
  })
})

test('TC-07: nenhuma operação exposta retira um participante por iniciativa de outro usuário', async () => {
  await withExit(async (context) => {
    const router = context.app.router ?? context.app._router
    const writes = router.stack.filter((layer) => layer.route)
      .flatMap((layer) => Object.keys(layer.route.methods).filter((method) => method !== 'get').map((method) => `${method} ${layer.route.path}`))
    const participantWrites = writes.filter((route) => /participant|participation|member|exit|remove|kick/.test(route))
    // A saída é do próprio solicitante; promover e decidir solicitações pendentes não retiram membros.
    assert.deepEqual(participantWrites.sort(), [
      'post /pools/:poolId/exit',
      'post /pools/:poolId/participants/:participationId/promote',
      'post /pools/:poolId/requests/:participationId/approve',
      'post /pools/:poolId/requests/:participationId/reject',
    ])
    for (const [method, path] of [
      ['DELETE', `/pools/${context.poolId}/participants/${context.brunoId}`],
      ['POST', `/pools/${context.poolId}/participants/${context.brunoId}/remove`],
      ['POST', `/pools/${context.poolId}/participants/${context.brunoId}/exit`],
    ]) {
      expectCommonFormat(await context.call(method, path, { token: context.ana.token, body: confirm }), 404, 'not_found')
    }
    // Recusar só vale para solicitação pendente: não serve para expulsar um membro confirmado.
    expectCommonFormat(await context.call('POST', `/pools/${context.poolId}/requests/${context.brunoId}/reject`, { token: context.ana.token }), 409, 'request_already_decided')
    assert.equal(context.participation(context.brunoId).status, 'confirmed')
  })
})

test('TC-08: depois da saída, ranking, participantes e medalhas não mostram quem saiu, e ele perde o acesso de membro', async () => {
  await withExit(async (context) => {
    context.database.prepare(`
      INSERT INTO pool_medals (id, pool_id, participation_id, round_number, awarded_at) VALUES (?, ?, ?, 2, ?)
    `).run(randomUUID(), context.poolId, context.brunoId, new Date().toISOString())
    const before = await context.call('GET', `/pools/${context.poolId}/ranking`, { token: context.ana.token })
    assert.ok(before.json.participants.some(({ name }) => name === 'Bruno'))

    await context.call('POST', context.route, { token: context.bruno.token, body: confirm })

    const ranking = await context.call('GET', `/pools/${context.poolId}/ranking`, { token: context.ana.token })
    assert.deepEqual(ranking.json.participants.map(({ name, position }) => [name, position]), [['Ana', 1], ['Carla', 2]])
    const participants = await context.call('GET', `/pools/${context.poolId}/participants`, { token: context.ana.token })
    assert.equal(participants.json.participants.some(({ name }) => name === 'Bruno'), false)
    const medals = await context.call('GET', `/pools/${context.poolId}/medals`, { token: context.ana.token })
    assert.equal(JSON.stringify(medals.json).includes('Bruno'), false)
    assert.equal(context.database.prepare('SELECT COUNT(*) AS count FROM pool_medals WHERE participation_id = ?').get(context.brunoId).count, 1, 'medalha permanece gravada')
    assert.equal(context.app.locals.medals.reconcileMedals().awarded >= 0, true)
    assert.equal(context.database.prepare('SELECT COUNT(*) AS count FROM pool_medals WHERE participation_id = ?').get(context.brunoId).count, 1)

    for (const path of [`/pools/${context.poolId}`, `/pools/${context.poolId}/ranking`, `/pools/${context.poolId}/predictions`, context.route]) {
      expectCommonFormat(await context.call('GET', path, { token: context.bruno.token }), 404, 'not_found')
    }
    expectCommonFormat(await context.call('PUT', `/pools/${context.poolId}/matches/${context.future.id}/prediction`, {
      token: context.bruno.token, body: { type: 'result', outcome: 'draw' },
    }), 404, 'not_found')
    const pools = await context.call('GET', '/pools', { token: context.bruno.token })
    assert.deepEqual(pools.json.pools, [])
  })
})

test('TC-09: falha na remoção dos palpites ou na auditoria mantém a participação e os palpites', async () => {
  await withExit(async (context) => {
    context.database.exec(`
      CREATE TRIGGER fail_exit_delete BEFORE DELETE ON predictions
      BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;
    `)
    expectCommonFormat(await context.call('POST', context.route, { token: context.bruno.token, body: confirm }), 500, 'internal_error')
    context.database.exec('DROP TRIGGER fail_exit_delete')

    context.database.exec(`
      CREATE TRIGGER fail_exit_audit BEFORE INSERT ON audit_records
      WHEN NEW.action = 'participation.left' AND NEW.result = 'success'
      BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;
    `)
    expectCommonFormat(await context.call('POST', context.route, { token: context.bruno.token, body: confirm }), 500, 'internal_error')

    assert.deepEqual(context.participation(context.brunoId), { status: 'confirmed', role: 'participant', total_points: 2 })
    assert.equal(context.predictionsOf(context.brunoId).length, 3)
  })
})

test('TC-10: quem saiu não pode solicitar entrada de novo', async () => {
  await withExit(async (context) => {
    await context.call('POST', context.route, { token: context.bruno.token, body: confirm })
    const code = await context.inviteCode(context.ana, context.poolId)
    const response = await context.call('POST', '/invites/requests', {
      token: context.bruno.token, body: { code, rulesAccepted: true, lateEntryAcknowledged: true },
    })
    expectCommonFormat(response, 409, 'participation_exists')
    assert.equal(context.participation(context.brunoId).status, 'left')
  })
})

test('TC-11 e TC-12: a saída não cria movimentação financeira nem altera regras, outros participantes e seus palpites', async () => {
  await withExit(async (context) => {
    const tables = context.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map(({ name }) => name)
    const counts = () => Object.fromEntries(tables.map((name) => [name, context.database.prepare(`SELECT COUNT(*) AS count FROM "${name}"`).get().count]))
    const others = () => JSON.stringify([
      context.database.prepare('SELECT * FROM pools').all(),
      context.database.prepare('SELECT * FROM pool_participations WHERE id <> ? ORDER BY id').all(context.brunoId),
      context.database.prepare('SELECT * FROM predictions WHERE participation_id <> ? ORDER BY id').all(context.brunoId),
      context.database.prepare('SELECT * FROM pool_matches ORDER BY match_id').all(),
    ])
    const beforeCounts = counts()
    const beforeOthers = others()

    await context.call('POST', context.route, { token: context.bruno.token, body: confirm })

    const afterCounts = counts()
    const changed = tables.filter((name) => afterCounts[name] !== beforeCounts[name]).sort()
    assert.deepEqual(changed, ['audit_records', 'predictions'], 'só auditoria e palpites removidos mudam de tamanho')
    assert.equal(others(), beforeOthers)
  })
})

test('TC-14: saídas simultâneas valem uma vez; saída e palpite simultâneos não deixam palpite futuro', async () => {
  await withExit(async (context) => {
    const responses = await Promise.all([
      context.call('POST', context.route, { token: context.bruno.token, body: confirm }),
      context.call('POST', context.route, { token: context.bruno.token, body: confirm }),
    ])
    assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 404])
    assert.equal(context.auditStore.findByObject({ type: 'participation', id: context.brunoId })
      .filter(({ action, result }) => action === 'participation.left' && result === 'success').length, 1)

    const [exit, prediction] = await Promise.all([
      context.call('POST', context.route, { token: context.carla.token, body: confirm }),
      context.call('PUT', `/pools/${context.poolId}/matches/${context.future.id}/prediction`, {
        token: context.carla.token, body: { type: 'result', outcome: 'away' },
      }),
    ])
    assert.equal(exit.status, 200, exit.text)
    assert.ok([200, 404].includes(prediction.status))
    const future = context.database.prepare(`
      SELECT COUNT(*) AS count FROM predictions pr JOIN sports_matches m ON m.id = pr.match_id
      WHERE pr.participation_id = ? AND (m.starts_at IS NULL OR m.starts_at > ?)
    `).get(context.carlaId, new Date(context.clock.current).toISOString()).count
    assert.equal(future, 0)
  })
})
