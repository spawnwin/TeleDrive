'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { Play, Pause, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { resolveMediaUrl } from '@/lib/media-url'

const VOICE_PLAY_EVENT = 'aurora:voice-play'
const SPEEDS = [1, 1.5, 2] as const
const QUICK_REACTIONS = ['❤️', '🔥', '😂', '👍', '😮'] as const

interface VoicePlayerProps {
  url: string
  durationSec?: number | null
  mine: boolean
  /** Stable id used to derive a per-message waveform so each message looks different. */
  messageId?: string
  /** Optional MIME so <source type> matches the server Content-Type. */
  mimeType?: string | null
  /** Circular Voice Notes 2.0 UI (default). Pass false for classic linear bar. */
  circle?: boolean
  /** Optional reaction callback — long-press / chips under the circle. */
  onReact?: (emoji: string) => void
  reactions?: Array<{ emoji: string; count: number; mine?: boolean }>
}

function inferAudioMime(url: string, mimeType?: string | null): string | undefined {
  const mime = (mimeType || '').toLowerCase().trim()
  if (mime.startsWith('audio/')) {
    // Strip codecs=… for the type attribute — browsers are picky.
    return mime.split(';')[0].trim()
  }
  if (mime === 'video/webm') return 'audio/webm'
  if (mime === 'video/ogg') return 'audio/ogg'
  const lower = url.toLowerCase()
  if (lower.includes('.m4a') || lower.includes('.mp4')) return 'audio/mp4'
  if (lower.includes('.mp3')) return 'audio/mpeg'
  if (lower.includes('.wav')) return 'audio/wav'
  if (lower.includes('.ogg') || lower.includes('.oga')) return 'audio/ogg'
  if (lower.includes('.webm')) return 'audio/webm'
  if (lower.includes('.aac')) return 'audio/aac'
  return undefined
}

