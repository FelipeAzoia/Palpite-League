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
// Máscara de valor em reais, como nos apps de banco: só dígitos são aceitos e cada dígito novo
// entra pela direita, empurrando os outros (1 → 0,01; 12 → 0,12; 123 → 1,23). Trabalha em
// centavos inteiros, então nunca há problema com vírgula ou ponto.
export const maxFeeInputDigits = 5 // até R$ 999,99; o limite da regra (R$ 500,00) é conferido à parte

export function centsFromMaskedInput(text, previousCents = 0) {
  const digits = String(text ?? '').replace(/\D/g, '').replace(/^0+/, '')
  if (digits.length > maxFeeInputDigits) return previousCents
  return digits === '' ? 0 : Number(digits)
}

export function formatCentsInput(cents) {
  const safe = Number.isSafeInteger(cents) && cents > 0 ? cents : 0
  return (safe / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Mesma faixa do backend (SPEC-007): zero, ou de R$ 1,00 a R$ 500,00.
export function entryFeeErrors(cents) {
  if (cents === 0) return {}
  if (cents < 100 || cents > 50000) return { entryFee: 'A taxa deve ser R$ 0,00 ou ficar entre R$ 1,00 e R$ 500,00.' }
  return {}
}

export function buildPoolRequest(values) {
  return {
    name: values.name,
    startsOn: values.startsOn,
    endsOn: values.endsOn,
    entryFee: Number.isSafeInteger(values.entryFeeCents)
      ? (values.entryFeeCents / 100).toFixed(2)
      : String(values.entryFee ?? '').trim().replace(',', '.'),
    prizeModel: values.prizeModel,
    tiebreaker: values.tiebreaker,
    selection: {
      matchIds: [...values.matchIds],
      roundNumbers: [...values.roundNumbers].sort((first, second) => first - second),
    },
  }
}
