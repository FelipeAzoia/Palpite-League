import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { isSessionRejected } from './account-api.js'
import { createInvite, fetchInvites, revokeInvite } from './invites-api.js'
import { formatInviteDate, inviteStatusLabels } from './invites-view.js'

export default function InvitesSection({ token, poolId, onSessionRejected }) {
  const [invites, setInvites] = useState(null)
  const [error, setError] = useState('')
  const [newLink, setNewLink] = useState('')
  const [copyMessage, setCopyMessage] = useState('')
  const [creating, setCreating] = useState(false)
  const [confirmingId, setConfirmingId] = useState(null)
  const [revokingId, setRevokingId] = useState(null)
  const linkInput = useRef(null)

  function handleError(requestError) {
    if (isSessionRejected(requestError)) onSessionRejected()
    else setError(requestError.message)
  }

  async function load() {
    try {
      setInvites((await fetchInvites(token, poolId)).invites)
    } catch (requestError) {
      handleError(requestError)
    }
  }

  const handleLoadError = useEffectEvent((requestError) => handleError(requestError))

  // A seção é remontada quando o bolão muda (key no PoolsPanel), então o estado já começa limpo.
  useEffect(() => {
    let active = true
    fetchInvites(token, poolId).then((result) => {
      if (active) setInvites(result.invites)
    }).catch((requestError) => {
      if (active) handleLoadError(requestError)
    })
    return () => { active = false }
  }, [token, poolId])

  async function create() {
    setCreating(true)
    setError('')
    setCopyMessage('')
    try {
      const result = await createInvite(token, poolId)
      setNewLink(result.invite.link)
      await load()
    } catch (requestError) {
      handleError(requestError)
    } finally {
      setCreating(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(newLink)
      setCopyMessage('Link copiado.')
    } catch {
      linkInput.current?.select()
      setCopyMessage('Não foi possível copiar automaticamente. Selecione o link e copie.')
    }
  }

  async function revoke(inviteId) {
    setRevokingId(inviteId)
    setError('')
    try {
      await revokeInvite(token, poolId, inviteId)
      setConfirmingId(null)
      await load()
    } catch (requestError) {
      handleError(requestError)
      setConfirmingId(null)
      await load()
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <section aria-labelledby="invites-title">
      <div className="block-head">
        <h3 id="invites-title" className="block-title">Convites</h3>
        <button className="small-button small-button-solid" type="button" onClick={create} disabled={creating}>
          {creating ? <><LoaderCircle size={13} className="spin" /> Criando...</> : 'Novo convite'}
        </button>
      </div>
      <p className="fine-print fine-print-top">Cada convite é um link de uso único, válido por 7 dias.</p>

      {newLink && (
        <div className="invite-link-box">
          <p className="invite-warning">Copie o link agora: ele não será exibido novamente.</p>
          <input ref={linkInput} readOnly value={newLink} aria-label="Link do convite" onFocus={(event) => event.target.select()} />
          <div className="invite-actions">
            <button type="button" className="small-button" onClick={copy}>Copiar link</button>
            <button type="button" className="small-button" onClick={() => { setNewLink(''); setCopyMessage('') }}>Ocultar link</button>
          </div>
          {copyMessage && <p className="form-message form-message-success" role="status">{copyMessage}</p>}
        </div>
      )}

      {error && <p className="form-message" role="alert">{error}</p>}

      {!invites && !error && <p className="tab-loading" role="status">Carregando convites...</p>}
      {invites && invites.length === 0 && <p className="empty-state">Nenhum convite criado ainda.</p>}
      {invites && invites.length > 0 && (() => {
        const renderInvite = (invite) => (
          <li key={invite.id}>
            <span className="plain-rows-main">
              <span className={`state state-invite-${invite.status}`}>{inviteStatusLabels[invite.status] ?? invite.status}</span>
              <small>
                Criado em {formatInviteDate(invite.createdAt)} por {invite.createdBy}
                {invite.usedAt ? ` · usado em ${formatInviteDate(invite.usedAt)}` : ` · vale até ${formatInviteDate(invite.expiresAt)}`}
              </small>
            </span>
            {invite.status === 'active' && confirmingId !== invite.id && (
              <button type="button" className="small-button danger" onClick={() => setConfirmingId(invite.id)}>Revogar</button>
            )}
            {confirmingId === invite.id && (
              <span className="invite-actions">
                <button type="button" className="small-button danger" disabled={revokingId === invite.id} onClick={() => revoke(invite.id)}>
                  {revokingId === invite.id ? 'Revogando...' : 'Confirmar'}
                </button>
                <button type="button" className="small-button" onClick={() => setConfirmingId(null)}>Cancelar</button>
              </span>
            )}
          </li>
        )
        const active = invites.filter(({ status }) => status === 'active')
        const history = invites.filter(({ status }) => status !== 'active')
        return (
          <>
            {active.length > 0 ? <ul className="plain-rows">{active.map(renderInvite)}</ul> : <p className="empty-state">Nenhum convite ativo.</p>}
            {history.length > 0 && (
              <details className="history">
                <summary>Histórico de convites ({history.length})</summary>
                <ul className="plain-rows">{history.map(renderInvite)}</ul>
              </details>
            )}
          </>
        )
      })()}
    </section>
  )
}
