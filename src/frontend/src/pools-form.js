export const prizeModelLabels = {
  winner_takes_all: 'Vencedor leva tudo sobre o montante arrecadado',
}

export const tiebreakerLabels = {
  exact_scores: 'Mais placares exatos',
  correct_results: 'Mais resultados corretos',
  last_round_points: 'Maior pontuação na última rodada do bolão',
}

export const roleLabels = {
  administrator: 'Administrador',
  coadministrator: 'Coadministrador',
  participant: 'Participante',
}

export const poolStatusLabels = {
  active: 'Ativo',
  ended: 'Encerrado',
}

export function todayInSaoPaulo(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

// Conferência das datas já na tela, com as mesmas regras do backend (SPEC-007 INV-006): o início
// não pode ser anterior a hoje (dia de America/Sao_Paulo) e o fim não pode ser anterior ao início.
// O backend valida de novo no envio.
export function periodErrors({ startsOn, endsOn }, today = todayInSaoPaulo()) {
  const errors = {}
  if (!startsOn) errors.startsOn = 'Informe a data de início.'
  else if (startsOn < today) errors.startsOn = 'A data de início não pode ser anterior a hoje.'
  if (endsOn && startsOn && endsOn < startsOn) errors.endsOn = 'A data de fim não pode ser anterior à data de início.'
  return errors
}

// "25.00" -> "R$ 25,00"
export function formatBrl(amount) {
  return `R$ ${String(amount).replace('.', ',')}`
}

export function formatDay(day) {
  const [year, month, date] = day.split('-')
  return `${date}/${month}/${year}`
}

export function toggleValue(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

// Monta o corpo da criação; a validação de verdade acontece no backend.
export function buildPoolRequest(values) {
  return {
    name: values.name,
    startsOn: values.startsOn,
    endsOn: values.endsOn,
    entryFee: String(values.entryFee ?? '').trim().replace(',', '.'),
    prizeModel: values.prizeModel,
    tiebreaker: values.tiebreaker,
    selection: {
      matchIds: [...values.matchIds],
      roundNumbers: [...values.roundNumbers].sort((first, second) => first - second),
    },
  }
}
