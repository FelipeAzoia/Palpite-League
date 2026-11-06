export async function requestAuth(path, { method = 'GET', body, token, fetcher = fetch } = {}) {
  const headers = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (token) headers.authorization = `Bearer ${token}`

  const response = await fetcher(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

  let payload = {}
  try {
    payload = await response.json()
  } catch {
    payload = {}
  }

  if (!response.ok) {
    const error = new Error(payload.message || 'Não foi possível concluir a solicitação.')
    error.status = response.status
    error.type = payload.type
    error.fields = payload.fields ?? {}
    throw error
  }

  return payload
}