import {
  useEffect,
  type FormEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

type SheetProps = {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  tall?: boolean
  asForm?: boolean
  onSubmit?: (e: FormEvent) => void
}

/** Locks page scroll while any sheet is open (refcount-safe). */
let sheetLockCount = 0

export function useSheetScrollLock(open: boolean) {
  useEffect(() => {
    if (!open) return
    sheetLockCount += 1
    const html = document.documentElement
    const body = document.body
    html.classList.add('sheet-open')
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    return () => {
      sheetLockCount = Math.max(0, sheetLockCount - 1)
      if (sheetLockCount === 0) {
        html.classList.remove('sheet-open')
        html.style.overflow = ''
        body.style.overflow = ''
      }
    }
  }, [open])
}

export default function Sheet({
  title,
  onClose,
  children,
  footer,
  tall,
  asForm,
  onSubmit,
}: SheetProps) {
  const className = `sheet glass-strong${tall ? ' sheet-tall' : ''}`

  const inner = (
    <>
      <div className="sheet-header">
        <div className="sheet-handle" />
        <div className="sheet-title-row">
          <h3>{title}</h3>
          <button
            type="button"
            className="sheet-close"
            aria-label="Закрыть"
            onClick={onClose}
          >
            ×
          </button>
        </div>
      </div>
      <div className="sheet-body">{children}</div>
      {footer ? <div className="sheet-footer">{footer}</div> : null}
    </>
  )

  const node = (
    <div className="sheet-root">
      <div className="sheet-backdrop" onClick={onClose} aria-hidden />
      {asForm ? (
        <form className={className} onSubmit={onSubmit}>
          {inner}
        </form>
      ) : (
        <div className={className} role="dialog" aria-modal="true">
          {inner}
        </div>
      )}
    </div>
  )

  return createPortal(node, document.body)
}
