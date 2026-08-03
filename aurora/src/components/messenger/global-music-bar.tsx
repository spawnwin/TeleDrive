'use client'

import { useEffect, useRef } from 'react'
import { Music, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react'
import { useI18n } from '@/hooks/use-i18n'
import { useMusicPlayerStore } from '@/lib/music-player-store'

function formatTime(s: number) {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const total = Math.floor(s)
  const m = Math.floor(total / 60)
  const sec = total % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

/**
 * Sticky mini-player + Media Session / lock-screen controls.
 * Single audio element for the whole app.
 */
export function GlobalMusicBar() {
  const { t } = useI18n()
  const audioRef = useRef<HTMLAudioElement>(null)
  const {
    queue,
    index,
    playing,
    current,
    duration,
    preview,
    expanded,
    seekRequest,
    setPlaying,
    setProgress,
    setPreview,
    setLoading,
    playNext,
    playPrev,
    clear,
    setExpanded,
    clearSeekRequest,
  } = useMusicPlayerStore()

  const track = queue[index] || null
  const streamSrc = track
    ? `/api/yandex-music/stream/${encodeURIComponent(track.trackId)}`
    : ''

  useEffect(() => {
    const a = audioRef.current
    if (!a || !track) return
    setLoading(true)
    a.load()
    setProgress(0, track.durationSec || 0)
    const cacheKey = `ym-preview:${track.trackId}`
    let cached: string | null = null
    try {
      cached = sessionStorage.getItem(cacheKey)
    } catch {
      /* ignore */
    }
    if (cached != null) {
      setPreview(cached === '1')
    } else {
      fetch(streamSrc, { headers: { Range: 'bytes=0-1' }, credentials: 'same-origin' })
        .then((r) => {
          const isPreview = r.headers.get('X-Aurora-Preview') === '1'
          setPreview(isPreview)
          try {
            sessionStorage.setItem(cacheKey, isPreview ? '1' : '0')
          } catch {
            /* ignore */
          }
        })
        .catch(() => setPreview(false))
    }
    if (playing) {
      a.play()
        .then(() => setLoading(false))
        .catch(() => {
          setPlaying(false)
          setLoading(false)
        })
    } else {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.key, streamSrc])

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    if (playing) {
      a.play()
        .then(() => setLoading(false))
        .catch(() => setPlaying(false))
    } else {
      a.pause()
    }
  }, [playing, setPlaying, setLoading])

  useEffect(() => {
    if (seekRequest == null) return
    const a = audioRef.current
    if (a) {
      a.currentTime = seekRequest
    }
    clearSeekRequest()
  }, [seekRequest, clearSeekRequest])

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onTime = () =>
      setProgress(
        a.currentTime,
        Number.isFinite(a.duration) && a.duration > 0 ? a.duration : duration,
      )
    const onEnded = () => playNext()
    const onPlay = () => {
      setPlaying(true)
      setLoading(false)
    }
    const onPause = () => setPlaying(false)
    const onWaiting = () => setLoading(true)
    const onPlaying = () => setLoading(false)
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('ended', onEnded)
    a.addEventListener('play', onPlay)
    a.addEventListener('pause', onPause)
    a.addEventListener('waiting', onWaiting)
    a.addEventListener('playing', onPlaying)
    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('ended', onEnded)
      a.removeEventListener('play', onPlay)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('waiting', onWaiting)
      a.removeEventListener('playing', onPlaying)
    }
  }, [duration, playNext, setPlaying, setProgress, setLoading])

  useEffect(() => {
    if (!track || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        artwork: track.coverUrl
          ? [{ src: track.coverUrl, sizes: '200x200', type: 'image/jpeg' }]
          : [],
      })
      navigator.mediaSession.setActionHandler('play', () => setPlaying(true))
      navigator.mediaSession.setActionHandler('pause', () => setPlaying(false))
      navigator.mediaSession.setActionHandler('previoustrack', () => playPrev())
      navigator.mediaSession.setActionHandler('nexttrack', () => playNext())
      try {
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (typeof details.seekTime === 'number') {
            useMusicPlayerStore.getState().seekTo(details.seekTime)
          }
        })
      } catch {
        /* seekto unsupported */
      }
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
    } catch {
      /* Media Session not fully supported */
    }
  }, [track, playing, playNext, playPrev, setPlaying])

  if (!track || !expanded) return null

  const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-3 md:bottom-4">
      <div className="pointer-events-auto flex w-full max-w-lg items-center gap-3 rounded-2xl border border-border/60 bg-background/95 p-2.5 shadow-xl backdrop-blur-xl">
        <button
          type="button"
          onClick={() => setPlaying(!playing)}
          className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {track.coverUrl ? (
            <img src={track.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-rose-500 to-primary text-white">
              <Music className="h-5 w-5" />
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
            {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{track.title}</p>
          <p className="truncate text-[11px] text-muted-foreground">{track.artist}</p>
          {preview && (
            <button
              type="button"
              className="mt-0.5 text-[10px] font-medium text-amber-600 underline-offset-2 hover:underline dark:text-amber-400"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent('aurora:open-settings', { detail: { page: 'yandex' } }),
                )
              }}
            >
              {t('music.previewBadge')}
            </button>
          )}
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="w-7 text-right text-[9px] tabular-nums text-muted-foreground">
              {formatTime(current)}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={progress}
              onChange={(e) => {
                if (!duration) return
                useMusicPlayerStore.getState().seekTo((Number(e.target.value) / 100) * duration)
              }}
              className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-primary/20 accent-primary"
            />
            <span className="w-7 text-[9px] tabular-nums text-muted-foreground">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => playPrev()}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Previous"
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => playNext()}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Next"
            disabled={index >= queue.length - 1}
          >
            <SkipForward className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              audioRef.current?.pause()
              clear()
              setExpanded(false)
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <audio ref={audioRef} src={streamSrc || undefined} preload="none" playsInline />
      </div>
    </div>
  )
}
