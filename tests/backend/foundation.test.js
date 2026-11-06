import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { createApp } from '../../src/backend/app.js'
import { createDatabase, defaultDatabasePath, runInTransaction } from '../../src/backend/shared/database.js'
import { createLogger } from '../../src/backend/shared/logger.js'
import { runMigrations } from '../../src/backend/shared/migrations.js'

async function withServer(database, logger, callback) {
  const server = createServer(createApp(database, { logger }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

  try {
    await callback(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

test('GET /health informa disponibilidade sem detalhes internos', async () => {
  const database = createDatabase(':memory:')
  const events = []
  const logger = createLogger((event) => events.push(event))

  await withServer(database, logger, async (url) => {
    const response = await fetch(`${url}/health`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { status: 'available' })
    assert.equal(response.headers.get('x-correlation-id'), events[0].correlationId)
    assert.equal(events[0].correlationId, events[1].correlationId)
    assert.deepEqual(Object.keys(events[0]).sort(), ['component', 'correlationId', 'level', 'result', 'timestamp'])

    const secondResponse = await fetch(`${url}/health`)
    assert.notEqual(secondResponse.headers.get('x-correlation-id'), response.headers.get('x-correlation-id'))
    assert.equal(events[2].correlationId, secondResponse.headers.get('x-correlation-id'))
  })

  database.close()
})

test('GET /health retorna 503 e registra a indisponibilidade da persistência', async () => {
  const database = createDatabase(':memory:')
  database.close()
  const events = []
  const logger = createLogger((event) => events.push(event))

  await withServer(database, logger, async (url) => {
    const response = await fetch(`${url}/health`)
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { status: 'unavailable', component: 'persistence' })
    assert.equal(events.at(-1).component, 'persistence')
    assert.equal(events.at(-1).result, 'unavailable')
  })
})

test('operações transacionais persistem por inteiro ou são revertidas', () => {
  const database = createDatabase(':memory:')
  const events = []
  const logger = createLogger((event) => events.push(event))
  database.exec('CREATE TABLE entries (value TEXT NOT NULL)')
  const insert = database.prepare('INSERT INTO entries (value) VALUES (?)')

  runInTransaction(database, () => {
    insert.run('first')
    insert.run('second')
  })
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM entries').get().count, 2)

  assert.throws(() => runInTransaction(database, () => {
    insert.run('third')
    database.prepare('INSERT INTO missing_table (value) VALUES (?)').run('failure')
  }, logger))
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM entries').get().count, 2)
  assert.equal(events[0].component, 'persistence')
  assert.equal(events[0].result, 'transaction_failed')
  database.close()
})

test('consultas parametrizadas armazenam texto com sintaxe SQL literalmente', () => {
  const database = createDatabase(':memory:')
  database.exec('CREATE TABLE entries (value TEXT NOT NULL)')
  const value = "x'); DROP TABLE entries; --"
  database.prepare('INSERT INTO entries (value) VALUES (?)').run(value)

  assert.equal(database.prepare('SELECT value FROM entries').get().value, value)
  database.close()
})

test('migrações numeradas são ordenadas, atômicas e aplicadas uma única vez', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'palpite-migrations-'))
  const database = createDatabase(':memory:')

  try {
    fs.writeFileSync(path.join(directory, '002-second.sql'), "INSERT INTO order_check (name) VALUES ('second');")
    fs.writeFileSync(path.join(directory, '001-first.sql'), "CREATE TABLE order_check (name TEXT); INSERT INTO order_check (name) VALUES ('first');")
    runMigrations(database, directory)
    runMigrations(database, directory)

    assert.deepEqual(database.prepare('SELECT name FROM order_check ORDER BY rowid').all(), [{ name: 'first' }, { name: 'second' }])
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 2)
  } finally {
    database.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('migração com falha reverte suas alterações e registra somente resultado seguro', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'palpite-migration-failure-'))
  const database = createDatabase(':memory:')
  const events = []
  fs.writeFileSync(path.join(directory, '001-failure.sql'), 'CREATE TABLE partial_change (id INTEGER); INVALID SQL;')

  try {
    assert.throws(() => runMigrations(database, directory, createLogger((event) => events.push(event))), /Migration failed/)
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'partial_change'").get().count, 0)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 0)
    assert.equal(events[0].result, 'failed')
  } finally {
    database.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('erros de requisição são correlacionados e não ecoam dados sensíveis', async () => {
  const database = createDatabase(':memory:')
  const events = []
  const logger = createLogger((event) => events.push(event))
  const secret = 'token-super-sensivel'

  await withServer(database, logger, async (url) => {
    const response = await fetch(`${url}/health`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: `{"token":"${secret}", invalid}`,
    })
    const body = await response.text()

    assert.equal(response.status, 400)
    assert.ok(response.headers.get('x-correlation-id'))
    assert.equal(body.includes(secret), false)
    assert.equal(JSON.stringify(events).includes(secret), false)
    assert.equal(events.at(-1).result, 'request_failed')
    assert.equal(events[0].correlationId, events.at(-1).correlationId)
  })

  database.close()
})

test('os sete módulos e a configuração local da fundação existem', () => {
  const moduleNames = [
    'auth-users', 'pools-participations', 'matches-results', 'predictions-scoring',
    'payments-subscriptions', 'notifications-audit', 'external-integrations',
  ]
  for (const name of moduleNames) {
    const moduleFile = new URL(`../../src/backend/modules/${name}/index.js`, import.meta.url)
    assert.ok(fs.existsSync(moduleFile))
    assert.doesNotMatch(fs.readFileSync(moduleFile, 'utf8'), /from\s+['"](?:express|better-sqlite3|axios|node-fetch|mercadopago(?:\/[^'"]*)?|@mercadopago\/[^'"]+)['"]/)
  }
  assert.ok(fs.existsSync(new URL('../../src/backend/adapters', import.meta.url)))
  assert.ok(fs.existsSync(new URL('../../src/backend/shared', import.meta.url)))
  assert.ok(fs.existsSync(new URL('../../src/backend/migrations', import.meta.url)))
  assert.equal(defaultDatabasePath, path.join(fileURLToPath(new URL('../..', import.meta.url)), 'data', 'palpite-league.db'))
  assert.match(fs.readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8'), /^\.env$/m)
  const example = fs.readFileSync(new URL('../../.env.example', import.meta.url), 'utf8').trim().split('\n')
  assert.ok(example.length > 0 && example.every((line) => /^[A-Z_]+=$/.test(line)))
})

test('falha de persistência no startup encerra o processo sem iniciar o servidor', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'palpite-startup-failure-'))
  const projectRoot = fileURLToPath(new URL('../..', import.meta.url))

  try {
    const result = spawnSync(process.execPath, [path.join(projectRoot, 'src/backend/index.js')], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_PATH: directory, PORT: '0' },
    })
    const output = result.stdout.trim().split('\n').map((line) => JSON.parse(line))

    assert.equal(result.status, 1)
    assert.equal(output.at(-1).component, 'startup')
    assert.equal(output.at(-1).result, 'initialization_failed')
    assert.equal(output.some((event) => event.result === 'server_started'), false)
    assert.equal(result.stderr.includes(directory), false)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})