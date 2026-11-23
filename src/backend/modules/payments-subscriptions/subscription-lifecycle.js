import { AppError } from '../../shared/app-error.js'
import { createLogger } from '../../shared/logger.js'
import { getPlan, simultaneousPoolLimit } from '../auth-users/index.js'
import { paymentsProviderSources } from './payments-provider.js'
import { addBillingCycle } from './premium-subscription.js'
import { createSubscriptionStore, subscriptionStatuses } from './subscription-store.js'

// SPEC-020 — consulta e cancelamento da assinatura; SPEC-029 — renovação recorrente e pagamento em atraso.
// - o cancelamento é uma movimentação do núcleo financeiro (valor zero, chave idempotente); a
//   assinatura fica em "cancelamento pendente" até a confirmação verificável do provedor (INV-002);
// - confirmado, a renovação fica cancelada: nenhuma cobrança nova, e o Premium continua até o fim do
//   período pago, quando a assinatura passa a cancelada, o plano a Gratuito e o bolão aberto perde o
//   ao vivo (SPEC-029 RB68; SPEC-020 seção 15);
// - no fim de cada período o provedor cobra o próximo ciclo: a assinatura fica em "renovação
//   pendente", com carência de 3 dias, até a cobrança ser confirmada (RB67); o sistema nunca cobra
//   por conta própria nem repete cobranças automaticamente (ADR-0003);
// - uma tarefa periódica processa renovações, carências e fins de período, comparando em UTC.

export const lifecycleActions = Object.freeze({
  cancellationRequested: 'subscription.cancellation_requested',
  renewalCancelled: 'subscription.renewal_cancelled',
  cancelled: 'subscription.cancelled',
  cancellationRefused: 'subscription.cancellation_refused',
  expired: 'subscription.expired',
  renewalDue: 'subscription.renewal_due',
  renewed: 'subscription.renewed',
  renewalRefused: 'subscription.renewal_refused',
})

const statusSchema = { type: 'enum', values: subscriptionStatuses }
const originSchema = { type: 'enum', values: paymentsProviderSources }
const changeSchema = { previousState: statusSchema, newState: statusSchema, origin: originSchema }
const timestamp = { type: 'timestamp' }

export const lifecycleAuditDetailSchemas = Object.freeze({
  [lifecycleActions.cancellationRequested]: changeSchema,
  [lifecycleActions.renewalCancelled]: { ...changeSchema, endsAt: timestamp },
  [lifecycleActions.cancelled]: { ...changeSchema, liveResultsRemoved: { type: 'integer' } },
  [lifecycleActions.cancellationRefused]: changeSchema,
  [lifecycleActions.expired]: { ...changeSchema, endsAt: timestamp },
  [lifecycleActions.renewalDue]: { ...changeSchema, endsAt: timestamp, graceEndsAt: timestamp },
  [lifecycleActions.renewed]: { ...changeSchema, endsAt: timestamp },
  [lifecycleActions.renewalRefused]: { ...changeSchema, graceEndsAt: timestamp },
})

// Carência da renovação não paga (RB67).
export const renewalGraceMs = 3 * 24 * 60 * 60 * 1000

const systemActor = Object.freeze({ type: 'system' })

function conflict(type, message, details) {
  return new AppError(409, type, message, undefined, details)
}

const renewalReference = (row) => `subscription_renewal:${row.id}:${row.ends_at}`

