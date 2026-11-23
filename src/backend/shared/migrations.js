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

  // Procedimento do SQLite para reconstruir tabelas referenciadas (por exemplo, para mudar um CHECK):
  // as chaves estrangeiras são desligadas fora da transação e conferidas antes do commit de cada
  // migração; qualquer violação desfaz a migração inteira.
  const foreignKeysEnabled = database.pragma('foreign_keys', { simple: true }) === 1
  if (foreignKeysEnabled) database.pragma('foreign_keys = OFF')

  try {
    for (const filename of files) {
      const applied = database.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(filename)
      if (applied) continue

      try {
        const sql = fs.readFileSync(path.join(directory, filename), 'utf8')
        database.transaction(() => {
          database.exec(sql)
          if (database.pragma('foreign_key_check').length > 0) throw new Error('foreign key violation')
          database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
            .run(filename, new Date().toISOString())
        })()
        logger?.info('migrations', 'applied')
      } catch {
        logger?.error('migrations', 'failed')
        throw new Error('Migration failed')
      }
    }
  } finally {
    if (foreignKeysEnabled) database.pragma('foreign_keys = ON')
  }
}