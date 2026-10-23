import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { recordTechnicalEvent } from './observability/logger.js'

const migrationsDirectory = fileURLToPath(new URL('./migrations/', import.meta.url))

export function createDatabase(
  filename = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'palpite-league.db'),
) {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true })
  }

  const database = new Database(filename)
  try {
    database.pragma('journal_mode = WAL')
    migrateDatabase(database)
  } catch (error) {
    database.close()
    throw error
  }
  return database
}

export function migrateDatabase(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  const appliedMigrations = new Set(
    database.prepare('SELECT version FROM schema_migrations').all().map(({ version }) => version),
  )
  const migrationFiles = fs.readdirSync(migrationsDirectory)
    .filter((filename) => filename.endsWith('.sql'))
    .sort()

  for (const filename of migrationFiles) {
    if (appliedMigrations.has(filename)) {
      continue
    }

    const migration = fs.readFileSync(path.join(migrationsDirectory, filename), 'utf8')
    const applyMigration = database.transaction(() => {
      database.exec(migration)
      database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(filename, new Date().toISOString())
    })

    applyMigration()
  }
}

export function executeTransaction(
  database,
  operation,
  {
    correlationId = randomUUID(),
    logger = (event) => recordTechnicalEvent(database, event),
  } = {},
) {
  if (typeof operation !== 'function') {
    throw new TypeError('A transação exige uma função.')
  }

  try {
    return database.transaction(operation)()
  } catch (error) {
    logger({
      level: 'error',
      component: 'persistence',
      correlationId,
      outcome: 'transaction_failed',
    })
    throw error
  }
}
