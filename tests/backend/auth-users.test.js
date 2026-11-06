import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { createApp } from '../../src/backend/app.js'
import { createAuthService } from '../../src/backend/modules/auth-users/index.js'
import { createAuditStore } from '../../src/backend/modules/notifications-audit/index.js'
import { createDatabase } from '../../src/backend/shared/database.js'
import { createLogger } from '../../src/backend/shared/logger.js'
import { runMigrations } from '../../src/backend/shared/migrations.js'

function createFixture({ now = Date.now, logger } = {}) {
  const database = createDatabase(':memory:')
  runMigrations(database)
  const auditStore = createAuditStore(database, { logger })
  const auth = createAuthService(database, auditStore, { now })
  return { database, auditStore, auth }
}

async function withHttpApp(callback) {
  const database = createDatabase(':memory:')
  runMigrations(database)
  const events = []
  const logger = createLogger((event) => events.push(event))
  const server = createServer(createApp(database, { logger }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

  try {
    await callback(`http://127.0.0.1:${server.address().port}`, database, events)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    database.close()
  }
}

test('cadastro normaliza e-mail e cria conta gratuita ativa sem sessão', async () => {
  const { database, auditStore, auth } = createFixture()
  const user = await auth.register({ name: '  Ana Silva  ', email: ' Ana@Example.COM ', password: 'senha-segura-123' })

  assert.deepEqual(user, {
    id: user.id,
    name: 'Ana Silva',
    email: 'Ana@Example.COM',
    plan: 'free',
    status: 'active',
  })
  assert.equal(database.prepare('SELECT normalized_email FROM users WHERE id = ?').get(user.id).normalized_email, 'ana@example.com')
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM auth_sessions').get().count, 0)
  assert.equal(auditStore.findByObject({ type: 'user', id: user.id }).length, 1)
  database.close()
})

test('valida campos do cadastro e rejeita e-mail duplicado sem alterar a conta', async () => {
  const { database, auth } = createFixture()

  for (const input of [
    { name: ' ', email: 'ana@example.com', password: 'senha-segura' },
    { name: 'Ana', email: 'ana example.com', password: 'senha-segura' },
    { name: 'Ana', email: 'ana@example.com', password: 'curta' },
    { name: 'x'.repeat(101), email: 'ana@example.com', password: 'senha-segura' },
    { name: 'Ana', email: 'a'.repeat(245) + '@example.com', password: 'senha-segura' },
    { name: 'Ana', email: 'ana@example.com', password: 'x'.repeat(129) },
  ]) {
    await assert.rejects(auth.register(input), (error) => error.status === 400 && error.type === 'validation_error')
  }

  const firstUser = await auth.register({ name: 'Ana', email: 'ana@example.com', password: 'senha-segura' })
  await assert.rejects(
    auth.register({ name: 'Outra Ana', email: ' ANA@EXAMPLE.COM ', password: 'outra-senha' }),
    (error) => error.status === 409 && error.type === 'email_already_registered',
  )
  assert.equal(database.prepare('SELECT name FROM users WHERE id = ?').get(firstUser.id).name, 'Ana')
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1)
  database.close()
})

test('protege senhas com salt e hash scrypt distintos sem registrá-los na auditoria', async () => {
  const { database, auditStore, auth } = createFixture()
  const password = 'mesma-senha-segura'
  const first = await auth.register({ name: 'Ana', email: 'ana@example.com', password })
  const second = await auth.register({ name: 'Bia', email: 'bia@example.com', password })
  const credentials = database.prepare('SELECT password_salt, password_hash FROM user_credentials ORDER BY user_id').all()

  assert.notEqual(credentials[0].password_salt, credentials[1].password_salt)
  assert.notEqual(credentials[0].password_hash, credentials[1].password_hash)
  assert.equal(credentials.some(({ password_hash }) => password_hash === password), false)
  const audit = [
    ...auditStore.findByObject({ type: 'user', id: first.id }),
    ...auditStore.findByObject({ type: 'user', id: second.id }),
  ]
  assert.equal(JSON.stringify(audit).includes(password), false)
  assert.equal(JSON.stringify(audit).includes(credentials[0].password_hash), false)
  database.close()
})

test('login normaliza e-mail, devolve token opaco e persiste somente o hash por oito horas', async () => {
  const { database, auditStore, auth } = createFixture()
  const user = await auth.register({ name: 'Ana', email: ' Ana@Example.COM ', password: 'senha-segura-123' })
  const login = await auth.login({ email: ' ana@example.com ', password: 'senha-segura-123' })
  const session = database.prepare('SELECT * FROM auth_sessions').get()

  assert.equal(login.user.id, user.id)
  assert.equal(login.user.name, 'Ana')
  assert.equal(Date.parse(login.expiresAt) - session.issued_at, 8 * 60 * 60 * 1000)
  assert.notEqual(session.token_hash, login.token)
  assert.equal(session.token_hash.length, 64)
  assert.deepEqual(auth.authenticate(login.token), { id: user.id, name: 'Ana', plan: 'free' })
  assert.equal(auditStore.findByObject({ type: 'user', id: user.id }).filter(({ action }) => action === 'user.login').length, 1)
  database.close()
})

test('falhas de login têm resposta igual e auditoria anônima sem e-mail', async () => {
  const { database, auditStore, auth } = createFixture()
  await auth.register({ name: 'Ana', email: 'ana@example.com', password: 'senha-segura-123' })

  let wrongPassword
  let unknownEmail
  await assert.rejects(auth.login({ email: 'ana@example.com', password: 'senha-errada' }), (error) => {
    wrongPassword = { status: error.status, type: error.type, message: error.message }
    return error.status === 401
  })
  await assert.rejects(auth.login({ email: 'nao-existe@example.com', password: 'senha-errada' }), (error) => {
    unknownEmail = { status: error.status, type: error.type, message: error.message }
    return error.status === 401
  })
  await assert.rejects(auth.login({ email: 'tentativa-incompleta@example.com', password: '' }), (error) => error.status === 401)

  assert.deepEqual(wrongPassword, unknownEmail)
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM auth_sessions').get().count, 0)
  const attempts = database.prepare("SELECT * FROM audit_records WHERE action = 'user.login_failed'").all()
  assert.equal(attempts.length, 3)
  assert.ok(attempts.every(({ actor_type, actor_id, result }) => actor_type === 'anonymous' && actor_id === null && result === 'failure'))
  assert.equal(JSON.stringify(attempts).includes('nao-existe@example.com'), false)
  assert.equal(JSON.stringify(attempts).includes('tentativa-incompleta@example.com'), false)
  database.close()
})

test('logout invalida somente a sessão usada e sessões expiram sem renovação', async () => {
  let currentTime = Date.now()
  const { database, auth } = createFixture({ now: () => currentTime })
  await auth.register({ name: 'Ana', email: 'ana@example.com', password: 'senha-segura-123' })
  const firstSession = await auth.login({ email: 'ana@example.com', password: 'senha-segura-123' })
  const secondSession = await auth.login({ email: 'ana@example.com', password: 'senha-segura-123' })

  auth.logout(firstSession.token)
  assert.throws(() => auth.authenticate(firstSession.token), (error) => error.status === 401)
  assert.equal(auth.authenticate(secondSession.token).plan, 'free')

  currentTime += 8 * 60 * 60 * 1000
  assert.throws(() => auth.authenticate(secondSession.token), (error) => error.status === 401)
  database.close()
})

test('falha ao gravar auditoria de cadastro reverte usuário e credencial', async () => {
  const { database, auth } = createFixture()
  database.exec(`
    CREATE TRIGGER reject_registration_audit BEFORE INSERT ON audit_records
    WHEN NEW.action = 'user.registered' AND NEW.result = 'success'
    BEGIN SELECT RAISE(ABORT, 'injected audit failure'); END;
  `)

  await assert.rejects(auth.register({ name: 'Ana', email: 'ana@example.com', password: 'senha-segura' }))
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM users').get().count, 0)
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM user_credentials').get().count, 0)
  database.close()
})

test('falha ao gravar auditoria de login reverte a nova sessão', async () => {
  const { database, auth } = createFixture()
  await auth.register({ name: 'Ana', email: 'ana@example.com', password: 'senha-segura-123' })
  database.exec(`
    CREATE TRIGGER reject_login_audit BEFORE INSERT ON audit_records
    WHEN NEW.action = 'user.login' AND NEW.result = 'success'
    BEGIN SELECT RAISE(ABORT, 'injected audit failure'); END;
  `)

  await assert.rejects(auth.login({ email: 'ana@example.com', password: 'senha-segura-123' }))
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM auth_sessions').get().count, 0)
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM audit_records WHERE action = 'user.login' AND result = 'success'").get().count, 0)
  database.close()
})

test('HTTP executa cadastro, login, rota protegida e logout', async () => {
  await withHttpApp(async (url, database) => {
    const registration = await fetch(`${url}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ana', email: 'ana@example.com', password: 'senha-segura-123' }),
    })
    const registrationBody = await registration.json()
    assert.equal(registration.status, 201)
    assert.equal(registrationBody.user.plan, 'free')
    assert.equal('token' in registrationBody, false)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM auth_sessions').get().count, 0)

    const anonymousResponse = await fetch(`${url}/auth/me`)
    const anonymousBody = await anonymousResponse.json()
    assert.equal(anonymousResponse.status, 401)
    assert.equal(anonymousBody.type, 'session_rejected')
    assert.equal(anonymousBody.correlationId, anonymousResponse.headers.get('x-correlation-id'))

    const login = await fetch(`${url}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ana@example.com', password: 'senha-segura-123' }),
    })
    const loginBody = await login.json()
    assert.equal(login.status, 200)
    assert.ok(loginBody.token)

    const authenticated = await fetch(`${url}/auth/me`, {
      headers: { authorization: `Bearer ${loginBody.token}` },
    })
    assert.deepEqual((await authenticated.json()).user, {
      id: registrationBody.user.id,
      name: 'Ana',
      plan: 'free',
    })

    const logout = await fetch(`${url}/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${loginBody.token}` },
    })
    assert.equal(logout.status, 200)
    const rejectedAfterLogout = await fetch(`${url}/auth/me`, {
      headers: { authorization: `Bearer ${loginBody.token}` },
    })
    assert.equal(rejectedAfterLogout.status, 401)
  })
})

