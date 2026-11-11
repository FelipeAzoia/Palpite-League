import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createSimulatedRecoveryChannel } from '../../src/backend/adapters/simulated-recovery-channel.js'
import { createApp } from '../../src/backend/app.js'
import { createAuthService } from '../../src/backend/modules/auth-users/index.js'
import { createAuditStore } from '../../src/backend/modules/notifications-audit/index.js'
import { createDatabase } from '../../src/backend/shared/database.js'
import { createLogger } from '../../src/backend/shared/logger.js'
import { runMigrations } from '../../src/backend/shared/migrations.js'

const password = 'senha-segura-123'
const newPassword = 'nova-senha-segura-456'
const baseUrl = 'http://localhost:5173'
const thirtyMinutes = 30 * 60 * 1000

function memoryChannel({ fail = false } = {}) {
  const messages = []
  return {
    messages,
    deliver(message) {
      if (fail) throw new Error('disco cheio')
      messages.push(message)
    },
  }
}

function tokenFrom(message) {
  return new URL(message.link).hash.replace('#token=', '')
}

function controlledClock(start = Date.UTC(2026, 10, 5, 12, 0, 0)) {
  let current = start
  return { now: () => current, advance(ms) { current += ms } }
}

function createFixture({ clock = controlledClock(), channel = memoryChannel() } = {}) {
  const database = createDatabase(':memory:')
  runMigrations(database)
  const events = []
  const logger = createLogger((event) => events.push(event))
  const auditStore = createAuditStore(database, { logger })
  const auth = createAuthService(database, auditStore, {
    now: clock.now,
    logger,
    recoveryChannel: channel,
    interfaceBaseUrl: baseUrl,
  })
  return { database, events, logger, auditStore, auth, channel, clock }
}

async function registerAna(auth) {
  return auth.register({ name: 'Ana', email: 'Ana@Example.com', password })
}

async function requestToken(fixture, email = 'ana@example.com') {
  await fixture.auth.requestPasswordRecovery({ email })
  return tokenFrom(fixture.channel.messages.at(-1))
}

