// Modelos de premiação (SPEC-030, RB69). As porcentagens são decididas pelo backend; aqui só os textos.
export const prizeModelLabels = {
  winner_takes_all: 'Vencedor leva tudo sobre o montante arrecadado',
  podium_50_30_20: 'Pódio: 1º 50% · 2º 30% · 3º 20%',
  podium_60_30_10: 'Pódio: 1º 60% · 2º 30% · 3º 10%',
  podium_70_20_10: 'Pódio: 1º 70% · 2º 20% · 3º 10%',
}

const podiumNote = 'Empatados somam as porcentagens das colocações que ocupam e dividem por igual. Se menos de três pessoas pontuarem, a sobra é repartida entre os premiados.'

export const prizeModelDescriptions = {
  winner_takes_all: 'Todo o montante arrecadado vai para o 1º lugar. Em caso de empate, os vencedores dividem por igual.',
  podium_50_30_20: `O montante é dividido entre os três primeiros: 50%, 30% e 20%. ${podiumNote}`,
  podium_60_30_10: `O montante é dividido entre os três primeiros: 60%, 30% e 10%. ${podiumNote}`,
  podium_70_20_10: `O montante é dividido entre os três primeiros: 70%, 20% e 10%. ${podiumNote}`,
}

// Porcentagem do montante, no formato brasileiro: 37.5 → "37,5%".
export function formatPrizePercent(percent) {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return ''
  return `${percent.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
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
