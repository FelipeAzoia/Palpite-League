export async function checkAvailability(fetcher = fetch) {
  const response = await fetcher('/health')
  if (!response.ok) throw new Error('Backend unavailable')
  return response.json()
}