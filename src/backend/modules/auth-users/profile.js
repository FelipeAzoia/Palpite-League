import { AuthError } from './errors.js'
import { getPlan, listPlans, planStatus } from './plan-catalog.js'
import { isValidName, nameRuleMessage } from './validation.js'

const readOnlyFieldMessage = 'Este campo não pode ser alterado.'

function rejectedSession() {
	return new AuthError(401, 'session_rejected', 'Sua sessão expirou ou não é válida.')
}

function planView(plan) {
	return { id: plan.id, name: plan.name, features: { ...plan.features } }
}

export function createProfileService(database) {
	function readUser(userId) {
		const row = database.prepare(`
			SELECT name, email, plan FROM users WHERE id = ? AND status = 'active'
		`).get(userId)
		if (!row) throw rejectedSession()
		return row
	}

	function getProfile(userId) {
		const row = readUser(userId)
		const plan = getPlan(row.plan)
		return { name: row.name, email: row.email, plan: { id: plan.id, name: plan.name } }
	}

	function updateName(userId, input) {
		const body = input !== null && typeof input === 'object' && !Array.isArray(input) ? input : {}
		const fields = Object.fromEntries(
			Object.keys(body).filter((key) => key !== 'name').map((key) => [key, readOnlyFieldMessage]),
		)
		const name = typeof body.name === 'string' ? body.name.trim() : ''
		const hasName = Object.hasOwn(body, 'name')
		if (hasName ? !isValidName(name) : Object.keys(fields).length === 0) fields.name = nameRuleMessage

		if (Object.keys(fields).length > 0) {
			throw new AuthError(400, 'validation_error', 'Confira os campos informados.', fields)
		}

		readUser(userId)
		database.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, userId)
		return getProfile(userId)
	}

	function getAccountPlan(userId) {
		const row = readUser(userId)
		return { plan: planView(getPlan(row.plan)), status: planStatus(row.plan) }
	}

	function listAvailablePlans() {
		return { plans: listPlans().map(planView) }
	}

	return { getProfile, updateName, getAccountPlan, listAvailablePlans }
}