test('HTTP erros têm formato comum e login não revela qual credencial falhou', async () => {
  await withHttpApp(async (url) => {
    const invalidRegistration = await fetch(`${url}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '', email: 'invalid', password: 'short' }),
    })
    const invalidBody = await invalidRegistration.json()
    assert.equal(invalidRegistration.status, 400)
    assert.equal(invalidBody.type, 'validation_error')
    assert.deepEqual(Object.keys(invalidBody.fields).sort(), ['email', 'name', 'password'])
    assert.equal(invalidBody.correlationId, invalidRegistration.headers.get('x-correlation-id'))

    await fetch(`${url}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ana', email: 'ana@example.com', password: 'senha-segura-123' }),
    })

    const responses = []
    for (const credentials of [
      { email: 'ana@example.com', password: 'senha-errada' },
      { email: 'nao-existe@example.com', password: 'senha-errada' },
    ]) {
      const response = await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(credentials),
      })
      responses.push({ status: response.status, body: await response.json() })
    }
    assert.equal(responses[0].status, 401)
    assert.deepEqual(
      { ...responses[0].body, correlationId: undefined },
      { ...responses[1].body, correlationId: undefined },
    )
    assert.equal(responses[0].body.message, 'E-mail ou senha inválidos.')
  })
})

test('HTTP responde duplicidade e erro interno sem devolver ou registrar dados sensíveis', async () => {
  await withHttpApp(async (url, database, events) => {
    const firstRegistration = await fetch(`${url}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ana', email: 'ana@example.com', password: 'senha-segura-123' }),
    })
    assert.equal(firstRegistration.status, 201)

    const duplicate = await fetch(`${url}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Outra Ana', email: ' ANA@EXAMPLE.COM ', password: 'senha-segura-123' }),
    })
    const duplicateBody = await duplicate.json()
    assert.equal(duplicate.status, 409)
    assert.equal(duplicateBody.type, 'email_already_registered')

    database.exec(`
      CREATE TRIGGER reject_registration_audit BEFORE INSERT ON audit_records
      WHEN NEW.action = 'user.registered' AND NEW.result = 'success'
      BEGIN SELECT RAISE(ABORT, 'injected database error'); END;
    `)
    const secretEmail = 'private@example.com'
    const secretPassword = 'private-password-123'
    const internalFailure = await fetch(`${url}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Privada', email: secretEmail, password: secretPassword }),
    })
    const failureBody = await internalFailure.json()

    assert.equal(internalFailure.status, 500)
    assert.equal(failureBody.type, 'internal_error')
    assert.equal(failureBody.message, 'Ocorreu uma falha interna.')
    assert.equal(failureBody.correlationId, internalFailure.headers.get('x-correlation-id'))
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1)
    assert.equal(JSON.stringify({ failureBody, events }).includes(secretEmail), false)
    assert.equal(JSON.stringify({ failureBody, events }).includes(secretPassword), false)
    assert.equal(events.at(-1).result, 'request_failed')
  })
})