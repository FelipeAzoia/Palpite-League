import express from 'express'
import { recordTechnicalEvent } from './db.js'

export function createApp(database) {
  const app = express()
  app.use(express.json())

  app.get('/api/health', (_request, response) => {
    recordTechnicalEvent(database, 'health.checked')
    response.json({ status: 'ok', database: 'connected' })
  })

  return app
}