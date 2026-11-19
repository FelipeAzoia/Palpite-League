import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { expectCommonFormat, withHttpApp } from './support/app-harness.js'

// Bolão com administrador (Ana), um participante confirmado (Bruno) e um coadministrador (Carla).
async function setup(context) {
  const admin = await context.signUp('Ana')
  const participant = await context.signUp('Bruno')
  const coadmin = await context.signUp('Carla')
  const pool = await context.createPool(admin)
  const participantId = await context.joinPool(admin, participant, pool.poolId)
  const coadminId = await context.joinPool(admin, coadmin, pool.poolId)
  const promoted = await context.call('POST', `/pools/${pool.poolId}/participants/${coadminId}/promote`, { token: admin.token })
  assert.equal(promoted.status, 200, promoted.text)
  return { admin, participant, coadmin, participantId, coadminId, ...pool }
}

const deniedCount = (database, action) => database.prepare(
  "SELECT COUNT(*) AS count FROM audit_records WHERE action = ? AND result = 'denied'",
).get(action).count

const adminCount = (database, poolId) => database.prepare(
  "SELECT COUNT(*) AS count FROM pool_participations WHERE pool_id = ? AND role = 'administrator'",
).get(poolId).count

test('TC-01: administrador e coadministrador listam só os membros, sem e-mail; participante comum recebe 403', async () => {
  await withHttpApp(async (context) => {
    const { admin, participant, coadmin, poolId } = await setup(context)
    await context.requestEntry(admin, await context.signUp('Diego'), poolId)
    const rejected = await context.requestEntry(admin, await context.signUp('Elisa'), poolId)
    await context.call('POST', `/pools/${poolId}/requests/${rejected}/reject`, { token: admin.token })
    const leaver = await context.signUp('Fábio')
    const leaverId = await context.joinPool(admin, leaver, poolId)
    context.database.prepare("UPDATE pool_participations SET status = 'left' WHERE id = ?").run(leaverId)

    for (const user of [admin, coadmin]) {
      const response = await context.call('GET', `/pools/${poolId}/participants`, { token: user.token })
      assert.equal(response.status, 200)
      assert.deepEqual(response.json.participants.map(({ name, role, status }) => [name, role, status]), [
        ['Ana', 'administrator', 'confirmed'],
        ['Carla', 'coadministrator', 'confirmed'],
        ['Bruno', 'participant', 'confirmed'],
      ])
      assert.equal(/@example\.com|email/.test(response.text), false)
    }
    expectCommonFormat(await context.call('GET', `/pools/${poolId}/participants`, { token: participant.token }), 403, 'forbidden')
  })
})

test('TC-02: promover um participante confirmado muda só o papel e registra os papéis anterior e novo', async () => {
  await withHttpApp(async (context) => {
    const { admin, participantId, poolId } = await setup(context)
    const before = context.participation(participantId)

    const response = await context.call('POST', `/pools/${poolId}/participants/${participantId}/promote`, { token: admin.token })

    assert.equal(response.status, 200)
    assert.deepEqual(response.json.participation, { id: participantId, role: 'coadministrator', status: 'confirmed' })
    assert.deepEqual(context.participation(participantId), { ...before, role: 'coadministrator' })
    const records = context.auditStore.findByObject({ type: 'participation', id: participantId })
      .filter(({ action }) => action === 'participation.promoted')
    assert.equal(records.length, 1)
    assert.equal(records[0].result, 'success')
    assert.equal(records[0].actor.id, admin.id)
    assert.deepEqual(records[0].details, { previousRole: 'participant', newRole: 'coadministrator' })
  })
})