async function withHttpApp(options, callback) {
  const database = createDatabase(':memory:')
  runMigrations(database)
  const events = []
  const logger = createLogger((event) => events.push(event))
  const server = createServer(createApp(database, { logger, interfaceBaseUrl: baseUrl, ...options }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const responses = []

  async function call(method, route, body) {
    const response = await fetch(`${origin}${route}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const text = await response.text()
    responses.push(text)
    let json = null
    try { json = JSON.parse(text) } catch { json = null }
    return { status: response.status, headers: response.headers, text, json }
  }

  try {
    await callback({ call, database, events, responses })
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    database.close()
  }
}

test('TC-01: solicitação com conta cria token pendente, mensagem simulada e auditoria de sucesso', async () => {
  const fixture = createFixture()
  const user = await registerAna(fixture.auth)

  const response = await fixture.auth.requestPasswordRecovery({ email: 'ana@example.com' })

  assert.equal(typeof response.message, 'string')
  assert.equal(fixture.channel.messages.length, 1)
  const [message] = fixture.channel.messages
  assert.equal(message.recipient, 'Ana@Example.com')
  assert.ok(message.link.startsWith(`${baseUrl}/#token=`))
  const tokens = fixture.database.prepare('SELECT state, created_at, expires_at FROM password_recovery_tokens').all()
  assert.equal(tokens.length, 1)
  assert.equal(tokens[0].state, 'pending')
  assert.equal(tokens[0].expires_at - tokens[0].created_at, thirtyMinutes)
  assert.equal(Buffer.from(tokenFrom(message), 'base64url').length, 32)
  const records = fixture.auditStore.findByObject({ type: 'user', id: user.id })
    .filter((record) => record.action === 'user.password_recovery_requested')
  assert.equal(records.length, 1)
  assert.equal(records[0].result, 'success')
  assert.deepEqual(records[0].actor, { type: 'user', id: user.id })
  fixture.database.close()
})

test('TC-02: e-mail sem conta recebe resposta idêntica, sem token nem mensagem, com auditoria anônima', async () => {
  const fixture = createFixture()
  await registerAna(fixture.auth)
  const withAccount = await fixture.auth.requestPasswordRecovery({ email: 'ana@example.com' })
  const tokensBefore = fixture.database.prepare('SELECT COUNT(*) AS count FROM password_recovery_tokens').get().count
  const messagesBefore = fixture.channel.messages.length

  const withoutAccount = await fixture.auth.requestPasswordRecovery({ email: 'ninguem@example.com' })

  assert.deepEqual(withoutAccount, withAccount)
  assert.equal(fixture.database.prepare('SELECT COUNT(*) AS count FROM password_recovery_tokens').get().count, tokensBefore)
  assert.equal(fixture.channel.messages.length, messagesBefore)
  const anonymous = fixture.auditStore.findByActor({ type: 'anonymous' })
    .filter((record) => record.action === 'user.password_recovery_requested')
  assert.equal(anonymous.length, 1)
  assert.equal(anonymous[0].result, 'failure')
  assert.equal(JSON.stringify(anonymous).toLowerCase().includes('ninguem'), false)
  fixture.database.close()
})

test('TC-03: e-mail ausente ou inválido é erro de validação e não cria token', async () => {
  const fixture = createFixture()
  await registerAna(fixture.auth)

  for (const input of [{}, { email: '' }, { email: '   ' }, { email: 'ana example.com' }, { email: 'sem-arroba' }, { email: 42 }, undefined]) {
    await assert.rejects(
      fixture.auth.requestPasswordRecovery(input),
      (error) => error.status === 400 && error.type === 'validation_error' && Boolean(error.fields.email),
    )
  }
  assert.equal(fixture.database.prepare('SELECT COUNT(*) AS count FROM password_recovery_tokens').get().count, 0)
  assert.equal(fixture.channel.messages.length, 0)
  fixture.database.close()
})

test('TC-04: e-mail em minúsculas e com espaços nas pontas encontra a conta de e-mail em caixa mista', async () => {
  const fixture = createFixture()
  await registerAna(fixture.auth)

  await fixture.auth.requestPasswordRecovery({ email: '  ANA@example.COM  ' })

  assert.equal(fixture.channel.messages.length, 1)
  assert.equal(fixture.database.prepare('SELECT COUNT(*) AS count FROM password_recovery_tokens').get().count, 1)
  fixture.database.close()
})

test('TC-05: token só existe como hash e a mensagem simulada traz a marca de simulação', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'palpite-recovery-'))
  const filePath = path.join(directory, 'canal', 'mensagens.txt')
  const fixture = createFixture({ channel: createSimulatedRecoveryChannel({ filePath }) })
  await registerAna(fixture.auth)

  await fixture.auth.requestPasswordRecovery({ email: 'ana@example.com' })
  await fixture.auth.requestPasswordRecovery({ email: 'ana@example.com' })

  const content = fs.readFileSync(filePath, 'utf8')
  assert.equal(content.match(/SIMULAÇÃO/g).length, 2)
  assert.match(content, /Data e hora \(UTC\): \d{4}-\d{2}-\d{2}T[\d:.]+Z/)
  assert.ok(content.includes('Destinatário: Ana@Example.com'))
  const links = [...content.matchAll(/Link de redefinição: (\S+)/g)].map((match) => match[1])
  assert.equal(links.length, 2)
  const token = new URL(links[1]).hash.replace('#token=', '')
  const rows = fixture.database.prepare('SELECT * FROM password_recovery_tokens').all()
  assert.equal(JSON.stringify(rows).includes(token), false)
  assert.ok(rows.every((row) => /^[0-9a-f]{64}$/.test(row.token_hash)))
  fixture.database.close()
  fs.rmSync(directory, { recursive: true, force: true })
})

