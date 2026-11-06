import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultDirectory = fileURLToPath(new URL('../migrations/', import.meta.url))

export function runMigrations(database, directory = defaultDirectory, logger) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  const files = fs.readdirSync(directory)
    .filter((filename) => /^\d{3,}[-_][a-zA-Z0-9_-]+\.sql$/.test(filename))
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))

  for (const filename of files) {
    const applied = database.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(filename)
    if (applied) continue

    try {
      const sql = fs.readFileSync(path.join(directory, filename), 'utf8')
      database.transaction(() => {
        database.exec(sql)
        database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
          .run(filename, new Date().toISOString())
      })()
      logger?.info('migrations', 'applied')
    } catch {
      logger?.error('migrations', 'failed')
      throw new Error('Migration failed')
    }
  }
}