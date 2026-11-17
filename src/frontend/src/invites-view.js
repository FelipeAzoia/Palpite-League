export const inviteStatusLabels = {
  active: 'Ativo',
  used: 'Usado',
  expired: 'Expirado',
  revoked: 'Revogado',
}

// A interface apenas apresenta; quem autoriza é o backend (SPEC-008, INV-015).
export function canManageInvites(role) {
  return role === 'administrator' || role === 'coadministrator'
}

const formatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

export function formatInviteDate(iso) {
  return formatter.format(new Date(iso))
}