export function createSubscriptionLifecycleService(database, {
  auditStore,
  financialCore,
  paymentsProvider,
  logger = createLogger(),
  now = Date.now,
} = {}) {
  if (!auditStore || !financialCore || !paymentsProvider) throw new TypeError('auditStore, financialCore and paymentsProvider are required')
  const nowIso = () => new Date(now()).toISOString()
  const { findSubscription, currentSubscription, movementFor, view } = createSubscriptionStore(database)

  const readUser = (userId) => {
    const user = database.prepare("SELECT id, plan FROM users WHERE id = ? AND status = 'active'").get(userId)
    if (!user) throw new AppError(401, 'session_rejected', 'Sua sessão expirou ou não é válida.')
    return user
  }

  function audit(row, action, previousState, newState, actor = systemActor, extra = {}) {
    return {
      actor,
      action,
      object: { type: 'subscription', id: row.id },
      origin: row.origin,
      details: { previousState, newState, origin: row.origin, ...extra },
    }
  }

  // "Bolões em andamento": os criados pela pessoa e ainda ativos, a mesma contagem do limite de
  // criação da SPEC-007.
  const activePoolsOf = (userId) => database.prepare(
    "SELECT COUNT(*) AS count FROM pools WHERE creator_id = ? AND status = 'active'",
  ).get(userId).count
  const activeLivePools = (userId) => database.prepare(
    "SELECT COUNT(*) AS count FROM pools WHERE creator_id = ? AND status = 'active' AND live_results = 1",
  ).get(userId).count
  // Última tentativa da cobrança de renovação do período atual.
  const renewalMovementOf = (row) => database.prepare(`
    SELECT * FROM financial_movements WHERE business_reference = ? ORDER BY attempt_number DESC LIMIT 1
  `).get(renewalReference(row))

  function subscriptionOf(movement) {
    const row = findSubscription(movement.operation.id)
    if (!row || row.user_id !== movement.userId) throw new Error('subscription not found for movement')
    return row
  }

  // Cancelamento confirmado pelo provedor: a renovação fica cancelada e o Premium continua até o fim
  // do período pago (SPEC-029). Se a assinatura expirou antes da resposta, ela só fica registrada (OPEN-91).
  financialCore.registerHandler('subscription_cancellation', {
    onConfirmed(movement) {
      const row = subscriptionOf(movement)
      if (row.status === 'expired') return
      if (row.status !== 'cancellation_pending') throw new Error('subscription is not pending cancellation')
      auditStore.runAuditedOperation(
        audit(row, lifecycleActions.renewalCancelled, 'cancellation_pending', 'non_renewing', systemActor, { endsAt: row.ends_at }),
        () => {
          database.prepare(`
            UPDATE subscriptions SET status = 'non_renewing', updated_at = ?
            WHERE id = ? AND status = 'cancellation_pending'
          `).run(nowIso(), row.id)
        },
      )
    },
    onRefused(movement) {
      const row = subscriptionOf(movement)
      if (row.status === 'expired') return
      if (row.status !== 'cancellation_pending') throw new Error('subscription is not pending cancellation')
      database.prepare(`
        UPDATE subscriptions SET status = 'active', cancellation_requested_at = NULL, updated_at = ?
        WHERE id = ? AND status = 'cancellation_pending'
      `).run(nowIso(), row.id)
      // A recusa volta a assinatura para ativa e é auditada com resultado falha (A3).
      auditStore.recordOutcome(audit(row, lifecycleActions.cancellationRefused, 'cancellation_pending', 'active'), 'failure')
    },
  })

  // Cobrança da renovação confirmada: estende a vigência por um ciclo a partir do fim do período
  // anterior, uma única vez por período (INV-003). Paga depois do fim da carência, fica só registrada.
  financialCore.registerHandler('subscription_renewal', {
    onConfirmed(movement) {
      const row = subscriptionOf(movement)
      if (row.status === 'expired' || movement.businessReference !== renewalReference(row)) return
      if (row.status !== 'past_due') throw new Error('subscription renewal is not pending')
      const endsAt = addBillingCycle(row.ends_at, row.recurrence)
      auditStore.runAuditedOperation(audit(row, lifecycleActions.renewed, 'past_due', 'active', systemActor, { endsAt }), () => {
        database.prepare(`
          UPDATE subscriptions SET status = 'active', ends_at = ?, grace_ends_at = NULL, updated_at = ?
          WHERE id = ? AND status = 'past_due'
        `).run(endsAt, nowIso(), row.id)
      })
    },
    onRefused(movement) {
      const row = subscriptionOf(movement)
      if (row.status !== 'past_due' || movement.businessReference !== renewalReference(row)) return
      // A assinatura segue na carência, com o Premium; a recusa fica auditada como falha (A1).
      auditStore.recordOutcome(
        audit(row, lifecycleActions.renewalRefused, 'past_due', 'past_due', systemActor, { graceEndsAt: row.grace_ends_at }),
        'failure',
      )
    },
  })

  // Consulta da assinatura (RF07): plano vigente, recursos, assinatura atual e o que a pessoa pode fazer.
  function getSubscription(userId) {
    const user = readUser(userId)
    const current = currentSubscription(userId)
    const plan = getPlan(user.plan)
    const latestRenewal = current?.status === 'past_due' ? renewalMovementOf(current) : null
    return {
      plan: { id: plan.id, name: plan.name, features: { ...plan.features } },
      limit: plan.features.simultaneousPools,
      liveResults: plan.features.liveResultsInCreatedPools,
      subscription: current ? view(current) : null,
      // Condição para cancelar: no máximo o limite de bolões em andamento do Gratuito (SPEC-020 CA-18).
      cancellation: {
        activePools: activePoolsOf(userId),
        limit: simultaneousPoolLimit('free'),
        allowed: current?.status === 'active' && activePoolsOf(userId) <= simultaneousPoolLimit('free'),
      },
      // Nova tentativa de pagamento só depois de uma recusa (SPEC-029 CA-07).
      renewal: { canRetryPayment: latestRenewal?.status === 'refused' },
    }
  }

  function validateConfirmation(body) {
    const input = body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {}
    const fields = Object.fromEntries(Object.keys(input).filter((key) => key !== 'confirm')
      .map((key) => [key, 'Este campo não é aceito.']))
    if (Object.keys(fields).length > 0) throw new AppError(400, 'validation_error', 'Confira os campos informados.', fields)
    if (input.confirm !== true) {
      throw new AppError(400, 'confirmation_required', 'Confirme o cancelamento da assinatura para continuar.')
    }
  }

  // Solicitação de cancelamento (RF08): valida o estado no backend, cria a movimentação de
  // cancelamento e passa a assinatura para cancelamento pendente, tudo na mesma transação; só então
  // o pedido vai ao provedor. Repetições e pedidos simultâneos recebem conflito (E3, E5).
  async function requestCancellation(userId, body) {
    validateConfirmation(body)
    readUser(userId)
    const current = currentSubscription(userId)
    if (current?.status === 'cancellation_pending') {
      throw conflict('cancellation_already_pending', 'O cancelamento da sua assinatura já aguarda confirmação.')
    }
    if (current?.status === 'non_renewing') {
      throw conflict('renewal_already_cancelled', 'A renovação da sua assinatura já foi cancelada; o Premium vale até o fim do período pago.')
    }
    if (current?.status === 'past_due') {
      throw conflict('renewal_pending', 'O pagamento da renovação está pendente. Se não quiser continuar, basta deixar a carência terminar.')
    }
    if (current?.status === 'cancelled' || current?.status === 'expired') {
      throw conflict('subscription_ended', 'Sua assinatura já foi encerrada.')
    }
    if (current?.status !== 'active') throw conflict('no_active_subscription', 'Você não tem uma assinatura ativa para cancelar.')

    // Só cancela quem já está dentro do limite do Gratuito (SPEC-020 CA-18).
    const limit = simultaneousPoolLimit('free')
    const activePools = activePoolsOf(userId)
    if (activePools > limit) {
      throw conflict('too_many_active_pools',
        `Para cancelar, você precisa ter no máximo ${limit} bolão em andamento criado por você (o limite do plano Gratuito). Hoje você tem ${activePools}; encerre os demais e tente de novo.`,
        { activePools, limit })
    }

    const contract = movementFor(current.id, 'subscription')
    const at = nowIso()
    const { movement } = await financialCore.startMovement({
      type: 'subscription_cancellation',
      amountCents: 0,
      userId,
      operation: { type: 'subscription', id: current.id },
      businessReference: `subscription_cancellation:${current.id}`,
    }, {
      providerContext: { subscriptionProviderId: contract?.provider_id ?? null },
      onCreate: (_movement, { database: transaction }) => {
        auditStore.runAuditedOperation(
          audit(current, lifecycleActions.cancellationRequested, 'active', 'cancellation_pending', { type: 'user', id: userId }),
          () => {
            const changed = transaction.prepare(`
              UPDATE subscriptions SET status = 'cancellation_pending', cancellation_requested_at = ?, updated_at = ?
              WHERE id = ? AND status = 'active'
            `).run(at, at, current.id)
            if (changed.changes !== 1) throw conflict('cancellation_already_pending', 'O cancelamento da sua assinatura já aguarda confirmação.')
          },
        )
      },
    })

    const subscription = view(findSubscription(current.id))
    // O provedor não respondeu: o cancelamento continua pendente e a conferência posterior resolve,
    // sem repetição automática (A4).
    if (movement.status === 'pending' && !movement.providerId) {
      throw new AppError(503, 'payments_provider_unavailable',
        'O cancelamento foi registrado e aguarda a confirmação do provedor, que não respondeu agora. Sua assinatura continua ativa até lá.',
        undefined, { subscription })
    }
    return subscription
  }

  // Conferência do cancelamento pendente (retorno do usuário), além da tarefa da SPEC-018.
  async function checkCancellation(userId) {
    readUser(userId)
    const current = currentSubscription(userId)
    if (!current) throw new AppError(404, 'subscription_not_found', 'Você não tem assinatura.')
    if (current.status === 'cancellation_pending') {
      const cancellation = movementFor(current.id, 'subscription_cancellation')
      if (cancellation) await financialCore.checkMovement(cancellation.id)
    }
    return view(findSubscription(current.id))
  }

  // Fim do período de uma assinatura ativa: registra a cobrança da renovação (feita pelo provedor) e
  // entra na carência, na mesma transação; em seguida consulta o provedor (SPEC-029 5.2).
  async function startRenewal(row) {
    const contract = movementFor(row.id, 'subscription')
    const graceEndsAt = new Date(Date.parse(row.ends_at) + renewalGraceMs).toISOString()
    const { movement } = await financialCore.startMovement({
      type: 'subscription_renewal',
      amountCents: row.amount_cents,
      userId: row.user_id,
      operation: { type: 'subscription', id: row.id },
      businessReference: renewalReference(row),
    }, {
      providerContext: { subscriptionProviderId: contract?.provider_id ?? null, periodEndsAt: row.ends_at, billingCycle: row.recurrence },
      onCreate: (_movement, { database: transaction }) => {
        auditStore.runAuditedOperation(
          audit(row, lifecycleActions.renewalDue, 'active', 'past_due', systemActor, { endsAt: row.ends_at, graceEndsAt }),
          () => {
            const changed = transaction.prepare(`
              UPDATE subscriptions SET status = 'past_due', grace_ends_at = ?, updated_at = ?
              WHERE id = ? AND status = 'active'
            `).run(graceEndsAt, nowIso(), row.id)
            if (changed.changes !== 1) throw new Error('subscription is no longer active')
          },
        )
      },
    })
    if (movement.status === 'pending' && movement.providerId) await financialCore.checkMovement(movement.id)
  }

  // Fim da carência: consulta a cobrança pendente antes de expirar; sem confirmação, expira (A3).
  async function expireAfterGrace(row) {
    const renewal = renewalMovementOf(row)
    if (renewal?.status === 'pending') await financialCore.checkMovement(renewal.id)
    const current = findSubscription(row.id)
    if (current.status !== 'past_due') return false
    finish(current, 'expired', current.grace_ends_at, lifecycleActions.expired, { endsAt: current.ends_at })
    return true
  }

  // Passa a assinatura a um estado final e devolve o plano Gratuito, numa transação com a auditoria.
  // No fim do período com a renovação cancelada, o bolão aberto perde o ao vivo (SPEC-020 seção 15).
  function finish(row, status, endedAt, action, extra) {
    const removeLive = status === 'cancelled'
    const details = removeLive ? { liveResultsRemoved: activeLivePools(row.user_id) } : extra
    auditStore.runAuditedOperation(audit(row, action, row.status, status, systemActor, details), () => {
      const changed = database.prepare(`
        UPDATE subscriptions SET status = ?, ended_at = ?, updated_at = ? WHERE id = ? AND status = ?
      `).run(status, endedAt, nowIso(), row.id, row.status)
      if (changed.changes !== 1) throw new Error('subscription changed meanwhile')
      database.prepare("UPDATE users SET plan = 'free' WHERE id = ?").run(row.user_id)
      if (removeLive) {
        database.prepare("UPDATE pools SET live_results = 0 WHERE creator_id = ? AND status = 'active' AND live_results = 1")
          .run(row.user_id)
      }
    })
  }

  // Tarefa periódica (RNF21): fins de carência, fins de período com a renovação cancelada,
  // cancelamentos ainda pendentes no fim do período (OPEN-91) e renovações. Uma execução em
  // andamento é reaproveitada; a falha de uma assinatura não impede as demais.
  async function runPeriods() {
    const at = nowIso()
    const due = (status, column) => database.prepare(`
      SELECT * FROM subscriptions WHERE status = ? AND ${column} <= ? ORDER BY ${column}, id
    `).all(status, at)
    const result = { renewed: 0, pastDue: 0, expired: 0, cancelled: 0 }
    const attempt = async (work) => {
      try {
        await work()
      } catch {
        logger.error('subscriptions', 'period_processing_failed')
      }
    }

    for (const row of due('past_due', 'grace_ends_at')) {
      await attempt(async () => { if (await expireAfterGrace(row)) result.expired += 1 })
    }
    for (const row of due('non_renewing', 'ends_at')) {
      await attempt(() => { finish(row, 'cancelled', row.ends_at, lifecycleActions.cancelled); result.cancelled += 1 })
    }
    for (const row of due('cancellation_pending', 'ends_at')) {
      await attempt(() => { finish(row, 'expired', row.ends_at, lifecycleActions.expired, { endsAt: row.ends_at }); result.expired += 1 })
    }
    for (const row of due('active', 'ends_at')) {
      await attempt(async () => {
        await startRenewal(row)
        if (findSubscription(row.id).status === 'active') result.renewed += 1
        else result.pastDue += 1
      })
    }
    return result
  }

  let running = null
  function processSubscriptions() {
    running ??= runPeriods().finally(() => { running = null })
    return running
  }

  // Regularização do pagamento em atraso (RF44): nova tentativa da cobrança, só depois de uma recusa;
  // com a anterior pendente, apenas consulta, sem nova cobrança (ADR-0003, SPEC-029 CA-07).
  async function retryRenewalPayment(userId) {
    readUser(userId)
    const current = currentSubscription(userId)
    if (!current) throw new AppError(404, 'subscription_not_found', 'Você não tem assinatura.')
    if (current.status !== 'past_due') throw conflict('no_renewal_pending', 'Não há pagamento de renovação pendente.')

    const latest = renewalMovementOf(current)
    if (latest?.status === 'pending') {
      await financialCore.checkMovement(latest.id)
      const after = findSubscription(current.id)
      if (after.status === 'past_due' && renewalMovementOf(after)?.status === 'pending') {
        throw conflict('renewal_payment_pending', 'A última cobrança ainda aguarda a resposta do provedor; tente de novo em instantes.')
      }
      return view(after)
    }
    if (latest?.status !== 'refused') throw conflict('renewal_payment_pending', 'A última cobrança ainda não foi recusada.')

    const contract = movementFor(current.id, 'subscription')
    const { movement } = await financialCore.startMovement({
      type: 'subscription_renewal',
      amountCents: current.amount_cents,
      userId,
      operation: { type: 'subscription', id: current.id },
      businessReference: renewalReference(current),
    }, {
      providerContext: { subscriptionProviderId: contract?.provider_id ?? null, periodEndsAt: current.ends_at, billingCycle: current.recurrence },
    })
    if (movement.status === 'pending' && movement.providerId) await financialCore.checkMovement(movement.id)
    return view(findSubscription(current.id))
  }

  return { getSubscription, requestCancellation, checkCancellation, processSubscriptions, retryRenewalPayment }
}
