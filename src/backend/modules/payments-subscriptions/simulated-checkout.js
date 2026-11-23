import { AppError } from '../../shared/app-error.js'
import { formatCents } from './financial-core.js'

// SPEC-019 — página de pagamento simulado (OPEN-86, INV-008).
// Faz o papel do checkout do provedor quando o simulador está ativo: o pagador aprova ou recusa, e
// isso só muda o estado do lado do simulador. A movimentação e a assinatura mudam depois, pela
// conferência do núcleo financeiro, como aconteceria com o provedor de teste. Com outro provedor
// ativo este serviço não é criado e as rotas não existem.

function notFound() {
  return new AppError(404, 'not_found', 'Pagamento simulado não encontrado.')
}

export function createSimulatedCheckoutService(database, simulator) {
  if (simulator?.source !== 'simulator' || typeof simulator.confirm !== 'function' || typeof simulator.refuse !== 'function') {
    throw new TypeError('the simulated checkout requires the payments simulator')
  }

  function ownPendingMovement(userId, movementId) {
    const row = typeof movementId === 'string'
      // Só cobranças passam pela página do pagador; devoluções e repasses são decididos pelo
      // provedor, nunca por quem recebe o valor (SPEC-024).
      ? database.prepare(`
        SELECT * FROM financial_movements
        WHERE id = ? AND user_id = ? AND origin = 'simulator' AND type IN ('entry_fee', 'subscription')
      `).get(movementId, userId)
      : undefined
    if (!row) throw notFound()
    return row
  }

  function view(row) {
    return {
      id: row.id,
      type: row.type,
      amountCents: row.amount_cents,
      amount: formatCents(row.amount_cents),
      currency: row.currency,
      status: row.status,
      simulated: true,
    }
  }

  function getPayment(userId, movementId) {
    return view(ownPendingMovement(userId, movementId))
  }

  function decide(userId, movementId, body) {
    const decision = body?.decision
    if (decision !== 'approve' && decision !== 'refuse') {
      throw new AppError(400, 'validation_error', 'Escolha aprovar ou recusar o pagamento simulado.', {
        decision: 'Use "approve" ou "refuse".',
      })
    }
    const row = ownPendingMovement(userId, movementId)
    if (row.status !== 'pending') {
      throw new AppError(409, 'payment_already_decided', 'Este pagamento simulado já foi concluído.')
    }
    if (decision === 'approve') simulator.confirm(row.operation_key)
    else simulator.refuse(row.operation_key)
    return { decision, payment: view(row) }
  }

  return { getPayment, decide }
}