test('TC-03 e TC-12: coadministrador e participante recebem 403, não membro 404, sem sessão 401, sem alteração', async () => {
  await withHttpApp(async (context) => {
    const { participant, coadmin, participantId, poolId } = await setup(context)
    const outsider = await context.signUp('Gabi')
    const route = `/pools/${poolId}/participants/${participantId}/promote`

    expectCommonFormat(await context.call('POST', route, { token: coadmin.token }), 403, 'forbidden')
    expectCommonFormat(await context.call('POST', route, { token: participant.token }), 403, 'forbidden')
    expectCommonFormat(await context.call('POST', route, { token: outsider.token }), 404, 'not_found')
    expectCommonFormat(await context.call('POST', route), 401, 'session_rejected')
    expectCommonFormat(await context.call('GET', `/pools/${poolId}/participants`, { token: outsider.token }), 404, 'not_found')
    expectCommonFormat(await context.call('GET', `/pools/${poolId}/participants`), 401, 'session_rejected')

    assert.equal(context.participation(participantId).role, 'participant')
    assert.equal(deniedCount(context.database, 'participation.promoted'), 3)
    assert.equal(deniedCount(context.database, 'participation.participants_listed'), 1)
  })
})

test('TC-04: o coadministrador recém-promovido convida e decide entradas, mas não promove', async () => {
  await withHttpApp(async (context) => {
    const { admin, participant, participantId, poolId } = await setup(context)
    await context.call('POST', `/pools/${poolId}/participants/${participantId}/promote`, { token: admin.token })

    assert.equal((await context.call('POST', `/pools/${poolId}/invites`, { token: participant.token })).status, 201)
    assert.equal((await context.call('GET', `/pools/${poolId}/invites`, { token: participant.token })).status, 200)
    const newcomer = await context.signUp('Hugo')
    const requestId = await context.requestEntry(participant, newcomer, poolId)
    assert.equal((await context.call('GET', `/pools/${poolId}/requests`, { token: participant.token })).json.requests.length, 1)
    assert.equal((await context.call('POST', `/pools/${poolId}/requests/${requestId}/approve`, { token: participant.token })).status, 200)

    expectCommonFormat(await context.call('POST', `/pools/${poolId}/participants/${requestId}/promote`, { token: participant.token }), 403, 'forbidden')
    assert.equal(context.participation(requestId).role, 'participant')
  })
})

test('TC-05: alvo de outro bolão ou inexistente recebe 404 e nada muda', async () => {
  await withHttpApp(async (context) => {
    const { admin, poolId } = await setup(context)
    const otherAdmin = await context.signUp('Iara')
    const other = await context.createPool(otherAdmin)
    const foreign = await context.joinPool(otherAdmin, await context.signUp('João'), other.poolId)

    expectCommonFormat(await context.call('POST', `/pools/${poolId}/participants/${foreign}/promote`, { token: admin.token }), 404, 'not_found')
    expectCommonFormat(await context.call('POST', `/pools/${poolId}/participants/inexistente/promote`, { token: admin.token }), 404, 'not_found')
    assert.equal(context.participation(foreign).role, 'participant')
  })
})

test('TC-06: alvos solicitada, aprovada aguardando pagamento, rejeitada e que saiu recebem 409', async () => {
  await withHttpApp(async (context) => {
    const { admin, poolId } = await setup(context)

    for (const status of ['requested', 'approved_awaiting_payment', 'rejected', 'left']) {
      const targetId = await context.requestEntry(admin, await context.signUp(`Alvo ${status}`), poolId)
      context.database.prepare('UPDATE pool_participations SET status = ? WHERE id = ?').run(status, targetId)

      const response = await context.call('POST', `/pools/${poolId}/participants/${targetId}/promote`, { token: admin.token })

      expectCommonFormat(response, 409, 'participant_not_eligible')
      assert.equal(context.participation(targetId).role, 'participant')
      assert.equal(context.participation(targetId).status, status)
    }
  })
})

