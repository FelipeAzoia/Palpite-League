import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/app-error.js'
import { getPlan } from '../auth-users/index.js'
import { formatCents } from './financial-core.js'
import { paymentsProviderSources } from './payments-provider.js'
import { billingCycles, createSubscriptionStore, premiumStatuses, subscriptionStatuses } from './subscription-store.js'

// SPEC-019 — contratação do Premium e ativação dos recursos.
// - a assinatura nasce pendente, na mesma transação da movimentação e da auditoria (INV-004);
// - o plano só vira Premium no tratador de confirmação do núcleo financeiro, junto com a assinatura
//   ativa, a vigência e a auditoria (INV-001); a recusa deixa a assinatura recusada e o plano igual;
// - valor, moeda e recorrência vêm do backend (INV-002, INV-012).

export { subscriptionStatuses }

export const subscriptionActions = Object.freeze({
  requested: 'subscription.requested',
  activated: 'subscription.activated',
  refused: 'subscription.refused',
})

const statusSchema = { type: 'enum', values: subscriptionStatuses }
const originSchema = { type: 'enum', values: paymentsProviderSources }
const changeSchema = { amountCents: { type: 'integer' }, previousState: statusSchema, newState: statusSchema, origin: originSchema }

export const subscriptionAuditDetailSchemas = Object.freeze({
  [subscriptionActions.requested]: {
    amountCents: { type: 'integer' }, newState: statusSchema, origin: originSchema, billingPolicyVersion: { type: 'identifier' },
    billingCycle: { type: 'enum', values: billingCycles },
  },
  [subscriptionActions.activated]: changeSchema,
  [subscriptionActions.refused]: changeSchema,
})

export const defaultPremiumPriceCents = 1990
// Plano anual (SPEC-029, RB66): R$ 199,00, equivalente a 2 meses grátis em relação a doze mensalidades.
export const defaultPremiumAnnualPriceCents = 19900
export const premiumRecurrence = 'monthly'
export { billingCycles }
// Política de Cobrança e Cancelamento (SPEC-019 CA-22, SPEC-029 CA-13): a contratação exige o aceite da
// versão em vigor. Ao mudar o texto da política no frontend, mude também esta versão.
export const billingPolicyVersion = '2026-11-23.2'

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

