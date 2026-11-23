import { formatCents } from './financial-core.js'

// Leituras da assinatura usadas pela contratação (SPEC-019) e pelo ciclo de vida (SPEC-020).

// pendente e recusada (SPEC-019); ativa, cancelamento pendente, cancelada e expirada (SPEC-020);
// renovação pendente (past_due) e renovação cancelada (non_renewing) (SPEC-029).
export const subscriptionStatuses = Object.freeze([
  'pending', 'active', 'refused', 'cancellation_pending', 'cancelled', 'expired', 'past_due', 'non_renewing',
])
// Estados em que o usuário tem o Premium: durante o cancelamento pendente (OPEN-89), a carência da
// renovação e a renovação cancelada, até o fim do período pago (SPEC-029, INV-005).
export const premiumStatuses = Object.freeze(['active', 'cancellation_pending', 'past_due', 'non_renewing'])
export const billingCycles = Object.freeze(['monthly', 'annual'])

export function createSubscriptionStore(database) {
  const findSubscription = (id) => database.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id)

  // A assinatura "atual" (OPEN-92): a que dá o Premium, senão a contratação pendente, senão a mais
  // recente (recusada, cancelada ou expirada).
  const currentSubscription = (userId) => database.prepare(`
    SELECT * FROM subscriptions WHERE user_id = ?
    ORDER BY CASE WHEN status IN ('active', 'cancellation_pending', 'past_due', 'non_renewing') THEN 0
      WHEN status = 'pending' THEN 1 ELSE 2 END,
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
      billingCycle: row.recurrence,
      // Próxima cobrança (renovação ligada) ou fim do Premium (renovação cancelada) (SPEC-029, RF07).
      nextChargeAt: row.status === 'active' ? row.ends_at : null,
      premiumUntil: row.status === 'non_renewing' || row.status === 'cancellation_pending' ? row.ends_at : null,
      graceEndsAt: row.status === 'past_due' ? row.grace_ends_at : null,
      // Nova tentativa de pagamento só depois de a cobrança da renovação ser recusada (SPEC-029 CA-07).
      canRetryPayment: row.status === 'past_due' && database.prepare(`
        SELECT status FROM financial_movements WHERE business_reference = ? ORDER BY attempt_number DESC LIMIT 1
      `).get(`subscription_renewal:${row.id}:${row.ends_at}`)?.status === 'refused',
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
