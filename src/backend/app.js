import { randomUUID } from 'node:crypto'
import express from 'express'
import { createAuthService, createProfileService, AuthError } from './modules/auth-users/index.js'
import { createAuditStore, createNotificationsService } from './modules/notifications-audit/index.js'
import {
  createLiveResultsService,
  createResultsSyncService,
  createSportsCatalogService,
  resultsAuditDetailSchemas,
} from './modules/matches-results/index.js'
import {
  createInvitesService,
  createParticipantManagementService,
  createParticipationDecisionsService,
  createParticipationExitService,
  createParticipationRequestsService,
  createPoolsService,
  createPoolClosingService,
  closingAuditDetailSchemas,
  createRefundRequestsService,
  refundAuditDetailSchemas,
  decisionAuditDetailSchemas,
  exitAuditDetailSchemas,
  participantAuditDetailSchemas,
  participationAuditDetailSchemas,
} from './modules/pools-participations/index.js'
import {
  createPredictionsService,
  createMedalsService,
  createHistoryService,
  createRankingService,
  createScoringService,
  predictionAuditDetailSchemas,
} from './modules/predictions-scoring/index.js'
import {
  createFinancialCoreService,
  createPremiumSubscriptionService,
  createSimulatedCheckoutService,
  createEntryFeePaymentService,
  createPrizePayoutService,
  prizeAuditDetailSchemas,
  createRefundProcessingService,
  refundProcessingAuditDetailSchemas,
  entryFeeAuditDetailSchemas,
  createSubscriptionLifecycleService,
  defaultPremiumAnnualPriceCents,
  defaultPremiumPriceCents,
  lifecycleAuditDetailSchemas,
  financialAuditDetailSchemas,
  subscriptionAuditDetailSchemas,
} from './modules/payments-subscriptions/index.js'

// Esquemas dos detalhes de auditoria permitidos por ação (SPEC-002), reunidos de cada módulo.
export const auditDetailSchemas = Object.freeze({
  ...participationAuditDetailSchemas,
  ...decisionAuditDetailSchemas,
  ...participantAuditDetailSchemas,
  ...exitAuditDetailSchemas,
  ...predictionAuditDetailSchemas,
  ...resultsAuditDetailSchemas,
  ...financialAuditDetailSchemas,
  ...subscriptionAuditDetailSchemas,
  ...lifecycleAuditDetailSchemas,
  ...entryFeeAuditDetailSchemas,
  ...refundAuditDetailSchemas,
  ...refundProcessingAuditDetailSchemas,
  ...closingAuditDetailSchemas,
  ...prizeAuditDetailSchemas,
})

// Intervalo padrão da sincronização de resultados (SPEC-013, ADR-0006): 10 minutos.
export const defaultResultsSyncIntervalMs = 10 * 60 * 1000
// Intervalo padrão da atualização ao vivo (SPEC-021, OPEN-99): 1 minuto.
export const defaultLiveResultsIntervalMs = 60 * 1000
// Intervalo padrão do início do processamento das devoluções aprovadas (SPEC-024, OPEN-126): 1 minuto.
export const defaultRefundProcessingIntervalMs = 60 * 1000
// Intervalo padrão do encerramento automático dos bolões (SPEC-025, OPEN-135): 1 minuto.
export const defaultPoolClosingIntervalMs = 60 * 1000
// Intervalo padrão da geração de notificações (SPEC-027, OPEN-155): 1 minuto.
export const defaultNotificationsIntervalMs = 60 * 1000
// Intervalo padrão da pontuação (SPEC-014, OPEN-76): 1 minuto.
export const defaultScoringIntervalMs = 60 * 1000
// Intervalo padrão das medalhas (SPEC-016, OPEN-81): 1 minuto.
export const defaultMedalsIntervalMs = 60 * 1000
// Intervalo padrão da conferência financeira (SPEC-018, ADR-0006): 5 minutos.
export const defaultFinancialReconciliationIntervalMs = 5 * 60 * 1000
// Intervalo padrão do processamento dos períodos das assinaturas (SPEC-020 OPEN-90, SPEC-029 RNF21): 1 minuto.
export const defaultSubscriptionPeriodsIntervalMs = 60 * 1000
import { createSimulatedSportsProvider } from './adapters/simulated-sports-provider.js'
import { createApiFootballSportsProvider } from './adapters/api-football-sports-provider.js'
import { createSimulatedPaymentsProvider } from './adapters/simulated-payments-provider.js'
import { createMercadoPagoTestPaymentsProvider } from './adapters/mercado-pago-test-payments-provider.js'
import { SportsProviderError } from './modules/matches-results/sports-provider.js'
import { AppError } from './shared/app-error.js'
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

