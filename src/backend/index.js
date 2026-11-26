import {
  createApp,
  defaultFinancialReconciliationIntervalMs,
  defaultLiveResultsIntervalMs,
  defaultNotificationsIntervalMs,
  defaultPoolClosingIntervalMs,
  defaultRefundProcessingIntervalMs,
  defaultMedalsIntervalMs,
  defaultResultsSyncIntervalMs,
  defaultScoringIntervalMs,
  defaultSubscriptionPeriodsIntervalMs,
} from './app.js'
import fs from 'node:fs'
import path from 'node:path'
import { needsDemoSeed, seedDemoData } from './demo-seed.js'
import { createDatabase, frontendDistPath } from './shared/database.js'
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

// Deploy num serviço só: com SERVE_FRONTEND=true o back também entrega o front compilado.
const frontendDir = process.env.SERVE_FRONTEND === 'true' && fs.existsSync(path.join(frontendDistPath, 'index.html'))
  ? frontendDistPath
  : null
if (process.env.SERVE_FRONTEND === 'true' && !frontendDir) logger.warn('startup', 'frontend_build_missing')

const app = createApp(database, { logger, frontendDir })

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
  'pool-closing',
  Number(process.env.POOL_CLOSING_INTERVAL_MS || defaultPoolClosingIntervalMs),
  app.locals.tasks.closePools,
)
scheduler.register(
  'notifications',
  Number(process.env.NOTIFICATIONS_INTERVAL_MS || defaultNotificationsIntervalMs),
  app.locals.tasks.generateNotifications,
)
scheduler.register(
  'financial-reconciliation',
  Number(process.env.FINANCIAL_RECONCILIATION_INTERVAL_MS || defaultFinancialReconciliationIntervalMs),
  app.locals.tasks.reconcilePayments,
)
scheduler.register(
  'refund-processing',
  Number(process.env.REFUND_PROCESSING_INTERVAL_MS || defaultRefundProcessingIntervalMs),
  app.locals.tasks.processRefunds,
)
scheduler.register(
  'subscription-periods',
  Number(process.env.SUBSCRIPTION_PERIODS_INTERVAL_MS || defaultSubscriptionPeriodsIntervalMs),
  app.locals.tasks.processSubscriptions,
)

const server = app.listen(port, async () => {
  logger.info('http', 'server_started')
  // Deploy de demonstração: com SEED_DEMO_DATA=true e o banco sem usuários, monta os dados de
  // demonstração pela própria API antes de ligar as tarefas periódicas.
  if (process.env.SEED_DEMO_DATA === 'true' && needsDemoSeed(database)) {
    try {
      const result = await seedDemoData({ baseUrl: `http://127.0.0.1:${port}` })
      logger.info('demo-seed', `done:${result.accounts}-accounts:${result.pools}-pools:${result.predictions}-predictions`)
    } catch (error) {
      logger.error('demo-seed', `failed:${error.message}`)
    }
  }
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