test('TC-06: redefinição troca a senha, consome o token, invalida sessões e tokens e não inicia sessão', async () => {
  const fixture = createFixture()
  const user = await registerAna(fixture.auth)
  const firstSession = await fixture.auth.login({ email: 'ana@example.com', password })
  const secondSession = await fixture.auth.login({ email: 'ana@example.com', password })
  const token = await requestToken(fixture)
  const sessionsBefore = fixture.database.prepare('SELECT COUNT(*) AS count FROM auth_sessions').get().count
  const oldHash = fixture.database.prepare('SELECT password_hash, password_salt FROM user_credentials').get()

  const response = await fixture.auth.resetPassword({ token, password: newPassword })

  assert.deepEqual(Object.keys(response), ['message'])
  const newHash = fixture.database.prepare('SELECT password_hash, password_salt FROM user_credentials').get()
  assert.notEqual(newHash.password_hash, oldHash.password_hash)
  assert.notEqual(newHash.password_salt, oldHash.password_salt)
  await assert.rejects(fixture.auth.login({ email: 'ana@example.com', password }), (error) => error.status === 401)
  assert.throws(() => fixture.auth.authenticate(firstSession.token), (error) => error.status === 401)
  assert.throws(() => fixture.auth.authenticate(secondSession.token), (error) => error.status === 401)
  assert.equal(fixture.database.prepare('SELECT state FROM password_recovery_tokens').get().state, 'used')
  assert.equal(fixture.database.prepare('SELECT COUNT(*) AS count FROM auth_sessions').get().count, sessionsBefore)
  assert.equal(fixture.database.prepare('SELECT COUNT(*) AS count FROM auth_sessions WHERE revoked_at IS NULL').get().count, 0)
  await fixture.auth.login({ email: 'ana@example.com', password: newPassword })
  assert.equal(sessionsBefore, 2)
  const records = fixture.auditStore.findByObject({ type: 'user', id: user.id })
    .filter((record) => record.action === 'user.password_reset')
  assert.equal(records.length, 1)
  assert.equal(records[0].result, 'success')
  fixture.database.close()
})

test('TC-06b: a redefinição não cria nenhuma sessão', async () => {
  const fixture = createFixture()
  await registerAna(fixture.auth)
  const token = await requestToken(fixture)

  await fixture.auth.resetPassword({ token, password: newPassword })

  assert.equal(fixture.database.prepare('SELECT COUNT(*) AS count FROM auth_sessions').get().count, 0)
  fixture.database.close()
})

test('TC-07: token já usado é rejeitado e nada é alterado', async () => {
  const fixture = createFixture()
  await registerAna(fixture.auth)
  const token = await requestToken(fixture)
  await fixture.auth.resetPassword({ token, password: newPassword })
  const hashAfterFirstUse = fixture.database.prepare('SELECT password_hash FROM user_credentials').get().password_hash

  await assert.rejects(
    fixture.auth.resetPassword({ token, password: 'outra-senha-789' }),
    (error) => error.status === 400 && error.type === 'invalid_recovery_token',
  )

  assert.equal(fixture.database.prepare('SELECT password_hash FROM user_credentials').get().password_hash, hashAfterFirstUse)
  await fixture.auth.login({ email: 'ana@example.com', password: newPassword })
  fixture.database.close()
})

test('TC-08: token vale por menos de 30 minutos e é rejeitado depois disso', async () => {
  const fixture = createFixture()
  await registerAna(fixture.auth)
  await fixture.auth.register({ name: 'Bia', email: 'bia@example.com', password })
  const anaToken = await requestToken(fixture, 'ana@example.com')
  const biaToken = await requestToken(fixture, 'bia@example.com')

  fixture.clock.advance(thirtyMinutes - 1000)
  await fixture.auth.resetPassword({ token: anaToken, password: newPassword })

  fixture.clock.advance(2000)
  await assert.rejects(
    fixture.auth.resetPassword({ token: biaToken, password: newPassword }),
    (error) => error.status === 400 && error.type === 'invalid_recovery_token',
  )
  fixture.database.close()
})

