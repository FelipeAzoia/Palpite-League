import {
	createHash,
	randomBytes,
	randomUUID,
	scrypt as scryptCallback,
	timingSafeEqual,
} from 'node:crypto'
import { promisify } from 'node:util'

export const moduleName = 'auth-users'

const scrypt = promisify(scryptCallback)
const passwordKeyLength = 64
const passwordSaltLength = 16
const sessionTokenLength = 32
const sessionDurationMs = 8 * 60 * 60 * 1000
const scryptParameters = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 }
const dummySalt = Buffer.alloc(passwordSaltLength, 0xa5)

export class AuthError extends Error {
	constructor(status, type, message, fields) {
		super(message)
		this.status = status
		this.type = type
		this.fields = fields
	}
}

function normalizedEmail(email) {
	return email.trim().toLowerCase()
}

function publicUser(row) {
	return {
		id: row.id,
		name: row.name,
		email: row.email,
		plan: row.plan,
		status: row.status,
	}
}

function validateRegistration(input) {
	const fields = {}
	const name = typeof input?.name === 'string' ? input.name.trim() : ''
	const email = typeof input?.email === 'string' ? input.email.trim() : ''
	const password = typeof input?.password === 'string' ? input.password : ''
	const nameLength = Array.from(name).length
	const emailLength = Array.from(email).length
	const passwordLength = Array.from(password).length
	const atIndex = email.indexOf('@')
	const validEmail = atIndex > 0
		&& atIndex === email.lastIndexOf('@')
		&& atIndex < email.length - 1
		&& !/\s/.test(email)

	if (nameLength < 1 || nameLength > 100) fields.name = 'Informe um nome com até 100 caracteres.'
	if (emailLength > 254 || !validEmail) fields.email = 'Informe um e-mail válido com até 254 caracteres.'
	if (passwordLength < 8 || passwordLength > 128) fields.password = 'A senha deve ter entre 8 e 128 caracteres.'

	if (Object.keys(fields).length) {
		throw new AuthError(400, 'validation_error', 'Confira os campos informados.', fields)
	}

	return { name, email, normalizedEmail: normalizedEmail(email), password }
}

function invalidCredentials() {
	return new AuthError(401, 'invalid_credentials', 'E-mail ou senha inválidos.')
}

function rejectedSession() {
	return new AuthError(401, 'session_rejected', 'Sua sessão expirou ou não é válida.')
}

function tokenHash(token) {
	return createHash('sha256').update(token).digest('hex')
}

function auditFailedLogin(auditStore) {
	auditStore.recordOutcome({
		actor: { type: 'anonymous' },
		action: 'user.login_failed',
		object: { type: 'authentication_attempt', id: randomUUID() },
	}, 'failure')
}

