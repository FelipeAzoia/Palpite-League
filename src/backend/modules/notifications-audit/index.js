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

function validateDetails(details, allowedDetailKeys = []) {
	if (details === undefined || details === null) return null
	if (!details || typeof details !== 'object' || Array.isArray(details)) {
		throw new TypeError('details must be an object')
	}
	if (!Array.isArray(allowedDetailKeys)) {
		throw new TypeError('allowedDetailKeys must be an array')
	}

	const allowed = new Set(allowedDetailKeys)
	for (const key of Object.keys(details)) {
		if (!allowed.has(key) || sensitiveDetailKey.test(key)) {
			throw new TypeError(`detail key is not allowed: ${key}`)
		}
	}

	const rejectSensitiveKeys = (value) => {
		if (!value || typeof value !== 'object') return
		for (const [key, nestedValue] of Object.entries(value)) {
			if (sensitiveDetailKey.test(key)) {
				throw new TypeError(`detail key is not allowed: ${key}`)
			}
			rejectSensitiveKeys(nestedValue)
		}
	}
	rejectSensitiveKeys(details)

	try {
		return JSON.stringify(details)
	} catch {
		throw new TypeError('details must contain JSON values')
	}
}

function validateEntry(entry, detailKeysByAction) {
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
		details: validateDetails(entry.details, detailKeysByAction.get(action) ?? []),
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

export function createAuditStore(database, { logger = createLogger(), detailKeysByAction = {} } = {}) {
	if (!detailKeysByAction || typeof detailKeysByAction !== 'object' || Array.isArray(detailKeysByAction)) {
		throw new TypeError('detailKeysByAction must be an object')
	}

	const allowedDetails = new Map()
	for (const [action, keys] of Object.entries(detailKeysByAction)) {
		const actionName = requiredText(action, 'action')
		if (!Array.isArray(keys)) throw new TypeError(`detail keys for ${actionName} must be an array`)
		const validatedKeys = keys.map((key) => requiredText(key, 'detail key'))
		if (validatedKeys.some((key) => sensitiveDetailKey.test(key))) {
			throw new TypeError(`sensitive detail key configured for ${actionName}`)
		}
		allowedDetails.set(actionName, validatedKeys)
	}

	const insertAuditRecord = database.prepare(`
		INSERT INTO audit_records (
			actor_type, actor_id, action, object_type, object_id, occurred_at,
			result, origin, correlation_id, details_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)

	function insert(record, result) {
		insertAuditRecord.run(
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
		const record = validateEntry(entry, allowedDetails)
		return withCorrelation(() => persistOutcome(record, result))
	}

	function runAuditedOperation(entry, operation) {
		if (typeof operation !== 'function') throw new TypeError('operation must be a function')
		const record = validateEntry(entry, allowedDetails)
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