// O token de recuperação chega no fragmento (#token=...) do endereço e nunca é enviado
// em consultas ou caminhos: a interface o lê, o remove da barra de endereço e o envia
// apenas no corpo da requisição de redefinição (SPEC-004, CA-19).
export function readRecoveryToken(hash) {
  const match = /^#token=([A-Za-z0-9_-]+)$/.exec(hash ?? '')
  return match ? match[1] : null
}

export function consumeRecoveryToken(location, history) {
  const token = readRecoveryToken(location.hash)
  if (token) history.replaceState(null, '', `${location.pathname}${location.search}`)
  return token
}
