import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import Database from 'better-sqlite3'
import test from 'node:test'
import { createApp } from '../backend/app.js'
import { createDatabase, executeTransaction } from '../backend/db.js'
import { recordTechnicalEvent } from '../backend/observability/logger.js'

async function withServer(database, callback, options) {
  const server = createServer(createApp(database, options))
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const { port } = server.address()
  try {
    await callback(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

test('health endpoints report the backend and SQLite availability', async () => {
  const database = createDatabase(':memory:')

  try {
    await withServer(database, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`)
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { status: 'ok', database: 'connected' })
      assert.match(response.headers.get('x-correlation-id'), /^[\da-f-]{36}$/i)

      const legacyResponse = await fetch(`${baseUrl}/api/health`)
      assert.equal(legacyResponse.status, 200)
      assert.deepEqual(await legacyResponse.json(), { status: 'ok', database: 'connected' })
    })
  } finally {
    database.close()
  }
})

test('the health endpoint reports persistence failures without claiming success', async () => {
  const database = createDatabase(':memory:')
  const events = []
  database.close()

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`)
    const body = await response.json()

    assert.equal(response.status, 503)
    assert.equal(body.status, 'unavailable')
    assert.equal(body.component, 'persistence')
    assert.match(body.correlationId, /^[\da-f-]{36}$/i)
    assert.ok(events.some((event) => event.component === 'persistence' && event.outcome === 'unavailable'))
    assert.ok(events.every((event) => event.correlationId === body.correlationId))
  }, { logger: (event) => events.push(event) })
})

test('health requests retry SQLite access after an initial connection failure', async () => {
  const database = createDatabase(':memory:')
  const events = []
  let attempts = 0
  const databaseProvider = () => {
    attempts += 1
    if (attempts === 1) {
      throw new Error('Database is not ready.')
    }
    return database
  }

  try {
    await withServer(databaseProvider, async (baseUrl) => {
      const unavailableResponse = await fetch(`${baseUrl}/health`)
      const availableResponse = await fetch(`${baseUrl}/health`)

      assert.equal(unavailableResponse.status, 503)
      assert.equal(availableResponse.status, 200)
    }, { logger: (event) => events.push(event) })

    assert.equal(attempts, 2)
    assert.ok(events.some((event) => event.component === 'persistence' && event.outcome === 'unavailable'))
  } finally {
    database.close()
  }
})

test('SQLite migrations are versioned and upgrade an existing technical-events table', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'palpite-league-migration-'))
  const filename = path.join(directory, 'legacy.db')
  const legacyDatabase = new Database(filename)
  legacyDatabase.exec(`
    CREATE TABLE technical_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    INSERT INTO technical_events (event_type, created_at)
      VALUES ('legacy.event', '2026-01-01T00:00:00.000Z');
  `)
  legacyDatabase.close()

  try {
    const database = createDatabase(filename)
    const columns = new Set(database.pragma('table_info(technical_events)').map(({ name }) => name))
    const legacyEvent = database.prepare('SELECT * FROM technical_events').get()
    const versions = database.prepare('SELECT version FROM schema_migrations ORDER BY version').all()

    assert.ok(columns.has('level'))
    assert.ok(columns.has('component'))
    assert.ok(columns.has('correlation_id'))
    assert.ok(columns.has('outcome'))
    assert.equal(legacyEvent.event_type, 'legacy.event')
    assert.equal(legacyEvent.component, 'legacy')
    assert.equal(versions.length, 2)
    database.close()
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('the transaction helper commits all operations on success and rolls back all on failure', () => {
  const database = createDatabase(':memory:')
  database.exec('CREATE TABLE atomic_values (value TEXT NOT NULL UNIQUE)')

  try {
    executeTransaction(database, () => {
      database.prepare('INSERT INTO atomic_values (value) VALUES (?)').run('first')
      database.prepare('INSERT INTO atomic_values (value) VALUES (?)').run('second')
    })
    assert.equal(database.prepare('SELECT COUNT(*) AS total FROM atomic_values').get().total, 2)

    assert.throws(() => executeTransaction(database, () => {
      database.prepare('INSERT INTO atomic_values (value) VALUES (?)').run('third')
      database.prepare('INSERT INTO atomic_values (value) VALUES (?)').run('first')
    }))
    assert.equal(database.prepare('SELECT COUNT(*) AS total FROM atomic_values').get().total, 2)
    assert.equal(database.prepare('SELECT outcome FROM technical_events').get().outcome, 'transaction_failed')
  } finally {
    database.close()
  }
})

test('SQL values are parameterized and preserved literally', () => {
  const database = createDatabase(':memory:')
  database.exec('CREATE TABLE literal_values (value TEXT NOT NULL)')
  const value = `quoted'; DROP TABLE literal_values; --`

  try {
    database.prepare('INSERT INTO literal_values (value) VALUES (?)').run(value)
    assert.equal(database.prepare('SELECT value FROM literal_values').get().value, value)
    assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get('literal_values').name, 'literal_values')
  } finally {
    database.close()
  }
})

test('technical events have the required fields and use a generated timestamp', () => {
  const database = createDatabase(':memory:')
  const correlationId = 'test-correlation'

  try {
    const event = recordTechnicalEvent(database, {
      level: 'error',
      component: 'test',
      correlationId,
      outcome: 'failure',
    })
    const stored = database.prepare(`
      SELECT created_at, level, component, correlation_id, outcome
      FROM technical_events
    `).get()

    assert.match(event.timestamp, /^\d{4}-\d{2}-\d{2}T.*Z$/)
    assert.equal(stored.created_at, event.timestamp)
    assert.equal(stored.level, 'error')
    assert.equal(stored.component, 'test')
    assert.equal(stored.correlation_id, correlationId)
    assert.equal(stored.outcome, 'failure')
  } finally {
    database.close()
  }
})

test('all events within one request share a correlation ID and separate requests do not', async () => {
  const database = createDatabase(':memory:')

  try {
    await withServer(database, async (baseUrl) => {
      const firstResponse = await fetch(`${baseUrl}/health`)
      const firstCorrelationId = firstResponse.headers.get('x-correlation-id')
      const secondResponse = await fetch(`${baseUrl}/health`)
      const secondCorrelationId = secondResponse.headers.get('x-correlation-id')
      const events = database.prepare(`
        SELECT correlation_id
        FROM technical_events
        ORDER BY id
      `).all()

      assert.notEqual(firstCorrelationId, secondCorrelationId)
      assert.equal(events.length, 4)
      assert.deepEqual(new Set(events.slice(0, 2).map(({ correlation_id }) => correlation_id)), new Set([firstCorrelationId]))
      assert.deepEqual(new Set(events.slice(2).map(({ correlation_id }) => correlation_id)), new Set([secondCorrelationId]))
    })
  } finally {
    database.close()
  }
})

test('request failures do not expose request secrets in responses or technical events', async () => {
  const database = createDatabase(':memory:')
  const secret = 'token-value-that-must-not-be-logged'

  try {
    await withServer(database, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/not-a-business-endpoint`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: `{"token":"${secret}",}`,
      })
      const responseText = await response.text()
      const events = database.prepare('SELECT * FROM technical_events').all()

      assert.equal(response.status, 400)
      assert.ok(!responseText.includes(secret))
      assert.ok(!JSON.stringify(events).includes(secret))
    })
  } finally {
    database.close()
  }
})

test('domain responsibility modules are identifiable and isolated from HTTP and provider SDKs', async () => {
  const modulesDirectory = new URL('../backend/modules/', import.meta.url)
  const expectedModules = [
    'audit',
    'authentication-users',
    'external-integrations',
    'guesses',
    'matches-results',
    'notifications',
    'payments-subscriptions',
    'pools-participations',
    'scoring',
  ]
  const actualModules = fs.readdirSync(modulesDirectory).sort()
  assert.deepEqual(actualModules, expectedModules)

  for (const moduleName of actualModules) {
    const modulePath = new URL(`../backend/modules/${moduleName}/index.js`, import.meta.url)
    const source = fs.readFileSync(modulePath, 'utf8')
    assert.doesNotMatch(source, /from\s+['"](?:express|node:http|mercadopago|axios|node-fetch)/i)
  }
})

test('the project starts one backend application for the modular monolith', () => {
  const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const backendEntry = fs.readFileSync(new URL('../backend/index.js', import.meta.url), 'utf8')
  const modulesDirectory = new URL('../backend/modules/', import.meta.url)
  const moduleSources = fs.readdirSync(modulesDirectory)
    .map((moduleName) => fs.readFileSync(new URL(`../backend/modules/${moduleName}/index.js`, import.meta.url), 'utf8'))

  assert.match(packageJson.scripts.start, /backend\/index\.js/)
  assert.equal((backendEntry.match(/createServer\(/g) ?? []).length, 1)
  assert.ok(moduleSources.every((source) => !source.includes('createServer(')))
})
