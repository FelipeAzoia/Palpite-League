export function describeFeatures(features) {
  return [
    { id: 'pools', label: 'Bolões criados simultaneamente', value: `Até ${features.simultaneousPools}` },
    { id: 'participation', label: 'Participação em bolões', value: features.unlimitedParticipation ? 'Sem limite' : 'Limitada' },
    { id: 'live', label: 'Resultados ao vivo nos bolões que você cria', value: features.liveResultsInCreatedPools ? 'Sim' : 'Não' },
  ]
}

export function planStatusLabel(status) {
  return status === 'active' ? 'Ativo' : status
}
