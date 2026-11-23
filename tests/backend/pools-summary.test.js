import assert from 'node:assert/strict'
import test from 'node:test'
import { expectCommonFormat, withHttpApp } from './support/app-harness.js'

// Resumo da página inicial: pontos e colocação do próprio usuário em cada bolão.

function setPoints(context, poolId, user, points) {
  context.database.prepare('UPDATE pool_participations SET total_points = ? WHERE pool_id = ? AND user_id = ?').run(points, poolId, user.id)
}

test('resumo mostra pontos e colocação do próprio usuário em cada bolão, igual ao ranking do bolão', async () => {
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const bruno = await context.signUp('Bruno')
    const carla = await context.signUp('Carla')

    const first = await context.createPool(ana)
    await context.joinPool(ana, bruno, first.poolId)
    context.clock.current += 60 * 1000
    const second = await context.createPool(bruno)
    await context.joinPool(bruno, ana, second.poolId)
    await context.joinPool(bruno, carla, second.poolId)

    setPoints(context, first.poolId, ana, 5)
    setPoints(context, first.poolId, bruno, 9)
    setPoints(context, second.poolId, ana, 7)
    setPoints(context, second.poolId, bruno, 3)
    setPoints(context, second.poolId, carla, 7)

    const summary = await context.call('GET', '/account/pools-summary', { token: ana.token })
    assert.equal(summary.status, 200, summary.text)
    assert.deepEqual(summary.json.pools.map(({ poolId, totalPoints, participants }) => [poolId, totalPoints, participants]), [
      [second.poolId, 7, 3],
      [first.poolId, 5, 2],
    ])
    assert.equal(summary.json.pools[1].position, 2)
    assert.equal(summary.json.pools[0].name, 'Bolão dos Amigos')
    assert.equal(summary.json.pools[0].status, 'active')

    // A colocação é a mesma da consulta do ranking do bolão, inclusive em empate.
    for (const pool of summary.json.pools) {
      const ranking = await context.call('GET', `/pools/${pool.poolId}/ranking`, { token: ana.token })
      assert.equal(pool.position, ranking.json.participants.find((row) => row.isRequester).position)
    }

    // Nenhum dado de outro participante além da contagem.
    assert.equal(summary.text.includes('Bruno') || summary.text.includes('Carla'), false)
    assert.deepEqual(Object.keys(summary.json.pools[0]).sort(), [
      'latestRound', 'name', 'participants', 'poolId', 'position', 'previousPosition', 'roundPoints', 'status', 'totalPoints',
    ])
    // Sem partida encerrada ainda: nada de novo e nada para comparar.
    assert.equal(summary.json.pools[0].latestRound, null)
    assert.equal(summary.json.pools[0].roundPoints, 0)
    assert.equal(summary.json.pools[0].previousPosition, null)
  })
})

test('resumo traz os pontos da rodada mais recente e a colocação antes dela (subiu, caiu, manteve)', async () => {
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const bruno = await context.signUp('Bruno')
    const carla = await context.signUp('Carla')
    const matchesOf = async (round) => (await context.call('GET', `/catalog/rounds/${round}/matches?status=scheduled`, { token: ana.token })).json.matches
    const [r1a] = await matchesOf(1)
    const [r2a, r2b] = await matchesOf(2)
    const { poolId } = await context.createPool(ana, { selection: { matchIds: [r1a.id, r2a.id, r2b.id] } })
    await context.joinPool(ana, bruno, poolId)
    await context.joinPool(ana, carla, poolId)

    const participationOf = (user) => context.database.prepare('SELECT id FROM pool_participations WHERE pool_id = ? AND user_id = ?').get(poolId, user.id).id
    let counter = 0
    function scored(user, matchId, points) {
      counter += 1
      context.database.prepare(`
        INSERT INTO predictions (id, participation_id, match_id, type, predicted_outcome, points, submitted_at)
        VALUES (?, ?, ?, 'result', 'home', ?, '2026-11-14T15:00:00.000Z')
      `).run(`pred-${counter}`, participationOf(user), matchId, points)
    }
    const finish = (matchId) => context.database.prepare("UPDATE sports_matches SET status = 'finished', starts_at = '2026-11-10T15:00:00.000Z' WHERE id = ?").run(matchId)

    // Rodada 1: Ana 5, Bruno 2, Carla 2 → Ana 1º, Bruno e Carla 2º (empate).
    finish(r1a.id)
    scored(ana, r1a.id, 5)
    scored(bruno, r1a.id, 2)
    scored(carla, r1a.id, 2)
    const roundOne = new Map((await context.call('GET', '/account/pools-summary', { token: ana.token })).json.pools.map((pool) => [pool.poolId, pool]))
    assert.equal(roundOne.get(poolId).latestRound, 1)
    assert.equal(roundOne.get(poolId).roundPoints, 5)
    assert.equal(roundOne.get(poolId).previousPosition, null)

    // Rodada 2: Ana 0, Bruno 7, Carla 0 → Bruno 9, Ana 5, Carla 2.
    finish(r2a.id)
    finish(r2b.id)
    scored(bruno, r2a.id, 5)
    scored(bruno, r2b.id, 2)
    scored(ana, r2a.id, 0)
    scored(carla, r2a.id, 0)
    for (const [user, total] of [[ana, 5], [bruno, 9], [carla, 2]]) {
      context.database.prepare('UPDATE pool_participations SET total_points = ? WHERE id = ?').run(total, participationOf(user))
    }

    const summaryOf = async (user) => (await context.call('GET', '/account/pools-summary', { token: user.token })).json.pools[0]
    const anaNow = await summaryOf(ana)
    assert.deepEqual([anaNow.latestRound, anaNow.roundPoints, anaNow.totalPoints, anaNow.position, anaNow.previousPosition], [2, 0, 5, 2, 1])
    const brunoNow = await summaryOf(bruno)
    assert.deepEqual([brunoNow.roundPoints, brunoNow.totalPoints, brunoNow.position, brunoNow.previousPosition], [7, 9, 1, 2])
    const carlaNow = await summaryOf(carla)
    assert.deepEqual([carlaNow.roundPoints, carlaNow.position, carlaNow.previousPosition], [0, 3, 2])

    // A colocação atual continua igual à do ranking do bolão.
    for (const user of [ana, bruno, carla]) {
      const ranking = await context.call('GET', `/pools/${poolId}/ranking`, { token: user.token })
      assert.equal((await summaryOf(user)).position, ranking.json.participants.find((row) => row.isRequester).position)
    }
  })
})

test('resumo ignora participações não confirmadas, fica vazio sem bolões e exige sessão', async () => {
  await withHttpApp(async (context) => {
    const ana = await context.signUp('Ana')
    const bruno = await context.signUp('Bruno')
    const { poolId } = await context.createPool(ana)
    await context.requestEntry(ana, bruno, poolId)

    assert.deepEqual((await context.call('GET', '/account/pools-summary', { token: bruno.token })).json, { pools: [] })
    expectCommonFormat(await context.call('GET', '/account/pools-summary'), 401, 'session_rejected')
  })
})
