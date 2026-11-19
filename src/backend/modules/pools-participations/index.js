import { randomUUID } from 'node:crypto'
import { AppError } from '../../shared/app-error.js'
import { saoPauloDate } from '../../shared/sao-paulo-date.js'
import { getPlan, simultaneousPoolLimit } from '../auth-users/index.js'

export const moduleName = 'pools-participations'
export { createInvitesService } from './invites.js'
export { createParticipationRequestsService, participationAuditDetailSchemas } from './participation-requests.js'

export const prizeModels = Object.freeze(['winner_takes_all'])
export const tiebreakers = Object.freeze(['exact_scores', 'correct_results', 'last_round_points'])

const memberStatuses = ['approved_awaiting_payment', 'confirmed']
const maxSelectedIds = 500
const maxSelectedRounds = 100
const minFeeCents = 100
const maxFeeCents = 50000

function validationError(fields) {
  return new AppError(400, 'validation_error', 'Confira os campos informados.', fields)
}

function poolNotFound() {
  return new AppError(404, 'not_found', 'O bolão solicitado não foi encontrado.')
}

function sessionRejected() {
  return new AppError(401, 'session_rejected', 'Sua sessão expirou ou não é válida.')
}

function formatCents(cents) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

function formatBrl(cents) {
  return `R$ ${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

// Converte a taxa informada em reais para centavos; devolve null se não for um valor monetário válido.
function parseFeeCents(value) {
  if (typeof value === 'string') {
    if (!/^\d+(\.\d{1,2})?$/.test(value)) return null
    return Math.round(Number(value) * 100)
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const cents = Math.round(value * 100)
  return Math.abs(value * 100 - cents) < 1e-7 ? cents : null
}

function participationConditions(feeCents) {
  return [
    'A entrada exige convite e aprovação do administrador ou coadministrador.',
    feeCents > 0
      ? `É necessário pagar a taxa de entrada de ${formatBrl(feeCents)}.`
      : 'Este bolão não tem taxa de entrada.',
    'Todo participante precisa aceitar as regras do bolão.',
    'Quem entra depois do início não palpita nas partidas que já começaram.',
  ]
}

export function createPoolsService(database, { auditStore, sportsCatalog, now = Date.now }) {
  function readUser(userId) {
    const user = database.prepare("SELECT id, plan FROM users WHERE id = ? AND status = 'active'").get(userId)
    if (!user) throw sessionRejected()
    return user
  }

  function countActivePools(userId) {
    return database.prepare("SELECT COUNT(*) AS count FROM pools WHERE creator_id = ? AND status = 'active'").get(userId).count
  }

  function availabilityOf(user) {
    const plan = getPlan(user.plan)
    const limit = simultaneousPoolLimit(user.plan)
    const activePools = countActivePools(user.id)
    return { plan: { id: plan.id, name: plan.name }, limit, activePools, canCreate: activePools < limit }
  }

  function limitReached(availability) {
    const guidance = availability.plan.id === 'free'
      ? 'Encerre um bolão ativo para criar outro ou conheça o plano Premium, que permite até 10 bolões simultâneos.'
      : 'Encerre um bolão ativo para criar outro.'
    return new AppError(
      409,
      'pool_limit_reached',
      `Você atingiu o limite de ${availability.limit} ${availability.limit === 1 ? 'bolão ativo' : 'bolões ativos'} do plano ${availability.plan.name}.`,
      undefined,
      { plan: availability.plan, limit: availability.limit, activePools: availability.activePools, guidance },
    )
  }

  function getCreationAvailability(userId) {
    return availabilityOf(readUser(userId))
  }

  function parseRules(input, today) {
    const body = input !== null && typeof input === 'object' && !Array.isArray(input) ? input : {}
    const fields = {}

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const nameLength = Array.from(name).length
    if (nameLength < 1 || nameLength > 100) fields.name = 'Informe um nome com até 100 caracteres.'

    let startsOn = null
    if (!isValidDate(body.startsOn)) fields.startsOn = 'Informe a data de início no formato AAAA-MM-DD.'
    else if (body.startsOn < today) fields.startsOn = 'A data de início não pode ser anterior a hoje.'
    else startsOn = body.startsOn

    let endsOn = null
    if (!isValidDate(body.endsOn)) fields.endsOn = 'Informe a data de fim no formato AAAA-MM-DD.'
    else if (startsOn && body.endsOn < startsOn) fields.endsOn = 'A data de fim não pode ser anterior à data de início.'
    else endsOn = body.endsOn

    let entryFeeCents = null
    if (body.entryFee === undefined || body.entryFee === null || body.entryFee === '') {
      fields.entryFee = 'Informe a taxa de entrada (use 0 para um bolão sem taxa).'
    } else {
      entryFeeCents = parseFeeCents(body.entryFee)
      if (entryFeeCents === null) fields.entryFee = 'Informe um valor em reais com no máximo duas casas decimais.'
      else if (entryFeeCents !== 0 && (entryFeeCents < minFeeCents || entryFeeCents > maxFeeCents)) {
        fields.entryFee = 'A taxa deve ser zero ou ficar entre R$ 1,00 e R$ 500,00.'
        entryFeeCents = null
      }
    }

    if (!prizeModels.includes(body.prizeModel)) fields.prizeModel = 'Selecione um modelo de premiação disponível.'
    if (!tiebreakers.includes(body.tiebreaker)) fields.tiebreaker = 'Selecione um critério de desempate disponível.'

    const selection = body.selection
    let matchIds = []
    let roundNumbers = []
    const validSelection = selection !== null && typeof selection === 'object' && !Array.isArray(selection)
      && (selection.matchIds === undefined || (Array.isArray(selection.matchIds)
        && selection.matchIds.length <= maxSelectedIds
        && selection.matchIds.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 100)))
      && (selection.roundNumbers === undefined || (Array.isArray(selection.roundNumbers)
        && selection.roundNumbers.length <= maxSelectedRounds
        && selection.roundNumbers.every((number) => Number.isSafeInteger(number) && number > 0)))
    if (!validSelection) {
      fields.selection = 'Selecione ao menos uma partida ou rodada.'
    } else {
      matchIds = [...new Set(selection.matchIds ?? [])]
      roundNumbers = [...new Set(selection.roundNumbers ?? [])]
      if (matchIds.length === 0 && roundNumbers.length === 0) fields.selection = 'Selecione ao menos uma partida ou rodada.'
    }

    return {
      fields,
      rules: { name, startsOn, endsOn, entryFeeCents, prizeModel: body.prizeModel, tiebreaker: body.tiebreaker },
      matchIds,
      roundNumbers,
    }
  }

  function resolveSelection({ matchIds, roundNumbers, startsOn, endsOn }, fields) {
    const nowMs = now()
    const isEligible = (match) => match.status === 'scheduled' && match.startsAt && Date.parse(match.startsAt) > nowMs
    const selected = new Map()

    if (matchIds.length > 0) {
      const found = sportsCatalog.findMatchesByIds(matchIds)
      if (found.length !== matchIds.length) {
        fields.selection = 'Algumas partidas escolhidas não existem no catálogo.'
      } else if (!found.every(isEligible)) {
        fields.selection = 'Só é possível escolher partidas agendadas, com data e hora futuras.'
      } else {
        for (const match of found) selected.set(match.id, match)
      }
    }

    if (!fields.selection) {
      for (const roundNumber of roundNumbers) {
        const roundMatches = sportsCatalog.findRoundMatches(roundNumber)
        if (!roundMatches) {
          fields.selection = `A rodada ${roundNumber} não existe no catálogo.`
          break
        }
        const eligible = roundMatches.filter(isEligible)
        if (eligible.length === 0) {
          fields.selection = `A rodada ${roundNumber} não tem partidas elegíveis.`
          break
        }
        for (const match of eligible) selected.set(match.id, match)
      }
    }

    if (!fields.selection && startsOn && endsOn) {
      const outside = [...selected.values()].some((match) => {
        const day = saoPauloDate(match.startsAt)
        return day < startsOn || day > endsOn
      })
      if (outside) fields.selection = 'Todas as partidas selecionadas devem ocorrer dentro do período do bolão.'
    }

    return [...selected.values()]
  }

  async function createPool(userId, input) {
    const user = readUser(userId)
    const availability = availabilityOf(user)
    if (!availability.canCreate) throw limitReached(availability)

    await sportsCatalog.ensureCatalogAvailable()

    const today = saoPauloDate(now())
    const parsed = parseRules(input, today)
    const fields = { ...parsed.fields }
    const selectedMatches = fields.selection ? [] : resolveSelection({ ...parsed, ...parsed.rules }, fields)
    if (Object.keys(fields).length > 0) throw validationError(fields)

    const { rules } = parsed
    const plan = getPlan(user.plan)
    const poolId = randomUUID()
    const createdAt = new Date(now()).toISOString()
    const hasFee = rules.entryFeeCents > 0

    auditStore.runAuditedOperation({
      actor: { type: 'user', id: userId },
      action: 'pool.created',
      object: { type: 'pool', id: poolId },
    }, () => {
      // O limite é reverificado na mesma transação da gravação (INV-003).
      const fresh = availabilityOf(user)
      if (!fresh.canCreate) throw limitReached(fresh)

      database.prepare(`
        INSERT INTO pools (
          id, creator_id, name, starts_on, ends_on, entry_fee_cents,
          prize_model, tiebreaker, status, live_results, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
      `).run(
        poolId, userId, rules.name, rules.startsOn, rules.endsOn, rules.entryFeeCents,
        rules.prizeModel, rules.tiebreaker, plan.features.liveResultsInCreatedPools ? 1 : 0, createdAt,
      )
      const insertMatch = database.prepare('INSERT INTO pool_matches (pool_id, match_id) VALUES (?, ?)')
      for (const match of selectedMatches) insertMatch.run(poolId, match.id)
      database.prepare(`
        INSERT INTO pool_participations (
          id, pool_id, user_id, role, status, payment_confirmed, rules_accepted_at, joined_at
        ) VALUES (?, ?, ?, 'administrator', ?, ?, ?, ?)
      `).run(
        randomUUID(), poolId, userId,
        hasFee ? 'approved_awaiting_payment' : 'confirmed',
        hasFee ? 0 : 1,
        createdAt,
        hasFee ? null : createdAt,
      )
    })

    const matches = sportsCatalog.describeMatches(selectedMatches.map(({ id }) => id))
    const countsByRound = new Map()
    for (const match of matches) countsByRound.set(match.roundNumber, (countsByRound.get(match.roundNumber) ?? 0) + 1)

    return {
      pool: {
        id: poolId,
        name: rules.name,
        status: 'active',
        startsOn: rules.startsOn,
        endsOn: rules.endsOn,
        entryFee: formatCents(rules.entryFeeCents),
        currency: 'BRL',
        prizeModel: rules.prizeModel,
        tiebreaker: rules.tiebreaker,
        liveResults: Boolean(plan.features.liveResultsInCreatedPools),
        matches,
      },
      participation: {
        role: 'administrator',
        status: hasFee ? 'approved_awaiting_payment' : 'confirmed',
        paymentConfirmed: !hasFee,
      },
      matchCountByRound: [...countsByRound.entries()]
        .sort(([first], [second]) => first - second)
        .map(([roundNumber, matchCount]) => ({ roundNumber, matchCount })),
    }
  }

  function memberPlaceholders() {
    return memberStatuses.map(() => '?').join(',')
  }

  function listPools(userId) {
    readUser(userId)
    const rows = database.prepare(`
      SELECT p.id, p.name, p.status, part.role
      FROM pool_participations part JOIN pools p ON p.id = part.pool_id
      WHERE part.user_id = ? AND part.status IN (${memberPlaceholders()})
      ORDER BY p.created_at DESC, p.id
    `).all(userId, ...memberStatuses)
    return { pools: rows.map((row) => ({ id: row.id, name: row.name, status: row.status, role: row.role })) }
  }

  function getPoolRules(userId, poolId) {
    readUser(userId)
    const row = typeof poolId === 'string' && poolId.length <= 100
      ? database.prepare(`
        SELECT p.*, part.role AS requester_role
        FROM pools p JOIN pool_participations part ON part.pool_id = p.id AND part.user_id = ?
        WHERE p.id = ? AND part.status IN (${memberPlaceholders()})
      `).get(userId, poolId, ...memberStatuses)
      : undefined
    if (!row) throw poolNotFound()

    return {
      pool: describePool(row),
      requesterRole: row.requester_role,
      participationConditions: participationConditions(row.entry_fee_cents),
    }
  }

  function describePool(row) {
    const matchIds = database.prepare('SELECT match_id FROM pool_matches WHERE pool_id = ?').all(row.id).map(({ match_id: id }) => id)
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      entryFee: formatCents(row.entry_fee_cents),
      currency: 'BRL',
      prizeModel: row.prize_model,
      tiebreaker: row.tiebreaker,
      liveResults: row.live_results === 1,
      matches: sportsCatalog.describeMatches(matchIds),
    }
  }

  // Visão das regras do convidado (SPEC-009, OPEN-19): só regras e condições, nunca participantes.
  // Chamada somente depois de o convite ter sido validado pelo serviço de convites.
  function getInviteeRules(poolId) {
    const row = database.prepare('SELECT * FROM pools WHERE id = ?').get(poolId)
    if (!row) throw poolNotFound()
    return { pool: describePool(row), participationConditions: participationConditions(row.entry_fee_cents) }
  }

  return { getCreationAvailability, createPool, listPools, getPoolRules, getInviteeRules }
}
