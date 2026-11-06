import assert from 'node:assert/strict'
import test from 'node:test'
import { createAuditStore } from '../../src/backend/modules/notifications-audit/index.js'
import { createDatabase } from '../../src/backend/shared/database.js'
import { createLogger } from '../../src/backend/shared/logger.js'
import { runMigrations } from '../../src/backend/shared/migrations.js'
import { requestContext } from '../../src/backend/shared/request-context.js'

const baseEntry = {
  actor: { type: 'user', id: 'user-1' },
  action: 'prediction.updated',
  object: { type: 'prediction', id: 'prediction-1' },
  details: { before: '1-0', after: '2-0' },
}

function createStore({ logger, detailKeysByAction = {} } = {}) {
  const database = createDatabase(':memory:')
  runMigrations(database)
  return {
    database,
    store: createAuditStore(database, {
      logger,
      detailKeysByAction: {
        'prediction.updated': ['before', 'after'],
        'prediction.corrected': ['before', 'after'],
        ...detailKeysByAction,
      },
    }),
  }
}

test('grava sucesso na mesma transação com UTC e correlação do contexto', () => {
  const { database, store } = createStore()
  const startedAt = Date.now()

  const entry = {
    ...baseEntry,
    occurredAt: '2000-01-01T00:00:00.000Z',
    correlationId: 'caller-controlled',
  }
  const result = requestContext.run({ correlationId: 'request-123' }, () => store.runAuditedOperation(entry, (connection) => {
    connection.exec('CREATE TABLE operation_marker (id INTEGER PRIMARY KEY)')
    connection.prepare('INSERT INTO operation_marker DEFAULT VALUES').run()
    return 'done'
  }))

  const [record] = store.findByObject(baseEntry.object)
  assert.equal(result, 'done')
  assert.equal(record.result, 'success')
  assert.equal(record.correlationId, 'request-123')
  assert.deepEqual(record.details, baseEntry.details)
  assert.ok(Date.parse(record.occurredAt) >= startedAt)
  assert.equal(record.occurredAt.endsWith('Z'), true)
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM operation_marker').get().count, 1)
  database.close()
})

test('ator sistema e ator anônimo não carregam identificador', () => {
  const { database, store } = createStore()
  store.runAuditedOperation({ ...baseEntry, actor: { type: 'system' } }, () => {})
  store.runAuditedOperation({ ...baseEntry, actor: { type: 'anonymous', email: 'tried@example.com' } }, () => {})

  assert.deepEqual(store.findByActor({ type: 'system' })[0].actor, { type: 'system' })
  assert.deepEqual(store.findByActor({ type: 'anonymous' })[0].actor, { type: 'anonymous' })
  assert.equal(JSON.stringify(store.findByActor({ type: 'anonymous' })).includes('tried@example.com'), false)
  database.close()
})

test('preserva a origem informada para movimentações financeiras', () => {
  const { database, store } = createStore()
  const simulatedEntry = { ...baseEntry, object: { type: 'movement', id: 'movement-1' }, origin: 'simulator' }
  const providerEntry = { ...baseEntry, object: { type: 'movement', id: 'movement-2' }, origin: 'test-provider' }

  store.runAuditedOperation(simulatedEntry, () => {})
  store.runAuditedOperation(providerEntry, () => {})

  assert.equal(store.findByObject(simulatedEntry.object)[0].origin, 'simulator')
  assert.equal(store.findByObject(providerEntry.object)[0].origin, 'test-provider')
  database.close()
})

test('falha desfaz a operação e grava falha em transação separada', () => {
  const { database, store } = createStore()
  database.exec('CREATE TABLE operation_marker (value TEXT NOT NULL)')

  assert.throws(() => store.runAuditedOperation(baseEntry, (connection) => {
    connection.prepare('INSERT INTO operation_marker VALUES (?)').run('temporary')
    throw new Error('operation failed')
  }), /operation failed/)

  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM operation_marker').get().count, 0)
  assert.equal(store.findByObject(baseEntry.object)[0].result, 'failure')
  database.close()
})

