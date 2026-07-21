'use client'

import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { resolveMediaUrl } from '@/lib/media-url'
import { useI18n } from '@/hooks/use-i18n'

interface MediaLightboxProps {
  url: string | null
  alt?: string
  onClose: () => void
  zIndexClass?: string
  /** Bottom chrome (Telegram-style viewers + delete). */
  footer?: ReactNode
  /** Use fixed bottom bar layout (no «Close» text). */
  hideCloseLabel?: boolean
  /** Double-tap on the photo (e.g. like). Does not close the lightbox. */
  onDoubleTap?: () => void
}

export function MediaLightbox({
  url,
  alt = '',
  onClose,
  zIndexClass = 'z-[9999]',
  footer,
  hideCloseLabel = false,
  onDoubleTap,
}: MediaLightboxProps) {
  const { t } = useI18n()
  const src = resolveMediaUrl(url)
  const lastTapRef = useRef(0)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    onClose()
  }, [onClose])

  const stopClose = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation()
  }, [])

  const onClosePress = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault()
      e.stopPropagation()
      handleClose()
    },
    [handleClose],
  )

  const onPhotoPress = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!onDoubleTap) {
        handleClose()
        return
      }
      const now = Date.now()
      if (now - lastTapRef.current < 320) {
        lastTapRef.current = 0
        if (closeTimerRef.current) {
          clearTimeout(closeTimerRef.current)
          closeTimerRef.current = null
        }
        onDoubleTap()
        return
      }
      lastTapRef.current = now
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null
        handleClose()
      }, 320)
    },
    [handleClose, onDoubleTap],
  )

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!src) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.dataset.lightboxOpen = 'true'
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      delete document.body.dataset.lightboxOpen
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [src, handleClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {src && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label={alt || t('misc.close')}
          className={`fixed inset-0 ${zIndexClass} isolate touch-manipulation`}
        >
          <button
            type="button"
            aria-label={t('misc.close')}
            className="absolute inset-0 bg-black"
            onClick={handleClose}
            onPointerUp={(e) => {
              if (e.pointerType === 'touch') handleClose()
            }}
          />

          {/* Top close */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-end p-3"
            style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
          >
            <button
              type="button"
              aria-label={t('misc.close')}
              className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white active:bg-black/70"
              style={{ WebkitTapHighlightColor: 'transparent' }}
              onClick={onClosePress}
              onPointerUp={onClosePress}
              onTouchEnd={onClosePress}
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Photo */}
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center px-2"
            style={{
              paddingTop: 'max(3.5rem, calc(env(safe-area-inset-top) + 3rem))',
              paddingBottom: hideCloseLabel
                ? 'max(5.5rem, calc(env(safe-area-inset-bottom) + 4.5rem))'
                : 'max(4rem, calc(env(safe-area-inset-bottom) + 3rem))',
            }}
          >
            <img
              src={src}
              alt={alt}
              className="pointer-events-auto max-h-full max-w-full object-contain"
              onClick={onPhotoPress}
              onTouchEnd={onPhotoPress}
              onPointerDown={stopClose}
            />
          </div>

          {/* Bottom chrome — fixed like Telegram */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-30"
            style={{
              paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
            }}
          >
            <div className="bg-gradient-to-t from-black via-black/70 to-transparent px-4 pb-3 pt-16">
              <div className="pointer-events-auto" onClick={stopClose} onPointerDown={stopClose}>
                {footer}
                {!hideCloseLabel && !footer && (
                  <button
                    type="button"
                    className="mx-auto block min-h-11 px-4 text-sm text-white/80 active:text-white"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                    onClick={onClosePress}
                    onPointerUp={onClosePress}
                    onTouchEnd={onClosePress}
                  >
                    {t('misc.close')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
