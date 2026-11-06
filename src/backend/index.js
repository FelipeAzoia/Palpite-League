import { createApp } from './app.js'
import { createDatabase } from './shared/database.js'
import { runMigrations } from './shared/migrations.js'
import { createLogger } from './shared/logger.js'

const logger = createLogger()
const port = Number(process.env.PORT || 3000)
let database

try {
  database = createDatabase()
  runMigrations(database, undefined, logger)
} catch {
  logger.error('startup', 'initialization_failed')
  process.exit(1)
}

const server = createApp(database, { logger }).listen(port, () => {
  logger.info('http', 'server_started')
})

function shutdown() {
  server.close(() => {
    database.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)