import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { recordTechnicalEvent } from './observability/logger.js'

const frontendDist = fileURLToPath(new URL('../dist/', import.meta.url))

export function createApp(database, { logger = (event) => recordTechnicalEvent(database, event) } = {}) {
  const app = express()
  const getDatabase = typeof database === 'function' ? database : () => database

  app.use((request, response, next) => {
    request.correlationId = randomUUID()
    response.setHeader('x-correlation-id', request.correlationId)
    response.once('finish', () => {
      logger({
        level: response.statusCode >= 500 ? 'error' : response.statusCode >= 400 ? 'warn' : 'info',
        component: 'http',
        correlationId: request.correlationId,
        outcome: response.statusCode >= 400 ? 'failure' : 'success',
      })
    })
    next()
  })

  app.use(express.json({ limit: '16kb' }))

  app.get(['/health', '/api/health'], (request, response) => {
    try {
      getDatabase().prepare('SELECT 1').get()
      logger({
        level: 'info',
        component: 'persistence',
        correlationId: request.correlationId,
        outcome: 'available',
      })
      response.json({ status: 'ok', database: 'connected' })
    } catch {
      logger({
        level: 'error',
        component: 'persistence',
        correlationId: request.correlationId,
        outcome: 'unavailable',
      })
      response.status(503).json({
        status: 'unavailable',
        component: 'persistence',
        correlationId: request.correlationId,
      })
    }
  })

  if (fs.existsSync(frontendDist)) {
    app.use(express.static(path.resolve(frontendDist)))
  }

  app.use((error, request, response, _next) => {
    if (response.headersSent) {
      response.destroy()
      return
    }

    const statusCode = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
      ? error.status
      : 500

    logger({
      level: statusCode >= 500 ? 'error' : 'warn',
      component: 'http',
      correlationId: request.correlationId,
      outcome: 'request_failed',
    })

    response.status(statusCode).json({
      error: statusCode >= 500 ? 'Internal server error' : 'Invalid request',
      correlationId: request.correlationId,
    })
  })

  return app
}
