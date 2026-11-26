import { AppError } from '../../shared/app-error.js'
import { classify } from './ranking.js'

// SPEC-028 — histórico do bolão. Somente leitura (INV-001): tudo é derivado dos dados persistidos
// pelas SPEC-012 a 015 e 025, sem cópias; pontos e posições usam as mesmas regras (INV-005).
// - acessa o participante confirmado e, depois da saída, só o período em que participou (INV-002);
// - só o próprio palpite aparece (INV-003); só resultado oficial, nunca dado ao vivo (INV-004);
// - em bolão encerrado, o resumo é o resultado final congelado (INV-008).

const defaultPageSize = 10
const maxPageSize = 50

function notFound() {
  return new AppError(404, 'not_found', 'O bolão solicitado não foi encontrado.')
}

function invalid(fields) {
  return new AppError(400, 'validation_error', 'Confira os parâmetros informados.', fields)
}

function positiveInteger(value, field, max) {
  if (value === undefined) return undefined
  const number = Number(value)
  if (!/^\d+$/.test(String(value)) || !Number.isInteger(number) || number < 1 || (max && number > max)) {
    throw invalid({ [field]: max ? `Use um número de 1 a ${max}.` : 'Use um número inteiro positivo.' })
  }
  return number
}

export function createHistoryService(database, { ranking }) {
  if (!ranking) throw new TypeError('ranking is required')

  // Participação com acesso ao histórico: confirmada, ou que saiu (só o próprio período). Aprovada
  // sem confirmação, rejeitada e não membros recebem o 404 de bolão inexistente (A8, E2).
  function access(userId, poolId) {
    const row = typeof poolId === 'string' && poolId.length <= 100
      ? database.prepare(`
        SELECT p.id AS pool_id, p.name, p.status AS pool_status, p.tiebreaker, p.ended_at,
          part.id AS participation_id, part.status, part.joined_at, part.left_at
        FROM pools p JOIN pool_participations part ON part.pool_id = p.id AND part.user_id = ?
        WHERE p.id = ?
      `).get(userId, poolId)
      : undefined
    if (!row || !['confirmed', 'left'].includes(row.status) || !row.joined_at) throw notFound()
    return row
  }

  // Partidas do período de participação (OPEN-160): início a partir da confirmação e, para quem
  // saiu, antes da saída. Partida sem data só aparece para quem continua no bolão.
  function periodMatches(member) {
    const left = member.status === 'left'
    return database.prepare(`
      SELECT m.id, r.number AS round_number, home.name AS home_name, away.name AS away_name,
        home.crest AS home_crest, away.crest AS away_crest,
        m.starts_at, m.status, m.home_score, m.away_score,
        pr.type AS prediction_type, pr.predicted_outcome, pr.home_goals, pr.away_goals, pr.points
      FROM pool_matches pm
      JOIN sports_matches m ON m.id = pm.match_id
      JOIN sports_rounds r ON r.id = m.round_id
      JOIN sports_teams home ON home.id = m.home_team_id
      JOIN sports_teams away ON away.id = m.away_team_id
      LEFT JOIN predictions pr ON pr.match_id = m.id AND pr.participation_id = ?
      WHERE pm.pool_id = ?
        AND (
          (m.starts_at IS NOT NULL AND m.starts_at >= ? AND (? IS NULL OR m.starts_at < ?))
          OR (m.starts_at IS NULL AND ? = 0)
        )
      ORDER BY r.number, m.starts_at IS NULL, m.starts_at, m.id
    `).all(member.participation_id, member.pool_id, member.joined_at, member.left_at, member.left_at, left ? 1 : 0)
  }

  function matchView(row) {
    const finished = row.status === 'finished' && row.home_score !== null
    const prediction = row.prediction_type === null
      ? null
      : row.prediction_type === 'result'
        ? { type: 'result', outcome: row.predicted_outcome }
        : { type: 'exact_score', homeGoals: row.home_goals, awayGoals: row.away_goals }
    return {
      id: row.id,
      home: { name: row.home_name, crest: row.home_crest },
      away: { name: row.away_name, crest: row.away_crest },
      startsAt: row.starts_at,
      // Adiada, cancelada ou em andamento: só o status, sem placar parcial (A3, A4).
      status: row.status,
      result: finished ? { home: row.home_score, away: row.away_score } : null,
      prediction,
      // Pontos só com resultado oficial; sem palpite numa partida encerrada vale zero (A2).
      points: finished ? row.points ?? 0 : null,
    }
  }

  // Posição ao final de cada rodada (OPEN-161): a classificação da SPEC-015 aplicada aos pontos e
  // critérios acumulados até a rodada, com os participantes confirmados e o próprio solicitante.
  function positionsByRound(member, roundNumbers) {
    const perRound = ranking.roundPoints(member.pool_id)
    const participants = database.prepare(`
      SELECT part.id, u.name FROM pool_participations part JOIN users u ON u.id = part.user_id
      WHERE part.pool_id = ? AND (part.status = 'confirmed' OR part.id = ?)
    `).all(member.pool_id, member.participation_id)
    const positions = new Map()
    for (const roundNumber of roundNumbers) {
      const rows = participants.map((participant) => {
        const stats = perRound.get(participant.id) ?? new Map()
        let totalPoints = 0
        let exactScores = 0
        let correctResults = 0
        for (const [number, round] of stats) {
          if (number > roundNumber) continue
          totalPoints += round.points
          exactScores += round.exactScores
          correctResults += round.correctResults
        }
        return {
          id: participant.id,
          name: participant.name,
          totalPoints,
          exactScores,
          correctResults,
          lastRoundPoints: stats.get(roundNumber)?.points ?? 0,
        }
      })
      const own = classify(rows, member.tiebreaker).find(({ id }) => id === member.participation_id)
      positions.set(roundNumber, { position: own.position, participants: rows.length })
    }
    return positions
  }

  function summary(member, totalPoints) {
    if (member.pool_status === 'ended') {
      const result = database.prepare('SELECT * FROM pool_final_results WHERE pool_id = ?').get(member.pool_id)
      if (result) {
        const own = database.prepare('SELECT * FROM pool_final_standings WHERE pool_id = ? AND participation_id = ?').get(member.pool_id, member.participation_id)
        const count = database.prepare('SELECT COUNT(*) AS n FROM pool_final_standings WHERE pool_id = ?').get(member.pool_id).n
        return {
          final: true,
          endedAt: result.ended_at,
          position: own?.position ?? null,
          participants: count,
          totalPoints: own?.total_points ?? totalPoints,
          winner: own?.winner === 1,
          hasWinner: result.winner_count > 0,
        }
      }
    }
    if (member.status !== 'confirmed') {
      // Quem saiu não vê a classificação posterior à saída (A7).
      return { final: false, endedAt: null, position: null, participants: null, totalPoints, winner: false, hasWinner: null }
    }
    const { ranking: current } = ranking.computeRanking(member.pool_id)
    const own = current.find(({ id }) => id === member.participation_id)
    return {
      final: false,
      endedAt: null,
      position: own?.position ?? null,
      participants: current.length,
      totalPoints: own?.totalPoints ?? totalPoints,
      winner: false,
      hasWinner: null,
    }
  }

  function getHistory(userId, poolId, query = {}) {
    const member = access(userId, poolId)
    const round = positiveInteger(query.round, 'round')
    const page = positiveInteger(query.page, 'page') ?? 1
    const pageSize = positiveInteger(query.pageSize, 'pageSize', maxPageSize) ?? defaultPageSize

    // Rodadas em ordem cronológica; totais calculados sobre todas, independentemente da página (INV-006).
    const byRound = new Map()
    for (const row of periodMatches(member)) {
      if (!byRound.has(row.round_number)) byRound.set(row.round_number, [])
      byRound.get(row.round_number).push(matchView(row))
    }
    const numbers = [...byRound.keys()].sort((first, second) => first - second)
    const positions = positionsByRound(member, numbers)
    let cumulative = 0
    const rounds = numbers.map((number) => {
      const matches = byRound.get(number)
      const points = matches.reduce((total, match) => total + (match.points ?? 0), 0)
      cumulative += points
      const closed = matches.every(({ status }) => status === 'finished' || status === 'cancelled')
      return {
        number,
        points,
        cumulativePoints: cumulative,
        position: positions.get(number).position,
        participants: positions.get(number).participants,
        closed,
        matches,
      }
    })

    const filtered = round === undefined ? rounds : rounds.filter(({ number }) => number === round)
    const start = (page - 1) * pageSize
    return {
      pool: { id: member.pool_id, name: member.name, status: member.pool_status },
      participation: {
        status: member.status,
        joinedAt: member.joined_at,
        leftAt: member.left_at,
        readOnly: member.status !== 'confirmed' || member.pool_status !== 'active',
      },
      summary: summary(member, cumulative),
      totalPoints: cumulative,
      rounds: filtered.slice(start, start + pageSize),
      page,
      pageSize,
      totalRounds: filtered.length,
    }
  }

  // Bolões que o usuário deixou, para chegar ao histórico deles (quem saiu não vê o bolão na lista).
  function listLeftPools(userId) {
    return {
      pools: database.prepare(`
        SELECT p.id, p.name, p.status, part.left_at FROM pool_participations part JOIN pools p ON p.id = part.pool_id
        WHERE part.user_id = ? AND part.status = 'left' AND part.joined_at IS NOT NULL
        ORDER BY part.left_at DESC, p.id
      `).all(userId).map((row) => ({ id: row.id, name: row.name, status: row.status, leftAt: row.left_at })),
    }
  }

  return { getHistory, listLeftPools }
}
