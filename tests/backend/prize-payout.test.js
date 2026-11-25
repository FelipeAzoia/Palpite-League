import assert from 'node:assert/strict'
import test from 'node:test'
import { createSimulatedPaymentsProvider } from '../../src/backend/adapters/simulated-payments-provider.js'
import { createSimulatedSportsProvider } from '../../src/backend/adapters/simulated-sports-provider.js'
import { prizeActions, splitPrize } from '../../src/backend/modules/payments-subscriptions/index.js'
import { computePrizeShares, periodEndMs } from '../../src/backend/modules/pools-participations/index.js'
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
// predictions: palpites extras por nome, para pontuações diferentes (SPEC-030).
async function setup(context, { winners = ['Bruno'], fee = 10, extra = [], prizeModel = 'winner_takes_all', predictions = {} } = {}) {
  const admin = await context.signUp('Ana')
  const bruno = await context.signUp('Bruno')
  const caio = await context.signUp('Caio')
  const created = await context.createPool(admin, { matchCount: 1, endsOn, entryFee: fee, prizeModel })
  const { poolId } = created
  const [match] = created.matches
  const users = { Ana: admin, Bruno: bruno, Caio: caio }
  if (fee > 0) await payFee(context, admin, poolId)
  for (const user of [bruno, caio]) {
    await context.joinPool(admin, user, poolId)
    if (fee > 0) await payFee(context, user, poolId)
  }
  for (const name of winners) await predict(context, users[name], poolId, match.id, 2, 1)
  for (const [name, body] of Object.entries(predictions)) {
    const response = await context.call('PUT', `/pools/${poolId}/matches/${match.id}/prediction`, { token: users[name].token, body })
    assert.equal(response.status, 200, response.text)
  }
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
    assert.deepEqual(adminView.awardees, [{ name: 'Bruno', place: 1, state: 'completed', isRequester: false }])
    assert.equal(adminView.payment, null)
    assert.equal(JSON.stringify(adminView).includes(payouts(context)[0].operation_key), false)
    assert.equal((await prize(context, bruno, poolId)).json.awardees, undefined)
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

// SPEC-030 — premiação por pódio.

test('SPEC-030 TC-01 a TC-05: partes por modelo, empates, colocações vazias e centavos', () => {
  const row = (participationId, position, totalPoints = 10) => ({ participationId, position, totalPoints })
  const summary = (model, rows, amount) => computePrizeShares(model, rows, amount)
    .map(({ participationId, place, amountCents, percentBasisPoints }) => [participationId, place, amountCents, percentBasisPoints])
  const values = (model, rows, amount) => computePrizeShares(model, rows, amount).map(({ amountCents }) => amountCents)

  // TC-01: cada modelo, sem empate; o 4º não recebe.
  const four = [row('a', 1), row('b', 2), row('c', 3), row('d', 4)]
  assert.deepEqual(summary('podium_50_30_20', four, 10000), [['a', 1, 5000, 5000], ['b', 2, 3000, 3000], ['c', 3, 2000, 2000]])
  assert.deepEqual(values('podium_60_30_10', four, 10000), [6000, 3000, 1000])
  assert.deepEqual(values('podium_70_20_10', four, 10000), [7000, 2000, 1000])

  // TC-02: empates no 1º, no 2º e no 3º.
  assert.deepEqual(summary('podium_50_30_20', [row('a', 1), row('b', 1), row('c', 3), row('d', 4)], 10000),
    [['a', 1, 4000, 4000], ['b', 1, 4000, 4000], ['c', 3, 2000, 2000]])
  assert.deepEqual(values('podium_50_30_20', [row('a', 1), row('b', 1), row('c', 1), row('d', 4)], 9000), [3000, 3000, 3000])
  assert.deepEqual(summary('podium_50_30_20', [row('a', 1), row('b', 2), row('c', 2), row('d', 4)], 10000),
    [['a', 1, 5000, 5000], ['b', 2, 2500, 2500], ['c', 2, 2500, 2500]])
  assert.deepEqual(values('podium_60_30_10', [row('a', 1), row('b', 2), row('c', 3), row('d', 3)], 10000), [6000, 3000, 500, 500])

  // TC-03: menos de três premiados; quem tem zero ponto não recebe.
  assert.deepEqual(summary('podium_50_30_20', [row('a', 1), row('b', 2), row('c', 3, 0)], 8000),
    [['a', 1, 5000, 6250], ['b', 2, 3000, 3750]])
  assert.deepEqual(values('podium_70_20_10', [row('a', 1)], 1234), [1234])
  assert.deepEqual(computePrizeShares('podium_50_30_20', [row('a', 1, 0)], 1000), [])

  // TC-04: a soma fecha com o montante e o resto vai na ordem da classificação.
  const odd = values('podium_50_30_20', [row('a', 1), row('b', 2), row('c', 2)], 1001)
  assert.equal(odd.reduce((sum, value) => sum + value, 0), 1001)
  assert.deepEqual(odd, [501, 250, 250])

  // TC-05: "vencedor leva tudo" é a divisão igual de antes.
  assert.deepEqual(values('winner_takes_all', [row('a', 1), row('b', 1), row('c', 1), row('d', 4)], 1000), splitPrize(1000, 3))
})

test('SPEC-030 TC-07, TC-08 e TC-10: 2º colocado recebe a sua parte; quem não pontuou é recusado; partes fixas', async () => {
  await withPrize(async (context) => {
    // R$ 30,00 arrecadados; Ana crava o placar, Bruno acerta só o vencedor, Caio erra: dois premiados.
    const { admin, bruno, caio, poolId } = await setup(context, {
      winners: ['Ana'],
      prizeModel: 'podium_50_30_20',
      predictions: { Bruno: { type: 'result', outcome: 'home' }, Caio: { type: 'result', outcome: 'away' } },
    })
    const brunoView = (await prize(context, bruno, poolId)).json
    assert.equal(brunoView.state, 'available')
    assert.equal(brunoView.place, 2)
    assert.equal(brunoView.sharePercent, 37.5)
    assert.equal(brunoView.shareCents, 1125)

    expectCommonFormat(await request(context, caio, poolId), 403, 'not_winner')
    const requested = await request(context, bruno, poolId)
    assert.equal(requested.status, 201, requested.text)
    assert.equal(requested.json.shareCents, 1125)

    const stored = context.database.prepare('SELECT place, percent_basis_points, amount_cents FROM pool_prize_shares ORDER BY place').all()
    assert.deepEqual(stored.map((share) => ({ ...share })), [
      { place: 1, percent_basis_points: 6250, amount_cents: 1875 },
      { place: 2, percent_basis_points: 3750, amount_cents: 1125 },
    ])
    assert.throws(() => context.database.prepare('UPDATE pool_prize_shares SET amount_cents = 1').run(), /prize shares are fixed/)

    const adminView = (await prize(context, admin, poolId)).json
    assert.equal(adminView.shareCents, 1875)
    assert.deepEqual(adminView.awardees.map(({ name, place }) => [name, place]), [['Ana', 1], ['Bruno', 2]])

    const final = (await context.call('GET', `/pools/${poolId}/final-result`, { token: caio.token })).json
    assert.equal(final.prizeModel, 'podium_50_30_20')
    assert.deepEqual(final.standings.map(({ name, winner, awarded, prizePercent }) => [name, winner, awarded, prizePercent]), [
      ['Ana', true, true, 62.5], ['Bruno', false, true, 37.5], ['Caio', false, false, null],
    ])
  })
})

test('SPEC-030 TC-09: montante fixado antes da Spec, sem partes gravadas, mantém a divisão igual', async () => {
  await withPrize(async (context) => {
    const { admin, bruno, poolId } = await setup(context, { winners: ['Ana', 'Bruno'] })
    context.database.prepare(`
      INSERT INTO pool_prize_pools (pool_id, amount_cents, currency, winner_count, fixed_at)
      VALUES (?, 3001, 'BRL', 2, '2026-11-20T00:00:00.000Z')
    `).run(poolId)
    assert.equal((await prize(context, admin, poolId)).json.shareCents, 1501)
    const requested = await request(context, bruno, poolId)
    assert.equal(requested.json.shareCents, 1500)
    assert.equal(context.database.prepare('SELECT COUNT(*) AS n FROM pool_prize_shares').get().n, 0)
  })
})

test('SPEC-030 TC-06: a criação aceita os modelos de pódio, que ficam imutáveis, e recusa outro valor', async () => {
  await withPrize(async (context) => {
    const owner = await context.signUp('Ana')
    const { poolId } = await context.createPool(owner, { matchCount: 1, prizeModel: 'podium_70_20_10' })
    assert.equal(context.database.prepare('SELECT prize_model FROM pools WHERE id = ?').get(poolId).prize_model, 'podium_70_20_10')
    assert.throws(() => context.database.prepare("UPDATE pools SET prize_model = 'winner_takes_all' WHERE id = ?").run(poolId), /immutable/)

    const other = await context.signUp('Bruno')
    const matches = (await context.call('GET', '/catalog/rounds/2/matches?status=scheduled', { token: other.token })).json.matches
    const refused = await context.call('POST', '/pools', {
      token: other.token,
      body: {
        name: 'Bolão', startsOn: '2026-11-14', endsOn, entryFee: 0, prizeModel: 'podium_40_40_20',
        tiebreaker: 'exact_scores', selection: { matchIds: [matches[0].id] },
      },
    })
    assert.equal(refused.status, 400, refused.text)
    assert.ok(refused.json.fields.prizeModel)
  })
})
