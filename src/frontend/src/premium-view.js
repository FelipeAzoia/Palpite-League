import { formatBrl } from './financial-view.js'
import { describeFeatures } from './plan-features.js'

// SPEC-019 — apresentação da contratação do Premium. A interface só mostra o que o backend decide:
// ela não ativa recursos nem define valor ou recorrência (INV-012).

// No cartão do Premium só entra o que muda em relação ao Gratuito: o limite de bolões que o usuário
// cria e administra (RB02, RB03) e os resultados ao vivo (RB06). A participação em bolões de outros
// é sem limite nos dois planos (RB05) e aparece só na comparação.
export function premiumAdvantages(features) {
  return describeFeatures(features).filter(({ id }) => id !== 'participation')
}

export function recurrenceLabel(recurrence) {
  if (recurrence === 'monthly') return 'por mês'
  if (recurrence === 'annual') return 'por ano'
  return ''
}

export function cycleName(cycle) {
  return cycle === 'annual' ? 'Anual' : 'Mensal'
}

// Preço de um ciclo (SPEC-029); sem ciclo, o mensal das condições.
export function priceLabel(conditions, cycleId = 'monthly') {
  const cycle = conditions.cycles?.find(({ id }) => id === cycleId)
  const cents = cycle ? cycle.priceCents : conditions.priceCents
  return `${formatBrl(cents)} ${recurrenceLabel(cycle ? cycle.id : conditions.recurrence)}`.trim()
}

// Destaque do anual: mensal equivalente e economia frente a doze mensalidades (SPEC-029 CA-01).
export function cycleHighlight(cycle) {
  if (!cycle || cycle.id !== 'annual' || !cycle.savingsCents) return ''
  return `${formatBrl(cycle.monthlyEquivalentCents)} por mês · economia de ${formatBrl(cycle.savingsCents)} (2 meses grátis)`
}

export function formatDay(isoDate) {
  if (!isoDate) return ''
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

// Etapa da tela a partir das condições e da contratação atual.
export function premiumStage(conditions) {
  const status = conditions.subscription?.status
  if (status === 'cancellation_pending') return 'cancellation_pending'
  if (status === 'non_renewing') return 'non_renewing'
  if (status === 'past_due') return 'past_due'
  if (conditions.reason === 'already_premium') return 'active'
  if (status === 'pending') return conditions.subscription.payment ? 'pending' : 'pending_unstarted'
  if (status === 'refused') return 'refused'
  if (status === 'cancelled' || status === 'expired') return 'ended'
  return 'offer'
}

// SPEC-020 — situação da assinatura, datas em UTC e o aviso fixo do cancelamento (OPEN-94).
const subscriptionStatusLabels = Object.freeze({
  pending: 'Aguardando pagamento',
  active: 'Ativa',
  refused: 'Pagamento recusado',
  cancellation_pending: 'Cancelamento aguardando confirmação',
  cancelled: 'Cancelada',
  expired: 'Expirada',
  past_due: 'Pagamento da renovação pendente',
  non_renewing: 'Renovação cancelada',
})

export function subscriptionStatusLabel(status) {
  return subscriptionStatusLabels[status] ?? 'Sem assinatura'
}

export function formatUtc(isoDate) {
  if (!isoDate) return ''
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' })} UTC`
}

export const cancellationNotice = Object.freeze([
  'Nenhuma cobrança nova acontece depois que o provedor confirmar o cancelamento.',
  'Seu Premium continua até o fim do período já pago; depois sua conta volta ao plano Gratuito (até 1 bolão ativo criado por você).',
  'Não há reembolso do valor já pago.',
  'No fim do período, o bolão que você mantiver aberto deixa de ter resultados ao vivo.',
  'Desde o pedido até o fim do período, você não cria bolões além do limite do Gratuito.',
  'Seus bolões, participações, palpites e medalhas continuam exatamente como estão.',
])

// Só cancela quem tem no máximo 1 bolão em andamento criado por si, o limite do Gratuito (CA-18).
export const freePoolLimit = 1

export function cancellationBlockedMessage(activePools) {
  if (activePools <= freePoolLimit) return ''
  return `Para cancelar, você precisa ter no máximo ${freePoolLimit} bolão em andamento criado por você (o limite do plano Gratuito). Hoje você tem ${activePools}: encerre os demais para poder cancelar.`
}

export function cancellationResultMessage(status, subscription) {
  if (status === 'non_renewing') {
    return `Cancelamento confirmado: não haverá novas cobranças e seu Premium vale até ${formatDay(subscription?.premiumUntil ?? subscription?.endsAt)}.`
  }
  if (status === 'cancelled') return 'Cancelamento concluído: sua conta voltou ao plano Gratuito.'
  if (status === 'active') return 'O cancelamento foi recusado pelo provedor e sua assinatura continua ativa.'
  if (status === 'expired') return 'Sua assinatura chegou ao fim da vigência e expirou.'
  return 'O cancelamento ainda aguarda a confirmação do provedor; seu Premium continua valendo até lá.'
}

export function stageMessage(stage, subscription) {
  switch (stage) {
    case 'active':
      return subscription?.nextChargeAt
        ? `Seu Premium está ativo e será renovado automaticamente em ${formatDay(subscription.nextChargeAt)}.`
        : 'Seu Premium está ativo.'
    case 'non_renewing':
      return `A renovação foi cancelada: não haverá novas cobranças, e seu Premium vale até ${formatDay(subscription?.premiumUntil)}. Depois disso sua conta volta ao plano Gratuito.`
    case 'past_due':
      return `Não conseguimos confirmar o pagamento da renovação. Seu Premium continua até ${formatDay(subscription?.graceEndsAt)}; regularize até lá para não voltar ao plano Gratuito.`
    case 'pending':
      return 'Aguardando a confirmação do pagamento. Seu plano muda só depois que o pagamento for confirmado.'
    case 'pending_unstarted':
      return 'Não foi possível iniciar o pagamento. A contratação não foi confirmada e nada foi cobrado; confira novamente em instantes.'
    case 'refused':
      return 'O pagamento foi recusado e seu plano continua Gratuito. Você pode tentar contratar de novo.'
    case 'cancellation_pending':
      return 'Você pediu o cancelamento e ele aguarda a confirmação do provedor. Seu Premium continua valendo até o fim do período pago.'
    case 'ended':
      return subscription?.status === 'expired'
        ? `Sua assinatura expirou em ${formatDay(subscription.endedAt)}. Você está no plano Gratuito; seus bolões continuam como estavam.`
        : `Sua assinatura foi cancelada em ${formatDay(subscription?.endedAt)}. Você está no plano Gratuito; seus bolões continuam como estavam.`
    default:
      return ''
  }
}

// Mensagem depois de voltar do pagamento e conferir a situação.
export function checkResultMessage(status) {
  if (status === 'active') return 'Pagamento confirmado: seu plano agora é Premium.'
  if (status === 'refused') return 'Pagamento recusado: seu plano continua Gratuito.'
  return 'Ainda não recebemos a confirmação do pagamento. A operação não foi confirmada; conferimos de novo automaticamente.'
}

// SPEC-029 — resultado da nova tentativa de pagar a renovação.
export function retryResultMessage(status) {
  if (status === 'active') return 'Pagamento confirmado: sua assinatura foi renovada.'
  return 'O pagamento ainda não foi confirmado. Tente de novo mais tarde, antes do fim da carência.'
}
