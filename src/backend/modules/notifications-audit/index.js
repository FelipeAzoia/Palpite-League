import { randomUUID } from 'node:crypto'
import { requestContext } from '../../shared/request-context.js'
import { createLogger } from '../../shared/logger.js'

export const moduleName = 'notifications-audit'

const validActorTypes = new Set(['user', 'system', 'anonymous'])
const validResults = new Set(['failure', 'denied'])
const sensitiveDetailKey = /password|token|secret|credential|authorization|email|card|cvv|cvc|pan/i

function requiredText(value, field) {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new TypeError(`${field} is required`)
	}

	return value.trim()
}

function validateActor(actor) {
	if (!actor || !validActorTypes.has(actor.type)) {
		throw new TypeError('actor is required')
	}

	if (actor.type === 'user') {
		return { type: actor.type, id: requiredText(actor.id, 'actor.id') }
	}

	if (actor.id !== undefined && actor.id !== null) {
		throw new TypeError(`${actor.type} actor must not have an id`)
	}

	return { type: actor.type, id: null }
}

function validateDetails(details, detailSchema = {}) {
	if (details === undefined || details === null) return null
	if (!details || typeof details !== 'object' || Array.isArray(details)) {
		throw new TypeError('details must be an object')
	}
	for (const [key, value] of Object.entries(details)) {
		const fieldSchema = detailSchema[key]
		if (!fieldSchema || sensitiveDetailKey.test(key) || !isValidDetailValue(value, fieldSchema)) {
			throw new TypeError(`detail key is not allowed: ${key}`)
		}
	}

	try {
		return JSON.stringify(details)
	} catch {
		throw new TypeError('details must contain JSON values')
	}
}

function isValidDetailValue(value, schema) {
	switch (schema.type) {
		case 'score':
			return typeof value === 'string' && /^(?:[0-9]|[1-9][0-9])-(?:[0-9]|[1-9][0-9])$/.test(value)
		case 'integer':
			return Number.isSafeInteger(value)
		case 'number':
			return typeof value === 'number' && Number.isFinite(value)
		case 'boolean':
			return typeof value === 'boolean'
		case 'timestamp':
			return typeof value === 'string'
				&& Number.isFinite(Date.parse(value))
				&& new Date(value).toISOString() === value
		case 'enum':
			return typeof value === 'string' && schema.values.includes(value)
		default:
			return false
	}
}

function validateEntry(entry, detailSchemasByAction) {
	if (!entry || typeof entry !== 'object') throw new TypeError('audit entry is required')
	const actor = validateActor(entry.actor)
	const object = entry.object
	const action = requiredText(entry.action, 'action')

	if (!object || typeof object !== 'object') throw new TypeError('object is required')

	return {
		actor,
		action,
		objectType: requiredText(object.type, 'object.type'),
		objectId: requiredText(String(object.id ?? ''), 'object.id'),
		origin: entry.origin == null ? null : requiredText(entry.origin, 'origin'),
		details: validateDetails(entry.details, detailSchemasByAction.get(action) ?? {}),
	}
}

function withCorrelation(operation) {
	const context = requestContext.getStore() ?? {}
	const correlationId = context.correlationId ?? randomUUID()
	return requestContext.run({ ...context, correlationId }, () => operation(correlationId))
}

function toRecord(row) {
	return {
		id: row.id,
		actor: { type: row.actor_type, ...(row.actor_id === null ? {} : { id: row.actor_id }) },
		action: row.action,
		object: { type: row.object_type, id: row.object_id },
		occurredAt: row.occurred_at,
		result: row.result,
		origin: row.origin,
		correlationId: row.correlation_id,
		details: row.details_json === null ? null : JSON.parse(row.details_json),
	}
}

