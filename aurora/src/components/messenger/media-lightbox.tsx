'use client'

import { useCallback, useEffect, type ReactNode } from 'react'
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
  /** Extra actions under the photo (e.g. delete profile photo). */
  footer?: ReactNode
  /** Hide the default «Close» text under the footer (Telegram-style chrome). */
  hideCloseLabel?: boolean
}

export function MediaLightbox({
  url,
  alt = '',
  onClose,
  zIndexClass = 'z-[9999]',
  footer,
  hideCloseLabel = false,
}: MediaLightboxProps) {
  const { t } = useI18n()
  const src = resolveMediaUrl(url)

  const handleClose = useCallback(() => {
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
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: hideCloseLabel
              ? 'env(safe-area-inset-bottom)'
              : 'calc(5.75rem + env(safe-area-inset-bottom))',
          }}
        >
          <button
            type="button"
            aria-label={t('misc.close')}
            className="absolute inset-0 bg-black/90"
            onClick={handleClose}
            onPointerUp={(e) => {
              if (e.pointerType === 'touch') handleClose()
            }}
          />

          <div className="pointer-events-none relative flex h-full flex-col">
            <div className="pointer-events-auto flex shrink-0 items-center justify-end p-3">
              <button
                type="button"
                aria-label={t('misc.close')}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white active:bg-black/80"
                style={{ WebkitTapHighlightColor: 'transparent' }}
                onClick={onClosePress}
                onPointerUp={onClosePress}
                onTouchEnd={onClosePress}
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-2">
              <img
                src={src}
                alt={alt}
                className="pointer-events-auto max-h-full max-w-full object-contain"
                onClick={onClosePress}
                onTouchEnd={onClosePress}
                onPointerDown={stopClose}
              />
            </div>

            <div
              className={
                hideCloseLabel
                  ? 'pointer-events-auto shrink-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-10'
                  : 'pointer-events-auto shrink-0 space-y-2 px-4 pb-4 text-center'
              }
              onClick={stopClose}
              onPointerDown={stopClose}
            >
              {footer}
              {!hideCloseLabel && (
                <button
                  type="button"
                  className="min-h-11 px-4 text-sm text-white/80 active:text-white"
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
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
