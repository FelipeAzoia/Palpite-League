import { createApp, defaultResultsSyncIntervalMs } from './app.js'
import { createDatabase } from './shared/database.js'
import { runMigrations } from './shared/migrations.js'
import { createLogger } from './shared/logger.js'
import { createScheduler } from './shared/scheduler.js'

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

const app = createApp(database, { logger })

// Tarefas periódicas em processo (ADR-0006): cada uma roda logo após a inicialização e depois
// a cada intervalo, sem sobreposição.
const scheduler = createScheduler({ logger })
scheduler.register(
  'results-sync',
  Number(process.env.RESULTS_SYNC_INTERVAL_MS || defaultResultsSyncIntervalMs),
  app.locals.tasks.syncResults,
)

const server = app.listen(port, () => {
  logger.info('http', 'server_started')
  scheduler.start()
})

function shutdown() {
  scheduler.stop()
  server.close(() => {
    database.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
