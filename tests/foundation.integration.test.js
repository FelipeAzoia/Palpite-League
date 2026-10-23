import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))

async function findAvailablePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

function startNodeProcess(args, env) {
  return spawn(process.execPath, args, {
    cwd: projectRoot,
    env,
    stdio: 'ignore',
  })
}

async function waitForResponse(url, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Process exited before serving ${url}.`)
    }

    try {
      return await fetch(url)
    } catch {
      await delay(100)
    }
  }

  throw new Error(`Timed out waiting for ${url}.`)
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) {
    return
  }

  const exited = new Promise((resolve) => child.once('exit', resolve))
  child.kill('SIGTERM')
  await Promise.race([exited, delay(3000)])

  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await exited
  }
}

function createLocalEnvironment(databasePath, port) {
  return {
    PATH: process.env.PATH,
    HOME: os.homedir(),
    DATABASE_PATH: databasePath,
    HOST: '127.0.0.1',
    PORT: String(port),
  }
}

test('backend and minimal frontend start without provider credentials and communicate over HTTP', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'palpite-league-integration-'))
  const backendPort = await findAvailablePort()
  const frontendPort = await findAvailablePort()
  const backend = startNodeProcess(
    ['backend/index.js'],
    createLocalEnvironment(path.join(directory, 'foundation.db'), backendPort),
  )
  let frontend

  try {
    const backendResponse = await waitForResponse(`http://127.0.0.1:${backendPort}/health`, backend)
    assert.equal(backendResponse.status, 200)
    assert.equal((await backendResponse.json()).status, 'ok')

    frontend = startNodeProcess([
      'node_modules/vite/bin/vite.js',
      '--config',
      'vite.config.js',
      '--host',
      '127.0.0.1',
      '--port',
      String(frontendPort),
      '--strictPort',
    ], createLocalEnvironment(path.join(directory, 'unused.db'), frontendPort))

    const frontendResponse = await waitForResponse(`http://127.0.0.1:${frontendPort}/`, frontend)
    const html = await frontendResponse.text()
    assert.equal(frontendResponse.status, 200)
    assert.match(html, /\/frontend\/main\.jsx/)

    const proxyResponse = await fetch(`http://127.0.0.1:${frontendPort}/api/health`)
    assert.equal(proxyResponse.status, 200)
    assert.equal((await proxyResponse.json()).status, 'ok')
  } finally {
    await Promise.all([stopProcess(frontend), stopProcess(backend)])
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('backend stays available with HTTP 503 and recovers when startup persistence becomes available', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'palpite-league-recovery-'))
  const blocker = path.join(directory, 'database-path')
  const databasePath = path.join(blocker, 'foundation.db')
  const port = await findAvailablePort()
  fs.writeFileSync(blocker, 'blocks the database directory')

  const backend = startNodeProcess(
    ['backend/index.js'],
    createLocalEnvironment(databasePath, port),
  )

  try {
    const unavailableResponse = await waitForResponse(`http://127.0.0.1:${port}/health`, backend)
    assert.equal(unavailableResponse.status, 503)
    assert.equal((await unavailableResponse.json()).component, 'persistence')

    fs.unlinkSync(blocker)
    const availableResponse = await waitForResponse(`http://127.0.0.1:${port}/health`, backend)
    assert.equal(availableResponse.status, 200)
    assert.equal((await availableResponse.json()).status, 'ok')
  } finally {
    await stopProcess(backend)
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
