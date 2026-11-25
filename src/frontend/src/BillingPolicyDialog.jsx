import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { billingPolicySections, billingPolicyTitle, billingPolicyUpdatedAt } from './billing-policy.js'

const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Política de Cobrança e Cancelamento em uma janela sobre a página: quem está contratando lê sem
// perder o que já marcou. Fecha pelo botão, pelo Esc ou clicando fora.
// A janela é renderizada direto no <body>: a animação de entrada das páginas deixa um transform no
// conteúdo, e um position: fixed dentro dele ficaria preso ao conteúdo em vez de cobrir a tela.
export default function BillingPolicyDialog({ onClose }) {
  const dialog = useRef(null)
  const body = useRef(null)
  const closeButton = useRef(null)
  const [scroll, setScroll] = useState({ top: true, bottom: false })
  const close = useEffectEvent(() => onClose())

  function updateScroll() {
    const element = body.current
    if (!element) return
    setScroll({
      top: element.scrollTop <= 2,
      bottom: element.scrollTop + element.clientHeight >= element.scrollHeight - 2,
    })
  }

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()
    updateScroll()

    function handleKeys(event) {
      if (event.key === 'Escape') {
        close()
        return
      }
      if (event.key !== 'Tab' || !dialog.current) return
      // Mantém o foco dentro da janela enquanto ela estiver aberta.
      const focusable = [...dialog.current.querySelectorAll(focusableSelector)]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeys)
    window.addEventListener('resize', updateScroll)
    return () => {
      window.removeEventListener('keydown', handleKeys)
      window.removeEventListener('resize', updateScroll)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus?.()
    }
  }, [])

  return createPortal(
    <div className="policy-backdrop" role="presentation" onClick={onClose}>
      <section
        ref={dialog}
        className="policy-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="billing-policy-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={`policy-head${scroll.top ? '' : ' is-scrolled'}`}>
          <div>
            <p className="eyebrow">PREMIUM · AMBIENTE DE TESTE</p>
            <h3 id="billing-policy-title">{billingPolicyTitle}</h3>
            <p className="policy-updated">Atualizada em {billingPolicyUpdatedAt}</p>
          </div>
          <button ref={closeButton} className="policy-close" type="button" onClick={onClose} aria-label="Fechar a política">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div ref={body} className="policy-body" onScroll={updateScroll} tabIndex={0} aria-label="Texto da política">
          <nav className="policy-index" aria-label="Seções da política">
            {billingPolicySections.map((section, index) => (
              <a key={section.title} href={`#policy-section-${index + 1}`} onClick={(event) => {
                event.preventDefault()
                body.current?.querySelector(`#policy-section-${index + 1}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}>
                {section.title}
              </a>
            ))}
          </nav>
          {billingPolicySections.map((section, index) => (
            <section key={section.title} id={`policy-section-${index + 1}`} className="policy-section">
              <h4><span className="policy-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{section.title}</h4>
              <ul>
                {section.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          ))}
        </div>

        <footer className={`policy-foot${scroll.bottom ? '' : ' has-more'}`}>
          <p className="policy-hint">{scroll.bottom ? 'Você chegou ao fim da política.' : 'Role para ler até o fim.'}</p>
          <button className="small-button small-button-solid" type="button" onClick={onClose}>Entendi</button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
