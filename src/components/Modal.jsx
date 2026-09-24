import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

const WIDTHS = { sm: 420, md: 580, wide: 680, lg: 720 }

/**
 * Dimmed full-screen layer rendered straight into <body>, so page animations/stacking
 * contexts can never trap it underneath the sidebar. Closes on Escape or backdrop click.
 */
export function Overlay({ onClose, children }) {
  // Parents usually pass an inline onClose; keep the latest one without re-running the effect.
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const onKey = (e) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return createPortal(
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && closeRef.current()}>
      {children}
    </div>,
    document.body,
  )
}

export default function Modal({ title, subtitle, onClose, footer, children, size = 'md' }) {
  return (
    <Overlay onClose={onClose}>
      <div className="modal slide-in" style={{ width: WIDTHS[size] }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{title}</div>
            {subtitle && <div className="modal-subtitle">{subtitle}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="إغلاق">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </Overlay>
  )
}
