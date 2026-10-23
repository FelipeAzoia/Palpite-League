export async function fetchHealth(fetchImplementation = fetch) {
  const response = await fetchImplementation('/api/health')
  const result = await response.json()

  return {
    available: response.ok && result.status === 'ok',
    component: result.component,
  }
}
