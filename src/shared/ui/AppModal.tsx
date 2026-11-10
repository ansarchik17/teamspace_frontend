import React, { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import MaterialSymbol from './MaterialSymbol'

interface AppModalProps {
  title: string
  children: React.ReactNode
  onClose: () => void
  maxWidth?: number
  footer?: React.ReactNode
  closeOnBackdrop?: boolean
  animated?: boolean
  /** Optional feature header; the dialog retains the supplied title as its accessible name. */
  header?: React.ReactNode
  className?: string
}

export default function AppModal({ title, children, onClose, maxWidth = 560, footer, closeOnBackdrop = false, animated = false, header, className = '' }: AppModalProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  const backdropPress = useRef(false)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const initialInput = dialogRef.current?.querySelector<HTMLElement>('input:not(:disabled):not([type="hidden"]), textarea:not(:disabled), select:not(:disabled)')
    if (initialInput) initialInput.focus()
    else dialogRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      // A CRM card can open an editor or a confirmation above it. Only the top
      // dialog should handle Escape and trap focus while both are mounted.
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]')
      if (dialogs[dialogs.length - 1] !== dialogRef.current) return
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current() }
      if (event.key === 'Tab') {
        const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') || [])
        const first = items[0], last = items[items.length - 1]
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); previous?.focus() }
  }, [])
  return createPortal(
    <div className={`ts-dialog-backdrop${animated ? ' ts-dialog-backdrop--animated' : ''}`}
      onPointerDown={event => { backdropPress.current = event.target === event.currentTarget }}
      onClick={event => {
        if (!closeOnBackdrop || !backdropPress.current || event.target !== event.currentTarget) return
        const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]')
        if (dialogs[dialogs.length - 1] === dialogRef.current) onClose()
      }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={header ? undefined : titleId} aria-label={header ? title : undefined} tabIndex={-1}
        className={`ts-dialog${animated ? ' ts-dialog--animated' : ''}${className ? ` ${className}` : ''}`}
        style={{ maxWidth }}
      >
        <div className="ts-dialog__header">
          {header ?? <h2 id={titleId} className="ts-dialog__title">{title}</h2>}
          <button 
            type="button"
            aria-label={t('actions.close')}
            onClick={onClose}
            className="ts-button ts-button--ghost ts-button--icon"
          >
            <MaterialSymbol name="close" size={20} />
          </button>
        </div>
        <div className="ts-dialog__body custom-scrollbar">
          {children}
        </div>
        {footer && <div className="ts-dialog__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
