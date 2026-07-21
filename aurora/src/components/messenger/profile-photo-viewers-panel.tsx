'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Eye, Loader2, X } from 'lucide-react'
import { Avatar } from './avatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useI18n } from '@/hooks/use-i18n'

export interface ProfilePhotoViewerItem {
  id: string
  name: string
  username: string
  avatarColor: string
  avatarUrl?: string | null
  viewedAt: string
}

interface ProfilePhotoViewersPanelProps {
  userId: string
  open: boolean
  onClose: () => void
  onSelectUser?: (userId: string) => void
  /** Specific profile photo URL (avatar or gallery). Defaults to current avatar. */
  photoUrl?: string | null
}

export function ProfilePhotoViewersPanel({
  userId,
  open,
  onClose,
  onSelectUser,
  photoUrl,
}: ProfilePhotoViewersPanelProps) {
  const { t, lang } = useI18n()
  const [loading, setLoading] = useState(false)
  const [viewers, setViewers] = useState<ProfilePhotoViewerItem[]>([])
  const [total, setTotal] = useState(0)

  useEffect(() => {
    if (!open || !userId) return
    let cancelled = false
    setLoading(true)
    const qs = photoUrl ? `?url=${encodeURIComponent(photoUrl)}` : ''
    fetch(`/api/users/${userId}/profile/photo/viewers${qs}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        setViewers(data.viewers || [])
        setTotal(typeof data.total === 'number' ? data.total : (data.viewers || []).length)
      })
      .catch(() => {
        if (!cancelled) {
          setViewers([])
          setTotal(0)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, userId, photoUrl])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex flex-col justify-end">
      <button
        type="button"
        aria-label={t('misc.close')}
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="relative z-10 max-h-[70vh] rounded-t-2xl bg-background shadow-2xl"
        style={{
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Eye className="h-4 w-4 text-[#3390ec]" />
            {t('profile.photoViewersTitle')}
            {total > 0 ? <span className="text-muted-foreground">· {total}</span> : null}
          </h3>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : viewers.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t('profile.photoNoViewers')}
          </p>
        ) : (
          <ScrollArea className="max-h-[calc(70vh-4rem)]">
            <ul className="divide-y divide-border/60">
              {viewers.map((viewer) => (
                <li key={viewer.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/50 active:bg-muted"
                    onClick={() => {
                      onSelectUser?.(viewer.id)
                      onClose()
                    }}
                  >
                    <Avatar
                      name={viewer.name}
                      color={viewer.avatarColor}
                      imageUrl={viewer.avatarUrl}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{viewer.name}</p>
                      <p className="truncate text-xs text-muted-foreground">@{viewer.username}</p>
                    </div>
                    <time className="shrink-0 text-[10px] text-muted-foreground">
                      {new Date(viewer.viewedAt).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </motion.div>
    </div>,
    document.body,
  )
}
