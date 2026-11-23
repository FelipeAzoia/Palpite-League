import { AppError } from '../../shared/app-error.js'
import { formatCents } from './financial-core.js'

// SPEC-026 — solicitação e processamento da premiação.
// - só o vencedor registrado no resultado final congelado (SPEC-025) pede, e só para si, sem
//   aprovação administrativa (INV-001, INV-015);
// - modelo "vencedor leva tudo sobre o montante arrecadado" (SPEC-007, OPEN-13): o montante é a soma
//   das taxas de entrada confirmadas do bolão menos as devoluções concluídas, fixado uma única vez na
//   primeira solicitação; co-vencedores dividem por igual, com o resto dos centavos distribuído na
//   ordem da classificação final (INV-003, INV-004, OPEN-144);
// - o repasse é uma movimentação nova do núcleo financeiro, pendente até confirmação verificável;
//   nova tentativa só pelo vencedor depois de uma recusa (INV-005 a INV-007);
// - o simulador é sempre identificado e a integração de premiação consta como não atendida enquanto
//   o repasse não for validado no sandbox (INV-009, OPEN-29, OPEN-146).

export const prizeActions = Object.freeze({
  requested: 'prize.requested',
  completed: 'prize.completed',
  refused: 'prize.refused',
})

export const prizeAuditDetailSchemas = Object.freeze({
  [prizeActions.requested]: { amountCents: { type: 'integer' }, attemptNumber: { type: 'integer' } },
  [prizeActions.completed]: { amountCents: { type: 'integer' }, attemptNumber: { type: 'integer' } },
  [prizeActions.refused]: { amountCents: { type: 'integer' }, attemptNumber: { type: 'integer' } },
})

const systemActor = Object.freeze({ type: 'system' })

const messages = {
  pool_not_ended: 'A premiação fica disponível quando o bolão for encerrado.',
  not_winner: 'Só o vencedor registrado no resultado final pode solicitar a premiação.',
  no_winner: 'Este bolão terminou sem vencedor; não há premiação a pagar.',
  nothing_to_pay: 'Este bolão não tem montante a pagar.',
  waiting_refunds: 'Há devoluções aprovadas em processamento neste bolão. A premiação poderá ser solicitada quando elas terminarem.',
  prize_in_progress: 'Sua premiação está em processamento. Aguarde o resultado antes de tentar de novo.',
  prize_completed: 'Sua premiação já foi paga.',
}

// Divide o montante entre os vencedores, em centavos inteiros: parte igual arredondada para baixo
// e o resto distribuído um centavo por vez na ordem da classificação final (OPEN-144).
export function splitPrize(amountCents, winnerCount) {
  const base = Math.floor(amountCents / winnerCount)
  const remainder = amountCents - base * winnerCount
  return Array.from({ length: winnerCount }, (_, index) => base + (index < remainder ? 1 : 0))
}

