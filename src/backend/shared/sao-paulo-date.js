const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

// Dia civil (AAAA-MM-DD) em America/Sao_Paulo para um instante (milissegundos ou texto ISO).
export function saoPauloDate(instant) {
  const values = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}
