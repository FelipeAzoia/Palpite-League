import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { defaultNotificationsIntervalMs } from '../../src/backend/app.js'
import { createSimulatedPaymentsProvider } from '../../src/backend/adapters/simulated-payments-provider.js'
import { createSimulatedSportsProvider } from '../../src/backend/adapters/simulated-sports-provider.js'
import { billingPolicyVersion } from '../../src/backend/modules/payments-subscriptions/index.js'
import { periodEndMs } from '../../src/backend/modules/pools-participations/index.js'
import { expectCommonFormat, withHttpApp } from './support/app-harness.js'

// SPEC-027 — notificações de eventos, com provedores simulados e relógio controlado.

function withNotifications(callback) {
  const sports = createSimulatedSportsProvider()
  const payments = createSimulatedPaymentsProvider()
  return withHttpApp((context) => callback({ ...context, sports, payments }), { sportsProvider: sports, paymentsProvider: payments })
}

const generate = (context) => context.app.locals.tasks.generateNotifications()
const list = (context, user, query = '') => context.call('GET', `/account/notifications${query}`, { token: user.token })
const mine = async (context, user) => (await list(context, user, '?limit=50')).json.notifications

function providerId(context, matchId) {
  return context.database.prepare('SELECT provider_id FROM sports_matches WHERE id = ?').get(matchId).provider_id
}

async function report(context, items) {
  context.sports.setResults({
    matches: items.map(([matchId, status, homeScore = null, awayScore = null]) => ({ id: providerId(context, matchId), status, homeScore, awayScore })),
  })
  await context.app.locals.tasks.syncResults()
}

async function predict(context, user, poolId, matchId) {
  const response = await context.call('PUT', `/pools/${poolId}/matches/${matchId}/prediction`, {
    token: user.token, body: { type: 'exact_score', homeGoals: 2, awayGoals: 1 },
  })
  assert.equal(response.status, 200, response.text)
}

// Bolão sem taxa com duas partidas da mesma rodada: Ana administra; Bruno palpita, Caio não.
async function setup(context) {
  const admin = await context.signUp('Ana')
  const bruno = await context.signUp('Bruno')
  const caio = await context.signUp('Caio')
  const created = await context.createPool(admin, { matchCount: 2, endsOn: '2026-12-31' })
  await context.joinPool(admin, bruno, created.poolId)
  await context.joinPool(admin, caio, created.poolId)
  const [first, second] = created.matches
  await predict(context, bruno, created.poolId, first.id)
  return { admin, bruno, caio, poolId: created.poolId, first, second }
}

async function becomePremium(context, user, decision = 'approve') {
  const created = await context.call('POST', '/account/premium/subscription', { token: user.token, body: { confirm: true, billingPolicyVersion } })
  assert.equal(created.status, 201, created.text)
  await context.call('POST', `/payments/simulated-checkout/${created.json.subscription.movementId}/decision`, { token: user.token, body: { decision } })
  return (await context.call('POST', '/account/premium/subscription/check', { token: user.token })).json.subscription
}

test('CT-01: entrada aprovada notifica quem entrou; com taxa, lembra do pagamento sem mostrar valores', async () => {
  await withNotifications(async (context) => {
    const { bruno, poolId } = await setup(context)
    await generate(context)
    const [approved] = (await mine(context, bruno)).filter(({ type }) => type === 'entry_approved')
    assert.equal(approved.message, 'Sua entrada no bolão "Bolão dos Amigos" foi aprovada.')
    assert.equal(approved.poolId, poolId)
    assert.equal(approved.read, false)

    const admin = await context.signUp('Duda')
    const payer = await context.signUp('Edu')
    const paid = await context.createPool(admin, { entryFee: 25 })
    await context.joinPool(admin, payer, paid.poolId)
    await generate(context)
    const [withFee] = await mine(context, payer)
    assert.match(withFee.message, /Pague a taxa de entrada/)
    assert.equal(/R\$|25/.test(withFee.message), false)
  })
})

