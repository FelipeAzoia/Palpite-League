import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/app-error.js'

// SPEC-012 — realização e alteração de palpite dentro do prazo.
// Prazo, direito por entrada tardia e formato são decididos aqui, no backend (INV-015);
// a interface apenas orienta. Tentativas recusadas não são auditadas, só vão ao registro
// técnico pelo tratador de erros da API (OPEN-73).

const submittedAction = 'prediction.submitted'
const changedAction = 'prediction.changed'
const predictionTypes = Object.freeze(['result', 'exact_score'])
export const predictionOutcomes = Object.freeze(['home', 'draw', 'away'])
const maxGoals = 99

const typeSchema = { type: 'enum', values: predictionTypes }
const outcomeSchema = { type: 'enum', values: predictionOutcomes }

export const predictionAuditDetailSchemas = Object.freeze({
  [submittedAction]: { type: typeSchema, outcome: outcomeSchema, score: { type: 'score' } },
  [changedAction]: {
    previousType: typeSchema,
    previousOutcome: outcomeSchema,
    previousScore: { type: 'score' },
    type: typeSchema,
    outcome: outcomeSchema,
    score: { type: 'score' },
  },
})

// Situação de uma partida para o participante (CA-14).
export const situations = Object.freeze({
  open: 'open',
  closed: 'closed',
  lateEntry: 'late_entry',
  unavailable: 'unavailable',
})

function poolNotFound() {
  return new AppError(404, 'not_found', 'O bolão solicitado não foi encontrado.')
}

function matchNotFound() {
  return new AppError(404, 'not_found', 'A partida não foi encontrada neste bolão.')
}

function notConfirmed() {
  return new AppError(409, 'participation_not_confirmed', 'Sua participação ainda não foi confirmada. Conclua o pagamento da taxa de entrada para palpitar.')
}

function poolEnded() {
  return new AppError(409, 'pool_ended', 'Este bolão está encerrado e não aceita palpites.')
}

function blockedBy(situation) {
  if (situation === situations.unavailable) {
    return new AppError(409, 'match_unavailable', 'Esta partida não está disponível para palpite (adiada, cancelada ou sem data e hora).')
  }
  if (situation === situations.lateEntry) {
    return new AppError(409, 'late_entry_not_allowed', 'Você entrou no bolão depois do início desta partida e não pode palpitar nela.')
  }
  return new AppError(409, 'prediction_deadline_passed', 'O prazo para palpitar nesta partida terminou no início do jogo.')
}

function validationError(fields) {
  return new AppError(400, 'validation_error', 'Confira o palpite informado.', fields)
}

function isGoals(value) {
  return Number.isInteger(value) && value >= 0 && value <= maxGoals
}

// Valida o formato do palpite (INV-009) e a exclusividade da modalidade (INV-002).
export function parsePrediction(input) {
  const body = input !== null && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const hasOutcome = body.outcome !== undefined
  const hasGoals = body.homeGoals !== undefined || body.awayGoals !== undefined

  if (!predictionTypes.includes(body.type)) {
    throw validationError({ type: 'Escolha a modalidade do palpite: resultado ou placar exato.' })
  }

  if (body.type === 'result') {
    if (hasGoals) throw validationError({ type: 'Um palpite de resultado não leva placar. Escolha só uma modalidade.' })
    if (!predictionOutcomes.includes(body.outcome)) {
      throw validationError({ outcome: 'Escolha vitória do mandante, empate ou vitória do visitante.' })
    }
    return { type: 'result', outcome: body.outcome, homeGoals: null, awayGoals: null }
  }

  if (hasOutcome) throw validationError({ type: 'Um palpite de placar exato não leva resultado. Escolha só uma modalidade.' })
  const fields = {}
  if (!isGoals(body.homeGoals)) fields.homeGoals = 'Informe os gols do mandante: um número inteiro de 0 a 99.'
  if (!isGoals(body.awayGoals)) fields.awayGoals = 'Informe os gols do visitante: um número inteiro de 0 a 99.'
  if (Object.keys(fields).length > 0) throw validationError(fields)
  return { type: 'exact_score', outcome: null, homeGoals: body.homeGoals, awayGoals: body.awayGoals }
}

