import { useState } from 'react'
import { crestSource } from './crests.js'

// Escudo do time nos placares (SPEC-031), para o campeonato simulado e para a API-Football. Sem escudo
// ou com a imagem indisponível, mostra a inicial do time no mesmo espaço, para não desalinhar a linha.
export function TeamCrest({ team, size = 18 }) {
  const [broken, setBroken] = useState(false)
  if (!team?.crest || broken) {
    return (
      <span className="team-crest team-crest-empty" style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }} aria-hidden="true">
        {team?.name?.slice(0, 1) ?? '?'}
      </span>
    )
  }
  return (
    <img
      className="team-crest"
      src={crestSource(team.crest)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  )
}

// Nome com o escudo do lado do placar: mandante "Nome [escudo]", visitante "[escudo] Nome".
export function TeamLabel({ team, side, size }) {
  return side === 'home'
    ? <>{team.name}<TeamCrest team={team} size={size} /></>
    : <><TeamCrest team={team} size={size} />{team.name}</>
}