test('CT-02, CT-03 e CT-04: resultado só para quem palpitou; correção gera outra; rodada encerrada para todos', async () => {
  await withNotifications(async (context) => {
    const { admin, bruno, caio, first, second } = await setup(context)
    context.startMatch(first.id, { status: 'scheduled' })
    context.startMatch(second.id, { status: 'scheduled' })
    await report(context, [[first.id, 'finished', 2, 1], [second.id, 'in_progress']])
    await generate(context)

    const brunoResults = (await mine(context, bruno)).filter(({ type }) => type === 'result_recorded')
    assert.equal(brunoResults.length, 1)
    assert.match(brunoResults[0].message, /^Resultado oficial: .+ 2 x 1 .+ \(bolão "Bolão dos Amigos"\)\.$/)
    assert.deepEqual(brunoResults[0].reference, { type: 'match', id: first.id })
    assert.equal((await mine(context, caio)).some(({ type }) => type === 'result_recorded'), false)
    // A rodada ainda tem partida em andamento: não está encerrada.
    assert.equal((await mine(context, caio)).some(({ type }) => type === 'round_closed'), false)

    await report(context, [[first.id, 'finished', 0, 3], [second.id, 'in_progress']])
    await generate(context)
    const corrected = (await mine(context, bruno)).filter(({ type }) => type === 'result_corrected')
    assert.equal(corrected.length, 1)
    assert.match(corrected[0].message, /^Resultado oficial corrigido: .+ 0 x 3 /)

    await report(context, [[second.id, 'finished', 1, 1]])
    await generate(context)
    for (const user of [admin, bruno, caio]) {
      const rounds = (await mine(context, user)).filter(({ type }) => type === 'round_closed')
      assert.equal(rounds.length, 1, user.name)
      assert.equal(rounds[0].message, 'A rodada 2 do bolão "Bolão dos Amigos" foi encerrada.')
    }
  })
})

test('CT-05: medalha notifica só quem ganhou', async () => {
  await withNotifications(async (context) => {
    const { bruno, caio, first, second } = await setup(context)
    context.startMatch(first.id, { status: 'scheduled' })
    context.startMatch(second.id, { status: 'scheduled' })
    await report(context, [[first.id, 'finished', 2, 1], [second.id, 'finished', 0, 0]])
    await context.app.locals.tasks.scorePredictions()
    await context.app.locals.tasks.reconcileMedals()
    await generate(context)
    const medals = (await mine(context, bruno)).filter(({ type }) => type === 'medal_awarded')
    assert.equal(medals.length, 1)
    assert.equal(medals[0].message, 'Você ganhou a medalha da rodada 2 no bolão "Bolão dos Amigos"!')
    assert.equal((await mine(context, caio)).some(({ type }) => type === 'medal_awarded'), false)
  })
})

test('CT-06 e CT-07 (parte): assinatura ativada, recusada, cancelada e expirada notificam o titular, com simulação', async () => {
  await withNotifications(async (context) => {
    const ana = await context.signUp('Ana')
    const bruno = await context.signUp('Bruno')
    const caio = await context.signUp('Caio')

    await becomePremium(context, bruno, 'refuse')
    const { endsAt } = await becomePremium(context, ana)
    await generate(context)
    const [activated] = (await mine(context, ana)).filter(({ type }) => type === 'subscription_changed')
    assert.equal(activated.message, 'Sua assinatura Premium foi ativada. (simulação: nenhum dinheiro real foi movimentado)')
    assert.equal(activated.simulated, true)
    const [refused] = await mine(context, bruno)
    assert.equal(refused.message, 'O pagamento da assinatura Premium foi recusado. Seu plano não mudou.')

    // Cancelamento confirmado: no fim do período a assinatura passa a cancelada.
    await context.call('POST', '/account/subscription/cancellation', { token: ana.token, body: { confirm: true } })
    await context.call('POST', '/account/subscription/cancellation/check', { token: ana.token })
    context.clock.current = Date.parse(endsAt)
    await context.app.locals.tasks.processSubscriptions()

    // Renovação não paga: expira no fim da carência.
    const caioSubscription = await becomePremium(context, caio)
    context.payments.setRenewalOutcome('refused')
    context.clock.current = Date.parse(caioSubscription.endsAt)
    await context.app.locals.tasks.processSubscriptions()
    context.clock.current = Date.parse(caioSubscription.endsAt) + 3 * 24 * 60 * 60 * 1000
    await context.app.locals.tasks.processSubscriptions()
    await generate(context)

    assert.ok((await mine(context, ana)).some(({ message }) => message === 'Sua assinatura Premium foi cancelada.'))
    assert.ok((await mine(context, caio)).some(({ message }) => message === 'Sua assinatura Premium terminou e o plano voltou ao Gratuito.'))
  })
})