test('TC-09: token inexistente, expirado e usado recebem a mesma resposta e auditoria anônima', async () => {
  const fixture = createFixture()
  await registerAna(fixture.auth)
  const usedToken = await requestToken(fixture)
  await fixture.auth.resetPassword({ token: usedToken, password: newPassword })
  const expiredToken = await requestToken(fixture)
  fixture.clock.advance(thirtyMinutes + 1000)
  const hashBefore = fixture.database.prepare('SELECT password_hash FROM user_credentials').get().password_hash

  const errors = []
  for (const token of ['token-que-nao-existe', expiredToken, usedToken]) {
    await assert.rejects(fixture.auth.resetPassword({ token, password: 'outra-senha-789' }), (error) => {
      errors.push({ status: error.status, type: error.type, message: error.message })
      return true
    })
  }

  assert.equal(errors.length, 3)
  assert.deepEqual(errors[1], errors[0])
  assert.deepEqual(errors[2], errors[0])
  assert.equal(fixture.database.prepare('SELECT password_hash FROM user_credentials').get().password_hash, hashBefore)
  const anonymous = fixture.auditStore.findByActor({ type: 'anonymous' })
    .filter((record) => record.action === 'user.password_reset')
  assert.equal(anonymous.length, 3)
  assert.ok(anonymous.every((record) => record.result === 'failure'))
  fixture.database.close()
})

test('TC-10: senha fora das regras não consome o token', async () => {
  const fixture = createFixture()
  await registerAna(fixture.auth)
  const token = await requestToken(fixture)

  for (const weak of ['curta', '', 'x'.repeat(129)]) {
    await assert.rejects(
      fixture.auth.resetPassword({ token, password: weak }),
      (error) => error.status === 400 && error.type === 'validation_error' && Boolean(error.fields.password),
    )
  }
  assert.equal(fixture.database.prepare('SELECT state FROM password_recovery_tokens').get().state, 'pending')

  await fixture.auth.resetPassword({ token, password: newPassword })
  await fixture.auth.login({ email: 'ana@example.com', password: newPassword })
  fixture.database.close()
})

test('TC-11: nova solicitação invalida o token anterior e só há um pendente', async () => {
  const fixture = createFixture()
  await registerAna(fixture.auth)
  const firstToken = await requestToken(fixture)
  const secondToken = await requestToken(fixture)

  assert.equal(fixture.database.prepare("SELECT COUNT(*) AS count FROM password_recovery_tokens WHERE state = 'pending'").get().count, 1)
  await assert.rejects(
    fixture.auth.resetPassword({ token: firstToken, password: newPassword }),
    (error) => error.type === 'invalid_recovery_token',
  )
  await fixture.auth.resetPassword({ token: secondToken, password: newPassword })
  fixture.database.close()
})

