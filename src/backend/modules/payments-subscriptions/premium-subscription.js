import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/app-error.js'
import { getPlan } from '../auth-users/index.js'
import { formatCents } from './financial-core.js'
import { paymentsProviderSources } from './payments-provider.js'

// SPEC-019 — contratação do Premium e ativação dos recursos.
// - a assinatura nasce pendente, na mesma transação da movimentação e da auditoria (INV-004);
// - o plano só vira Premium no tratador de confirmação do núcleo financeiro, junto com a assinatura
//   ativa, a vigência e a auditoria (INV-001); a recusa deixa a assinatura recusada e o plano igual;
// - valor, moeda e recorrência vêm do backend (INV-002, INV-012).

export const subscriptionStatuses = Object.freeze(['pending', 'active', 'refused'])

export const subscriptionActions = Object.freeze({
  requested: 'subscription.requested',
  activated: 'subscription.activated',
  refused: 'subscription.refused',
})

const statusSchema = { type: 'enum', values: subscriptionStatuses }
const originSchema = { type: 'enum', values: paymentsProviderSources }
const changeSchema = { amountCents: { type: 'integer' }, previousState: statusSchema, newState: statusSchema, origin: originSchema }

export const subscriptionAuditDetailSchemas = Object.freeze({
  [subscriptionActions.requested]: { amountCents: { type: 'integer' }, newState: statusSchema, origin: originSchema },
  [subscriptionActions.activated]: changeSchema,
  [subscriptionActions.refused]: changeSchema,
})

export const defaultPremiumPriceCents = 1990
export const premiumRecurrence = 'monthly'

const systemActor = Object.freeze({ type: 'system' })

// Um mês de calendário em UTC; se o dia não existe no mês seguinte, vale o último dia (OPEN-86).
export function addCalendarMonth(isoDate) {
  const start = new Date(isoDate)
  const year = start.getUTCFullYear()
  const month = start.getUTCMonth() + 1
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(
    year, month, Math.min(start.getUTCDate(), lastDay),
    start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), start.getUTCMilliseconds(),
  )).toISOString()
}

function rejectedSession() {
  return new AppError(401, 'session_rejected', 'Sua sessão expirou ou não é válida.')
}

function notFound() {
  return new AppError(404, 'subscription_not_found', 'Você ainda não contratou o Premium.')
}

function alreadyPremium() {
  return new AppError(409, 'already_premium', 'Você já possui o plano Premium ativo.')
}

