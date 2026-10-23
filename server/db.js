import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const schema = `
  CREATE TABLE IF NOT EXISTS technical_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`

export function createDatabase(filename = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'palpite-league.db')) {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), { recursive: true })
  }

  const database = new Database(filename)
  database.pragma('journal_mode = WAL')
  database.exec(schema)
  return database
}

export function recordTechnicalEvent(database, eventType) {
  database.prepare('INSERT INTO technical_events (event_type, created_at) VALUES (?, ?)').run(eventType, new Date().toISOString())
}