'use client'

import { useEffect } from 'react'
import { Loader2, Music, Pause, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/hooks/use-i18n'
import type { ChatMusicMetadata } from '@/lib/music-message'
import { musicItemFromMeta, useMusicPlayerStore } from '@/lib/music-player-store'

function formatTime(s: number) {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const total = Math.floor(s)
  const m = Math.floor(total / 60)
  const sec = total % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

interface ChatMusicPlayerProps {
  meta: ChatMusicMetadata
  mine?: boolean
  messageId?: string
  className?: string
  queue?: ChatMusicMetadata[]
}

/**
 * Chat bubble UI only — playback lives in GlobalMusicBar / music-player-store.
 */
export function ChatMusicPlayer({
  meta,
  mine = false,
  messageId,
  className,
  queue = [],
}: ChatMusicPlayerProps) {
  const { t } = useI18n()
  const playerId = messageId || meta.trackId
  const playQueue = useMusicPlayerStore((s) => s.playQueue)
  const setStorePlaying = useMusicPlayerStore((s) => s.setPlaying)
  const seekTo = useMusicPlayerStore((s) => s.seekTo)
  const storePlaying = useMusicPlayerStore((s) => s.playing)
  const storeTrackKey = useMusicPlayerStore((s) => s.queue[s.index]?.key)
  const storeCurrent = useMusicPlayerStore((s) => s.current)
  const storeDuration = useMusicPlayerStore((s) => s.duration)
  const storePreview = useMusicPlayerStore((s) => s.preview)
  const storeLoading = useMusicPlayerStore((s) => s.loading)

  const isActive = storeTrackKey === playerId
  const playing = isActive && storePlaying
  const current = isActive ? storeCurrent : 0
  const duration = isActive && storeDuration > 0 ? storeDuration : meta.durationSec || 0
  const preview = isActive ? storePreview : false
  const loading = isActive && storeLoading

  useEffect(() => {
    // One shared Range probe cache per track id (avoid N bubbles × probe).
    if (!meta.trackId) return
    const cacheKey = `ym-preview:${meta.trackId}`
    try {
      const cached = sessionStorage.getItem(cacheKey)
      if (cached != null) return
    } catch {
      /* ignore */
    }
    const ctrl = new AbortController()
    fetch(`/api/yandex-music/stream/${encodeURIComponent(meta.trackId)}`, {
      headers: { Range: 'bytes=0-1' },
      credentials: 'same-origin',
      signal: ctrl.signal,
    })
      .then((r) => {
        const isPreview = r.headers.get('X-Aurora-Preview') === '1'
        try {
          sessionStorage.setItem(cacheKey, isPreview ? '1' : '0')
        } catch {
          /* ignore */
        }
      })
      .catch(() => {})
    return () => ctrl.abort()
  }, [meta.trackId])

  const openYandexSettings = () => {
    window.dispatchEvent(
      new CustomEvent('aurora:open-settings', { detail: { page: 'yandex' } }),
    )
  }

  const toggle = () => {
    const items =
      queue.length > 0
        ? queue.map((m, i) =>
            musicItemFromMeta(
              m,
              messageId && m.trackId === meta.trackId ? playerId : `${m.trackId}-${i}`,
            ),
          )
        : [musicItemFromMeta(meta, playerId)]
    const startIndex = Math.max(
      0,
      items.findIndex((i) => i.key === playerId || i.trackId === meta.trackId),
    )

    window.dispatchEvent(new CustomEvent('aurora:music-play', { detail: { id: playerId } }))
    window.dispatchEvent(new CustomEvent('aurora:voice-play', { detail: { id: `music-${playerId}` } }))

    if (isActive && storePlaying) {
      setStorePlaying(false)
      return
    }
    playQueue(items, startIndex >= 0 ? startIndex : 0)
  }

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isActive || !duration) return
    const ratio = Number(e.target.value) / 100
    seekTo(ratio * duration)
  }

  const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0
  let showPreview = preview
  if (!isActive) {
    try {
      showPreview = sessionStorage.getItem(`ym-preview:${meta.trackId}`) === '1'
    } catch {
      showPreview = false
    }
  }

  return (
    <div
      className={cn(
        'relative min-w-[240px] max-w-[min(100%,21rem)] overflow-hidden rounded-[1.15rem] p-3.5',
        mine
          ? 'bg-gradient-to-br from-[var(--bubble-out)] to-[color-mix(in_srgb,var(--bubble-out)_72%,black)] text-white shadow-md'
          : 'bg-gradient-to-br from-background via-primary/[0.08] to-rose-500/[0.12] text-foreground shadow-md ring-1 ring-black/[0.06]',
        className,
      )}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full opacity-50 blur-2xl"
        style={{
          background: mine
            ? 'radial-gradient(circle, rgba(255,255,255,0.28), transparent 70%)'
            : 'radial-gradient(circle, color-mix(in srgb, var(--primary) 55%, transparent), transparent 70%)',
        }}
      />
      <div className="relative flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl shadow-md transition active:scale-95"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {meta.coverUrl ? (
            <img
              src={meta.coverUrl}
              alt=""
              className={cn(
                'h-full w-full object-cover transition-transform duration-700',
                playing && 'scale-105',
              )}
            />
          ) : (
            <span
              className={cn(
                'flex h-full w-full items-center justify-center bg-gradient-to-br from-rose-500 to-primary text-white',
                playing && 'animate-pulse',
              )}
            >
              <Music className="h-6 w-6" />
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white backdrop-blur-[1px]">
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : playing ? (
              <Pause className="h-5 w-5 fill-current" />
            ) : (
              <Play className="h-5 w-5 translate-x-0.5 fill-current" />
            )}
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-[15px] font-semibold leading-tight tracking-tight', mine && 'text-white')}>
            {meta.title}
          </p>
          <p className={cn('mt-0.5 truncate text-[12px]', mine ? 'text-white/75' : 'text-muted-foreground')}>
            {meta.artist}
          </p>
          {showPreview && (
            <button
              type="button"
              onClick={openYandexSettings}
              className={cn(
                'mt-1 text-left text-[10px] font-medium underline-offset-2 hover:underline',
                mine ? 'text-amber-200/90' : 'text-amber-600 dark:text-amber-400',
              )}
            >
              {t('music.previewBadge')}
            </button>
          )}
          <div className="mt-2.5 flex items-center gap-2">
            <span
              className={cn(
                'w-8 shrink-0 text-right text-[10px] tabular-nums',
                mine ? 'text-white/65' : 'text-muted-foreground',
              )}
            >
              {formatTime(current)}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={progress}
              onChange={seek}
              disabled={!isActive}
              className={cn(
                'h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full',
                mine ? 'bg-white/25 accent-white' : 'bg-primary/20 accent-primary',
              )}
            />
            <span
              className={cn(
                'w-8 shrink-0 text-[10px] tabular-nums',
                mine ? 'text-white/65' : 'text-muted-foreground',
              )}
            >
              {formatTime(duration || meta.durationSec)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
