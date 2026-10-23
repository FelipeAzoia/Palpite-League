import { createServer } from 'node:http'
import { createApp } from './app.js'
import { createDatabase } from './db.js'

const port = Number(process.env.PORT ?? 3000)
const database = createDatabase()
const server = createServer(createApp(database))

server.listen(port, () => {
  console.log(`Palpite League API disponível em http://localhost:${port}`)
})

function shutdown() {
  server.close(() => {
    database.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)