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
    assert.deepEqual(Object.keys(summary.json.pools[0]).sort(), ['name', 'participants', 'poolId', 'position', 'status', 'totalPoints'])
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
