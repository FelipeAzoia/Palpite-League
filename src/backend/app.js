import { randomUUID } from 'node:crypto'
import express from 'express'
import { createAuthService, AuthError } from './modules/auth-users/index.js'
import { createAuditStore } from './modules/notifications-audit/index.js'
import { createLogger } from './shared/logger.js'
import { requestContext } from './shared/request-context.js'

function readBearerToken(request) {
  const authorization = request.get('authorization')
  const match = typeof authorization === 'string' ? /^Bearer ([^\s]+)$/i.exec(authorization) : null
  if (!match) throw new AuthError(401, 'session_rejected', 'Sua sessão expirou ou não é válida.')
  return match[1]
}

export function createAuthenticationMiddleware(authService) {
  return (request, _response, next) => {
    try {
      const token = readBearerToken(request)
      request.authenticatedUser = authService.authenticate(token)
      request.sessionToken = token
      next()
    } catch (error) {
      next(error)
    }
  }
}

export function createApp(database, { logger = createLogger(), now = Date.now } = {}) {
  const app = express()
  const auditStore = createAuditStore(database, { logger })
  const authService = createAuthService(database, auditStore, { now })
  const authenticateRequest = createAuthenticationMiddleware(authService)

  app.use((request, response, next) => {
    const correlationId = randomUUID()
    response.setHeader('x-correlation-id', correlationId)
    requestContext.run({ correlationId }, () => {
      logger.info('http', 'request_received')
      next()
    })
  })
  app.use(express.json())

  app.post('/auth/register', async (request, response, next) => {
    try {
      const user = await authService.register(request.body)
      response.status(201).json({
        message: 'Conta criada. Faça login para continuar.',
        user,
      })
    } catch (error) {
      next(error)
    }
  })

  app.post('/auth/login', async (request, response, next) => {
    try {
      response.status(200).json(await authService.login(request.body))
    } catch (error) {
      next(error)
    }
  })

  app.get('/auth/me', authenticateRequest, (request, response) => {
    response.json({ user: request.authenticatedUser })
  })

  app.post('/auth/logout', authenticateRequest, (request, response, next) => {
    try {
      authService.logout(request.sessionToken)
      response.json({ message: 'Sessão encerrada.' })
    } catch (error) {
      next(error)
    }
  })

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

  app.use((_request, _response, next) => {
    next(new AuthError(404, 'not_found', 'O recurso solicitado não foi encontrado.'))
  })

  app.use((error, _request, response, _next) => {
    const isKnownError = error instanceof AuthError
    const isInvalidJson = error.type === 'entity.parse.failed'
    const status = isKnownError ? error.status : isInvalidJson ? 400 : 500
    const type = isKnownError ? error.type : isInvalidJson ? 'invalid_request' : 'internal_error'
    const message = isKnownError
      ? error.message
      : isInvalidJson ? 'O corpo da requisição não contém JSON válido.' : 'Ocorreu uma falha interna.'
    logger.error('http', isKnownError ? error.type : 'request_failed')
    response.status(isInvalidJson ? 400 : status).json({
      type,
      message,
      ...(isKnownError && error.fields ? { fields: error.fields } : {}),
      correlationId: requestContext.getStore()?.correlationId ?? null,
    })
  })

  return app
}