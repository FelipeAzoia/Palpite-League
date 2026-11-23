import assert from 'node:assert/strict'
import test from 'node:test'
import { createSimulatedPaymentsProvider } from '../../src/backend/adapters/simulated-payments-provider.js'
import { createSimulatedSportsProvider } from '../../src/backend/adapters/simulated-sports-provider.js'
import { prizeActions, splitPrize } from '../../src/backend/modules/payments-subscriptions/index.js'
import { periodEndMs } from '../../src/backend/modules/pools-participations/index.js'
import { expectCommonFormat, withHttpApp } from './support/app-harness.js'

// SPEC-026 — solicitação e processamento da premiação, com provedores simulados e relógio controlado.

function withPrize(callback) {
  const sports = createSimulatedSportsProvider()
  const payments = createSimulatedPaymentsProvider()
  return withHttpApp((context) => callback({ ...context, sports, payments }), { sportsProvider: sports, paymentsProvider: payments })
}

const endsOn = '2026-12-31'

function key(context, movementId) {
  return context.database.prepare('SELECT operation_key FROM financial_movements WHERE id = ?').get(movementId).operation_key
}

async function payFee(context, user, poolId) {
  const started = await context.call('POST', `/pools/${poolId}/entry-fee/payment`, { token: user.token })
  assert.equal(started.status, 201, started.text)
  context.payments.confirm(key(context, started.json.payment.id))
  await context.call('POST', `/pools/${poolId}/entry-fee/payment/check`, { token: user.token })
}

async function predict(context, user, poolId, matchId, homeGoals, awayGoals) {
  const response = await context.call('PUT', `/pools/${poolId}/matches/${matchId}/prediction`, {
    token: user.token, body: { type: 'exact_score', homeGoals, awayGoals },
  })
  assert.equal(response.status, 200, response.text)
}

// Encerra o bolão: publica o resultado oficial, pontua e avança o relógio até o fim do período.
async function finish(context, matchId) {
  context.startMatch(matchId, { status: 'scheduled' })
  const providerId = context.database.prepare('SELECT provider_id FROM sports_matches WHERE id = ?').get(matchId).provider_id
  context.sports.setResults({ matches: [{ id: providerId, status: 'finished', homeScore: 2, awayScore: 1 }] })
  await context.app.locals.tasks.syncResults()
  await context.app.locals.tasks.scorePredictions()
  context.clock.current = periodEndMs(endsOn)
  const closed = await context.app.locals.tasks.closePools()
  assert.equal(closed.closed, 1, JSON.stringify(closed))
}

// Bolão com taxa de R$ 10,00 e três pagantes. winners: quem acerta o placar (2 a 1).
async function setup(context, { winners = ['Bruno'], fee = 10, extra = [] } = {}) {
  const admin = await context.signUp('Ana')
  const bruno = await context.signUp('Bruno')
  const caio = await context.signUp('Caio')
  const created = await context.createPool(admin, { matchCount: 1, endsOn, entryFee: fee })
  const { poolId } = created
  const [match] = created.matches
  const users = { Ana: admin, Bruno: bruno, Caio: caio }
  if (fee > 0) await payFee(context, admin, poolId)
  for (const user of [bruno, caio]) {
    await context.joinPool(admin, user, poolId)
    if (fee > 0) await payFee(context, user, poolId)
  }
  for (const name of winners) await predict(context, users[name], poolId, match.id, 2, 1)
  for (const step of extra) await step({ ...users, poolId, match })
  await finish(context, match.id)
  return { admin, bruno, caio, poolId, match }
}

const prize = (context, user, poolId) => context.call('GET', `/pools/${poolId}/prize`, { token: user.token })
const request = (context, user, poolId, body) => context.call('POST', `/pools/${poolId}/prize/request`, { token: user.token, body })

function payouts(context) {
  return context.database.prepare("SELECT * FROM financial_movements WHERE type = 'payout' ORDER BY created_at, attempt_number").all()
}

function audits(context, action) {
  return context.database.prepare('SELECT * FROM audit_records WHERE action = ? ORDER BY id').all(action)
    .map((row) => ({ ...row, details: row.details_json === null ? null : JSON.parse(row.details_json) }))
}