test('TC-12: falha na auditoria ou na troca de senha desfaz tudo e mantém o token válido', async () => {
  const fixture = createFixture()
  const user = await registerAna(fixture.auth)
  const session = await fixture.auth.login({ email: 'ana@example.com', password })
  const token = await requestToken(fixture)
  const credentialsBefore = fixture.database.prepare('SELECT * FROM user_credentials').get()

  function assertUnchanged() {
    assert.deepEqual(fixture.database.prepare('SELECT * FROM user_credentials').get(), credentialsBefore)
    assert.equal(fixture.database.prepare('SELECT state FROM password_recovery_tokens').get().state, 'pending')
    assert.equal(fixture.database.prepare('SELECT revoked_at FROM auth_sessions').get().revoked_at, null)
    assert.doesNotThrow(() => fixture.auth.authenticate(session.token))
  }

  fixture.database.exec(`
    CREATE TRIGGER fail_reset_audit BEFORE INSERT ON audit_records
    WHEN NEW.action = 'user.password_reset' AND NEW.result = 'success'
    BEGIN SELECT RAISE(ABORT, 'falha simulada'); END
  `)
  await assert.rejects(fixture.auth.resetPassword({ token, password: newPassword }))
  assertUnchanged()
  fixture.database.exec('DROP TRIGGER fail_reset_audit')

  fixture.database.exec(`
    CREATE TRIGGER fail_password_update BEFORE UPDATE ON user_credentials
    BEGIN SELECT RAISE(ABORT, 'falha simulada'); END
  `)
  await assert.rejects(fixture.auth.resetPassword({ token, password: newPassword }))
  assertUnchanged()
  fixture.database.exec('DROP TRIGGER fail_password_update')

  const failures = fixture.auditStore.findByObject({ type: 'user', id: user.id })
    .filter((record) => record.action === 'user.password_reset' && record.result === 'failure')
  assert.equal(failures.length, 2)

  await fixture.auth.resetPassword({ token, password: newPassword })
  fixture.database.close()
})

test('TC-13: nenhuma operação HTTP expõe o conteúdo do canal simulado', async () => {
  const channel = memoryChannel()
  await withHttpApp({ recoveryChannel: channel }, async ({ call, responses }) => {
    await call('POST', '/auth/register', { name: 'Ana', email: 'ana@example.com', password })
    await call('POST', '/auth/password-recovery', { email: 'ana@example.com' })
    const token = tokenFrom(channel.messages[0])

    for (const [method, route] of [
      ['GET', '/'],
      ['GET', '/health'],
      ['GET', '/auth/password-recovery'],
      ['GET', '/auth/password-reset'],
      ['GET', '/auth/me'],
      ['GET', '/data/simulated-recovery-channel.txt'],
      ['GET', '/simulated-recovery-channel.txt'],
    ]) {
      const response = await call(method, route)
      assert.equal(response.text.includes('SIMULAÇÃO'), false)
    }
    assert.ok(responses.every((text) => !text.includes('SIMULAÇÃO') && !text.includes(token)))
  })
})

test('TC-14: respostas, registros técnicos, auditoria e tokens não contêm segredos', async () => {
  const channel = memoryChannel()
  await withHttpApp({ recoveryChannel: channel }, async ({ call, database, events, responses }) => {
    await call('POST', '/auth/register', { name: 'Ana', email: 'ana@example.com', password })
    await call('POST', '/auth/password-recovery', { email: 'ana@example.com' })
    await call('POST', '/auth/password-recovery', { email: 'ninguem@example.com' })
    await call('POST', '/auth/password-recovery', { email: 'invalido' })
    const token = tokenFrom(channel.messages[0])
    await call('POST', '/auth/password-reset', { token: 'token-invalido', password: newPassword })
    await call('POST', '/auth/password-reset', { token, password: 'curta' })
    await call('POST', '/auth/password-reset', { token, password: newPassword })
    await call('POST', '/auth/password-reset', { token, password: newPassword })

    const tokenRow = database.prepare('SELECT * FROM password_recovery_tokens').get()
    const credentials = database.prepare('SELECT * FROM user_credentials').get()
    const secrets = [token, tokenRow.token_hash, password, newPassword, credentials.password_hash, credentials.password_salt]
    const outputs = [
      ...responses.filter((text) => !text.includes('"user"')),
      JSON.stringify(events),
      JSON.stringify(database.prepare('SELECT * FROM audit_records').all()),
    ]

    for (const secret of secrets) {
      for (const output of outputs) assert.equal(output.includes(secret), false)
    }
    assert.equal(JSON.stringify(tokenRow).includes(token), false)
    assert.equal(JSON.stringify(tokenRow).includes(newPassword), false)
    assert.equal(JSON.stringify(database.prepare('SELECT * FROM audit_records').all()).toLowerCase().includes('ninguem'), false)
  })
})