export function createPremiumSubscriptionService(database, {
  auditStore,
  financialCore,
  paymentsProvider,
  now = Date.now,
  priceCents = defaultPremiumPriceCents,
} = {}) {
  if (!auditStore || !financialCore || !paymentsProvider) throw new TypeError('auditStore, financialCore and paymentsProvider are required')
  if (!Number.isSafeInteger(priceCents) || priceCents <= 0) throw new RangeError('premium price must be a positive integer amount of cents')
  const nowIso = () => new Date(now()).toISOString()

  const readUser = (userId) => {
    const user = database.prepare("SELECT id, email, plan FROM users WHERE id = ? AND status = 'active'").get(userId)
    if (!user) throw rejectedSession()
    return user
  }
  const findSubscription = (id) => database.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id)
  // A contratação "atual": a ativa, senão a pendente, senão a mais recente recusada.
  const currentSubscription = (userId) => database.prepare(`
    SELECT * FROM subscriptions WHERE user_id = ?
    ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, created_at DESC, rowid DESC
    LIMIT 1
  `).get(userId)
  const movementFor = (subscriptionId) => database.prepare(`
    SELECT id, continuation_json FROM financial_movements
    WHERE operation_type = 'subscription' AND operation_id = ?
    ORDER BY attempt_number DESC LIMIT 1
  `).get(subscriptionId)

  function view(row) {
    const movement = movementFor(row.id)
    let payment = null
    if (row.status === 'pending' && movement?.continuation_json) {
      try { payment = JSON.parse(movement.continuation_json) } catch { payment = null }
    }
    return {
      id: row.id,
      status: row.status,
      amountCents: row.amount_cents,
      amount: formatCents(row.amount_cents),
      currency: row.currency,
      recurrence: row.recurrence,
      origin: row.origin,
      simulated: row.origin === 'simulator',
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      createdAt: row.created_at,
      movementId: movement?.id ?? null,
      payment,
    }
  }

  function changeAudit(row, newState) {
    return {
      actor: systemActor,
      action: newState === 'active' ? subscriptionActions.activated : subscriptionActions.refused,
      object: { type: 'subscription', id: row.id },
      origin: row.origin,
      details: { amountCents: row.amount_cents, previousState: 'pending', newState, origin: row.origin },
    }
  }

  function pendingSubscriptionOf(movement) {
    const row = findSubscription(movement.operation.id)
    if (!row || row.status !== 'pending' || row.user_id !== movement.userId) {
      throw new Error('subscription is not pending')
    }
    return row
  }

  // Tratadores do núcleo financeiro: rodam dentro da transação da mudança de estado da movimentação;
  // qualquer falha desfaz tudo e a conferência seguinte tenta de novo (E5).
  financialCore.registerHandler('subscription', {
    onConfirmed(movement) {
      const row = pendingSubscriptionOf(movement)
      const startsAt = nowIso()
      auditStore.runAuditedOperation(changeAudit(row, 'active'), () => {
        database.prepare(`
          UPDATE subscriptions SET status = 'active', starts_at = ?, ends_at = ?, updated_at = ?
          WHERE id = ? AND status = 'pending'
        `).run(startsAt, addCalendarMonth(startsAt), startsAt, row.id)
        database.prepare("UPDATE users SET plan = 'premium' WHERE id = ?").run(row.user_id)
      })
    },
    onRefused(movement) {
      const row = pendingSubscriptionOf(movement)
      database.prepare("UPDATE subscriptions SET status = 'refused', updated_at = ? WHERE id = ? AND status = 'pending'")
        .run(nowIso(), row.id)
      // A recusa é auditada com resultado falha (INV-014).
      auditStore.recordOutcome(changeAudit(row, 'refused'), 'failure')
    },
  })

  function getConditions(userId) {
    const user = readUser(userId)
    const current = currentSubscription(userId)
    let reason = null
    if (user.plan === 'premium' || current?.status === 'active') reason = 'already_premium'
    else if (current?.status === 'pending') reason = 'pending_subscription'
    const plan = getPlan('premium')
    return {
      plan: { id: plan.id, name: plan.name, features: { ...plan.features } },
      priceCents,
      amount: formatCents(priceCents),
      currency: 'BRL',
      recurrence: premiumRecurrence,
      environment: 'test',
      origin: paymentsProvider.source,
      simulated: paymentsProvider.source === 'simulator',
      canSubscribe: reason === null,
      reason,
      subscription: current ? view(current) : null,
    }
  }

  // Conferência da contratação pendente (retorno do checkout e E2): consulta o provedor pela
  // movimentação; o tratador aplica o resultado se ele for definitivo.
  async function refresh(row) {
    if (row.status !== 'pending') return row
    const movement = movementFor(row.id)
    if (movement) await financialCore.checkMovement(movement.id)
    return findSubscription(row.id)
  }

  function validateRequest(body) {
    const input = body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {}
    // Valor, recorrência e qualquer outra condição pertencem ao backend (CA-16).
    const fields = Object.fromEntries(Object.keys(input).filter((key) => key !== 'confirm')
      .map((key) => [key, 'As condições da contratação são definidas pelo sistema.']))
    if (Object.keys(fields).length > 0) throw new AppError(400, 'validation_error', 'Confira os campos informados.', fields)
    if (input.confirm !== true) {
      throw new AppError(400, 'confirmation_required', 'Confirme a contratação do Premium para continuar.')
    }
  }

  async function subscribe(userId, body) {
    validateRequest(body)
    const user = readUser(userId)
    let current = currentSubscription(userId)
    if (user.plan === 'premium' || current?.status === 'active') throw alreadyPremium()

    // Já existe contratação pendente: consulta a anterior antes de qualquer outra coisa (E2, A3).
    if (current?.status === 'pending') {
      current = await refresh(current)
      if (current.status === 'active') throw alreadyPremium()
      if (current.status === 'pending') return { created: false, subscription: view(current) }
    }

    const id = randomUUID()
    const origin = paymentsProvider.source
    const { movement } = await financialCore.startMovement({
      type: 'subscription',
      amountCents: priceCents,
      userId,
      operation: { type: 'subscription', id },
    }, {
      payer: { email: user.email },
      onCreate: (_movement, { database: transaction }) => {
        const at = nowIso()
        auditStore.runAuditedOperation({
          actor: { type: 'user', id: userId },
          action: subscriptionActions.requested,
          object: { type: 'subscription', id },
          origin,
          details: { amountCents: priceCents, newState: 'pending', origin },
        }, () => {
          transaction.prepare(`
            INSERT INTO subscriptions (id, user_id, status, amount_cents, currency, recurrence, origin, created_at, updated_at)
            VALUES (?, ?, 'pending', ?, 'BRL', ?, ?, ?, ?)
          `).run(id, userId, priceCents, premiumRecurrence, origin, at, at)
        })
      },
    })

    // O provedor não respondeu ao início: nada foi confirmado nem repetido; a assinatura segue
    // pendente e a conferência consulta o estado antes de qualquer nova tentativa (E1).
    if (movement.status === 'pending' && !movement.continuation) {
      throw new AppError(503, 'payments_provider_unavailable',
        'Não foi possível iniciar o pagamento agora. A contratação não foi confirmada; tente conferir novamente em instantes.')
    }
    return { created: true, subscription: view(findSubscription(id)) }
  }

  async function checkSubscription(userId) {
    readUser(userId)
    const current = currentSubscription(userId)
    if (!current) throw notFound()
    return view(await refresh(current))
  }

  function getSubscription(userId) {
    readUser(userId)
    const current = currentSubscription(userId)
    if (!current) throw notFound()
    return view(current)
  }

  return { getConditions, subscribe, checkSubscription, getSubscription }
}
