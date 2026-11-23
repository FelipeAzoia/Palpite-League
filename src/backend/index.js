import {
  createApp,
  defaultFinancialReconciliationIntervalMs,
  defaultLiveResultsIntervalMs,
  defaultMedalsIntervalMs,
  defaultResultsSyncIntervalMs,
  defaultScoringIntervalMs,
  defaultSubscriptionPeriodsIntervalMs,
} from './app.js'
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
scheduler.register(
  'live-results',
  Number(process.env.LIVE_RESULTS_INTERVAL_MS || defaultLiveResultsIntervalMs),
  app.locals.tasks.refreshLiveScores,
)
scheduler.register(
  'scoring',
  Number(process.env.SCORING_INTERVAL_MS || defaultScoringIntervalMs),
  app.locals.tasks.scorePredictions,
)
scheduler.register(
  'medals',
  Number(process.env.MEDALS_INTERVAL_MS || defaultMedalsIntervalMs),
  app.locals.tasks.reconcileMedals,
)
scheduler.register(
  'financial-reconciliation',
  Number(process.env.FINANCIAL_RECONCILIATION_INTERVAL_MS || defaultFinancialReconciliationIntervalMs),
  app.locals.tasks.reconcilePayments,
)
scheduler.register(
  'subscription-periods',
  Number(process.env.SUBSCRIPTION_PERIODS_INTERVAL_MS || defaultSubscriptionPeriodsIntervalMs),
  app.locals.tasks.processSubscriptions,
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