export function createAuthService(database, auditStore, { now = Date.now } = {}) {
	async function register(input) {
		const values = validateRegistration(input)
		const userId = randomUUID()
		const salt = randomBytes(passwordSaltLength)
		const passwordHash = await scrypt(values.password, salt, passwordKeyLength, scryptParameters)
		const createdAt = new Date(now()).toISOString()
		const entry = {
			actor: { type: 'user', id: userId },
			action: 'user.registered',
			object: { type: 'user', id: userId },
		}

		try {
			const user = auditStore.runAuditedOperation(entry, () => {
				database.prepare(`
					INSERT INTO users (id, name, email, normalized_email, plan, status, created_at)
					VALUES (?, ?, ?, ?, 'free', 'active', ?)
				`).run(userId, values.name, values.email, values.normalizedEmail, createdAt)
				database.prepare(`
					INSERT INTO user_credentials (
						user_id, password_salt, password_hash, scrypt_n, scrypt_r, scrypt_p, key_length
					) VALUES (?, ?, ?, ?, ?, ?, ?)
				`).run(
					userId,
					salt.toString('hex'),
					passwordHash.toString('hex'),
					scryptParameters.N,
					scryptParameters.r,
					scryptParameters.p,
					passwordKeyLength,
				)
				return { id: userId, name: values.name, email: values.email, plan: 'free', status: 'active' }
			})
			return user
		} catch (error) {
			if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
				throw new AuthError(409, 'email_already_registered', 'Este e-mail já está cadastrado.', { email: 'E-mail já cadastrado.' })
			}
			throw error
		}
	}

	async function login(input) {
		const email = typeof input?.email === 'string' ? input.email.trim() : ''
		const password = typeof input?.password === 'string' ? input.password : ''
		if (!email || !password || Array.from(email).length > 254 || Array.from(password).length > 128) {
			auditFailedLogin(auditStore)
			throw invalidCredentials()
		}

		const row = database.prepare(`
			SELECT users.id, users.name, users.email, users.plan, users.status,
				credentials.password_salt, credentials.password_hash,
				credentials.scrypt_n, credentials.scrypt_r, credentials.scrypt_p,
				credentials.key_length
			FROM users
			JOIN user_credentials AS credentials ON credentials.user_id = users.id
			WHERE users.normalized_email = ?
		`).get(normalizedEmail(email))
		const salt = row ? Buffer.from(row.password_salt, 'hex') : dummySalt
		const parameters = row
			? { N: row.scrypt_n, r: row.scrypt_r, p: row.scrypt_p, maxmem: 32 * 1024 * 1024 }
			: scryptParameters
		const keyLength = row?.key_length ?? passwordKeyLength
		const derivedHash = await scrypt(password, salt, keyLength, parameters)
		const passwordMatches = row
			&& timingSafeEqual(derivedHash, Buffer.from(row.password_hash, 'hex'))
			&& row.status === 'active'

		if (!passwordMatches) {
			auditFailedLogin(auditStore)
			throw invalidCredentials()
		}

		const token = randomBytes(sessionTokenLength).toString('base64url')
		const issuedAt = now()
		const expiresAt = issuedAt + sessionDurationMs
		const sessionId = randomUUID()
		const entry = {
			actor: { type: 'user', id: row.id },
			action: 'user.login',
			object: { type: 'user', id: row.id },
		}

		auditStore.runAuditedOperation(entry, () => {
			database.prepare(`
				INSERT INTO auth_sessions (id, user_id, token_hash, issued_at, expires_at)
				VALUES (?, ?, ?, ?, ?)
			`).run(sessionId, row.id, tokenHash(token), issuedAt, expiresAt)
		})

		return {
			token,
			expiresAt: new Date(expiresAt).toISOString(),
			user: { id: row.id, name: row.name },
		}
	}

	function authenticate(token) {
		if (typeof token !== 'string' || token.length === 0) throw rejectedSession()
		const row = database.prepare(`
			SELECT users.id, users.name, users.plan
			FROM auth_sessions AS sessions
			JOIN users ON users.id = sessions.user_id
			WHERE sessions.token_hash = ? AND sessions.revoked_at IS NULL
				AND sessions.expires_at > ? AND users.status = 'active'
		`).get(tokenHash(token), now())
		if (!row) throw rejectedSession()
		return { id: row.id, name: row.name, plan: row.plan }
	}

	function logout(token) {
		if (typeof token !== 'string' || token.length === 0) throw rejectedSession()
		const session = database.prepare(`
			SELECT sessions.id, sessions.user_id
			FROM auth_sessions AS sessions
			JOIN users ON users.id = sessions.user_id
			WHERE sessions.token_hash = ? AND sessions.revoked_at IS NULL
				AND sessions.expires_at > ? AND users.status = 'active'
		`).get(tokenHash(token), now())
		if (!session) throw rejectedSession()

		const revokedAt = now()
		auditStore.runAuditedOperation({
			actor: { type: 'user', id: session.user_id },
			action: 'user.logout',
			object: { type: 'auth_session', id: session.id },
		}, () => {
			const result = database.prepare(`
				UPDATE auth_sessions SET revoked_at = ?
				WHERE id = ? AND revoked_at IS NULL AND expires_at > ?
			`).run(revokedAt, session.id, revokedAt)
			if (result.changes !== 1) throw rejectedSession()
		})
	}

	return { register, login, authenticate, logout }
}