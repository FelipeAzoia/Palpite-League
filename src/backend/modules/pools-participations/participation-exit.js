import { AppError } from '../../shared/app-error.js'
import { poolEnded, poolNotFound } from './pool-access.js'

// SPEC-017 — saída voluntária do bolão.
// Só o próprio participante sai (não há operação de remoção por terceiros, INV-003). A saída,
// a remoção dos palpites de partidas que ainda não começaram e a auditoria são atômicas (INV-005).

const leftAction = 'participation.left'

export const exitAuditDetailSchemas = Object.freeze({
  [leftAction]: {
    previousStatus: { type: 'enum', values: ['confirmed'] },
    removedPredictions: { type: 'integer' },
  },
})

// Texto fixo da plataforma exibido ao final (OPEN-83).
export const exitFinalMessage = 'Sua saída foi registrada. Ela não gera devolução automática: qualquer devolução depende de solicitação formal ao administrador ou coadministrador do bolão.'

export const exitConsequences = Object.freeze([
  'Seus palpites de partidas que ainda não começaram serão desconsiderados.',
  'Os pontos que você já obteve permanecem registrados.',
  'Você deixará a classificação e não concorrerá à premiação.',
  'A saída não gera devolução automática de valores.',
  'A saída é definitiva: não é possível voltar a este bolão.',
])

function notConfirmed() {
  return new AppError(409, 'participation_not_confirmed', 'Sua participação ainda não foi confirmada; não há saída a registrar.')
}

function administratorCannotLeave() {
  return new AppError(409, 'administrator_cannot_leave', 'O administrador não pode sair do bolão enquanto ele estiver ativo.')
}

const exitPoolEnded = () => poolEnded('Este bolão está encerrado e não aceita saídas.')

export function createParticipationExitService(database, { auditStore, sportsCatalog, now = Date.now }) {
  function readOwn(userId, poolId) {
    if (typeof poolId !== 'string' || poolId.length > 100) return undefined
    return database.prepare(`
      SELECT pools.id AS pool_id, pools.status AS pool_status,
        part.id AS participation_id, part.role, part.status
      FROM pools JOIN pool_participations part ON part.pool_id = pools.id AND part.user_id = ?
      WHERE pools.id = ?
    `).get(userId, poolId)
  }

  // Quem pode sair (INV-001, INV-004, E2 a E5). Saídas repetidas recebem 404 (OPEN-83).
  function requireCanLeave(userId, poolId) {
    const own = readOwn(userId, poolId)
    if (!own || !['confirmed', 'approved_awaiting_payment'].includes(own.status)) throw poolNotFound()
    if (own.status === 'approved_awaiting_payment') throw notConfirmed()
    if (own.pool_status !== 'active') throw exitPoolEnded()
    if (own.role === 'administrator') throw administratorCannotLeave()
    return own
  }

  // Palpites de partidas que ainda não começaram: sem data e hora ou com início posterior ao
  // instante da saída, pelo relógio do servidor (INV-005, OPEN-82). Partida que o provedor já
  // informou como em andamento ou encerrada começou, mesmo se o horário divergir do relógio:
  // seus palpites e pontos são preservados (INV-006).
  const notStarted = `(m.starts_at IS NULL OR m.starts_at > ?) AND m.status NOT IN ('in_progress', 'finished')`

  function futurePredictions(participationId, atIso) {
    return database.prepare(`
      SELECT pr.id, pr.match_id, pr.type, pr.predicted_outcome, pr.home_goals, pr.away_goals
      FROM predictions pr JOIN sports_matches m ON m.id = pr.match_id
      WHERE pr.participation_id = ? AND ${notStarted}
    `).all(participationId, atIso)
  }

  function previewExit(userId, poolId) {
    const own = requireCanLeave(userId, poolId)
    const predictions = futurePredictions(own.participation_id, new Date(now()).toISOString())
    // describeMatches já devolve em ordem de início, com as sem data no fim.
    const matches = sportsCatalog.describeMatches(predictions.map(({ match_id: id }) => id))
    const byMatch = new Map(predictions.map((prediction) => [prediction.match_id, prediction]))
    return {
      discardedPredictions: matches.map((match) => [match, byMatch.get(match.id)]).map(([match, prediction]) => ({
        match,
        prediction: prediction.type === 'result'
          ? { type: 'result', outcome: prediction.predicted_outcome }
          : { type: 'exact_score', homeGoals: prediction.home_goals, awayGoals: prediction.away_goals },
      })),
      consequences: exitConsequences,
    }
  }

  function leave(userId, poolId, input) {
    // Confirmação explícita, verificada no backend (INV-002, E6).
    if (input?.confirm !== true) {
      throw new AppError(400, 'validation_error', 'Confirme que deseja sair do bolão.', { confirm: 'Confirme a saída para continuar.' })
    }
    const own = requireCanLeave(userId, poolId)
    const atIso = new Date(now()).toISOString()
    const discarded = futurePredictions(own.participation_id, atIso).length

    let removed = 0
    auditStore.runAuditedOperation({
      actor: { type: 'user', id: userId },
      action: leftAction,
      object: { type: 'participation', id: own.participation_id },
      details: { previousStatus: 'confirmed', removedPredictions: discarded },
    }, () => {
      // Revalida na transação; a atualização condicional garante uma única saída (INV-012).
      const updated = database.prepare(`
        UPDATE pool_participations SET status = 'left', left_at = ?
        WHERE id = ? AND status = 'confirmed' AND role <> 'administrator'
          AND pool_id IN (SELECT id FROM pools WHERE status = 'active')
      `).run(atIso, own.participation_id)
      if (updated.changes !== 1) throw poolNotFound()
      removed = database.prepare(`
        DELETE FROM predictions
        WHERE participation_id = ?
          AND match_id IN (SELECT m.id FROM sports_matches m WHERE ${notStarted})
      `).run(own.participation_id, atIso).changes
      // Pontuação acumulada continua sendo a soma dos palpites que restam (INV-006).
      database.prepare(`
        UPDATE pool_participations
        SET total_points = (SELECT COALESCE(SUM(points), 0) FROM predictions WHERE participation_id = ?)
        WHERE id = ?
      `).run(own.participation_id, own.participation_id)
      if (removed !== discarded) throw new Error('predictions changed during exit')
    })

    return {
      participation: { id: own.participation_id, status: 'left' },
      discardedPredictions: removed,
      message: exitFinalMessage,
    }
  }

  return { previewExit, leave }
}
