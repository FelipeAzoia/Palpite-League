import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { createApp } from './app.js'
import { createDatabase } from './db.js'
import { recordTechnicalEvent, writeStartupFailure } from './observability/logger.js'

const startupCorrelationId = randomUUID()
const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '127.0.0.1'
let database

function getDatabase() {
  if (!database?.open) {
    database = createDatabase()
  }

  return database
}

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  writeStartupFailure(startupCorrelationId, 'configuration')
  process.exitCode = 1
} else {
  try {
    getDatabase()
  } catch {
    writeStartupFailure(startupCorrelationId, 'persistence')
  }

  const server = createServer(createApp(getDatabase))

  server.once('error', () => {
    recordTechnicalEvent(getDatabase, {
      level: 'error',
      component: 'application',
      correlationId: startupCorrelationId,
      outcome: 'startup_failed',
    })
    if (database?.open) {
      database.close()
    }
    process.exitCode = 1
  })

  server.listen(port, host, () => {
    recordTechnicalEvent(getDatabase, {
      level: 'info',
      component: 'application',
      correlationId: startupCorrelationId,
      outcome: 'started',
    })
  })

  function shutdown() {
    server.close(() => {
      if (database?.open) {
        database.close()
      }
    })
  }

  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}
