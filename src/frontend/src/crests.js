// Escudos dos 20 clubes servidos pelo próprio sistema (public/crests), para não depender do
// servidor de imagens da API-Football: algumas redes não resolvem media.api-sports.io. Os clubes do
// campeonato simulado e os da temporada 2024 são os mesmos; qualquer outro escudo usa a URL original.
export const localCrestIds = Object.freeze(['118', '119', '120', '121', '124', '126', '127', '130', '131', '133', '134', '135', '136', '140', '144', '152', '154', '794', '1062', '1193'])

export function crestSource(url) {
  const id = /^https:\/\/media\.api-sports\.io\/football\/teams\/(\d+)\.png$/.exec(url ?? '')?.[1]
  return id && localCrestIds.includes(id) ? `/crests/${id}.png` : url
}
