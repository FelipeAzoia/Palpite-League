import { formatCents } from './financial-core.js'

// Leituras da assinatura usadas pela contratação (SPEC-019) e pelo ciclo de vida (SPEC-020).

// pendente e recusada (SPEC-019); ativa, cancelamento pendente, cancelada e expirada (SPEC-020).
export const subscriptionStatuses = Object.freeze(['pending', 'active', 'refused', 'cancellation_pending', 'cancelled', 'expired'])
// Estados em que o usuário tem o Premium: o plano é mantido durante o cancelamento pendente (OPEN-89).
export const premiumStatuses = Object.freeze(['active', 'cancellation_pending'])

export function createSubscriptionStore(database) {
  const findSubscription = (id) => database.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id)

  // A assinatura "atual" (OPEN-92): a que dá o Premium, senão a contratação pendente, senão a mais
  // recente (recusada, cancelada ou expirada).
  const currentSubscription = (userId) => database.prepare(`
    SELECT * FROM subscriptions WHERE user_id = ?
    ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'cancellation_pending' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
      created_at DESC, rowid DESC
    LIMIT 1
  `).get(userId)

  // Última tentativa da movimentação de um tipo ligada à assinatura (contratação ou cancelamento).
  const movementFor = (subscriptionId, type) => database.prepare(`
    SELECT id, status, provider_id, continuation_json, origin FROM financial_movements
    WHERE operation_type = 'subscription' AND operation_id = ? AND type = ?
    ORDER BY attempt_number DESC LIMIT 1
  `).get(subscriptionId, type)

  function view(row) {
    const movement = movementFor(row.id, 'subscription')
    const cancellation = movementFor(row.id, 'subscription_cancellation')
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
      cancellationPending: row.status === 'cancellation_pending',
      cancellationRequestedAt: row.cancellation_requested_at ?? null,
      endedAt: row.ended_at ?? null,
      billingPolicyVersion: row.billing_policy_version ?? null,
      movementId: movement?.id ?? null,
      cancellationMovementId: cancellation?.id ?? null,
      payment,
    }
  }

  return { findSubscription, currentSubscription, movementFor, view }
}
