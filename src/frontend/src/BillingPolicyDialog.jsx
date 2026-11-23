import { useEffect, useEffectEvent, useRef } from 'react'
import { X } from 'lucide-react'
import { billingPolicySections, billingPolicyTitle, billingPolicyUpdatedAt } from './billing-policy.js'

// Política de Cobrança e Cancelamento em uma janela sobre a página: quem está contratando lê sem
// perder o que já marcou. Fecha pelo botão, pelo Esc ou clicando fora.
export default function BillingPolicyDialog({ onClose }) {
  const closeButton = useRef(null)
  const close = useEffectEvent(() => onClose())

  useEffect(() => {
    closeButton.current?.focus()
    function closeOnEscape(event) {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])

  return (
    <div className="policy-backdrop" role="presentation" onClick={onClose}>
      <section
        className="policy-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="billing-policy-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="policy-head">
          <div>
            <p className="eyebrow">PREMIUM</p>
            <h3 id="billing-policy-title">{billingPolicyTitle}</h3>
            <p className="toolbar-note">Atualizada em {billingPolicyUpdatedAt}.</p>
          </div>
          <button ref={closeButton} className="policy-close" type="button" onClick={onClose} aria-label="Fechar a política">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="policy-body">
          {billingPolicySections.map((section) => (
            <section key={section.title}>
              <h4>{section.title}</h4>
              <ul>
                {section.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          ))}
        </div>
        <div className="premium-actions">
          <button className="small-button small-button-solid" type="button" onClick={onClose}>Entendi</button>
        </div>
      </section>
    </div>
  )
}
