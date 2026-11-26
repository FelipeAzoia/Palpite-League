import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { demoPassword, needsDemoSeed, seedDemoData } from '../../src/backend/demo-seed.js'
import { withHttpApp } from './support/app-harness.js'

// Deploy num serviço só (Railway): dados de demonstração na primeira subida e front compilado
// servido pelo back.

test('os dados de demonstração são montados pela API só com o banco sem usuários', async () => {
  await withHttpApp(async (context) => {
    assert.equal(needsDemoSeed(context.database), true)
    const result = await seedDemoData({ baseUrl: context.origin, now: () => context.clock.current })
    assert.equal(result.accounts, 9)
    assert.equal(result.pools, 3)
    assert.ok(result.predictions > 100)
    assert.equal(needsDemoSeed(context.database), false)

    const count = (sql) => context.database.prepare(sql).get().n
    assert.equal(count("SELECT COUNT(*) AS n FROM users WHERE normalized_email LIKE 'teste%@gmail.com'"), 9)
    assert.equal(context.database.prepare("SELECT plan FROM users WHERE normalized_email = 'teste2@gmail.com'").get().plan, 'premium')
    const pools = context.database.prepare('SELECT name, prize_model AS model FROM pools').all()
    assert.deepEqual(Object.fromEntries(pools.map(({ name, model }) => [name, model])), {
      'Bolão da Turma': 'podium_50_30_20',
      'Bolão Valendo': 'winner_takes_all',
      'Bolão dos Clássicos': 'podium_70_20_10',
    })
    assert.equal(count("SELECT COUNT(*) AS n FROM pool_participations WHERE status <> 'confirmed'"), 0)
    assert.equal(count("SELECT COUNT(*) AS n FROM pool_participations pp JOIN pools p ON p.id = pp.pool_id WHERE p.name = 'Bolão Valendo' AND pp.payment_confirmed = 1"), 6)
    // Nenhuma sessão aberta pelo script fica ativa, e as contas entram com a senha de demonstração.
    assert.equal(count('SELECT COUNT(*) AS n FROM auth_sessions WHERE revoked_at IS NULL'), 0)
    const login = await context.call('POST', '/auth/login', { body: { email: 'teste7@gmail.com', password: demoPassword } })
    assert.equal(login.status, 200, login.text)
  })
})

test('com a pasta do front, o back serve a interface e mantém a API e o 404', async () => {
  const frontendDir = fs.mkdtempSync(path.join(os.tmpdir(), 'palpite-front-'))
  fs.mkdirSync(path.join(frontendDir, 'assets'))
  fs.writeFileSync(path.join(frontendDir, 'index.html'), '<!doctype html><title>Palpite League</title>')
  fs.writeFileSync(path.join(frontendDir, 'assets', 'app-abc123.js'), 'console.log(1)')

  await withHttpApp(async (context) => {
    const page = await context.call('GET', '/')
    assert.equal(page.status, 200)
    assert.match(page.headers.get('content-type'), /text\/html/)
    assert.match(page.text, /Palpite League/)

    const asset = await context.call('GET', '/assets/app-abc123.js')
    assert.equal(asset.status, 200)

    assert.equal((await context.call('GET', '/health')).json.status, 'available')
    assert.equal((await context.call('GET', '/pools')).status, 401)
    assert.equal((await context.call('GET', '/nao-existe')).status, 404)
  }, { frontendDir })

  await withHttpApp(async (context) => {
    assert.equal((await context.call('GET', '/')).status, 404)
  })
  fs.rmSync(frontendDir, { recursive: true, force: true })
})