test('falha ao gravar sucesso desfaz a operação e não deixa sucesso', () => {
  const events = []
  const logger = createLogger((event) => events.push(event))
  const { database, store } = createStore({ logger })
  database.exec(`
    CREATE TABLE operation_marker (value TEXT NOT NULL);
    CREATE TRIGGER reject_audit_success BEFORE INSERT ON audit_records
    WHEN NEW.result = 'success'
    BEGIN SELECT RAISE(ABORT, 'injected audit failure'); END;
  `)

  assert.throws(() => store.runAuditedOperation(baseEntry, (connection) => {
    connection.prepare('INSERT INTO operation_marker VALUES (?)').run('temporary')
  }))
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM operation_marker').get().count, 0)
  const [failureRecord] = store.findByObject(baseEntry.object)
  assert.equal(failureRecord.result, 'failure')
  assert.ok(events.some(({ component, result }) => component === 'audit' && result === 'record_failed'))
  assert.equal(events[0].correlationId, failureRecord.correlationId)
  database.close()
})

test('negativa é gravada separadamente sem alterar o objeto', () => {
  const { database, store } = createStore()
  database.exec('CREATE TABLE operation_marker (value TEXT NOT NULL)')

  store.recordOutcome(baseEntry, 'denied')

  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM operation_marker').get().count, 0)
  assert.equal(store.findByObject(baseEntry.object)[0].result, 'denied')
  database.close()
})

test('valida campos obrigatórios e rejeita detalhes não permitidos ou sensíveis', () => {
  const { database, store } = createStore()
  let operationCalled = false

  assert.throws(() => store.runAuditedOperation({ ...baseEntry, actor: null }, () => { operationCalled = true }), /actor is required/)
  assert.throws(() => store.runAuditedOperation({ ...baseEntry, action: '' }, () => {}), /action is required/)
  assert.throws(() => store.runAuditedOperation({ ...baseEntry, object: { type: '', id: '1' } }, () => {}), /object.type is required/)
  assert.throws(() => store.runAuditedOperation({ ...baseEntry, object: { type: 'pool', id: '' } }, () => {}), /object.id is required/)
  assert.throws(() => store.runAuditedOperation({ ...baseEntry, details: { email: 'person@example.com' }, allowedDetailKeys: ['email'] }, () => {}), /detail key is not allowed/)
  assert.throws(() => store.runAuditedOperation({ ...baseEntry, details: { extra: 'value' } }, () => {}), /detail key is not allowed/)
  for (const [key, value] of Object.entries({ password: 'password-secret', token: 'token-secret', cardNumber: '4111111111111111' })) {
    assert.throws(() => store.runAuditedOperation({ ...baseEntry, details: { [key]: value }, allowedDetailKeys: [key] }, () => {}), /detail key is not allowed/)
  }
  assert.throws(() => createAuditStore(database, {
    detailKeysByAction: { 'prediction.updated': ['password'] },
  }), /sensitive detail key configured/)
  assert.throws(() => store.recordOutcome(baseEntry, undefined), /failure or denied/)
  assert.equal(operationCalled, false)
  assert.equal(store.findByObject(baseEntry.object).length, 0)
  database.close()
})

test('consulta por objeto e ator filtra e mantém ordem cronológica', () => {
  const { database, store } = createStore()
  store.runAuditedOperation(baseEntry, () => {})
  store.runAuditedOperation({ ...baseEntry, action: 'prediction.corrected' }, () => {})
  store.runAuditedOperation({ ...baseEntry, actor: { type: 'user', id: 'user-2' }, object: { type: 'pool', id: 'pool-1' } }, () => {})

  assert.deepEqual(store.findByObject(baseEntry.object).map(({ action }) => action), ['prediction.updated', 'prediction.corrected'])
  assert.equal(store.findByActor({ type: 'user', id: 'user-2' }).length, 1)
  assert.equal(store.findByObject({ type: 'missing', id: 'missing' }).length, 0)
  database.close()
})

test('registros são imutáveis e falha de persistência é sinalizada e registrada tecnicamente', () => {
  const events = []
  const logger = createLogger((event) => events.push(event))
  const { database, store } = createStore({ logger })
  store.runAuditedOperation(baseEntry, () => {})

  assert.throws(() => database.prepare("UPDATE audit_records SET action = 'changed'").run(), /immutable/)
  assert.throws(() => database.prepare('DELETE FROM audit_records').run(), /immutable/)

  database.exec('DROP TABLE audit_records')
  assert.throws(() => store.recordOutcome(baseEntry, 'failure'), /could not be persisted/)
  assert.equal(events.at(-1).component, 'audit')
  assert.equal(events.at(-1).result, 'record_failed')
  database.close()
})