// Prazo e direito (INV-003, INV-004, INV-007): aberta somente se agendada, com data e hora,
// iniciando depois da entrada do participante e estritamente depois do instante informado.
export function situationOf(match, { joinedAt, atMs, poolActive = true }) {
  if (!match.startsAt || match.status === 'postponed' || match.status === 'cancelled') return situations.unavailable
  const startsAtMs = Date.parse(match.startsAt)
  if (joinedAt && startsAtMs < Date.parse(joinedAt)) return situations.lateEntry
  if (match.status !== 'scheduled' || atMs >= startsAtMs || !poolActive) return situations.closed
  return situations.open
}

function viewOf(row) {
  if (!row) return null
  return {
    type: row.type,
    ...(row.type === 'result'
      ? { outcome: row.predicted_outcome }
      : { homeGoals: row.home_goals, awayGoals: row.away_goals }),
    submittedAt: row.submitted_at,
  }
}

function auditValues(prediction, prefix = '') {
  const key = (name) => (prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name)
  return prediction.type === 'result'
    ? { [key('type')]: 'result', [key('outcome')]: prediction.outcome }
    : { [key('type')]: 'exact_score', [key('score')]: `${prediction.homeGoals}-${prediction.awayGoals}` }
}

function fromRow(row) {
  return { type: row.type, outcome: row.predicted_outcome, homeGoals: row.home_goals, awayGoals: row.away_goals }
}

function samePrediction(row, prediction) {
  const current = fromRow(row)
  return current.type === prediction.type
    && current.outcome === prediction.outcome
    && current.homeGoals === prediction.homeGoals
    && current.awayGoals === prediction.awayGoals
}