export function createAuditStore(database, { logger = createLogger(), detailSchemasByAction = {} } = {}) {
	if (!detailSchemasByAction || typeof detailSchemasByAction !== 'object' || Array.isArray(detailSchemasByAction)) {
		throw new TypeError('detailSchemasByAction must be an object')
	}

	const detailSchemas = new Map()
	for (const [action, schema] of Object.entries(detailSchemasByAction)) {
		const actionName = requiredText(action, 'action')
		if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
			throw new TypeError(`detail schema for ${actionName} must be an object`)
		}
		const validatedSchema = {}
		for (const [key, definition] of Object.entries(schema)) {
			const field = requiredText(key, 'detail key')
			if (sensitiveDetailKey.test(field)) throw new TypeError(`sensitive detail key configured for ${actionName}`)
			if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
				throw new TypeError(`detail type required for ${actionName}.${field}`)
			}
			if (definition.type === 'enum') {
				if (!Array.isArray(definition.values) || definition.values.length === 0
					|| definition.values.some((value) => typeof value !== 'string' || value.length === 0)) {
					throw new TypeError(`enum values required for ${actionName}.${field}`)
				}
				validatedSchema[field] = { type: 'enum', values: [...definition.values] }
			} else if (['score', 'integer', 'number', 'boolean', 'timestamp'].includes(definition.type)) {
				validatedSchema[field] = { type: definition.type }
			} else {
				throw new TypeError(`unsupported detail type for ${actionName}.${field}`)
			}
		}
		detailSchemas.set(actionName, validatedSchema)
	}

	let insertAuditRecord

	function getInsertAuditRecord() {
		insertAuditRecord ??= database.prepare(`
		INSERT INTO audit_records (
			actor_type, actor_id, action, object_type, object_id, occurred_at,
			result, origin, correlation_id, details_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
		return insertAuditRecord
	}

	function insert(record, result) {
		getInsertAuditRecord().run(
			record.actor.type,
			record.actor.id,
			record.action,
			record.objectType,
			record.objectId,
			new Date().toISOString(),
			result,
			record.origin,
			requestContext.getStore()?.correlationId ?? randomUUID(),
			record.details,
		)
	}

	function persistOutcome(record, result) {
		if (!validResults.has(result)) throw new TypeError('result must be failure or denied')

		try {
			database.transaction(() => insert(record, result))()
		} catch {
			logger.error('audit', 'record_failed')
			throw new Error('Audit record could not be persisted')
		}
	}

	function recordOutcome(entry, result) {
		const record = validateEntry(entry, detailSchemas)
		return withCorrelation(() => persistOutcome(record, result))
	}

	function runAuditedOperation(entry, operation) {
		if (typeof operation !== 'function') throw new TypeError('operation must be a function')
		const record = validateEntry(entry, detailSchemas)
		return withCorrelation(() => {
			let operationCompleted = false

			try {
				return database.transaction(() => {
					const result = operation(database)
					operationCompleted = true
					insert(record, 'success')
					return result
				})()
			} catch (error) {
				if (operationCompleted) logger.error('audit', 'record_failed')
				try {
					persistOutcome(record, 'failure')
				} catch {
					// The technical logger in persistOutcome records the persistence failure.
				}
				throw error
			}
		})
	}

	function findByObject(object) {
		if (!object || typeof object !== 'object') throw new TypeError('object is required')
		const objectType = requiredText(object.type, 'object.type')
		const objectId = requiredText(String(object.id ?? ''), 'object.id')
		return database.prepare(`
			SELECT * FROM audit_records
			WHERE object_type = ? AND object_id = ?
			ORDER BY occurred_at ASC, id ASC
		`).all(objectType, objectId).map(toRecord)
	}

	function findByActor(actor) {
		const validActor = validateActor(actor)
		return database.prepare(`
			SELECT * FROM audit_records
			WHERE actor_type = ? AND actor_id IS ?
			ORDER BY occurred_at ASC, id ASC
		`).all(validActor.type, validActor.id).map(toRecord)
	}

	return { runAuditedOperation, recordOutcome, findByObject, findByActor }
}