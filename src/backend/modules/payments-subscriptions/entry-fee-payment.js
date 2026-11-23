import { AppError } from '../../shared/app-error.js'
import { formatCents } from './financial-core.js'

// SPEC-022 — pagamento da taxa de entrada e confirmação financeira da participação.
// - só o titular de uma participação aprovada e não confirmada, em bolão ativo com taxa, inicia a
//   cobrança; o valor é sempre a taxa do bolão, lida no backend (INV-002, INV-014);
// - a cobrança usa o núcleo financeiro da SPEC-018: no máximo uma tentativa pendente, nova tentativa
//   só depois de uma recusa, e nada é repetido automaticamente (INV-003, INV-005);
// - a participação só é confirmada no tratador de confirmação do núcleo, na mesma transação da
//   movimentação e da auditoria, pela operação interna da SPEC-010 (INV-001, INV-006);
// - pagamento confirmado para participação que já não é elegível não a confirma: o caso fica
//   sinalizado e auditado (INV-011, OPEN-112).

export const entryFeeActions = Object.freeze({
  started: 'entry_fee.payment_started',
  confirmed: 'entry_fee.payment_confirmed',
  refused: 'entry_fee.payment_refused',
  latePayment: 'entry_fee.late_payment',
})

const latePaymentReasons = Object.freeze(['left', 'rejected', 'pool_ended', 'already_confirmed', 'not_awaiting_payment'])

export const entryFeeAuditDetailSchemas = Object.freeze({
  [entryFeeActions.started]: { amountCents: { type: 'integer' }, attemptNumber: { type: 'integer' } },
  [entryFeeActions.confirmed]: {
    amountCents: { type: 'integer' }, attemptNumber: { type: 'integer' }, lateEntry: { type: 'boolean' },
  },
  [entryFeeActions.refused]: {
    attemptNumber: { type: 'integer' }, cause: { type: 'enum', values: ['provider_refused', 'provider_unavailable'] },
  },
  [entryFeeActions.latePayment]: {
    amountCents: { type: 'integer' }, reason: { type: 'enum', values: latePaymentReasons },
  },
})

const systemActor = Object.freeze({ type: 'system' })

function notFound() {
  return new AppError(404, 'not_found', 'A participação solicitada não foi encontrada.')
}

function conflict(type, message) {
  return new AppError(409, type, message)
}