test('CT-01, CT-05 e CT-15: o vencedor único recebe o montante arrecadado; simulação e integração não atendida', async () => {
  await withPrize(async (context) => {
    const { bruno, poolId } = await setup(context)
    const before = (await prize(context, bruno, poolId)).json
    assert.equal(before.state, 'available')
    assert.equal(before.shareCents, 3000)
    assert.equal(before.canRequest, true)
    assert.equal(before.prizeModel, 'winner_takes_all')

    const response = await request(context, bruno, poolId)
    assert.equal(response.status, 201, response.text)
    assert.equal(response.json.state, 'completed')
    assert.equal(response.json.share, '30.00')
    assert.equal(response.json.simulated, true)
    assert.equal(response.json.payment.simulated, true)
    assert.deepEqual(response.json.integration, { attended: false, reason: 'sandbox_not_validated' })

    const [payout] = payouts(context)
    assert.equal(payout.status, 'confirmed')
    assert.equal(payout.amount_cents, 3000)
    assert.equal(payout.user_id, bruno.id)
    assert.equal(payout.origin, 'simulator')
    assert.match(payout.operation_key, /^payout:.+:attempt-1$/)
    assert.equal(context.database.prepare('SELECT amount_cents, winner_count FROM pool_prize_pools').get().amount_cents, 3000)
    assert.equal(audits(context, prizeActions.requested)[0].actor_id, bruno.id)
    assert.equal(audits(context, prizeActions.completed)[0].actor_type, 'system')
    const history = (await context.call('GET', '/account/financial-history', { token: bruno.token })).json.movements
    assert.equal(history.find(({ type }) => type === 'payout').simulated, true)
  })
})

test('CT-02: valor enviado pelo cliente é rejeitado e nada é criado', async () => {
  await withPrize(async (context) => {
    const { bruno, poolId } = await setup(context)
    const response = await request(context, bruno, poolId, { amountCents: 999999 })
    expectCommonFormat(response, 400, 'validation_error')
    assert.equal(payouts(context).length, 0)
    assert.equal(context.database.prepare('SELECT COUNT(*) AS n FROM pool_prize_pools').get().n, 0)
  })
})

test('CT-03: não vencedor é recusado e auditado; bolão ativo e sem vencedor recebem conflito', async () => {
  await withPrize(async (context) => {
    const { caio, poolId } = await setup(context)
    expectCommonFormat(await request(context, caio, poolId), 403, 'not_winner')
    assert.equal(audits(context, prizeActions.requested)[0].result, 'denied')
    assert.equal((await prize(context, caio, poolId)).json.state, 'not_winner')
    assert.equal(payouts(context).length, 0)
  })
  await withPrize(async (context) => {
    const admin = await context.signUp('Ana')
    const created = await context.createPool(admin, { matchCount: 1, endsOn })
    expectCommonFormat(await request(context, admin, created.poolId), 409, 'pool_not_ended')
    const view = await prize(context, admin, created.poolId)
    assert.equal(view.status, 200, view.text)
    assert.equal(view.json.state, 'pool_not_ended')
  })
  await withPrize(async (context) => {
    // Ninguém acerta: bolão encerrado sem vencedor.
    const { bruno, poolId } = await setup(context, { winners: [] })
    expectCommonFormat(await request(context, bruno, poolId), 409, 'no_winner')
    assert.equal((await prize(context, bruno, poolId)).json.state, 'no_winner')
    assert.equal(payouts(context).length, 0)
  })
})

test('CT-04 e CT-10: duplicidade e solicitações simultâneas criam um único repasse', async () => {
  await withPrize(async (context) => {
    const { bruno, poolId } = await setup(context)
    context.payments.setPayoutOutcome('pending')
    const responses = await Promise.all([request(context, bruno, poolId), request(context, bruno, poolId), request(context, bruno, poolId)])
    assert.deepEqual(responses.map(({ status }) => status).sort(), [201, 409, 409])
    expectCommonFormat(await request(context, bruno, poolId), 409, 'prize_in_progress')
    assert.equal(payouts(context).length, 1)

    context.payments.confirm(payouts(context)[0].operation_key)
    await context.app.locals.tasks.reconcilePayments()
    expectCommonFormat(await request(context, bruno, poolId), 409, 'prize_completed')
    assert.equal(payouts(context).length, 1)
  })
})