test('CT-07: premiação concluída notifica o vencedor, identificando a simulação', async () => {
  await withNotifications(async (context) => {
    const admin = await context.signUp('Ana')
    const bruno = await context.signUp('Bruno')
    const created = await context.createPool(admin, { matchCount: 1, endsOn: '2026-12-31', entryFee: 10 })
    const pay = async (user) => {
      const started = await context.call('POST', `/pools/${created.poolId}/entry-fee/payment`, { token: user.token })
      await context.call('POST', `/payments/simulated-checkout/${started.json.payment.id}/decision`, { token: user.token, body: { decision: 'approve' } })
      await context.call('POST', `/pools/${created.poolId}/entry-fee/payment/check`, { token: user.token })
    }
    await pay(admin)
    await context.joinPool(admin, bruno, created.poolId)
    await pay(bruno)
    await predict(context, bruno, created.poolId, created.matches[0].id)
    context.startMatch(created.matches[0].id, { status: 'scheduled' })
    await report(context, [[created.matches[0].id, 'finished', 2, 1]])
    await context.app.locals.tasks.scorePredictions()
    context.clock.current = periodEndMs('2026-12-31')
    await context.app.locals.tasks.closePools()
    assert.equal((await context.call('POST', `/pools/${created.poolId}/prize/request`, { token: bruno.token })).json.state, 'completed')
    await generate(context)

    const [prize] = (await mine(context, bruno)).filter(({ type }) => type === 'prize_completed')
    assert.equal(prize.message, 'Sua premiação do bolão "Bolão dos Amigos" foi paga. (simulação: nenhum dinheiro real foi movimentado)')
    assert.equal(prize.simulated, true)
    assert.equal(/R\$|20/.test(prize.message), false)
  })
})

test('CT-08: atualização ao vivo nunca gera notificação', async () => {
  await withNotifications(async (context) => {
    const { bruno, first } = await setup(context)
    await generate(context)
    const before = (await mine(context, bruno)).length
    context.startMatch(first.id)
    context.database.prepare("INSERT INTO sports_live_scores VALUES (?, 'in_progress', 1, 0, ?, 'simulated')").run(first.id, new Date(context.clock.current).toISOString())
    await context.app.locals.tasks.refreshLiveScores()
    await generate(context)
    assert.equal((await mine(context, bruno)).length, before)
  })
})

test('CT-09: reexecutar a tarefa não duplica notificações', async () => {
  await withNotifications(async (context) => {
    await setup(context)
    const first = await generate(context)
    assert.ok(first.created >= 2)
    const total = context.database.prepare('SELECT COUNT(*) AS n FROM notifications').get().n
    assert.deepEqual(await generate(context), { events: 0, created: 0, failed: 0 })
    // Mesmo reprocessando todos os eventos do zero, a chave natural impede duplicidade.
    context.database.prepare('UPDATE notification_cursor SET last_audit_id = 0, last_medal_rowid = 0').run()
    await generate(context)
    assert.equal(context.database.prepare('SELECT COUNT(*) AS n FROM notifications').get().n, total)
  })
})

test('CT-10 e CT-18: falha em uma notificação não afeta a origem nem os demais eventos; o ciclo seguinte refaz', async () => {
  await withNotifications(async (context) => {
    const { bruno, caio, poolId } = await setup(context)
    const origin = JSON.stringify(context.database.prepare('SELECT * FROM pool_participations ORDER BY id').all())
    context.database.exec(`
      CREATE TEMP TRIGGER fail_bruno BEFORE INSERT ON notifications
      WHEN NEW.user_id = '${bruno.id}' BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;
    `)
    const failed = await generate(context)
    assert.equal(failed.failed, 1)
    assert.equal((await mine(context, caio)).length, 1)
    assert.equal((await mine(context, bruno)).length, 0)
    assert.equal(JSON.stringify(context.database.prepare('SELECT * FROM pool_participations ORDER BY id').all()), origin)
    assert.equal(context.events.some((event) => event.component === 'notifications' && event.result === 'event_failed'), true)

    context.database.exec('DROP TRIGGER fail_bruno')
    await generate(context)
    assert.equal((await mine(context, bruno)).filter(({ type }) => type === 'entry_approved').length, 1)
    assert.equal(context.database.prepare('SELECT COUNT(*) AS n FROM notification_retries').get().n, 0)
    assert.equal(poolId.length > 0, true)
  })
})

test('CT-11: lista própria, mais recente primeiro, paginada, com contagem de não lidas', async () => {
  await withNotifications(async (context) => {
    const { bruno, first, second } = await setup(context)
    await generate(context)
    context.clock.current += 60 * 1000
    context.startMatch(first.id, { status: 'scheduled' })
    context.startMatch(second.id, { status: 'scheduled' })
    await report(context, [[first.id, 'finished', 2, 1], [second.id, 'finished', 0, 0]])
    await generate(context)

    const all = (await list(context, bruno)).json
    assert.equal(all.unreadCount, 3)
    // A entrada aprovada é a mais antiga; resultado e rodada vieram um minuto depois.
    // No mesmo ciclo, a rodada encerrada veio depois do resultado que a fechou.
    assert.deepEqual(all.notifications.slice(0, 2).map(({ type }) => type), ['round_closed', 'result_recorded'])
    assert.equal(all.notifications[2].type, 'entry_approved')

    const page1 = (await list(context, bruno, '?limit=2')).json
    assert.equal(page1.notifications.length, 2)
    assert.ok(page1.nextBefore)
    const page2 = (await list(context, bruno, `?limit=2&before=${page1.nextBefore}`)).json
    assert.equal(page2.notifications.length, 1)
    assert.equal(page2.nextBefore, null)
    assert.equal(new Set([...page1.notifications, ...page2.notifications].map(({ id }) => id)).size, 3)
    expectCommonFormat(await list(context, bruno, '?limit=999'), 400, 'validation_error')
  })
})