function configuredSportsProvider(now) {
  const source = process.env.SPORTS_CATALOG_SOURCE || 'simulated'
  if (source === 'simulated') return createSimulatedSportsProvider({ now })
  if (source === 'api-football') {
    if (process.env.SPORTS_API_FOOTBALL_PROOF_APPROVED !== 'true') {
      return {
        source: 'api-football',
        async fetchCatalog() {
          throw new SportsProviderError('proof_pending')
        },
        async fetchResults() {
          throw new SportsProviderError('proof_pending')
        },
        async fetchLiveScore() {
          throw new SportsProviderError('proof_pending')
        },
      }
    }
    return createApiFootballSportsProvider({
      apiKey: process.env.API_FOOTBALL_API_KEY || '',
      timeoutMs: Number(process.env.SPORTS_PROVIDER_TIMEOUT_MS || 10000),
    })
  }
  throw new Error('Unsupported sports catalog source')
}

// Provedor de pagamentos por configuração (SPEC-018): o simulador é o padrão; o Mercado Pago só em
// ambiente de teste, com a chave fora do repositório.
function configuredPaymentsProvider() {
  const source = process.env.PAYMENTS_PROVIDER || 'simulator'
  if (source === 'simulator') return createSimulatedPaymentsProvider()
  if (source === 'mercado-pago-test') {
    return createMercadoPagoTestPaymentsProvider({
      accessToken: process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN || '',
      timeoutMs: Number(process.env.PAYMENTS_PROVIDER_TIMEOUT_MS || 10000),
      backUrl: process.env.APP_BASE_URL || '',
      // Assinaturas do Mercado Pago só depois dos smoke tests aprovados pela equipe (OPEN-26, SPEC-019).
      subscriptionsProofApproved: process.env.MERCADO_PAGO_SUBSCRIPTIONS_PROOF_APPROVED === 'true',
    })
  }
  throw new Error('Unsupported payments provider')
}

