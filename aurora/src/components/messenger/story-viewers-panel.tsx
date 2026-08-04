'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Heart, Loader2, X } from 'lucide-react'
import { Avatar } from './avatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useI18n } from '@/hooks/use-i18n'
import { cn } from '@/lib/utils'

export interface StoryViewerItem {
  id: string
  name: string
  username: string
  avatarColor: string
  avatarUrl?: string | null
  viewedAt: string
  liked?: boolean
}

export interface StoryLikerItem {
  id: string
  name: string
  username: string
  avatarColor: string
  avatarUrl?: string | null
  likedAt: string
}

interface StoryViewersPanelProps {
  storyId: string
  open: boolean
  onClose: () => void
}

type Tab = 'views' | 'likes'

export function StoryViewersPanel({ storyId, open, onClose }: StoryViewersPanelProps) {
  const { t, lang } = useI18n()
  const [loading, setLoading] = useState(false)
  const [viewers, setViewers] = useState<StoryViewerItem[]>([])
  const [likers, setLikers] = useState<StoryLikerItem[]>([])
  const [tab, setTab] = useState<Tab>('views')

  useEffect(() => {
    if (!open || !storyId) return
    let cancelled = false
    setLoading(true)
    setTab('views')
    fetch(`/api/stories/${storyId}/viewers`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        setViewers(data.viewers || [])
        setLikers(data.likers || [])
      })
      .catch(() => {
        if (!cancelled) {
          setViewers([])
          setLikers([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, storyId])

  if (!open) return null

  const listEmpty =
    tab === 'views' ? viewers.length === 0 : likers.length === 0

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 28, stiffness: 320 }}
      className="absolute inset-x-0 bottom-0 z-30 max-h-[60vh] rounded-t-2xl bg-background/95 shadow-2xl backdrop-blur-md"
      style={{
        // Clear floating bottom nav + iOS home indicator so the sheet never sits under it.
        paddingBottom: 'calc(5.75rem + env(safe-area-inset-bottom))',
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">
          {tab === 'likes' ? t('stories.likersTitle') : t('stories.viewersTitle')}
        </h3>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex gap-1 border-b border-border px-3 py-2">
        <button
          type="button"
          onClick={() => setTab('views')}
          className={cn(
            'flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition',
            tab === 'views' ? 'bg-[#3390ec]/15 text-[#3390ec]' : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {t('stories.viewersTab')} · {viewers.length}
        </button>
        <button
          type="button"
          onClick={() => setTab('likes')}
          className={cn(
            'flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition',
            tab === 'likes' ? 'bg-rose-500/15 text-rose-500' : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {t('stories.likersTab')} · {likers.length}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : listEmpty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {tab === 'likes' ? t('stories.noLikers') : t('stories.noViewers')}
        </p>
      ) : (
        <ScrollArea className="max-h-[calc(60vh-7rem)]">
          <ul className="divide-y divide-border/60">
            {tab === 'views'
              ? viewers.map((viewer) => (
                  <li key={viewer.id} className="flex items-center gap-3 px-4 py-3">
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
                    {viewer.liked && (
                      <Heart className="h-4 w-4 shrink-0 fill-rose-500 text-rose-500" />
                    )}
                    <time className="shrink-0 text-[10px] text-muted-foreground">
                      {new Date(viewer.viewedAt).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </li>
                ))
              : likers.map((liker) => (
                  <li key={liker.id} className="flex items-center gap-3 px-4 py-3">
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
                    <time className="shrink-0 text-[10px] text-muted-foreground">
                      {new Date(liker.likedAt).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </li>
                ))}
          </ul>
        </ScrollArea>
      )}
    </motion.div>
  )
}