export function createPredictionsService(database, { auditStore, sportsCatalog, now = Date.now }) {
  // Participação do próprio solicitante: só a confirmada palpita (INV-005).
  // Aprovada aguardando pagamento: 409; solicitada, rejeitada, saiu ou sem vínculo: 404.
  function requireConfirmed(userId, poolId) {
    if (typeof poolId !== 'string' || poolId.length > 100) throw poolNotFound()
    const row = database.prepare(`
      SELECT pools.id AS pool_id, pools.name AS pool_name, pools.status AS pool_status,
        part.id AS participation_id, part.status AS participation_status, part.joined_at
      FROM pools JOIN pool_participations part ON part.pool_id = pools.id AND part.user_id = ?
      WHERE pools.id = ?
    `).get(userId, poolId)
    if (!row) throw poolNotFound()
    if (row.participation_status === 'approved_awaiting_payment') throw notConfirmed()
    if (row.participation_status !== 'confirmed') throw poolNotFound()
    return {
      poolId: row.pool_id,
      poolName: row.pool_name,
      poolStatus: row.pool_status,
      participationId: row.participation_id,
      joinedAt: row.joined_at,
    }
  }

  function poolMatchIds(poolId) {
    return database.prepare('SELECT match_id FROM pool_matches WHERE pool_id = ?').all(poolId).map(({ match_id: id }) => id)
  }

  // Só partidas selecionadas pelo bolão (INV-006); dados locais, sem fornecedor (INV-014).
  function findPoolMatch(poolId, matchId) {
    if (typeof matchId !== 'string' || matchId.length > 100) throw matchNotFound()
    const selected = database.prepare('SELECT 1 FROM pool_matches WHERE pool_id = ? AND match_id = ?').get(poolId, matchId)
    if (!selected) throw matchNotFound()
    const [match] = sportsCatalog.describeMatches([matchId])
    if (!match) throw matchNotFound()
    return match
  }

  // Sempre filtrado pela participação do solicitante: nunca expõe palpite alheio (INV-011).
  function findOwnPrediction(participationId, matchId) {
    return database.prepare('SELECT * FROM predictions WHERE participation_id = ? AND match_id = ?').get(participationId, matchId)
  }

  function describe(member, match, atMs, row) {
    return {
      ...match,
      situation: situationOf(match, { joinedAt: member.joinedAt, atMs, poolActive: member.poolStatus === 'active' }),
      prediction: viewOf(row),
    }
  }

  function listMatches(userId, poolId) {
    const member = requireConfirmed(userId, poolId)
    const atMs = now()
    const ownPredictions = new Map(database.prepare('SELECT * FROM predictions WHERE participation_id = ?')
      .all(member.participationId).map((row) => [row.match_id, row]))
    const rounds = new Map()
    for (const match of sportsCatalog.describeMatches(poolMatchIds(member.poolId))) {
      if (!rounds.has(match.roundNumber)) rounds.set(match.roundNumber, [])
      rounds.get(match.roundNumber).push(describe(member, match, atMs, ownPredictions.get(match.id)))
    }
    return {
      pool: { id: member.poolId, name: member.poolName, status: member.poolStatus },
      rounds: [...rounds.entries()]
        .sort(([first], [second]) => first - second)
        .map(([number, matches]) => ({ number, matches })),
    }
  }

  function getPrediction(userId, poolId, matchId) {
    const member = requireConfirmed(userId, poolId)
    const match = findPoolMatch(member.poolId, matchId)
    return { match: describe(member, match, now(), findOwnPrediction(member.participationId, match.id)) }
  }

  // Grava ou substitui o palpite. Toda a validação e a comparação com o início da partida
  // acontecem dentro da transação de gravação, com o relógio do servidor (INV-003, ADR-0005).
  function savePrediction(userId, poolId, matchId, input) {
    return database.transaction(() => {
      const atMs = now()
      const member = requireConfirmed(userId, poolId)
      const match = findPoolMatch(member.poolId, matchId)
      const prediction = parsePrediction(input)
      if (member.poolStatus !== 'active') throw poolEnded()
      const situation = situationOf(match, { joinedAt: member.joinedAt, atMs })
      if (situation !== situations.open) throw blockedBy(situation)

      const existing = findOwnPrediction(member.participationId, match.id)
      // Reenvio idêntico: aceito sem efeito, sem nova data de envio nem auditoria (INV-010).
      if (existing && samePrediction(existing, prediction)) return { prediction: viewOf(existing), changed: false }

      const id = existing?.id ?? randomUUID()
      const submittedAt = new Date(atMs).toISOString()
      auditStore.runAuditedOperation({
        actor: { type: 'user', id: userId },
        action: existing ? changedAction : submittedAction,
        object: { type: 'prediction', id },
        details: existing
          ? { ...auditValues(fromRow(existing), 'previous'), ...auditValues(prediction) }
          : auditValues(prediction),
      }, () => {
        if (existing) {
          database.prepare(`
            UPDATE predictions
            SET type = ?, predicted_outcome = ?, home_goals = ?, away_goals = ?, submitted_at = ?
            WHERE id = ?
          `).run(prediction.type, prediction.outcome, prediction.homeGoals, prediction.awayGoals, submittedAt, id)
        } else {
          database.prepare(`
            INSERT INTO predictions (
              id, participation_id, match_id, type, predicted_outcome, home_goals, away_goals, points, submitted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)
          `).run(id, member.participationId, match.id, prediction.type, prediction.outcome,
            prediction.homeGoals, prediction.awayGoals, submittedAt)
        }
      })
      return { prediction: viewOf(findOwnPrediction(member.participationId, match.id)), changed: true }
    }).immediate()
  }

  return { listMatches, getPrediction, savePrediction }
}