export function createPrizePayoutService(database, { auditStore, financialCore, paymentsProvider, now = Date.now } = {}) {
  if (!auditStore || !financialCore || !paymentsProvider) throw new TypeError('auditStore, financialCore and paymentsProvider are required')
  const nowIso = () => new Date(now()).toISOString()

  // Participação própria e confirmada no bolão; os demais recebem o 404 de bolão inexistente.
  function member(userId, poolId) {
    const row = typeof poolId === 'string' && poolId.length <= 100
      ? database.prepare(`
        SELECT p.id AS pool_id, p.name, p.status, p.prize_model, part.id AS participation_id, part.role
        FROM pools p JOIN pool_participations part ON part.pool_id = p.id AND part.user_id = ?
        WHERE p.id = ? AND part.status = 'confirmed'
      `).get(userId, poolId)
      : undefined
    if (!row) throw new AppError(404, 'not_found', 'O bolão solicitado não foi encontrado.')
    return row
  }

  // Vencedores na ordem estável da classificação final congelada.
  const winners = (poolId) => database.prepare(`
    SELECT s.participation_id, u.id AS user_id, u.name
    FROM pool_final_standings s
    JOIN pool_participations part ON part.id = s.participation_id
    JOIN users u ON u.id = part.user_id
    WHERE s.pool_id = ? AND s.winner = 1
    ORDER BY s.position, u.name COLLATE NOCASE, s.participation_id
  `).all(poolId)

  // Montante arrecadado: taxas confirmadas (sem pagamentos tardios sinalizados, que não confirmaram
  // participação) menos devoluções concluídas.
  function collectedCents(poolId) {
    const fees = database.prepare(`
      SELECT COALESCE(SUM(m.amount_cents), 0) AS total FROM financial_movements m
      JOIN pool_participations part ON part.id = m.operation_id
      WHERE part.pool_id = ? AND m.type = 'entry_fee' AND m.operation_type = 'participation' AND m.status = 'confirmed'
        AND NOT EXISTS (SELECT 1 FROM entry_fee_late_payments lp WHERE lp.movement_id = m.id)
    `).get(poolId).total
    const refunds = database.prepare(`
      SELECT COALESCE(SUM(m.amount_cents), 0) AS total FROM financial_movements m
      JOIN refund_requests r ON r.id = m.operation_id
      WHERE r.pool_id = ? AND m.type = 'refund' AND m.operation_type = 'refund_request' AND m.status = 'confirmed'
    `).get(poolId).total
    return fees - refunds
  }

  // Devolução aprovada ainda não concluída nem recusada: o montante não é apurável (A10).
  function refundsInProgress(poolId) {
    return database.prepare(`
      SELECT COUNT(*) AS n FROM refund_requests r
      WHERE r.pool_id = ? AND r.status = 'approved'
        AND COALESCE((
          SELECT m.status FROM financial_movements m
          WHERE m.type = 'refund' AND m.operation_type = 'refund_request' AND m.operation_id = r.id
          ORDER BY m.attempt_number DESC LIMIT 1
        ), 'pending') = 'pending'
    `).get(poolId).n > 0
  }

  const fixedPrize = (poolId) => database.prepare('SELECT * FROM pool_prize_pools WHERE pool_id = ?').get(poolId)

  // Fixa o montante na primeira solicitação, uma única vez (INV-004).
  function fixPrize(poolId, winnerCount) {
    database.prepare(`
      INSERT INTO pool_prize_pools (pool_id, amount_cents, currency, winner_count, fixed_at)
      VALUES (?, ?, 'BRL', ?, ?) ON CONFLICT(pool_id) DO NOTHING
    `).run(poolId, collectedCents(poolId), winnerCount, nowIso())
    return fixedPrize(poolId)
  }

  function shareOf(prize, winnerList, participationId) {
    const index = winnerList.findIndex(({ participation_id: id }) => id === participationId)
    return index < 0 ? null : splitPrize(prize.amount_cents, prize.winner_count)[index]
  }

  const latestPayout = (participationId) => database.prepare(`
    SELECT * FROM financial_movements
    WHERE type = 'payout' AND operation_type = 'participation' AND operation_id = ?
    ORDER BY attempt_number DESC LIMIT 1
  `).get(participationId)

  function payoutState(movement) {
    if (!movement) return 'available'
    return { pending: 'processing', confirmed: 'completed', refused: 'refused' }[movement.status]
  }

  // Situação para um vencedor, sem gravar nada (consulta).
  function situation(pool, participationId) {
    if (pool.status !== 'ended') return { state: 'pool_not_ended' }
    const list = winners(pool.pool_id)
    if (list.length === 0) return { state: 'no_winner' }
    if (!list.some(({ participation_id: id }) => id === participationId)) return { state: 'not_winner' }
    const movement = latestPayout(participationId)
    const prize = fixedPrize(pool.pool_id)
    const amount = prize ? prize.amount_cents : collectedCents(pool.pool_id)
    if (!movement && amount <= 0) return { state: 'nothing_to_pay' }
    if (!movement && !prize && refundsInProgress(pool.pool_id)) return { state: 'waiting_refunds' }
    const share = prize ? shareOf(prize, list, participationId) : splitPrize(amount, list.length)[list.findIndex(({ participation_id: id }) => id === participationId)]
    return { state: payoutState(movement), shareCents: share, movement, fixed: Boolean(prize) }
  }

  function view(pool, userId) {
    const current = situation(pool, pool.participation_id)
    const movement = current.movement
    const result = {
      pool: { id: pool.pool_id, name: pool.name, status: pool.status },
      environment: 'test',
      origin: paymentsProvider.source,
      simulated: paymentsProvider.source === 'simulator',
      // O repasse real não foi validado no sandbox: a integração de premiação não está atendida (OPEN-146).
      integration: { attended: false, reason: 'sandbox_not_validated' },
      prizeModel: pool.prize_model,
      state: current.state,
      shareCents: current.shareCents ?? null,
      share: current.shareCents === undefined ? null : formatCents(current.shareCents),
      amountFixed: current.fixed ?? false,
      canRequest: current.state === 'available' || current.state === 'refused',
      payment: movement
        ? {
          id: movement.id,
          attemptNumber: movement.attempt_number,
          status: movement.status,
          amountCents: movement.amount_cents,
          simulated: movement.origin === 'simulator',
          inconsistent: movement.inconsistency !== null && movement.status === 'pending',
          updatedAt: movement.updated_at,
        }
        : null,
    }
    // A administração vê só o estado por vencedor, sem dados do provedor (OPEN-148).
    if (['administrator', 'coadministrator'].includes(pool.role) && pool.status === 'ended') {
      result.winners = winners(pool.pool_id).map((winner) => ({
        name: winner.name,
        state: situation(pool, winner.participation_id).state,
        isRequester: winner.user_id === userId,
      }))
    }
    return result
  }

  financialCore.registerHandler('payout', {
    onConfirmed(movement) {
      auditStore.runAuditedOperation({
        actor: systemActor,
        action: prizeActions.completed,
        object: { type: 'participation', id: movement.operation.id },
        origin: movement.origin,
        details: { amountCents: movement.amountCents, attemptNumber: movement.attemptNumber },
      }, () => {})
    },
    onRefused(movement) {
      auditStore.recordOutcome({
        actor: systemActor,
        action: prizeActions.refused,
        object: { type: 'participation', id: movement.operation.id },
        origin: movement.origin,
        details: { amountCents: movement.amountCents, attemptNumber: movement.attemptNumber },
      }, 'failure')
    },
  })

  function getPrize(userId, poolId) {
    return view(member(userId, poolId), userId)
  }

  async function requestPrize(userId, poolId, body) {
    const input = body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {}
    const fields = Object.fromEntries(Object.keys(input).map((key) => [key, 'O valor da premiação é definido pelo sistema.']))
    if (Object.keys(fields).length > 0) throw new AppError(400, 'validation_error', 'Confira os campos informados.', fields)

    const pool = member(userId, poolId)
    let current = situation(pool, pool.participation_id)
    if (current.state === 'not_winner') {
      // Tentativa de quem não é vencedor é negada e auditada (OPEN-149).
      auditStore.recordOutcome({ actor: { type: 'user', id: userId }, action: prizeActions.requested, object: { type: 'pool', id: pool.pool_id } }, 'denied')
      throw new AppError(403, 'not_winner', messages.not_winner)
    }
    if (current.state === 'processing') {
      // Antes de qualquer outra coisa, consulta a tentativa anterior (A8).
      await financialCore.checkMovement(current.movement.id)
      current = situation(pool, pool.participation_id)
      if (current.state === 'processing') throw new AppError(409, 'prize_in_progress', messages.prize_in_progress)
    }
    if (current.state === 'completed') throw new AppError(409, 'prize_completed', messages.prize_completed)
    if (!['available', 'refused'].includes(current.state)) throw new AppError(409, current.state, messages[current.state])

    // Fixa o montante (uma vez por bolão) e calcula a parte deste vencedor.
    const list = winners(pool.pool_id)
    const prize = database.transaction(() => fixPrize(pool.pool_id, list.length))()
    const amountCents = shareOf(prize, list, pool.participation_id)
    if (!amountCents || amountCents <= 0) throw new AppError(409, 'nothing_to_pay', messages.nothing_to_pay)

    const { movement, created } = await financialCore.startMovement({
      type: 'payout',
      amountCents,
      userId,
      operation: { type: 'participation', id: pool.participation_id },
      businessReference: `payout:${pool.participation_id}`,
    }, {
      onCreate: (createdMovement) => {
        auditStore.runAuditedOperation({
          actor: { type: 'user', id: userId },
          action: prizeActions.requested,
          object: { type: 'participation', id: pool.participation_id },
          origin: createdMovement.origin,
          details: { amountCents, attemptNumber: createdMovement.attemptNumber },
        }, () => {})
      },
    })
    // Solicitação simultânea: a outra já criou a tentativa (CA-07).
    if (!created) throw new AppError(409, movement.status === 'confirmed' ? 'prize_completed' : 'prize_in_progress',
      movement.status === 'confirmed' ? messages.prize_completed : messages.prize_in_progress)
    // Retorno imediato do provedor, quando ele já tem o resultado.
    if (movement.status === 'pending' && movement.providerId) await financialCore.checkMovement(movement.id)
    return view(member(userId, poolId), userId)
  }

  return { getPrize, requestPrize }
}