test('CT-06, CT-07 e CT-09: recusa não se repete sozinha; nova tentativa do vencedor usa o número seguinte', async () => {
  await withPrize(async (context) => {
    const { bruno, poolId } = await setup(context)
    context.payments.setPayoutOutcome('pending')
    await request(context, bruno, poolId)
    assert.equal((await prize(context, bruno, poolId)).json.state, 'processing')

    context.payments.refuse(payouts(context)[0].operation_key)
    await context.app.locals.tasks.reconcilePayments()
    const refused = (await prize(context, bruno, poolId)).json
    assert.equal(refused.state, 'refused')
    assert.equal(refused.canRequest, true)
    assert.equal(audits(context, prizeActions.refused)[0].result, 'failure')
    const starts = context.payments.calls.start
    await context.app.locals.tasks.reconcilePayments()
    assert.equal(context.payments.calls.start, starts)

    context.payments.setPayoutOutcome('confirmed')
    const retried = await request(context, bruno, poolId)
    assert.equal(retried.status, 201, retried.text)
    assert.equal(retried.json.state, 'completed')
    assert.equal(retried.json.payment.attemptNumber, 2)
    const [first, second] = payouts(context)
    assert.equal(first.status, 'refused')
    assert.equal(second.amount_cents, first.amount_cents)
    assert.match(second.operation_key, /:attempt-2$/)
  })
})

test('CT-08: indisponibilidade, tempo esgotado e resposta ambígua mantêm pendente', async () => {
  for (const [stage, code, afterRegistering] of [['start', 'response_error', false], ['start', 'timeout', true], ['consult', 'invalid_response', false]]) {
    await withPrize(async (context) => {
      const { bruno, poolId } = await setup(context)
      context.payments.failNext(stage, code, { afterRegistering })
      const response = await request(context, bruno, poolId)
      assert.equal(response.status, 201, response.text)
      assert.equal(response.json.state, 'processing', `${stage}/${code}`)
      assert.equal(payouts(context)[0].status, 'pending')
    })
  }
})

test('CT-11: confirmação repetida não tem efeito adicional', async () => {
  await withPrize(async (context) => {
    const { bruno, poolId } = await setup(context)
    await request(context, bruno, poolId)
    const audited = context.database.prepare('SELECT COUNT(*) AS n FROM audit_records').get().n
    context.payments.confirm(payouts(context)[0].operation_key)
    await context.app.locals.tasks.reconcilePayments()
    await context.app.locals.tasks.reconcilePayments()
    assert.equal(context.database.prepare('SELECT COUNT(*) AS n FROM audit_records').get().n, audited)
    assert.equal(payouts(context).length, 1)
  })
})

test('CT-12: co-vencedores dividem o mesmo montante fixado, sem exceder o total', async () => {
  assert.deepEqual(splitPrize(1000, 3), [334, 333, 333])
  assert.deepEqual(splitPrize(3000, 2), [1500, 1500])
  await withPrize(async (context) => {
    // Taxa de R$ 3,34 e três pagantes: R$ 10,02 divididos entre três co-vencedores.
    const { admin, bruno, caio, poolId } = await setup(context, { winners: ['Ana', 'Bruno', 'Caio'], fee: '3.34' })
    const shares = []
    for (const user of [caio, admin, bruno]) {
      const response = await request(context, user, poolId)
      assert.equal(response.status, 201, response.text)
      shares.push(response.json.shareCents)
    }
    const total = context.database.prepare('SELECT amount_cents FROM pool_prize_pools').get().amount_cents
    assert.equal(total, 1002)
    assert.deepEqual([...shares].sort(), [334, 334, 334])
    assert.equal(payouts(context).reduce((sum, row) => sum + row.amount_cents, 0), total)
  })
})

test('CT-13: com devolução aprovada em processamento, a solicitação aguarda; concluída, o montante a desconta', async () => {
  await withPrize(async (context) => {
    let refundId
    const { bruno, poolId } = await setup(context, {
      extra: [async ({ Ana: admin, Caio: caio, poolId: id }) => {
        // Caio sai, pede a devolução e Ana aprova antes do encerramento.
        await context.call('POST', `/pools/${id}/exit`, { token: caio.token, body: { confirm: true } })
        refundId = (await context.call('POST', `/pools/${id}/refund-request`, { token: caio.token })).json.request.id
        await context.call('POST', `/pools/${id}/refund-requests/${refundId}/approve`, { token: admin.token })
      }],
    })
    context.payments.setRefundOutcome('pending')
    await context.app.locals.tasks.processRefunds()
    expectCommonFormat(await request(context, bruno, poolId), 409, 'waiting_refunds')
    assert.equal((await prize(context, bruno, poolId)).json.state, 'waiting_refunds')
    assert.equal(payouts(context).length, 0)

    const refund = context.database.prepare("SELECT operation_key FROM financial_movements WHERE type = 'refund'").get()
    context.payments.confirm(refund.operation_key)
    await context.app.locals.tasks.reconcilePayments()
    const response = await request(context, bruno, poolId)
    assert.equal(response.status, 201, response.text)
    assert.equal(response.json.shareCents, 2000)
  })
})