test('TC-07: promover um coadministrador ou o próprio administrador recebe 409', async () => {
  await withHttpApp(async (context) => {
    const { admin, coadminId, poolId } = await setup(context)
    const adminId = context.database.prepare("SELECT id FROM pool_participations WHERE pool_id = ? AND role = 'administrator'").get(poolId).id

    expectCommonFormat(await context.call('POST', `/pools/${poolId}/participants/${coadminId}/promote`, { token: admin.token }), 409, 'participant_not_eligible')
    expectCommonFormat(await context.call('POST', `/pools/${poolId}/participants/${adminId}/promote`, { token: admin.token }), 409, 'participant_not_eligible')
    assert.equal(context.participation(adminId).role, 'administrator')
  })
})

test('TC-08: promoções simultâneas do mesmo alvo são efetivadas uma única vez', async () => {
  await withHttpApp(async (context) => {
    const { admin, participantId, poolId } = await setup(context)

    const responses = await Promise.all(Array.from({ length: 3 }, () => (
      context.call('POST', `/pools/${poolId}/participants/${participantId}/promote`, { token: admin.token })
    )))

    assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 409, 409])
    const successes = context.auditStore.findByObject({ type: 'participation', id: participantId })
      .filter(({ action, result }) => action === 'participation.promoted' && result === 'success')
    assert.equal(successes.length, 1)
  })
})

test('TC-09: falha na auditoria mantém o papel do alvo', async () => {
  await withHttpApp(async (context) => {
    const { admin, participantId, poolId } = await setup(context)
    context.database.exec(`
      CREATE TRIGGER fail_promotion_audit BEFORE INSERT ON audit_records
      WHEN NEW.action = 'participation.promoted' AND NEW.result = 'success'
      BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;
    `)

    const response = await context.call('POST', `/pools/${poolId}/participants/${participantId}/promote`, { token: admin.token })

    expectCommonFormat(response, 500, 'internal_error')
    assert.equal(context.participation(participantId).role, 'participant')
  })
})

test('TC-10: bolão encerrado não aceita promoções (409)', async () => {
  await withHttpApp(async (context) => {
    const { admin, participantId, poolId } = await setup(context)
    context.database.prepare("UPDATE pools SET status = 'ended' WHERE id = ?").run(poolId)

    expectCommonFormat(await context.call('POST', `/pools/${poolId}/participants/${participantId}/promote`, { token: admin.token }), 409, 'pool_ended')
    assert.equal(context.participation(participantId).role, 'participant')
  })
})

test('TC-11: depois de várias promoções o bolão continua com exatamente um administrador', async () => {
  await withHttpApp(async (context) => {
    const { admin, participantId, poolId } = await setup(context)
    await context.call('POST', `/pools/${poolId}/participants/${participantId}/promote`, { token: admin.token })
    for (let index = 0; index < 3; index += 1) {
      const id = await context.joinPool(admin, await context.signUp(`Extra ${index}`), poolId)
      assert.equal((await context.call('POST', `/pools/${poolId}/participants/${id}/promote`, { token: admin.token })).status, 200)
    }

    assert.equal(adminCount(context.database, poolId), 1)
  })
})

test('TC-15: não existe operação de rebaixamento do coadministrador', async () => {
  await withHttpApp(async (context) => {
    const { admin, coadminId, poolId } = await setup(context)

    for (const [method, route, body] of [
      ['POST', `/pools/${poolId}/participants/${coadminId}/demote`],
      ['DELETE', `/pools/${poolId}/participants/${coadminId}`],
      ['PATCH', `/pools/${poolId}/participants/${coadminId}`, { role: 'participant' }],
    ]) {
      expectCommonFormat(await context.call(method, route, { token: admin.token, body }), 404, 'not_found')
    }
    assert.equal(context.participation(coadminId).role, 'coadministrator')
    const source = fs.readFileSync(new URL('../../src/backend/app.js', import.meta.url), 'utf8')
    const routes = source.match(/app\.(get|post|put|patch|delete)\('[^']+'/g)
    assert.ok(routes.length > 0)
    assert.equal(routes.some((route) => /demote|rebaix|role/i.test(route)), false)
  })
})
