import { formatBrl } from './financial-view.js'

// SPEC-019 — apresentação da contratação do Premium. A interface só mostra o que o backend decide:
// ela não ativa recursos nem define valor ou recorrência (INV-012).

export function recurrenceLabel(recurrence) {
  return recurrence === 'monthly' ? 'por mês' : ''
}

export function priceLabel(conditions) {
  return `${formatBrl(conditions.priceCents)} ${recurrenceLabel(conditions.recurrence)}`.trim()
}

export function formatDay(isoDate) {
  if (!isoDate) return ''
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

// Etapa da tela a partir das condições e da contratação atual.
export function premiumStage(conditions) {
  if (conditions.reason === 'already_premium') return 'active'
  const status = conditions.subscription?.status
  if (status === 'pending') return conditions.subscription.payment ? 'pending' : 'pending_unstarted'
  if (status === 'refused') return 'refused'
  return 'offer'
}

export function stageMessage(stage, subscription) {
  switch (stage) {
    case 'active':
      return subscription?.endsAt
        ? `Seu Premium está ativo. Vigência atual até ${formatDay(subscription.endsAt)}.`
        : 'Seu Premium está ativo.'
    case 'pending':
      return 'Aguardando a confirmação do pagamento. Seu plano muda só depois que o pagamento for confirmado.'
    case 'pending_unstarted':
      return 'Não foi possível iniciar o pagamento. A contratação não foi confirmada e nada foi cobrado; confira novamente em instantes.'
    case 'refused':
      return 'O pagamento foi recusado e seu plano continua Gratuito. Você pode tentar contratar de novo.'
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