test('CT-14: valor divergente informado pelo provedor não confirma; fica pendente e sinalizado', async () => {
  await withPrize(async (context) => {
    const { bruno, poolId } = await setup(context)
    context.payments.setPayoutOutcome('amount_mismatch')
    const response = await request(context, bruno, poolId)
    assert.equal(response.json.state, 'processing')
    assert.equal(response.json.payment.inconsistent, true)
    assert.equal(payouts(context)[0].inconsistency, 'amount_mismatch')
  })
})

test('CT-16 e CT-17: sem vínculo recebe 404; a administração só vê o estado e não pede em nome do vencedor', async () => {
  await withPrize(async (context) => {
    const { admin, bruno, poolId } = await setup(context)
    const outsider = await context.signUp('Duda')
    const own = await prize(context, outsider, poolId)
    expectCommonFormat(own, 404, 'not_found')
    assert.equal((await prize(context, outsider, '00000000-0000-4000-8000-000000000000')).json.message, own.json.message)
    expectCommonFormat(await request(context, outsider, poolId), 404, 'not_found')
    expectCommonFormat(await context.call('GET', `/pools/${poolId}/prize`), 401, 'session_rejected')

    // A administradora não venceu: não consegue solicitar, e não existe rota para pedir por outro.
    expectCommonFormat(await request(context, admin, poolId), 403, 'not_winner')
    for (const route of [`/pools/${poolId}/prize/${bruno.id}/request`, `/pools/${poolId}/prize/block`]) {
      assert.equal((await context.call('POST', route, { token: admin.token })).status, 404)
    }
    await request(context, bruno, poolId)
    const adminView = (await prize(context, admin, poolId)).json
    assert.deepEqual(adminView.winners, [{ name: 'Bruno', state: 'completed', isRequester: false }])
    assert.equal(adminView.payment, null)
    assert.equal(JSON.stringify(adminView).includes(payouts(context)[0].operation_key), false)
    assert.equal((await prize(context, bruno, poolId)).json.winners, undefined)
  })
})

test('CT-18: resultado final, ranking, participações e devoluções ficam intactos', async () => {
  await withPrize(async (context) => {
    const { bruno, poolId } = await setup(context)
    const snapshot = () => JSON.stringify([
      context.database.prepare('SELECT * FROM pool_final_results').all(),
      context.database.prepare('SELECT * FROM pool_final_standings ORDER BY participation_id').all(),
      context.database.prepare('SELECT id, status, total_points FROM pool_participations ORDER BY id').all(),
      context.database.prepare('SELECT * FROM refund_requests').all(),
    ])
    const before = snapshot()
    await request(context, bruno, poolId)
    assert.equal(snapshot(), before)
  })
})

test('CT-19: auditoria em UTC e sem segredos', async () => {
  await withPrize(async (context) => {
    const { bruno, poolId } = await setup(context)
    const before = context.responses.length
    await request(context, bruno, poolId)
    const records = context.database.prepare("SELECT * FROM audit_records WHERE action LIKE 'prize.%'").all()
    assert.equal(records.length, 2)
    for (const record of records) assert.equal(new Date(record.occurred_at).toISOString(), record.occurred_at)
    const text = JSON.stringify(records) + context.responses.slice(before).join('')
    assert.equal(text.includes(bruno.email), false)
    assert.equal(/senha|secret|access_token/i.test(text), false)
  })
})

test('CT-20: bolão sem taxa não tem valor a pagar e não cria movimentação', async () => {
  await withPrize(async (context) => {
    const { bruno, poolId } = await setup(context, { fee: 0 })
    assert.equal((await prize(context, bruno, poolId)).json.state, 'nothing_to_pay')
    expectCommonFormat(await request(context, bruno, poolId), 409, 'nothing_to_pay')
    assert.equal(payouts(context).length, 0)
  })
})
