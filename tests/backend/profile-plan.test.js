import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { createApp } from '../../src/backend/app.js'
import {
  getPlan,
  listPlans,
  simultaneousPoolLimit,
} from '../../src/backend/modules/auth-users/index.js'
import { createDatabase } from '../../src/backend/shared/database.js'
import { createLogger } from '../../src/backend/shared/logger.js'
import { runMigrations } from '../../src/backend/shared/migrations.js'

const password = 'senha-segura-123'
const sessionMessage = 'Sua sessão expirou ou não é válida.'

async function withHttpApp(options, callback) {
  const database = createDatabase(':memory:')
  runMigrations(database)
  const events = []
  const logger = createLogger((event) => events.push(event))
  const server = createServer(createApp(database, { logger, ...options }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const responses = []

  async function call(method, route, { token, body, headers = {} } = {}) {
    const response = await fetch(`${origin}${route}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const text = await response.text()
    responses.push(text)
    let json = null
    try { json = JSON.parse(text) } catch { json = null }
    return { status: response.status, headers: response.headers, text, json }
  }

  async function signUp(name, email) {
    await call('POST', '/auth/register', { body: { name, email, password } })
    const login = await call('POST', '/auth/login', { body: { email, password } })
    return login.json.token
  }

  try {
    await callback({ call, signUp, database, events, responses })
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    database.close()
  }
}

function userRow(database, email) {
  return database.prepare('SELECT id, name, email, normalized_email, plan, status, created_at FROM users WHERE normalized_email = ?').get(email)
}

test('TC-01: consulta do perfil traz nome, e-mail e plano e nenhuma credencial', async () => {
  await withHttpApp({}, async ({ call, signUp }) => {
    const token = await signUp('Ana', 'ana@example.com')

    const response = await call('GET', '/account/profile', { token })

    assert.equal(response.status, 200)
    assert.deepEqual(response.json, {
      profile: { name: 'Ana', email: 'ana@example.com', plan: { id: 'free', name: 'Gratuito' } },
    })
    assert.equal(/password|hash|salt|token/i.test(response.text), false)
  })
})

test('TC-02: alterar o nome grava o novo nome e mantém e-mail, plano, status e identificador', async () => {
  await withHttpApp({}, async ({ call, signUp, database }) => {
    const token = await signUp('Ana', 'ana@example.com')
    const before = userRow(database, 'ana@example.com')

    const response = await call('PATCH', '/account/profile', { token, body: { name: 'Ana Maria' } })

    assert.equal(response.status, 200)
    assert.equal(response.json.profile.name, 'Ana Maria')
    assert.equal(response.json.profile.email, 'ana@example.com')
    assert.deepEqual(userRow(database, 'ana@example.com'), { ...before, name: 'Ana Maria' })
    assert.equal((await call('GET', '/account/profile', { token })).json.profile.name, 'Ana Maria')
  })
})

test('TC-02b: nome igual ao atual é aceito sem alteração visível', async () => {
  await withHttpApp({}, async ({ call, signUp, database }) => {
    const token = await signUp('Ana', 'ana@example.com')
    const before = userRow(database, 'ana@example.com')

    const response = await call('PATCH', '/account/profile', { token, body: { name: 'Ana' } })

    assert.equal(response.status, 200)
    assert.deepEqual(userRow(database, 'ana@example.com'), before)
  })
})

test('TC-03: espaços nas pontas do nome são removidos antes de gravar', async () => {
  await withHttpApp({}, async ({ call, signUp, database }) => {
    const token = await signUp('Ana', 'ana@example.com')

    const response = await call('PATCH', '/account/profile', { token, body: { name: '   Bia Souza \t ' } })

    assert.equal(response.status, 200)
    assert.equal(response.json.profile.name, 'Bia Souza')
    assert.equal(userRow(database, 'ana@example.com').name, 'Bia Souza')
  })
})

test('TC-04: nome vazio, só com espaços, ausente, não textual ou com 101 caracteres é rejeitado e nada muda', async () => {
  await withHttpApp({}, async ({ call, signUp, database }) => {
    const token = await signUp('Ana', 'ana@example.com')
    const before = userRow(database, 'ana@example.com')

    for (const body of [{ name: '' }, { name: '   ' }, { name: 'x'.repeat(101) }, { name: 123 }, { name: null }, {}, []]) {
      const response = await call('PATCH', '/account/profile', { token, body })
      assert.equal(response.status, 400, JSON.stringify(body))
      assert.equal(response.json.type, 'validation_error')
      assert.ok(response.json.fields.name, 'o campo name deve ser indicado')
    }
    assert.deepEqual(userRow(database, 'ana@example.com'), before)

    const notJson = await call('PATCH', '/account/profile', { token, body: 'texto' })
    assert.equal(notJson.status, 400)
    assert.equal(notJson.json.type, 'invalid_request')
    assert.deepEqual(userRow(database, 'ana@example.com'), before)

    const boundary = await call('PATCH', '/account/profile', { token, body: { name: 'x'.repeat(100) } })
    assert.equal(boundary.status, 200)
  })
})

test('TC-05: campos não editáveis rejeitam a solicitação inteira, com ou sem nome', async () => {
  await withHttpApp({}, async ({ call, signUp, database }) => {
    const token = await signUp('Ana', 'ana@example.com')
    const before = userRow(database, 'ana@example.com')

    for (const extra of [
      { email: 'outro@example.com' },
      { plan: 'premium' },
      { status: 'inactive' },
      { id: 'outro-id' },
      { password: 'nova-senha-123' },
      { userId: 'outro-id' },
      { email: 'outro@example.com', plan: 'premium', status: 'inactive', id: 'x' },
    ]) {
      for (const body of [extra, { ...extra, name: 'Nome Novo' }]) {
        const response = await call('PATCH', '/account/profile', { token, body })
        assert.equal(response.status, 400, JSON.stringify(body))
        assert.equal(response.json.type, 'validation_error')
        for (const key of Object.keys(extra)) assert.ok(response.json.fields[key], `campo ${key} deve ser indicado`)
        assert.equal(response.json.fields.name, undefined, 'um nome válido não é apontado como erro')
        assert.deepEqual(userRow(database, 'ana@example.com'), before)
      }
    }
  })
})

test('TC-06: cada usuário vê e altera apenas os próprios dados', async () => {
  await withHttpApp({}, async ({ call, signUp, database }) => {
    const anaToken = await signUp('Ana', 'ana@example.com')
    const biaToken = await signUp('Bia', 'bia@example.com')
    const bia = userRow(database, 'bia@example.com')

    assert.equal((await call('GET', '/account/profile', { token: anaToken })).json.profile.email, 'ana@example.com')
    assert.equal((await call('GET', '/account/profile', { token: biaToken })).json.profile.email, 'bia@example.com')

    await call('PATCH', '/account/profile', { token: anaToken, body: { name: 'Ana Nova' } })
    assert.equal(userRow(database, 'bia@example.com').name, 'Bia')

    const targeted = await call('PATCH', '/account/profile', { token: anaToken, body: { id: bia.id, name: 'Invasora' } })
    assert.equal(targeted.status, 400)
    assert.deepEqual(userRow(database, 'bia@example.com'), bia)

    const viaQuery = await call('GET', `/account/profile?id=${bia.id}&userId=${bia.id}`, { token: anaToken })
    assert.equal(viaQuery.json.profile.email, 'ana@example.com')
    assert.equal((await call('GET', `/account/profile/${bia.id}`, { token: anaToken })).status, 404)
    assert.equal((await call('GET', `/account/plan?userId=${bia.id}`, { token: anaToken })).status, 200)
  })
})

test('TC-07: todas as operações rejeitam sessão ausente, inválida, encerrada ou expirada', async () => {
  const clock = { current: Date.UTC(2026, 10, 5, 12, 0, 0) }
  await withHttpApp({ now: () => clock.current }, async ({ call, signUp }) => {
    const operations = [
      ['GET', '/account/profile'],
      ['PATCH', '/account/profile', { name: 'Nome' }],
      ['GET', '/account/plan'],
      ['GET', '/account/plans'],
    ]
    const loggedOut = await signUp('Ana', 'ana@example.com')
    await call('POST', '/auth/logout', { token: loggedOut })
    const expiring = await signUp('Bia', 'bia@example.com')
    clock.current += 9 * 60 * 60 * 1000

    for (const [method, route, body] of operations) {
      const attempts = [
        call(method, route, { body }),
        call(method, route, { body, headers: { authorization: 'Basic abc' } }),
        call(method, route, { body, token: 'token-que-nao-existe' }),
        call(method, route, { body, token: loggedOut }),
        call(method, route, { body, token: expiring }),
      ]
      for (const response of await Promise.all(attempts)) {
        assert.equal(response.status, 401, `${method} ${route}`)
        assert.equal(response.json.type, 'session_rejected')
        assert.equal(response.json.message, sessionMessage)
        assert.deepEqual(Object.keys(response.json).sort(), ['correlationId', 'message', 'type'])
      }
    }
  })
})

test('TC-08: respostas e registros técnicos não contêm credenciais, em sucesso e em falha', async () => {
  await withHttpApp({}, async ({ call, signUp, database, events, responses }) => {
    const token = await signUp('Ana', 'ana@example.com')
    const operationsStart = responses.length

    await call('GET', '/account/profile', { token })
    await call('PATCH', '/account/profile', { token, body: { name: 'Ana Maria' } })
    await call('PATCH', '/account/profile', { token, body: { name: '' } })
    await call('PATCH', '/account/profile', { token, body: { email: 'x@example.com' } })
    await call('GET', '/account/plan', { token })
    await call('GET', '/account/plans', { token })
    await call('GET', '/account/profile')
    database.exec("CREATE TRIGGER fail_update BEFORE UPDATE ON users BEGIN SELECT RAISE(ABORT, 'falha simulada'); END")
    await call('PATCH', '/account/profile', { token, body: { name: 'Outro Nome' } })

    const credentials = database.prepare('SELECT * FROM user_credentials').get()
    const session = database.prepare('SELECT token_hash FROM auth_sessions').get()
    const secrets = [password, token, session.token_hash, credentials.password_hash, credentials.password_salt]
    const outputs = [...responses.slice(operationsStart), JSON.stringify(events)]
    for (const secret of secrets) {
      for (const output of outputs) assert.equal(output.includes(secret), false)
    }
  })
})

test('TC-09: usuário novo vê plano Gratuito, status ativo e os recursos do catálogo', async () => {
  await withHttpApp({}, async ({ call, signUp }) => {
    const token = await signUp('Ana', 'ana@example.com')

    const response = await call('GET', '/account/plan', { token })

    assert.equal(response.status, 200)
    assert.deepEqual(response.json, {
      plan: {
        id: 'free',
        name: 'Gratuito',
        features: { simultaneousPools: 1, unlimitedParticipation: true, liveResultsInCreatedPools: false },
      },
      status: 'active',
    })
  })
})

test('TC-10: comparação traz Gratuito e Premium com os recursos e sem preço', async () => {
  await withHttpApp({}, async ({ call, signUp }) => {
    const token = await signUp('Ana', 'ana@example.com')

    const response = await call('GET', '/account/plans', { token })

    assert.equal(response.status, 200)
    assert.deepEqual(response.json.plans.map((plan) => [plan.id, plan.name, plan.features]), [
      ['free', 'Gratuito', { simultaneousPools: 1, unlimitedParticipation: true, liveResultsInCreatedPools: false }],
      ['premium', 'Premium', { simultaneousPools: 10, unlimitedParticipation: true, liveResultsInCreatedPools: true }],
    ])
    assert.equal(/pre[cç]o|price|amount|valor|currency|R\$/i.test(response.text), false)
  })
})

test('TC-11: o limite lido pelo domínio vem da mesma fonte das telas e nenhuma operação altera o plano', async () => {
  assert.equal(simultaneousPoolLimit('free'), 1)
  assert.equal(simultaneousPoolLimit('premium'), 10)
  assert.throws(() => simultaneousPoolLimit('inexistente'))
  assert.throws(() => simultaneousPoolLimit('__proto__'))
  assert.throws(() => { getPlan('free').features.simultaneousPools = 99 })
  assert.throws(() => { listPlans()[1].features.simultaneousPools = 99 })
  assert.equal(simultaneousPoolLimit('free'), 1)

  await withHttpApp({}, async ({ call, signUp, database }) => {
    const token = await signUp('Ana', 'ana@example.com')
    const screens = await call('GET', '/account/plans', { token })
    for (const plan of screens.json.plans) {
      assert.equal(plan.features.simultaneousPools, simultaneousPoolLimit(plan.id))
    }

    await call('GET', '/account/profile', { token })
    await call('PATCH', '/account/profile', { token, body: { name: 'Ana Maria' } })
    await call('PATCH', '/account/profile', { token, body: { plan: 'premium', name: 'Ana' } })
    await call('GET', '/account/plan', { token })
    assert.equal(userRow(database, 'ana@example.com').plan, 'free')
  })
})

test('TC-13: erros de validação, de sessão e internos seguem o formato comum, com correlação', async () => {
  await withHttpApp({}, async ({ call, signUp, database }) => {
    const token = await signUp('Ana', 'ana@example.com')

    const validation = await call('PATCH', '/account/profile', { token, body: { name: '' } })
    assert.equal(validation.status, 400)
    assert.equal(validation.json.type, 'validation_error')
    assert.ok(validation.json.fields.name)
    assert.equal(validation.json.correlationId, validation.headers.get('x-correlation-id'))

    const session = await call('GET', '/account/plan')
    assert.equal(session.status, 401)
    assert.equal(session.json.correlationId, session.headers.get('x-correlation-id'))

    const before = userRow(database, 'ana@example.com')
    database.exec("CREATE TRIGGER fail_update BEFORE UPDATE ON users BEGIN SELECT RAISE(ABORT, 'falha simulada'); END")
    const internal = await call('PATCH', '/account/profile', { token, body: { name: 'Outro Nome' } })
    assert.equal(internal.status, 500)
    assert.equal(internal.json.type, 'internal_error')
    assert.equal(internal.json.message, 'Ocorreu uma falha interna.')
    assert.equal(internal.text.includes('falha simulada'), false)
    assert.ok(internal.json.correlationId)
    database.exec('DROP TRIGGER fail_update')
    assert.deepEqual(userRow(database, 'ana@example.com'), before)
  })
})