test('CT-12 e CT-13: marcar como lida é idempotente; marcar todas só afeta as próprias', async () => {
  await withNotifications(async (context) => {
    const { bruno, caio } = await setup(context)
    await generate(context)
    const [item] = await mine(context, bruno)
    const read = await context.call('POST', `/account/notifications/${item.id}/read`, { token: bruno.token })
    assert.equal(read.status, 200, read.text)
    assert.equal(read.json.notification.read, true)
    assert.equal(read.json.unreadCount, 0)
    const readAt = read.json.notification.readAt
    context.clock.current += 1000
    const again = await context.call('POST', `/account/notifications/${item.id}/read`, { token: bruno.token })
    assert.equal(again.json.notification.readAt, readAt)
    assert.throws(() => context.database.prepare('UPDATE notifications SET read_at = NULL WHERE id = ?').run(item.id))

    const unreadOnly = (await list(context, caio, '?unread=true')).json
    assert.equal(unreadOnly.notifications.length, 1)
    const all = await context.call('POST', '/account/notifications/read-all', { token: caio.token })
    assert.deepEqual(all.json, { updated: 1, unreadCount: 0 })
    assert.equal(context.database.prepare('SELECT COUNT(*) AS n FROM notifications WHERE read_at IS NULL').get().n,
      context.database.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id NOT IN (?, ?) AND read_at IS NULL').get(bruno.id, caio.id).n)
  })
})

test('CT-14: sem sessão é 401; notificação alheia ou inexistente recebe a mesma resposta', async () => {
  await withNotifications(async (context) => {
    const { bruno, caio } = await setup(context)
    await generate(context)
    const [item] = await mine(context, bruno)
    expectCommonFormat(await context.call('GET', '/account/notifications'), 401, 'session_rejected')
    expectCommonFormat(await context.call('POST', `/account/notifications/${item.id}/read`), 401, 'session_rejected')
    const foreign = await context.call('POST', `/account/notifications/${item.id}/read`, { token: caio.token })
    expectCommonFormat(foreign, 404, 'not_found')
    const missing = await context.call('POST', '/account/notifications/nao-existe/read', { token: caio.token })
    assert.equal(missing.json.message, foreign.json.message)
    assert.equal((await mine(context, bruno))[0].read, false)
    assert.equal((await list(context, caio)).text.includes(item.id), false)
  })
})

test('CT-15 e CT-17: conteúdo padronizado, sem segredos nem valores; nenhum envio externo', async () => {
  await withNotifications(async (context) => {
    const calls = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (url, ...rest) => {
      if (!String(url).startsWith('http://127.0.0.1')) calls.push(String(url))
      return realFetch(url, ...rest)
    }
    try {
      const { bruno } = await setup(context)
      await generate(context)
      const text = JSON.stringify(context.database.prepare('SELECT * FROM notifications').all())
      assert.equal(text.includes(bruno.email), false)
      assert.equal(/senha|token|secret|R\$/i.test(text), false)
      assert.deepEqual(calls, [])
    } finally {
      globalThis.fetch = realFetch
    }
  })
})

test('CT-16: quem saiu do bolão mantém as notificações, sem ganhar acesso ao bolão', async () => {
  await withNotifications(async (context) => {
    const { caio, poolId } = await setup(context)
    await generate(context)
    assert.equal((await context.call('POST', `/pools/${poolId}/exit`, { token: caio.token, body: { confirm: true } })).status, 200)
    const notifications = await mine(context, caio)
    assert.equal(notifications.length, 1)
    assert.equal(notifications[0].poolId, poolId)
    expectCommonFormat(await context.call('GET', `/pools/${poolId}`, { token: caio.token }), 404, 'not_found')
  })
})

test('tarefa registrada a cada 1 minuto; a geração não é retroativa', async () => {
  assert.equal(defaultNotificationsIntervalMs, 60 * 1000)
  assert.match(fs.readFileSync(new URL('../../src/backend/index.js', import.meta.url), 'utf8'), /'notifications'/)
  const migration = fs.readFileSync(new URL('../../src/backend/migrations/023-notifications.sql', import.meta.url), 'utf8')
  assert.match(migration, /SELECT COALESCE\(MAX\(id\), 0\) FROM audit_records/)
})
