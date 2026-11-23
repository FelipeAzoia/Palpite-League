// SPEC-018 — apresentação do histórico financeiro. A interface só exibe: estados e efeitos são do
// backend, e nenhuma movimentação de teste é apresentada como comprovante de pagamento (INV-016).

export const testEnvironmentNotice =
  'Ambiente de teste: nenhuma operação movimenta dinheiro real e nenhum registro serve como comprovante de pagamento.'

const typeLabels = Object.freeze({
  entry_fee: 'Taxa de entrada',
  subscription: 'Assinatura',
  refund: 'Devolução',
  payout: 'Premiação',
})

const statusLabels = Object.freeze({
  pending: 'Pendente',
  confirmed: 'Confirmada',
  refused: 'Recusada',
})

export function movementTypeLabel(type) {
  return typeLabels[type] ?? 'Movimentação'
}

export function movementStatusLabel(status) {
  return statusLabels[status] ?? 'Pendente'
}

// Selo de origem: a simulação nunca aparece como confirmação do provedor (INV-005, CA-13).
export function originBadge(movement) {
  return movement?.origin === 'simulator' ? 'Simulação' : 'Provedor de teste'
}

// "R$ 1.234,56" a partir de centavos inteiros, sem ponto flutuante (INV-013).
export function formatBrl(amountCents) {
  if (!Number.isSafeInteger(amountCents)) return 'R$ —'
  const negative = amountCents < 0
  const absolute = Math.abs(amountCents)
  const reais = String(Math.trunc(absolute / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const cents = String(absolute % 100).padStart(2, '0')
  return `${negative ? '-' : ''}R$ ${reais},${cents}`
}

export function formatMovementDate(isoDate) {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })
}
