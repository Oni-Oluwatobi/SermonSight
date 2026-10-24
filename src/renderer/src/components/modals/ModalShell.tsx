import React, { useEffect } from 'react'

export function ModalShell({
  title,
  subtitle,
  icon,
  onClose,
  children,
  wide,
  className
}: {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
  className?: string
}): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`modal${wide ? ' wide' : ''}${className ? ` ${className}` : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="modal-head">
          <div className="modal-head-main">
            {icon ? <span className="modal-head-icon">{icon}</span> : null}
            <div className="modal-head-text">
              <h2>{title}</h2>
              {subtitle ? <p className="modal-head-sub">{subtitle}</p> : null}
            </div>
          </div>
          <button className="tb-btn close modal-close" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
