import { setTimeout as delay } from 'node:timers/promises'

const url = process.env.HEALTH_URL || 'http://localhost:3000/health'
let failed = false

for (let minute = 1; minute <= 30; minute += 1) {
  await delay(60_000)

  try {
    const response = await fetch(url)
    if (!response.ok) failed = true
    console.log(`minute=${minute} status=${response.status}`)
  } catch {
    failed = true
    console.log(`minute=${minute} status=unavailable`)
  }
}

process.exitCode = failed ? 1 : 0