import { AppError } from '../../shared/app-error.js'
import { createLogger } from '../../shared/logger.js'
import { getPlan, simultaneousPoolLimit } from '../auth-users/index.js'
import { paymentsProviderSources } from './payments-provider.js'
import { createSubscriptionStore, subscriptionStatuses } from './subscription-store.js'

// SPEC-020 — consulta e cancelamento da assinatura, expiração e downgrade.
// - o cancelamento é uma movimentação do núcleo financeiro (valor zero, chave idempotente); a
//   assinatura fica em "cancelamento pendente" e o plano continua Premium até a confirmação
//   verificável do provedor (INV-002, OPEN-89);
// - confirmação: cancelada e plano Gratuito; recusa: volta a ativa, sem nova tentativa automática;
// - a expiração é uma tarefa periódica que compara o fim da vigência em UTC (OPEN-90);
// - nenhum bolão, participação, palpite ou medalha é tocado (INV-003).

export const lifecycleActions = Object.freeze({
  cancellationRequested: 'subscription.cancellation_requested',
  cancelled: 'subscription.cancelled',
  cancellationRefused: 'subscription.cancellation_refused',
  expired: 'subscription.expired',
})

const statusSchema = { type: 'enum', values: subscriptionStatuses }
const originSchema = { type: 'enum', values: paymentsProviderSources }
const changeSchema = { previousState: statusSchema, newState: statusSchema, origin: originSchema }

export const lifecycleAuditDetailSchemas = Object.freeze({
  [lifecycleActions.cancellationRequested]: changeSchema,
  [lifecycleActions.cancelled]: { ...changeSchema, liveResultsRemoved: { type: 'integer' } },
  [lifecycleActions.cancellationRefused]: changeSchema,
  [lifecycleActions.expired]: { ...changeSchema, endsAt: { type: 'timestamp' } },
})

const systemActor = Object.freeze({ type: 'system' })

function conflict(type, message) {
  return new AppError(409, type, message)
}

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

  function subscriptionOf(movement) {
    const row = findSubscription(movement.operation.id)
    if (!row || row.user_id !== movement.userId) throw new Error('subscription not found for cancellation')
    return row
  }

  // Tratadores do cancelamento, na transação da mudança de estado da movimentação. Se a assinatura
  // expirou antes da resposta do provedor, a resposta tardia só fica registrada na movimentação (OPEN-91).
  financialCore.registerHandler('subscription_cancellation', {
    onConfirmed(movement) {
      const row = subscriptionOf(movement)
      if (row.status === 'expired') return
      if (row.status !== 'cancellation_pending') throw new Error('subscription is not pending cancellation')
      const at = nowIso()
      // O bolão que continua aberto perde os resultados ao vivo (CA-19, decisão de 23/11/2026);
      // as demais regras e todo o conteúdo do bolão ficam como estão.
      const livePools = activeLivePools(row.user_id)
      auditStore.runAuditedOperation(
        audit(row, lifecycleActions.cancelled, 'cancellation_pending', 'cancelled', systemActor, { liveResultsRemoved: livePools }),
        () => {
          database.prepare(`
            UPDATE subscriptions SET status = 'cancelled', ended_at = ?, updated_at = ?
            WHERE id = ? AND status = 'cancellation_pending'
          `).run(at, at, row.id)
          database.prepare("UPDATE users SET plan = 'free' WHERE id = ?").run(row.user_id)
          database.prepare(`
            UPDATE pools SET live_results = 0 WHERE creator_id = ? AND status = 'active' AND live_results = 1
          `).run(row.user_id)
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

  // Consulta da assinatura (RF07): plano vigente com os recursos e a assinatura atual (OPEN-92).
  function getSubscription(userId) {
    const user = readUser(userId)
    const current = currentSubscription(userId)
    const plan = getPlan(user.plan)
    return {
      plan: { id: plan.id, name: plan.name, features: { ...plan.features } },
      limit: plan.features.simultaneousPools,
      liveResults: plan.features.liveResultsInCreatedPools,
      subscription: current ? view(current) : null,
      // Condição para cancelar: no máximo o limite de bolões em andamento do Gratuito (CA-18).
      cancellation: {
        activePools: activePoolsOf(userId),
        limit: simultaneousPoolLimit('free'),
        allowed: current?.status === 'active' && activePoolsOf(userId) <= simultaneousPoolLimit('free'),
      },
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
    if (current?.status === 'cancelled' || current?.status === 'expired') {
      throw conflict('subscription_ended', 'Sua assinatura já foi encerrada.')
    }
    if (current?.status !== 'active') throw conflict('no_active_subscription', 'Você não tem uma assinatura ativa para cancelar.')

    // Só cancela quem já está dentro do limite do Gratuito (CA-18, decisão de 23/11/2026).
    const limit = simultaneousPoolLimit('free')
    const activePools = activePoolsOf(userId)
    if (activePools > limit) {
      throw new AppError(409, 'too_many_active_pools',
        `Para cancelar, você precisa ter no máximo ${limit} bolão em andamento criado por você (o limite do plano Gratuito). Hoje você tem ${activePools}; encerre os demais e tente de novo.`,
        undefined, { activePools, limit })
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
    // O provedor não respondeu: o cancelamento continua pendente (nunca é apresentado como cancelado)
    // e a conferência posterior resolve, sem repetição automática (A4).
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

  // Expiração (OPEN-90, OPEN-91): toda assinatura ativa ou com cancelamento pendente cujo fim da
  // vigência já passou (comparação em UTC) fica expirada, e o plano volta a Gratuito. Reexecutar não
  // tem efeito sobre as já expiradas (A7); a falha de uma não impede as demais.
  function expireSubscriptions() {
    const at = nowIso()
    const due = database.prepare(`
      SELECT * FROM subscriptions
      WHERE status IN ('active', 'cancellation_pending') AND ends_at <= ?
      ORDER BY ends_at, id
    `).all(at)
    let expired = 0
    for (const row of due) {
      try {
        auditStore.runAuditedOperation(
          audit(row, lifecycleActions.expired, row.status, 'expired', systemActor, { endsAt: row.ends_at }),
          () => {
            const changed = database.prepare(`
              UPDATE subscriptions SET status = 'expired', ended_at = ends_at, updated_at = ?
              WHERE id = ? AND status IN ('active', 'cancellation_pending')
            `).run(at, row.id)
            if (changed.changes !== 1) throw new Error('subscription already expired')
            database.prepare("UPDATE users SET plan = 'free' WHERE id = ?").run(row.user_id)
          },
        )
        expired += 1
      } catch {
        logger.error('subscriptions', 'expiration_failed')
      }
    }
    return { checked: due.length, expired }
  }

  return { getSubscription, requestCancellation, checkCancellation, expireSubscriptions }
}
