import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../../../', import.meta.url))
export const defaultRecoveryChannelPath = path.join(projectRoot, 'data', 'simulated-recovery-channel.txt')

// Porta de entrega da recuperação de acesso, com implementação simulada (ADR-0007).
// O arquivo é só de inclusão, fica em pasta ignorada pelo Git e não é exposto por HTTP.
export function createSimulatedRecoveryChannel({
  filePath = process.env.RECOVERY_CHANNEL_PATH || defaultRecoveryChannelPath,
} = {}) {
  const resolvedPath = path.resolve(projectRoot, filePath)

  return {
    deliver({ recipient, link, sentAt }) {
      const message = [
        '=== SIMULAÇÃO: mensagem de recuperação de acesso (não enviada a ninguém) ===',
        `Data e hora (UTC): ${new Date(sentAt).toISOString()}`,
        `Destinatário: ${recipient}`,
        `Link de redefinição: ${link}`,
        '',
        '',
      ].join('\n')

      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true })
      fs.appendFileSync(resolvedPath, message, 'utf8')
    },
  }
}