test('TC-15: falha na entrega simulada é registrada tecnicamente e a resposta continua genérica', async () => {
  const fixture = createFixture({ channel: memoryChannel({ fail: true }) })
  await registerAna(fixture.auth)
  const noAccount = await fixture.auth.requestPasswordRecovery({ email: 'ninguem@example.com' })

  const response = await fixture.auth.requestPasswordRecovery({ email: 'ana@example.com' })

  assert.deepEqual(response, noAccount)
  const failure = fixture.events.find((event) => event.component === 'recovery-delivery')
  assert.equal(failure.level, 'error')
  assert.equal(failure.result, 'delivery_failed')
  assert.ok(failure.correlationId)
  assert.equal(JSON.stringify(failure).includes('disco cheio'), false)
  assert.equal(fixture.database.prepare("SELECT COUNT(*) AS count FROM password_recovery_tokens WHERE state = 'pending'").get().count, 1)
  fixture.database.close()
})

test('TC-17: erros HTTP seguem o formato comum com correlação e sem detalhes internos', async () => {
  const channel = memoryChannel()
  await withHttpApp({ recoveryChannel: channel }, async ({ call, database }) => {
    await call('POST', '/auth/register', { name: 'Ana', email: 'ana@example.com', password })

    const validation = await call('POST', '/auth/password-recovery', { email: 'invalido' })
    assert.equal(validation.status, 400)
    assert.equal(validation.json.type, 'validation_error')
    assert.ok(validation.json.fields.email)
    assert.equal(validation.json.correlationId, validation.headers.get('x-correlation-id'))

    const invalidToken = await call('POST', '/auth/password-reset', { token: 'nada', password: newPassword })
    assert.equal(invalidToken.status, 400)
    assert.equal(invalidToken.json.type, 'invalid_recovery_token')
    assert.ok(invalidToken.json.correlationId)

    const weakPassword = await call('POST', '/auth/password-reset', { token: 'nada', password: 'x' })
    assert.equal(weakPassword.status, 400)
    assert.ok(weakPassword.json.fields.password)

    database.exec(`
      CREATE TRIGGER fail_token_insert BEFORE INSERT ON password_recovery_tokens
      BEGIN SELECT RAISE(ABORT, 'falha simulada'); END
    `)
    const internal = await call('POST', '/auth/password-recovery', { email: 'ana@example.com' })
    assert.equal(internal.status, 500)
    assert.equal(internal.json.type, 'internal_error')
    assert.equal(internal.json.message, 'Ocorreu uma falha interna.')
    assert.equal(internal.text.includes('falha simulada'), false)
    assert.ok(internal.json.correlationId)
  })
})

test('TC-18: respostas HTTP de redefinição não iniciam sessão', async () => {
  const channel = memoryChannel()
  await withHttpApp({ recoveryChannel: channel }, async ({ call, database }) => {
    await call('POST', '/auth/register', { name: 'Ana', email: 'ana@example.com', password })
    const withAccount = await call('POST', '/auth/password-recovery', { email: 'ana@example.com' })
    const withoutAccount = await call('POST', '/auth/password-recovery', { email: 'ninguem@example.com' })
    assert.equal(withAccount.status, withoutAccount.status)
    assert.equal(withAccount.text, withoutAccount.text)

    const reset = await call('POST', '/auth/password-reset', { token: tokenFrom(channel.messages[0]), password: newPassword })
    assert.equal(reset.status, 200)
    assert.deepEqual(Object.keys(reset.json), ['message'])
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM auth_sessions').get().count, 0)
    assert.equal((await call('POST', '/auth/login', { email: 'ana@example.com', password })).status, 401)
    assert.equal((await call('POST', '/auth/login', { email: 'ana@example.com', password: newPassword })).status, 200)
  })
})