export function VoicePlayer({
  url,
  durationSec,
  mine,
  messageId,
  mimeType,
  circle = true,
  onReact,
  reactions,
}: VoicePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [totalDuration, setTotalDuration] = useState(durationSec || 0)
  const [speedIdx, setSpeedIdx] = useState(0)
  const [error, setError] = useState(false)
  const playerId = messageId || url
  const speed = SPEEDS[speedIdx]
  const resolvedUrl = resolveMediaUrl(url) || url
  const sourceType = inferAudioMime(resolvedUrl, mimeType)

  useEffect(() => {
    setPlaying(false)
    setProgress(0)
    setCurrentTime(0)
    setTotalDuration(durationSec || 0)
    setError(false)
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
    audio.volume = 1
    audio.muted = false
    audio.load()
  }, [durationSec, resolvedUrl])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.playbackRate = speed
  }, [speed])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const usableDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration
      return totalDuration > 0 ? totalDuration : 0
    }

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
      const duration = usableDuration()
      if (duration > 0) {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          setTotalDuration(audio.duration)
        }
        setProgress(Math.min(1, audio.currentTime / duration))
      }
    }
    const onEnded = () => {
      setPlaying(false)
      setProgress(0)
      setCurrentTime(0)
    }
    const onPause = () => setPlaying(false)
    const onPlay = () => {
      setPlaying(true)
      setError(false)
    }
    const onLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setTotalDuration(audio.duration)
      }
    }
    const onError = () => {
      setPlaying(false)
      setError(true)
    }
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('error', onError)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('error', onError)
    }
  }, [totalDuration, resolvedUrl])

  useEffect(() => {
    const onOtherVoicePlay = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail
      if (detail?.id === playerId) return
      const audio = audioRef.current
      if (!audio) return
      audio.pause()
      setPlaying(false)
    }
    window.addEventListener(VOICE_PLAY_EVENT, onOtherVoicePlay)
    return () => window.removeEventListener(VOICE_PLAY_EVENT, onOtherVoicePlay)
  }, [playerId])

  const togglePlay = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      window.dispatchEvent(new CustomEvent(VOICE_PLAY_EVENT, { detail: { id: playerId } }))
      audio.volume = 1
      audio.muted = false
      audio.playbackRate = speed
      try {
        await audio.play()
        setPlaying(true)
        setError(false)
      } catch {
        setPlaying(false)
        setError(true)
      }
    }
  }

  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation()
    setSpeedIdx((i) => (i + 1) % SPEEDS.length)
  }

  const getSeekDuration = () => {
    const audio = audioRef.current
    if (!audio) return 0
    if (Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration
    return totalDuration > 0 ? totalDuration : 0
  }

  const applySeekRatio = (ratio: number) => {
    const audio = audioRef.current
    const duration = getSeekDuration()
    if (!audio || duration <= 0) return
    const safeRatio = Math.max(0, Math.min(1, ratio))
    const nextTime = safeRatio * duration
    try {
      audio.currentTime = nextTime
    } catch {
      // Some WebM blobs with broken metadata still refuse seeking; keep UI stable.
    }
    setProgress(safeRatio)
    setCurrentTime(nextTime)
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    applySeekRatio(ratio)
  }

  const seekToBar = (index: number) => {
    const ratio = (index + 0.5) / bars
    applySeekRatio(ratio)
  }

  const formatTime = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return '0:00'
    const total = Math.floor(s)
    const m = Math.floor(total / 60)
    const sec = total % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const bars = 32
  const filledBars = Math.floor(progress * bars)

  const barHeights = useMemo(() => {
    let seed = 0
    if (messageId) {
      for (let i = 0; i < messageId.length; i++) {
        seed = (seed * 31 + messageId.charCodeAt(i)) >>> 0
      }
    }
    const heights: number[] = []
    for (let i = 0; i < bars; i++) {
      let x = (seed + i * 2654435761) >>> 0 || (i * 1103515245 + 12345) >>> 0
      x ^= x << 13
      x >>>= 0
      x ^= x >> 17
      x ^= x << 5
      x >>>= 0
      const r = (x % 1000) / 1000
      heights.push(25 + r * 75)
    }
    return heights
  }, [messageId])

  const ringColor = mine ? '#ffffff' : '#3390ec'

  const audioEl = (
    <audio ref={audioRef} preload="metadata" playsInline>
      {sourceType ? (
        <source src={resolvedUrl} type={sourceType} />
      ) : (
        <source src={resolvedUrl} />
      )}
    </audio>
  )

  if (circle) {
    return (
      <div className="flex flex-col items-center gap-2 overflow-hidden py-1">
        {audioEl}
        <div className="relative h-[min(11rem,70vw)] w-[min(11rem,70vw)] max-h-44 max-w-44">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth="1.5" />
            <circle
              cx="50"
              cy="50"
              r="48"
              fill="none"
              stroke={ringColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 48}`}
              strokeDashoffset={`${2 * Math.PI * 48 * (1 - progress)}`}
              className="transition-all duration-100"
            />
          </svg>

          <button
            type="button"
            onClick={togglePlay}
            className={cn(
              'absolute inset-2 flex flex-col items-center justify-center overflow-hidden rounded-full transition',
              mine
                ? 'bg-gradient-to-br from-[#2b5278] to-[#1a3a56] text-white'
                : 'bg-gradient-to-br from-[#3390ec]/25 to-[#1a4a7a]/40 text-foreground',
              playing && 'animate-pulse',
              error && 'ring-2 ring-rose-500/70',
            )}
            aria-label={playing ? 'Pause' : 'Play'}
            title={error ? 'Не удалось воспроизвести' : undefined}
          >
            {/* Radial faux-waveform */}
            <div className="pointer-events-none absolute inset-4 flex items-end justify-center gap-[2px]">
              {Array.from({ length: 18 }).map((_, i) => {
                const h = barHeights[i % barHeights.length]
                const active = i / 18 <= progress
                return (
                  <span
                    key={i}
                    className={cn(
                      'w-[3px] rounded-full transition-colors',
                      active ? (mine ? 'bg-white/90' : 'bg-[#3390ec]') : mine ? 'bg-white/25' : 'bg-muted-foreground/25',
                    )}
                    style={{ height: `${Math.max(18, h * 0.55)}%` }}
                  />
                )
              })}
            </div>
            <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-black/25 backdrop-blur-md">
              {playing ? (
                <Pause className="h-5 w-5 fill-current" />
              ) : (
                <Play className="h-5 w-5 translate-x-0.5 fill-current" />
              )}
            </div>
          </button>

          <button
            type="button"
            onClick={cycleSpeed}
            className="absolute -right-1 top-2 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-bold tabular-nums text-white backdrop-blur"
            title="Playback speed"
          >
            {speed}x
          </button>

          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
            {formatTime(playing || currentTime > 0 ? currentTime : totalDuration)}
          </div>
        </div>

        {(onReact || (reactions && reactions.length > 0)) && (
          <div className="flex max-w-[13rem] flex-wrap items-center justify-center gap-1">
            {onReact &&
              QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onReact(emoji)
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-muted/60 text-sm transition hover:bg-muted active:scale-90"
                >
                  {emoji}
                </button>
              ))}
            {!onReact &&
              reactions?.map((r) => (
                <span
                  key={r.emoji}
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[11px]',
                    r.mine ? 'bg-[#3390ec]/15' : 'bg-muted/50',
                  )}
                >
                  {r.emoji} {r.count > 1 ? r.count : ''}
                </span>
              ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2.5 py-1">
      {audioEl}
      <Button
        onClick={togglePlay}
        variant="ghost"
        size="icon"
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full p-0',
          mine
            ? 'bg-white/20 text-white hover:bg-white/30'
            : 'bg-[#3390ec]/15 text-[#3390ec] hover:bg-[#3390ec]/25',
          error && 'ring-2 ring-rose-500/70',
        )}
        title={error ? 'Не удалось воспроизвести' : undefined}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-0.5" />}
      </Button>

      <div className="flex h-7 flex-1 cursor-pointer items-center gap-[2px]" onClick={seek}>
        {Array.from({ length: bars }).map((_, i) => {
          const isActive = i < filledBars
          return (
            <button
              key={i}
              type="button"
              aria-label={`${i + 1}`}
              onClick={(e) => {
                e.stopPropagation()
                seekToBar(i)
              }}
              className={cn(
                'w-[2.5px] rounded-full transition-colors',
                isActive
                  ? mine
                    ? 'bg-white/80'
                    : 'bg-[#3390ec]'
                  : mine
                    ? 'bg-white/30'
                    : 'bg-muted-foreground/30',
              )}
              style={{ height: `${barHeights[i]}%` }}
            />
          )
        })}
      </div>

      <button
        type="button"
        onClick={cycleSpeed}
        className={cn(
          'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
          mine ? 'bg-white/15 text-white/80' : 'bg-muted text-muted-foreground',
        )}
      >
        {speed}x
      </button>

      <span
        className={cn(
          'shrink-0 text-xs tabular-nums',
          mine ? 'text-white/70' : 'text-muted-foreground',
        )}
      >
        {formatTime(playing || currentTime > 0 ? currentTime : totalDuration)}
      </span>

      <a
        href={resolvedUrl}
        download
        className={cn(
          'shrink-0 rounded-full p-1.5 transition hover:bg-black/10',
          mine ? 'text-white/60 hover:text-white' : 'text-muted-foreground hover:text-foreground',
        )}
        title="Скачать"
      >
        <Download className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}
