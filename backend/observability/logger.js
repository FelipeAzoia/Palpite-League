export function recordTechnicalEvent(database, event) {
  const normalizedEvent = {
    timestamp: new Date().toISOString(),
    level: event.level,
    component: event.component,
    correlationId: event.correlationId,
    outcome: event.outcome,
  }

  try {
    const connection = typeof database === 'function' ? database() : database
    connection.prepare(`
      INSERT INTO technical_events (
        event_type,
        created_at,
        level,
        component,
        correlation_id,
        outcome
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `${normalizedEvent.component}.${normalizedEvent.outcome}`,
      normalizedEvent.timestamp,
      normalizedEvent.level,
      normalizedEvent.component,
      normalizedEvent.correlationId,
      normalizedEvent.outcome,
    )
  } catch {
    process.stderr.write(`${JSON.stringify({ ...normalizedEvent, sink: 'stderr' })}\n`)
  }

  return normalizedEvent
}

export function writeStartupFailure(correlationId, component = 'application') {
  const event = {
    timestamp: new Date().toISOString(),
    level: 'error',
    component,
    correlationId,
    outcome: 'startup_failed',
    sink: 'stderr',
  }

  process.stderr.write(`${JSON.stringify(event)}\n`)
}
