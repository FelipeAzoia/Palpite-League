// Símbolo da marca: um balão de fala com um campo de futebol dentro (o palpite sobre a partida).
// Usa currentColor, então herda a cor do contêiner.
export default function BrandIcon({ size = 20, strokeWidth = 2 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* Balão com a ponta no canto inferior direito */}
      <path d="M7 3h10a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4h-.5l1 3-4-3H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z" />
      {/* Linha do meio-campo e círculo central */}
      <path d="M12 3v16" />
      <circle cx="12" cy="11" r="2.6" />
      {/* Áreas dos gols */}
      <path d="M3 8.5h1.5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3" />
      <path d="M21 8.5h-1.5a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1H21" />
    </svg>
  )
}
