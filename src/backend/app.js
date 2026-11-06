import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import express from 'express'
import { createLogger } from './shared/logger.js'
import { requestContext } from './shared/request-context.js'

export function createApp(database, { logger = createLogger() } = {}) {
  const app = express()

  app.use((request, response, next) => {
    const correlationId = randomUUID()
    response.setHeader('x-correlation-id', correlationId)
    requestContext.run({ correlationId }, () => {
      logger.info('http', 'request_received')
      next()
    })
  })
  app.use(express.json())

  app.get('/health', (_request, response) => {
    try {
      database.prepare('SELECT 1').get()
      logger.info('persistence', 'available')
      response.status(200).json({ status: 'available' })
    } catch {
      logger.error('persistence', 'unavailable')
      response.status(503).json({ status: 'unavailable', component: 'persistence' })
    }
  })

  app.use((error, _request, response, _next) => {
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500
    logger.error('http', 'request_failed')
    response.status(status).json({ error: status === 500 ? 'Falha interna.' : 'Requisição inválida.' })
  })

  return app
}