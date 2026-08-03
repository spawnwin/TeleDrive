'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Music, Pause, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/hooks/use-i18n'
import type { ChatMusicMetadata } from '@/lib/music-message'

const MUSIC_PLAY_EVENT = 'aurora:music-play'

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
}

export function ChatMusicPlayer({
  meta,
  mine = false,
  messageId,
  className,
}: ChatMusicPlayerProps) {
  const { t } = useI18n()
  const audioRef = useRef<HTMLAudioElement>(null)
  const playerId = messageId || meta.trackId
  const streamSrc = `/api/yandex-music/stream/${encodeURIComponent(meta.trackId)}`
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [preview, setPreview] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(meta.durationSec || 0)

  useEffect(() => {
    setPlaying(false)
    setLoading(false)
    setError(false)
    setPreview(false)
    setCurrent(0)
    setDuration(meta.durationSec || 0)
    const a = audioRef.current
    if (!a) return
    a.pause()
    a.currentTime = 0
    a.load()

    fetch(streamSrc, { headers: { Range: 'bytes=0-1' }, credentials: 'same-origin' })
      .then((r) => {
        setPreview(r.headers.get('X-Aurora-Preview') === '1')
      })
      .catch(() => {})
  }, [meta.trackId, meta.durationSec, streamSrc])

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onTime = () => setCurrent(a.currentTime)
    const onMeta = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) setDuration(a.duration)
    }
    const onPlay = () => {
      setPlaying(true)
      setLoading(false)
      setError(false)
    }
    const onPause = () => setPlaying(false)
    const onEnded = () => {
      setPlaying(false)
      setCurrent(0)
    }
    const onWaiting = () => setLoading(true)
    const onPlaying = () => setLoading(false)
    const onError = () => {
      setPlaying(false)
      setLoading(false)
      setError(true)
    }
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('loadedmetadata', onMeta)
    a.addEventListener('play', onPlay)
    a.addEventListener('pause', onPause)
    a.addEventListener('ended', onEnded)
    a.addEventListener('waiting', onWaiting)
    a.addEventListener('playing', onPlaying)
    a.addEventListener('error', onError)
    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('loadedmetadata', onMeta)
      a.removeEventListener('play', onPlay)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('ended', onEnded)
      a.removeEventListener('waiting', onWaiting)
      a.removeEventListener('playing', onPlaying)
      a.removeEventListener('error', onError)
    }
  }, [streamSrc])

  useEffect(() => {
    const onOther = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail
      if (detail?.id === playerId) return
      audioRef.current?.pause()
      setPlaying(false)
    }
    window.addEventListener(MUSIC_PLAY_EVENT, onOther)
    return () => window.removeEventListener(MUSIC_PLAY_EVENT, onOther)
  }, [playerId])

  const toggle = async () => {
    const a = audioRef.current
    if (!a) return
    if (playing) {
      a.pause()
      setPlaying(false)
      return
    }
    window.dispatchEvent(new CustomEvent(MUSIC_PLAY_EVENT, { detail: { id: playerId } }))
    // Pause voice notes if any
    window.dispatchEvent(new CustomEvent('aurora:voice-play', { detail: { id: `music-${playerId}` } }))
    a.volume = 1
    a.muted = false
    setLoading(true)
    setError(false)
    try {
      await a.play()
      setPlaying(true)
    } catch {
      setPlaying(false)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current
    const dur = duration > 0 ? duration : meta.durationSec
    if (!a || !dur) return
    const ratio = Number(e.target.value) / 100
    a.currentTime = ratio * dur
    setCurrent(a.currentTime)
  }

  const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0

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
          className={cn(
            'relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl shadow-md transition active:scale-95',
            error && 'ring-2 ring-rose-400/80',
          )}
          aria-label={playing ? 'Pause' : 'Play'}
          title={error ? 'Не удалось воспроизвести' : undefined}
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
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white backdrop-blur-[1px] transition">
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
          <p
            className={cn(
              'mt-0.5 truncate text-[12px]',
              mine ? 'text-white/75' : 'text-muted-foreground',
            )}
          >
            {meta.artist}
          </p>
          {preview && (
            <p
              className={cn(
                'mt-1 text-[10px] font-medium',
                mine ? 'text-amber-200/90' : 'text-amber-600 dark:text-amber-400',
              )}
            >
              {t('music.previewBadge')}
            </p>
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
      <audio ref={audioRef} src={streamSrc} preload="none" playsInline />
    </div>
  )
}