export function createEntryFeePaymentService(database, {
  auditStore,
  financialCore,
  paymentsProvider,
  confirmParticipation,
  now = Date.now,
} = {}) {
  if (!auditStore || !financialCore || !paymentsProvider || typeof confirmParticipation !== 'function') {
    throw new TypeError('auditStore, financialCore, paymentsProvider and confirmParticipation are required')
  }
  const nowIso = () => new Date(now()).toISOString()

  // Participação do próprio usuário no bolão, com a taxa e o estado do bolão. Quem não tem
  // participação recebe o mesmo 404 de um bolão inexistente (INV-007, CA-13).
  function ownParticipation(userId, poolId) {
    const row = typeof poolId === 'string' && poolId.length <= 100
      ? database.prepare(`
        SELECT part.id, part.user_id, part.status, part.payment_confirmed,
          p.id AS pool_id, p.status AS pool_status, p.entry_fee_cents
        FROM pool_participations part JOIN pools p ON p.id = part.pool_id
        WHERE part.pool_id = ? AND part.user_id = ?
      `).get(poolId, userId)
      : undefined
    if (!row) throw notFound()
    return row
  }

  const latestMovement = (participationId) => database.prepare(`
    SELECT * FROM financial_movements
    WHERE type = 'entry_fee' AND operation_type = 'participation' AND operation_id = ?
    ORDER BY attempt_number DESC LIMIT 1
  `).get(participationId)

  // Motivo pelo qual a cobrança não pode começar, ou null (CA-12, E2).
  function blockedReason(row) {
    if (row.entry_fee_cents <= 0) return 'entry_fee_not_required'
    if (row.status === 'confirmed') return 'participation_already_confirmed'
    if (row.status !== 'approved_awaiting_payment') return 'participation_not_payable'
    if (row.pool_status !== 'active') return 'pool_ended'
    return null
  }

  const blockedMessages = {
    entry_fee_not_required: 'Este bolão não tem taxa de entrada.',
    participation_already_confirmed: 'Sua participação já está confirmada.',
    participation_not_payable: 'A taxa só pode ser paga depois que a sua entrada for aprovada.',
    pool_ended: 'Este bolão está encerrado e não aceita pagamentos.',
    entry_fee_pending: 'Já existe um pagamento em andamento. Conclua ou aguarde a confirmação antes de tentar de novo.',
  }

  function paymentView(movement) {
    if (!movement) return null
    let continuation = null
    if (movement.status === 'pending' && movement.continuation_json) {
      try { continuation = JSON.parse(movement.continuation_json) } catch { continuation = null }
    }
    return {
      id: movement.id,
      attemptNumber: movement.attempt_number,
      status: movement.status,
      amountCents: movement.amount_cents,
      amount: formatCents(movement.amount_cents),
      currency: movement.currency,
      origin: movement.origin,
      // Simulação sempre identificada, nunca apresentada como confirmação do provedor (INV-009).
      simulated: movement.origin === 'simulator',
      // Recusada sem referência do provedor: o provedor estava indisponível e nada foi cobrado (A3).
      providerUnavailable: movement.status === 'refused' && movement.provider_id === null,
      continuation,
      createdAt: movement.created_at,
      updatedAt: movement.updated_at,
    }
  }

  function view(row) {
    const movement = latestMovement(row.id)
    let reason = blockedReason(row)
    if (!reason && movement?.status === 'pending') reason = 'entry_fee_pending'
    return {
      environment: 'test',
      origin: paymentsProvider.source,
      simulated: paymentsProvider.source === 'simulator',
      participation: { id: row.id, status: row.status, paymentConfirmed: row.payment_confirmed === 1 },
      entryFee: { amountCents: row.entry_fee_cents, amount: formatCents(row.entry_fee_cents), currency: 'BRL' },
      canPay: reason === null,
      reason,
      payment: paymentView(movement),
    }
  }

  // Tratadores do núcleo financeiro: rodam na transação da mudança de estado da movimentação.
  financialCore.registerHandler('entry_fee', {
    onConfirmed(movement) {
      const row = database.prepare(`
        SELECT part.id, part.user_id, part.status, p.id AS pool_id, p.status AS pool_status
        FROM pool_participations part JOIN pools p ON p.id = part.pool_id
        WHERE part.id = ?
      `).get(movement.operation.id)
      if (!row || row.user_id !== movement.userId) throw new Error('entry fee movement without participation')

      let reason = null
      if (row.status === 'left') reason = 'left'
      else if (row.status === 'rejected') reason = 'rejected'
      else if (row.status === 'confirmed') reason = 'already_confirmed'
      else if (row.pool_status !== 'active') reason = 'pool_ended'
      else if (row.status !== 'approved_awaiting_payment') reason = 'not_awaiting_payment'

      if (reason) {
        // Pagamento tardio (A6): a movimentação fica confirmada, a participação não muda e o caso é
        // sinalizado para tratamento administrativo, sem reembolso automático.
        database.prepare(`
          INSERT INTO entry_fee_late_payments (movement_id, participation_id, pool_id, user_id, reason, flagged_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(movement.id, row.id, row.pool_id, row.user_id, reason, nowIso())
        auditStore.runAuditedOperation({
          actor: systemActor,
          action: entryFeeActions.latePayment,
          object: { type: 'participation', id: row.id },
          origin: movement.origin,
          details: { amountCents: movement.amountCents, reason },
        }, () => {})
        return
      }

      // Confirmação verificável: confirma a participação pela operação da SPEC-010 (INV-001).
      // Já estamos na transação do núcleo: qualquer falha aqui desfaz também a movimentação (INV-006).
      const confirmed = confirmParticipation(row.id, { at: now() })
      if (!confirmed.changed) throw new Error('participation was not confirmed')
      auditStore.runAuditedOperation({
        actor: systemActor,
        action: entryFeeActions.confirmed,
        object: { type: 'participation', id: row.id },
        origin: movement.origin,
        details: { amountCents: movement.amountCents, attemptNumber: movement.attemptNumber, lateEntry: confirmed.lateEntry },
      }, () => {})
    },
    onRefused(movement) {
      // A recusa e a indisponibilidade são auditadas com resultado falha (OPEN-115).
      auditStore.recordOutcome({
        actor: systemActor,
        action: entryFeeActions.refused,
        object: { type: 'participation', id: movement.operation.id },
        origin: movement.origin,
        details: {
          attemptNumber: movement.attemptNumber,
          cause: movement.providerId ? 'provider_refused' : 'provider_unavailable',
        },
      }, 'failure')
    },
  })

  function validateBody(body) {
    const input = body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {}
    // O valor e qualquer outra condição pertencem ao backend (CA-02).
    const fields = Object.fromEntries(Object.keys(input)
      .map((key) => [key, 'As condições do pagamento são definidas pelo sistema.']))
    if (Object.keys(fields).length > 0) throw new AppError(400, 'validation_error', 'Confira os campos informados.', fields)
  }

  function getPayment(userId, poolId) {
    return view(ownParticipation(userId, poolId))
  }

  async function startPayment(userId, poolId, body) {
    validateBody(body)
    const row = ownParticipation(userId, poolId)
    const reason = blockedReason(row)
    if (reason) throw conflict(reason, blockedMessages[reason])

    const user = database.prepare('SELECT email FROM users WHERE id = ?').get(userId)
    const { movement, created } = await financialCore.startMovement({
      type: 'entry_fee',
      amountCents: row.entry_fee_cents,
      userId,
      operation: { type: 'participation', id: row.id },
    }, {
      payer: { email: user.email },
      refuseWhenUnavailable: true,
      // Revalida o estado na transação que cria a movimentação: se a participação mudou no meio do
      // caminho, nada é gravado e o provedor não é chamado.
      onCreate: (created, { database: transaction }) => {
        const current = transaction.prepare(`
          SELECT part.status, p.status AS pool_status, p.entry_fee_cents
          FROM pool_participations part JOIN pools p ON p.id = part.pool_id WHERE part.id = ?
        `).get(row.id)
        const currentReason = blockedReason({ ...row, ...current })
        if (currentReason) throw conflict(currentReason, blockedMessages[currentReason])
        auditStore.runAuditedOperation({
          actor: { type: 'user', id: userId },
          action: entryFeeActions.started,
          object: { type: 'participation', id: row.id },
          origin: created.origin,
          details: { amountCents: created.amountCents, attemptNumber: created.attemptNumber },
        }, () => {})
      },
    })

    const fresh = ownParticipation(userId, poolId)
    if (!created) {
      // Já havia uma tentativa: o núcleo consultou o estado dela antes de responder (A5). Ainda
      // pendente, nenhuma cobrança nova é criada (E3); confirmada, a participação já está resolvida.
      if (movement.status === 'pending') throw conflict('entry_fee_pending', blockedMessages.entry_fee_pending)
      const freshReason = blockedReason(fresh)
      throw conflict(freshReason ?? 'participation_already_confirmed', blockedMessages[freshReason ?? 'participation_already_confirmed'])
    }
    // Provedor indisponível (A3): a tentativa foi encerrada como recusada, sem cobrança.
    if (movement.status === 'refused' && movement.providerId === null) {
      throw new AppError(503, 'payments_provider_unavailable',
        'O provedor de pagamentos está indisponível no momento. Nenhuma cobrança foi criada; tente novamente em instantes.')
    }
    return view(fresh)
  }

  // Volta do checkout: consulta o provedor sobre a tentativa pendente e aplica o resultado (5.2).
  async function checkPayment(userId, poolId) {
    const row = ownParticipation(userId, poolId)
    const movement = latestMovement(row.id)
    if (movement?.status === 'pending') await financialCore.checkMovement(movement.id)
    return view(ownParticipation(userId, poolId))
  }

  return { getPayment, startPayment, checkPayment }
}
