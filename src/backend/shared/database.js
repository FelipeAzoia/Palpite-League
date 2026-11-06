import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const projectRoot = fileURLToPath(new URL('../../../', import.meta.url))
export const defaultDatabasePath = path.join(projectRoot, 'data', 'palpite-league.db')

export function createDatabase(filename = process.env.DATABASE_PATH || defaultDatabasePath) {
  const resolvedFilename = filename === ':memory:' ? filename : path.resolve(projectRoot, filename)
  if (resolvedFilename !== ':memory:') {
    fs.mkdirSync(path.dirname(resolvedFilename), { recursive: true })
  }

  const database = new Database(resolvedFilename)
  database.pragma('journal_mode = WAL')
  return database
}

export function runInTransaction(database, operation, logger) {
  try {
    return database.transaction(operation)()
  } catch (error) {
    logger?.error('persistence', 'transaction_failed')
    throw error
  }
}