import { randomUUID } from 'node:crypto'
import { requestContext } from './request-context.js'

export function createLogger(write = (event) => console.log(JSON.stringify(event))) {
  function record(level, component, result) {
    write({
      timestamp: new Date().toISOString(),
      level,
      component,
      correlationId: requestContext.getStore()?.correlationId ?? randomUUID(),
      result,
    })
  }

  return {
    info: (component, result) => record('info', component, result),
    warn: (component, result) => record('warn', component, result),
    error: (component, result) => record('error', component, result),
  }
}