export function createApp(database, {
  logger = createLogger(),
  now = Date.now,
  recoveryChannel,
  interfaceBaseUrl,
  sportsProvider = configuredSportsProvider(now),
  paymentsProvider = configuredPaymentsProvider(),
  premiumPriceCents = Number(process.env.PREMIUM_TEST_PRICE_CENTS || defaultPremiumPriceCents),
  premiumAnnualPriceCents = Number(process.env.PREMIUM_TEST_ANNUAL_PRICE_CENTS || defaultPremiumAnnualPriceCents),
  sportsSeason = Number(process.env.SPORTS_SEASON || 2026),
  sportsCatalogTtlMs = Number(process.env.SPORTS_CATALOG_TTL_MS || 6 * 60 * 60 * 1000),
} = {}) {
  const app = express()
  const auditStore = createAuditStore(database, { logger, detailSchemasByAction: auditDetailSchemas })
  const authService = createAuthService(database, auditStore, {
    now,
    logger,
    ...(recoveryChannel ? { recoveryChannel } : {}),
    ...(interfaceBaseUrl ? { interfaceBaseUrl } : {}),
  })
  const profileService = createProfileService(database)
  const financialCore = createFinancialCoreService(database, {
    auditStore,
    paymentsProvider,
    logger,
    now,
  })
  const premiumSubscriptions = createPremiumSubscriptionService(database, {
    auditStore,
    financialCore,
    paymentsProvider,
    now,
    priceCents: premiumPriceCents,
    annualPriceCents: premiumAnnualPriceCents,
  })
  const subscriptionLifecycle = createSubscriptionLifecycleService(database, {
    auditStore,
    financialCore,
    paymentsProvider,
    logger,
    now,
  })
  // A página de pagamento simulado só existe com o simulador ativo (SPEC-019, INV-008).
  const simulatedCheckout = paymentsProvider.source === 'simulator'
    ? createSimulatedCheckoutService(database, paymentsProvider)
    : null
  const sportsCatalogService = createSportsCatalogService(database, sportsProvider, {
    logger,
    now,
    season: sportsSeason,
    ttlMs: sportsCatalogTtlMs,
  })
  const poolsService = createPoolsService(database, { auditStore, sportsCatalog: sportsCatalogService, now })
  const invitesService = createInvitesService(database, {
    auditStore,
    now,
    ...(interfaceBaseUrl ? { interfaceBaseUrl } : {}),
  })
  const participationRequests = createParticipationRequestsService(database, {
    auditStore,
    invites: invitesService,
    pools: poolsService,
    now,
  })
  const participationDecisions = createParticipationDecisionsService(database, { auditStore, pools: poolsService, now })
  const entryFeePayments = createEntryFeePaymentService(database, {
    auditStore,
    financialCore,
    paymentsProvider,
    confirmParticipation: participationDecisions.confirmParticipation,
    now,
  })
  const refundRequests = createRefundRequestsService(database, { auditStore, now })
  const refundProcessing = createRefundProcessingService(database, { auditStore, financialCore, logger })
  const prizePayouts = createPrizePayoutService(database, { auditStore, financialCore, paymentsProvider, now })
  const participantManagement = createParticipantManagementService(database, { auditStore })
  const participationExit = createParticipationExitService(database, { auditStore, sportsCatalog: sportsCatalogService, now })
  const predictions = createPredictionsService(database, { auditStore, sportsCatalog: sportsCatalogService, now })
  const resultsSync = createResultsSyncService(database, sportsProvider, { auditStore, logger, now, season: sportsSeason })
  const liveResults = createLiveResultsService(database, sportsProvider, { logger, now })
  // Tarefas periódicas expostas ao agendador do processo (index.js) e aos testes (SPEC-013).
  const scoring = createScoringService(database, { logger })
  app.locals.tasks = {
    syncResults: () => resultsSync.syncResults(),
    refreshLiveScores: () => liveResults.refreshLiveScores(),
    scorePredictions: () => scoring.scorePendingMatches(),
    reconcilePayments: () => financialCore.reconcilePending(),
    processRefunds: () => refundProcessing.processApproved(),
    processSubscriptions: () => subscriptionLifecycle.processSubscriptions(),
  }
  app.locals.scoring = scoring
  const ranking = createRankingService(database)
  app.locals.ranking = ranking
  const medals = createMedalsService(database, { ranking, logger, now })
  app.locals.medals = medals
  app.locals.tasks.reconcileMedals = () => medals.reconcileMedals()
  const poolClosing = createPoolClosingService(database, { auditStore, ranking, logger, now })
  const history = createHistoryService(database, { ranking })
  app.locals.tasks.closePools = () => poolClosing.closeDuePools()
  const notifications = createNotificationsService(database, { logger, now })
  app.locals.tasks.generateNotifications = () => notifications.generate()
  app.locals.results = resultsSync
  app.locals.financial = financialCore
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

  app.post('/auth/password-recovery', async (request, response, next) => {
    try {
      response.status(200).json(await authService.requestPasswordRecovery(request.body))
    } catch (error) {
      next(error)
    }
  })

  app.post('/auth/password-reset', async (request, response, next) => {
    try {
      response.status(200).json(await authService.resetPassword(request.body))
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

  app.get('/account/profile', authenticateRequest, (request, response, next) => {
    try {
      response.json({ profile: profileService.getProfile(request.authenticatedUser.id) })
    } catch (error) {
      next(error)
    }
  })

  app.patch('/account/profile', authenticateRequest, (request, response, next) => {
    try {
      response.json({ profile: profileService.updateName(request.authenticatedUser.id, request.body) })
    } catch (error) {
      next(error)
    }
  })

  app.get('/account/plan', authenticateRequest, (request, response, next) => {
    try {
      response.json(profileService.getAccountPlan(request.authenticatedUser.id))
    } catch (error) {
      next(error)
    }
  })

  app.get('/account/plans', authenticateRequest, (_request, response, next) => {
    try {
      response.json(profileService.listAvailablePlans())
    } catch (error) {
      next(error)
    }
  })

  // SPEC-018 — histórico financeiro próprio (RF41): só as movimentações da sessão, sem filtros.
  // Toda movimentação é de teste; a resposta diz isso explicitamente (INV-016).
  // SPEC-027 — notificações próprias, dentro da aplicação. Só o destinatário consulta ou marca.
  app.get('/account/notifications', authenticateRequest, (request, response, next) => {
    try {
      response.json(notifications.list(request.authenticatedUser.id, request.query))
    } catch (error) {
      next(error)
    }
  })

  app.post('/account/notifications/read-all', authenticateRequest, (request, response, next) => {
    try {
      response.json(notifications.markAllRead(request.authenticatedUser.id))
    } catch (error) {
      next(error)
    }
  })

  app.post('/account/notifications/:notificationId/read', authenticateRequest, (request, response, next) => {
    try {
      response.json(notifications.markRead(request.authenticatedUser.id, request.params.notificationId))
    } catch (error) {
      next(error)
    }
  })

  app.get('/account/financial-history', authenticateRequest, (request, response, next) => {
    try {
      response.json({ environment: 'test', movements: financialCore.getHistory(request.authenticatedUser.id) })
    } catch (error) {
      next(error)
    }
  })

  // SPEC-019 — contratação do Premium. Condições, valor e recorrência vêm sempre do backend.
  app.get('/account/premium', authenticateRequest, (request, response, next) => {
    try {
      response.json(premiumSubscriptions.getConditions(request.authenticatedUser.id))
    } catch (error) {
      next(error)
    }
  })

  app.post('/account/premium/subscription', authenticateRequest, async (request, response, next) => {
    try {
      const { created, subscription } = await premiumSubscriptions.subscribe(request.authenticatedUser.id, request.body)
      response.status(created ? 201 : 200).json({ subscription })
    } catch (error) {
      next(error)
    }
  })

  app.get('/account/premium/subscription', authenticateRequest, (request, response, next) => {
    try {
      response.json({ subscription: premiumSubscriptions.getSubscription(request.authenticatedUser.id) })
    } catch (error) {
      next(error)
    }
  })

  // Retorno do checkout: confere a operação na hora, além da tarefa periódica da SPEC-018.
  app.post('/account/premium/subscription/check', authenticateRequest, async (request, response, next) => {
    try {
      response.json({ subscription: await premiumSubscriptions.checkSubscription(request.authenticatedUser.id) })
    } catch (error) {
      next(error)
    }
  })

  // SPEC-020 — consulta da assinatura, cancelamento (pendente até a confirmação do provedor) e
  // conferência do cancelamento. Renovações, carências e fins de período são a tarefa processSubscriptions.
  app.get('/account/subscription', authenticateRequest, (request, response, next) => {
    try {
      response.json(subscriptionLifecycle.getSubscription(request.authenticatedUser.id))
    } catch (error) {
      next(error)
    }
  })

  app.post('/account/subscription/cancellation', authenticateRequest, async (request, response, next) => {
    try {
      const subscription = await subscriptionLifecycle.requestCancellation(request.authenticatedUser.id, request.body)
      response.status(202).json({ subscription })
    } catch (error) {
      next(error)
    }
  })

  app.post('/account/subscription/cancellation/check', authenticateRequest, async (request, response, next) => {
    try {
      response.json({ subscription: await subscriptionLifecycle.checkCancellation(request.authenticatedUser.id) })
    } catch (error) {
      next(error)
    }
  })

  // SPEC-029 — nova tentativa de pagar a renovação em atraso, só depois de uma recusa (RF44).
  app.post('/account/subscription/renewal/retry', authenticateRequest, async (request, response, next) => {
    try {
      response.json({ subscription: await subscriptionLifecycle.retryRenewalPayment(request.authenticatedUser.id) })
    } catch (error) {
      next(error)
    }
  })

  if (simulatedCheckout) {
    app.get('/payments/simulated-checkout/:movementId', authenticateRequest, (request, response, next) => {
      try {
        response.json({ payment: simulatedCheckout.getPayment(request.authenticatedUser.id, request.params.movementId) })
      } catch (error) {
        next(error)
      }
    })

    app.post('/payments/simulated-checkout/:movementId/decision', authenticateRequest, (request, response, next) => {
      try {
        response.json(simulatedCheckout.decide(request.authenticatedUser.id, request.params.movementId, request.body))
      } catch (error) {
        next(error)
      }
    })
  }

  app.get('/catalog/rounds', authenticateRequest, async (_request, response, next) => {
    try {
      response.json(await sportsCatalogService.listRounds())
    } catch (error) {
      next(error)
    }
  })

  app.get('/catalog/rounds/:roundNumber/matches', authenticateRequest, async (request, response, next) => {
    try {
      response.json(await sportsCatalogService.listMatches(
        request.params.roundNumber,
        request.query.status,
      ))
    } catch (error) {
      next(error)
    }
  })

  app.get('/pools/creation-availability', authenticateRequest, (request, response, next) => {
    try {
      response.json(poolsService.getCreationAvailability(request.authenticatedUser.id))
    } catch (error) {
      next(error)
    }
  })

  app.post('/pools', authenticateRequest, async (request, response, next) => {
    try {
      response.status(201).json(await poolsService.createPool(request.authenticatedUser.id, request.body))
    } catch (error) {
      next(error)
    }
  })

  app.get('/pools', authenticateRequest, (request, response, next) => {
    try {
      response.json(poolsService.listPools(request.authenticatedUser.id))
    } catch (error) {
      next(error)
    }
  })

  app.get('/pools/:poolId', authenticateRequest, (request, response, next) => {
    try {
      response.json(poolsService.getPoolRules(request.authenticatedUser.id, request.params.poolId))
    } catch (error) {
      next(error)
    }
  })

  app.post('/pools/:poolId/invites', authenticateRequest, (request, response, next) => {
    try {
      response.status(201).json(invitesService.createInvite(request.authenticatedUser.id, request.params.poolId))
    } catch (error) {
      next(error)
    }
  })

  app.get('/pools/:poolId/invites', authenticateRequest, (request, response, next) => {
    try {
      response.json(invitesService.listInvites(request.authenticatedUser.id, request.params.poolId))
    } catch (error) {
      next(error)
    }
  })

  app.delete('/pools/:poolId/invites/:inviteId', authenticateRequest, (request, response, next) => {
    try {
      response.json(invitesService.revokeInvite(request.authenticatedUser.id, request.params.poolId, request.params.inviteId))
    } catch (error) {
      next(error)
    }
  })

  // SPEC-010 — solicitações de entrada pendentes e decisão administrativa.
  app.get('/pools/:poolId/requests', authenticateRequest, (request, response, next) => {
    try {
      response.json(participationDecisions.listPendingRequests(request.authenticatedUser.id, request.params.poolId))
    } catch (error) {
      next(error)
    }
  })

  app.post('/pools/:poolId/requests/:participationId/approve', authenticateRequest, (request, response, next) => {
    try {
      response.json(participationDecisions.approve(request.authenticatedUser.id, request.params.poolId, request.params.participationId))
    } catch (error) {
      next(error)
    }
  })

  app.post('/pools/:poolId/requests/:participationId/reject', authenticateRequest, (request, response, next) => {
    try {
      response.json(participationDecisions.reject(request.authenticatedUser.id, request.params.poolId, request.params.participationId))
    } catch (error) {
      next(error)
    }
  })

  // SPEC-017 — saída voluntária: consequências e confirmação. Só o próprio participante sai;
  // não existe operação para retirar outro participante (RB48).
  app.get('/pools/:poolId/exit', authenticateRequest, (request, response, next) => {
    try {
      response.json(participationExit.previewExit(request.authenticatedUser.id, request.params.poolId))
    } catch (error) {
      next(error)
    }
  })

  app.post('/pools/:poolId/exit', authenticateRequest, (request, response, next) => {
    try {
      response.json(participationExit.leave(request.authenticatedUser.id, request.params.poolId, request.body))
    } catch (error) {
      next(error)
    }
  })

  // SPEC-011 — participantes do bolão e promoção a coadministrador (sem operação de rebaixamento).
  app.get('/pools/:poolId/participants', authenticateRequest, (request, response, next) => {
    try {
      response.json(participantManagement.listParticipants(request.authenticatedUser.id, request.params.poolId))
    } catch (error) {
      next(error)
    }
  })

  app.post('/pools/:poolId/participants/:participationId/promote', authenticateRequest, (request, response, next) => {
    try {
      response.json(participantManagement.promote(request.authenticatedUser.id, request.params.poolId, request.params.participationId))
    } catch (error) {
      next(error)
    }
  })

  // SPEC-013 — resultados oficiais do bolão, somente leitura. Não existe operação que escreva
  // resultado, placar ou status de partida (INV-001): qualquer tentativa cai no 404 comum.
  app.get('/pools/:poolId/results', authenticateRequest, (request, response, next) => {
    try {
      response.json(resultsSync.getPoolResults(request.authenticatedUser.id, request.params.poolId))
    } catch (error) {
      next(error)
    }
  })

  // SPEC-023 — pedido de devolução por quem saiu do bolão e decisão da administração. O valor é
  // sempre o da taxa confirmada; a aprovação só autoriza (a devolução é da SPEC-024).
  app.get('/account/refund-requests', authenticateRequest, (request, response, next) => {
    try {
      response.json(refundRequests.listOwn(request.authenticatedUser.id))
    } catch (error) {
      next(error)
    }
  })

  app.get('/pools/:poolId/refund-request', authenticateRequest, (request, response, next) => {
    try {
      response.json(refundRequests.getOwnRequest(request.authenticatedUser.id, request.params.poolId))
    } catch (error) {
      next(error)
    }
  })

  app.post('/pools/:poolId/refund-request', authenticateRequest, (request, response, next) => {
    try {
      response.status(201).json(refundRequests.requestRefund(request.authenticatedUser.id, request.params.poolId, request.body))
    } catch (error) {
      next(error)
    }
  })

  app.get('/pools/:poolId/refund-requests', authenticateRequest, (request, response, next) => {
    try {
      response.json(refundRequests.listPending(request.authenticatedUser.id, request.params.poolId))
    } catch (error) {
      next(error)
    }
  })

  app.post('/pools/:poolId/refund-requests/:requestId/approve', authenticateRequest, (request, response, next) => {
    try {
      response.json(refundRequests.approve(request.authenticatedUser.id, request.params.poolId, request.params.requestId))
    } catch (error) {
      next(error)
    }
  })

  // SPEC-024 — devoluções aprovadas do bolão e nova tentativa depois de uma recusa (administração).
  app.get('/pools/:poolId/refunds', authenticateRequest, (request, response, next) => {
    try {
      response.json(refundProcessing.listApproved(request.authenticatedUser.id, request.params.poolId))
    } catch (error) {
      next(error)
    }
  })

  app.post('/pools/:poolId/refunds/:requestId/retry', authenticateRequest, async (request, response, next) => {
    try {
      response.status(201).json(await refundProcessing.retry(request.authenticatedUser.id, request.params.poolId, request.params.requestId))
    } catch (error) {
      next(error)
    }
  })

  app.post('/pools/:poolId/refund-requests/:requestId/reject', authenticateRequest, (request, response, next) => {
    try {
      response.json(refundRequests.reject(request.authenticatedUser.id, request.params.poolId, request.params.requestId))
    } catch (error) {
      next(error)
    }
  })

  // SPEC-022 — pagamento da taxa de entrada pelo titular da participação aprovada. O valor vem
  // sempre do bolão; a participação só é confirmada pela conferência do pagamento.
  app.get('/pools/:poolId/entry-fee', authenticateRequest, (request, response, next) => {
    try {
      response.json(entryFeePayments.getPayment(request.authenticatedUser.id, request.params.poolId))
    } catch (error) {
      next(error)
    }
  })

  app.post('/pools/:poolId/entry-fee/payment', authenticateRequest, async (request, response, next) => {
    try {
      response.status(201).json(await entryFeePayments.startPayment(request.authenticatedUser.id, request.params.poolId, request.body))
    } catch (error) {
      next(error)
    }
  })

  app.post('/pools/:poolId/entry-fee/payment/check', authenticateRequest, async (request, response, next) => {
    try {
      response.json(await entryFeePayments.checkPayment(request.authenticatedUser.id, request.params.poolId))
    } catch (error) {
      next(error)
    }
  })

  // SPEC-021 — dados ao vivo do bolão, somente leitura e rotulados como não oficiais. Só
  // participante confirmado; bolão sem o recurso recebe a indicação de indisponível.
  app.get('/pools/:poolId/live', authenticateRequest, (request, response, next) => {
    try {
      response.json(liveResults.getPoolLive(request.authenticatedUser.id, request.params.poolId))
    } catch (error) {
      next(error)
    }
  })

  // SPEC-025 — resultado final do bolão encerrado, somente leitura. Não existe operação para
  // encerrar o bolão nem para alterar o resultado: o encerramento é só da tarefa agendada.
  app.get('/pools/:poolId/final-result', authenticateRequest, (request, response, next) => {
    try {
      response.json(poolClosing.getFinalResult(request.authenticatedUser.id, request.params.poolId))
    } catch (error) {
      next(error)
    }
  })

  // SPEC-026 — premiação do bolão encerrado. Só o vencedor solicita, para si; o valor é sempre
  // calculado no backend e não existe aprovação administrativa.
  app.get('/pools/:poolId/prize', authenticateRequest, (request, response, next) => {
    try {
      response.json(prizePayouts.getPrize(request.authenticatedUser.id, request.params.poolId))
    } catch (error) {
      next(error)
    }
  })

  app.post('/pools/:poolId/prize/request', authenticateRequest, async (request, response, next) => {
    try {
      response.status(201).json(await prizePayouts.requestPrize(request.authenticatedUser.id, request.params.poolId, request.body))
    } catch (error) {
      next(error)
    }
  })

  // SPEC-028 — histórico do bolão, somente leitura: participante confirmado, ou quem saiu (só o
  // período em que participou).
  app.get('/pools/:poolId/history', authenticateRequest, (request, response, next) => {
    try {
      response.json(history.getHistory(request.authenticatedUser.id, request.params.poolId, request.query))
    } catch (error) {
      next(error)
    }
  })

  app.get('/account/left-pools', authenticateRequest, (request, response, next) => {
    try {
      response.json(history.listLeftPools(request.authenticatedUser.id))
    } catch (error) {
      next(error)
    }
  })

  // SPEC-014 — pontos do próprio participante; não existe operação que informe ou altere pontos.
  app.get('/pools/:poolId/points', authenticateRequest, (request, response, next) => {
    try {
      response.json(predictions.getMyPoints(request.authenticatedUser.id, request.params.poolId))
    } catch (error) {
      next(error)
    }
  })

  // SPEC-016 — medalhas do bolão por rodada (somente leitura; a concessão é da tarefa agendada).
  app.get('/pools/:poolId/medals', authenticateRequest, (request, response, next) => {
    try {
      response.json(medals.getPoolMedals(request.authenticatedUser.id, request.params.poolId))
    } catch (error) {
      next(error)
    }
  })

  // SPEC-015 — ranking acumulado com desempate e desempenho próprio por rodada (somente leitura).
  app.get('/pools/:poolId/ranking', authenticateRequest, (request, response, next) => {
    try {
      response.json(ranking.getRanking(request.authenticatedUser.id, request.params.poolId))
    } catch (error) {
      next(error)
    }
  })

  // Página inicial: pontos e colocação do próprio usuário em cada bolão (somente leitura).
  app.get('/account/pools-summary', authenticateRequest, (request, response, next) => {
    try {
      response.json(ranking.getMySummary(request.authenticatedUser.id))
    } catch (error) {
      next(error)
    }
  })

  app.get('/pools/:poolId/performance', authenticateRequest, (request, response, next) => {
    try {
      response.json(ranking.getMyPerformance(request.authenticatedUser.id, request.params.poolId))
    } catch (error) {
      next(error)
    }
  })

  // SPEC-012 — partidas do bolão para palpite e palpite próprio (nunca o de outro participante).
  app.get('/pools/:poolId/predictions', authenticateRequest, (request, response, next) => {
    try {
      response.json(predictions.listMatches(request.authenticatedUser.id, request.params.poolId))
    } catch (error) {
      next(error)
    }
  })

  app.get('/pools/:poolId/matches/:matchId/prediction', authenticateRequest, (request, response, next) => {
    try {
      response.json(predictions.getPrediction(request.authenticatedUser.id, request.params.poolId, request.params.matchId))
    } catch (error) {
      next(error)
    }
  })

  app.put('/pools/:poolId/matches/:matchId/prediction', authenticateRequest, (request, response, next) => {
    try {
      response.json(predictions.savePrediction(
        request.authenticatedUser.id,
        request.params.poolId,
        request.params.matchId,
        request.body,
      ))
    } catch (error) {
      next(error)
    }
  })

  // O código do convite viaja sempre no corpo, nunca no caminho ou na consulta (SPEC-009, seção 9).
  app.post('/invites/open', authenticateRequest, (request, response, next) => {
    try {
      response.json(participationRequests.openInvite(request.authenticatedUser.id, request.body))
    } catch (error) {
      next(error)
    }
  })

  app.post('/invites/requests', authenticateRequest, (request, response, next) => {
    try {
      response.status(201).json(participationRequests.requestEntry(request.authenticatedUser.id, request.body))
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
    const isKnownError = error instanceof AppError
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
      ...(isKnownError && error.details ? { details: error.details } : {}),
      correlationId: requestContext.getStore()?.correlationId ?? null,
    })
  })

  return app
}