// Um ciclo de cobrança em UTC: um mês ou doze meses de calendário (SPEC-029).
// Mesmo dia no mês de destino; se ele não existe, o último dia desse mês (como no mensal, OPEN-86).
export function addBillingCycle(isoDate, cycle) {
  const months = cycle === 'annual' ? 12 : 1
  const start = new Date(isoDate)
  const total = start.getUTCMonth() + months
  const year = start.getUTCFullYear() + Math.floor(total / 12)
  const month = total % 12
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
  annualPriceCents = defaultPremiumAnnualPriceCents,
} = {}) {
  if (!auditStore || !financialCore || !paymentsProvider) throw new TypeError('auditStore, financialCore and paymentsProvider are required')
  if (!Number.isSafeInteger(priceCents) || priceCents <= 0) throw new RangeError('premium price must be a positive integer amount of cents')
  // O anual sempre custa menos que doze mensalidades (SPEC-029, INV-002).
  if (!Number.isSafeInteger(annualPriceCents) || annualPriceCents <= 0 || annualPriceCents >= priceCents * 12) {
    throw new RangeError('annual premium price must be positive and cheaper than twelve monthly payments')
  }
  const cyclePrices = Object.freeze({ monthly: priceCents, annual: annualPriceCents })
  const nowIso = () => new Date(now()).toISOString()

  const readUser = (userId) => {
    const user = database.prepare("SELECT id, email, plan FROM users WHERE id = ? AND status = 'active'").get(userId)
    if (!user) throw rejectedSession()
    return user
  }
  const { findSubscription, currentSubscription, movementFor, view } = createSubscriptionStore(database)
  const hasPremium = (user, current) => user.plan === 'premium' || premiumStatuses.includes(current?.status)

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
        `).run(startsAt, addBillingCycle(startsAt, row.recurrence), startsAt, row.id)
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
    if (hasPremium(user, current)) reason = 'already_premium'
    else if (current?.status === 'pending') reason = 'pending_subscription'
    const plan = getPlan('premium')
    return {
      plan: { id: plan.id, name: plan.name, features: { ...plan.features } },
      priceCents,
      amount: formatCents(priceCents),
      currency: 'BRL',
      recurrence: premiumRecurrence,
      // Ciclos de cobrança (SPEC-029, CA-01): valor, mensal equivalente e economia frente a 12 mensalidades.
      cycles: billingCycles.map((cycle) => ({
        id: cycle,
        priceCents: cyclePrices[cycle],
        amount: formatCents(cyclePrices[cycle]),
        monthlyEquivalentCents: cycle === 'annual' ? Math.floor(cyclePrices.annual / 12) : cyclePrices.monthly,
        savingsCents: cycle === 'annual' ? cyclePrices.monthly * 12 - cyclePrices.annual : 0,
      })),
      environment: 'test',
      origin: paymentsProvider.source,
      simulated: paymentsProvider.source === 'simulator',
      canSubscribe: reason === null,
      reason,
      billingPolicy: { version: billingPolicyVersion, title: 'Política de Cobrança e Cancelamento' },
      subscription: current ? view(current) : null,
    }
  }

  // Conferência da contratação pendente (retorno do checkout e E2): consulta o provedor pela
  // movimentação; o tratador aplica o resultado se ele for definitivo.
  async function refresh(row) {
    if (row.status !== 'pending') return row
    const movement = movementFor(row.id, 'subscription')
    if (movement) await financialCore.checkMovement(movement.id)
    return findSubscription(row.id)
  }

  function validateRequest(body) {
    const input = body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {}
    // Valor, recorrência e qualquer outra condição pertencem ao backend (CA-16).
    const fields = Object.fromEntries(Object.keys(input).filter((key) => !['confirm', 'billingPolicyVersion', 'billingCycle'].includes(key))
      .map((key) => [key, 'As condições da contratação são definidas pelo sistema.']))
    if (Object.keys(fields).length > 0) throw new AppError(400, 'validation_error', 'Confira os campos informados.', fields)
    if (input.confirm !== true) {
      throw new AppError(400, 'confirmation_required', 'Confirme a contratação do Premium para continuar.')
    }
    // O aceite vale para a versão em vigor; uma versão antiga ou ausente não serve (CA-22).
    if (input.billingPolicyVersion !== billingPolicyVersion) {
      throw new AppError(400, 'billing_policy_not_accepted', 'Leia e aceite a Política de Cobrança e Cancelamento para contratar.', {
        billingPolicyVersion: 'Aceite a versão atual da política.',
      })
    }
    // Ciclo escolhido (SPEC-029); sem ciclo, vale o mensal. O valor de cada ciclo é do backend.
    const billingCycle = Object.hasOwn(input, 'billingCycle') ? input.billingCycle : 'monthly'
    if (!billingCycles.includes(billingCycle)) {
      throw new AppError(400, 'validation_error', 'Escolha o ciclo mensal ou anual.', { billingCycle: 'Use "monthly" ou "annual".' })
    }
    return billingCycle
  }

  async function subscribe(userId, body) {
    const billingCycle = validateRequest(body)
    const amountCents = cyclePrices[billingCycle]
    const user = readUser(userId)
    let current = currentSubscription(userId)
    if (hasPremium(user, current)) throw alreadyPremium()

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
      amountCents,
      userId,
      operation: { type: 'subscription', id },
    }, {
      payer: { email: user.email },
      providerContext: { billingCycle },
      onCreate: (_movement, { database: transaction }) => {
        const at = nowIso()
        auditStore.runAuditedOperation({
          actor: { type: 'user', id: userId },
          action: subscriptionActions.requested,
          object: { type: 'subscription', id },
          origin,
          details: { amountCents, newState: 'pending', origin, billingPolicyVersion, billingCycle },
        }, () => {
          transaction.prepare(`
            INSERT INTO subscriptions (
              id, user_id, status, amount_cents, currency, recurrence, origin, billing_policy_version, created_at, updated_at
            ) VALUES (?, ?, 'pending', ?, 'BRL', ?, ?, ?, ?, ?)
          `).run(id, userId, amountCents, billingCycle, origin, billingPolicyVersion, at, at)
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
