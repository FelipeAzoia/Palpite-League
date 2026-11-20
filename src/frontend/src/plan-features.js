// "enabled" indica recursos sim/não, que a comparação mostra com ícone; "value" é o texto.
export function describeFeatures(features) {
  return [
    { id: 'pools', label: 'Bolões criados simultaneamente', value: `Até ${features.simultaneousPools}` },
    { id: 'participation', label: 'Participação em bolões', value: features.unlimitedParticipation ? 'Sem limite' : 'Limitada' },
    { id: 'live', label: 'Resultados ao vivo nos bolões que você cria', value: features.liveResultsInCreatedPools ? 'Sim' : 'Não', enabled: features.liveResultsInCreatedPools },
  ]
}

export function planStatusLabel(status) {
  return status === 'active' ? 'Ativo' : status
}

// Resumo de uma linha do que cada plano oferece (sem preço: ele pertence à SPEC-019).
export function planTagline(plan) {
  const pools = plan.features.simultaneousPools
  const live = plan.features.liveResultsInCreatedPools ? ', com resultados ao vivo nos bolões que você cria' : ''
  return `Participe de quantos bolões quiser e administre até ${pools} ${pools === 1 ? 'bolão ativo' : 'bolões ativos'} ao mesmo tempo${live}.`
}

// Uso do limite de bolões ativos criados (disponibilidade da SPEC-007).
export function usageSummary({ activePools, limit }) {
  const ratio = limit > 0 ? Math.min(1, activePools / limit) : 1
  const remaining = Math.max(0, limit - activePools)
  return {
    ratio,
    full: remaining === 0,
    text: remaining === 0
      ? 'Limite atingido: encerre um bolão para criar outro.'
      : `Você ainda pode criar ${remaining} ${remaining === 1 ? 'bolão' : 'bolões'}.`,
  }
}
