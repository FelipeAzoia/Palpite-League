// Seletor de rodada das telas do bolão. "tone" marca rodadas com algo a fazer (open) ou encerradas (done).
export default function RoundPicker({ rounds, value, onChange, label = 'Rodada' }) {
  if (rounds.length <= 1) return null
  return (
    <div className="round-picker" role="group" aria-label={`Escolher ${label.toLowerCase()}`}>
      <span className="round-picker-label">{label}</span>
      <div className="round-picker-options">
        {rounds.map((round) => (
          <button
            key={round.number}
            type="button"
            aria-pressed={round.number === value}
            className={round.tone ? `round-option round-option-${round.tone}` : 'round-option'}
            title={round.hint}
            onClick={() => onChange(round.number)}
          >
            {round.number}
          </button>
        ))}
      </div>
    </div>
  )
}
