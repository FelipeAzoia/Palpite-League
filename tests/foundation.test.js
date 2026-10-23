import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { createApp } from '../server/app.js'
import { createDatabase } from '../server/db.js'

test('API informa que a aplicação e o banco estão disponíveis', async () => {
  const database = createDatabase(':memory:')
  const server = createServer(createApp(database))

  await new Promise((resolve) => server.listen(0, resolve))
  const { port } = server.address()
  const response = await fetch(`http://127.0.0.1:${port}/api/health`)
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.deepEqual(body, { status: 'ok', database: 'connected' })
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM technical_events').get().total, 1)

  await new Promise((resolve) => server.close(resolve))
  database.close()
})