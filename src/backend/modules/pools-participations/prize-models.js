// SPEC-030 — modelos de premiação do bolão (RB51, RB69) e cálculo das partes dos premiados.
// Usado na criação do bolão, no resultado final (SPEC-025) e na premiação (SPEC-026).

// Porcentagem do montante por colocação em cada modelo de premiação (SPEC-030 INV-001, RB69).
export const prizeModelPlaces = Object.freeze({
  winner_takes_all: Object.freeze([100]),
  podium_50_30_20: Object.freeze([50, 30, 20]),
  podium_60_30_10: Object.freeze([60, 30, 10]),
  podium_70_20_10: Object.freeze([70, 20, 10]),
})

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b))

// Partes da premiação a partir da classificação final congelada, já na ordem estável (posição,
// nome, participação). Só elegíveis com pontos recebem (INV-002). Empatados formam um grupo que
// ocupa tantas colocações quantos membros tiver e divide por igual a soma das porcentagens dessas
// colocações (INV-003, INV-004); a sobra de colocações vazias é repartida na proporção do que cada
// premiado recebeu (INV-005); centavos para baixo e o resto, um por vez, na ordem (INV-006).
export function computePrizeShares(prizeModel, standings, amountCents) {
  const places = prizeModelPlaces[prizeModel] ?? prizeModelPlaces.winner_takes_all
  const ranked = standings.filter(({ totalPoints }) => totalPoints > 0)
  const groups = []
  let next = 0
  for (let start = 0; start < ranked.length && next < places.length;) {
    let end = start
    while (end < ranked.length && ranked[end].position === ranked[start].position) end += 1
    const members = ranked.slice(start, end)
    const percent = places.slice(next, next + members.length).reduce((sum, value) => sum + value, 0)
    groups.push({ members, place: next + 1, percent })
    next += members.length
    start = end
  }
  if (groups.length === 0) return []

  // Pesos inteiros: cada membro vale percent / tamanho do grupo; o denominador comum evita frações.
  const common = groups.reduce((acc, { members }) => (acc * members.length) / gcd(acc, members.length), 1)
  const awardees = groups.flatMap(({ members, place, percent }) => members.map((member) => ({
    participationId: member.participationId,
    place,
    weight: (percent * common) / members.length,
  })))
  const totalWeight = awardees.reduce((sum, { weight }) => sum + weight, 0)
  const shares = awardees.map(({ participationId, place, weight }) => ({
    participationId,
    place,
    amountCents: Math.floor((amountCents * weight) / totalWeight),
    percentBasisPoints: Math.max(1, Math.round((10000 * weight) / totalWeight)),
  }))
  let remainder = amountCents - shares.reduce((sum, share) => sum + share.amountCents, 0)
  for (let index = 0; remainder > 0; index = (index + 1) % shares.length, remainder -= 1) shares[index].amountCents += 1
  return shares
}

export const prizeModels = Object.freeze(Object.keys(prizeModelPlaces))
