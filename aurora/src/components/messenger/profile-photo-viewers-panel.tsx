'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Eye, Heart, Loader2, X } from 'lucide-react'
import { Avatar } from './avatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useI18n } from '@/hooks/use-i18n'
import { cn } from '@/lib/utils'

export interface ProfilePhotoViewerItem {
  id: string
  name: string
  username: string
  avatarColor: string
  avatarUrl?: string | null
  viewedAt: string
}

export interface ProfilePhotoLikerItem {
  id: string
  name: string
  username: string
  avatarColor: string
  avatarUrl?: string | null
  likedAt: string
}

interface ProfilePhotoViewersPanelProps {
  userId: string
  open: boolean
  onClose: () => void
  onSelectUser?: (userId: string) => void
  /** Specific profile photo URL (avatar or gallery). Defaults to current avatar. */
  photoUrl?: string | null
}

type Tab = 'views' | 'likes'

export function ProfilePhotoViewersPanel({
  userId,
  open,
  onClose,
  onSelectUser,
  photoUrl,
}: ProfilePhotoViewersPanelProps) {
  const { t, lang } = useI18n()
  const [tab, setTab] = useState<Tab>('views')
  const [loading, setLoading] = useState(false)
  const [viewers, setViewers] = useState<ProfilePhotoViewerItem[]>([])
  const [likers, setLikers] = useState<ProfilePhotoLikerItem[]>([])
  const [viewsTotal, setViewsTotal] = useState(0)
  const [likesTotal, setLikesTotal] = useState(0)

  useEffect(() => {
    if (!open) setTab('views')
  }, [open])

  useEffect(() => {
    if (!open || !userId) return
    let cancelled = false
    setLoading(true)
    const qs = photoUrl ? `?url=${encodeURIComponent(photoUrl)}` : ''
    Promise.all([
      fetch(`/api/users/${userId}/profile/photo/viewers${qs}`, { credentials: 'include' }).then((r) =>
        r.json(),
      ),
      fetch(`/api/users/${userId}/profile/photo/likers${qs}`, { credentials: 'include' }).then((r) =>
        r.json(),
      ),
    ])
      .then(([viewsData, likesData]) => {
        if (cancelled) return
        setViewers(viewsData.viewers || [])
        setViewsTotal(
          typeof viewsData.total === 'number' ? viewsData.total : (viewsData.viewers || []).length,
        )
        setLikers(likesData.likers || [])
        setLikesTotal(
          typeof likesData.total === 'number' ? likesData.total : (likesData.likers || []).length,
        )
      })
      .catch(() => {
        if (!cancelled) {
          setViewers([])
          setLikers([])
          setViewsTotal(0)
          setLikesTotal(0)
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

  const empty = tab === 'views' ? viewers.length === 0 : likers.length === 0

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
            {tab === 'likes' ? (
              <Heart className="h-4 w-4 fill-rose-500 text-rose-500" />
            ) : (
              <Eye className="h-4 w-4 text-[#3390ec]" />
            )}
            {tab === 'likes' ? t('profile.photoLikersTitle') : t('profile.photoViewersTitle')}
            {(tab === 'likes' ? likesTotal : viewsTotal) > 0 ? (
              <span className="text-muted-foreground">
                · {tab === 'likes' ? likesTotal : viewsTotal}
              </span>
            ) : null}
          </h3>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-2 px-4 py-2">
          <button
            type="button"
            onClick={() => setTab('views')}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium transition',
              tab === 'views'
                ? 'bg-[#3390ec]/15 text-[#3390ec]'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {t('stories.viewersTab')} · {viewsTotal}
          </button>
          <button
            type="button"
            onClick={() => setTab('likes')}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium transition',
              tab === 'likes'
                ? 'bg-rose-500/15 text-rose-500'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {t('stories.likersTab')} · {likesTotal}
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : empty ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {tab === 'likes' ? t('profile.photoNoLikers') : t('profile.photoNoViewers')}
          </p>
        ) : (
          <ScrollArea className="max-h-[calc(70vh-7rem)]">
            <ul className="divide-y divide-border/60">
              {tab === 'views'
                ? viewers.map((viewer) => (
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
                          {new Date(viewer.viewedAt).toLocaleString(
                            lang === 'ru' ? 'ru-RU' : 'en-US',
                            {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            },
                          )}
                        </time>
                      </button>
                    </li>
                  ))
                : likers.map((liker) => (
                    <li key={liker.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/50 active:bg-muted"
                        onClick={() => {
                          onSelectUser?.(liker.id)
                          onClose()
                        }}
                      >
                        <Avatar
                          name={liker.name}
                          color={liker.avatarColor}
                          imageUrl={liker.avatarUrl}
                          size="md"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{liker.name}</p>
                          <p className="truncate text-xs text-muted-foreground">@{liker.username}</p>
                        </div>
                        <Heart className="h-4 w-4 shrink-0 fill-rose-500 text-rose-500" />
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
