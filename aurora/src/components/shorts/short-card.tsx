'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart, MessageCircle, Share2, Music2, Volume2, VolumeX, Play, Pin, MoreVertical, Pencil, Trash2, Crown, SplitSquareHorizontal, Swords } from 'lucide-react'
import { Avatar } from '@/components/messenger/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useI18n } from '@/hooks/use-i18n'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { formatCount } from '@/lib/format-count'
import { buildShortSharePayload } from '@/lib/share-payload'
import { VIEW_QUALIFY_MS } from '@/lib/shorts-monetization'
import { getShortsMutedPreference, setShortsMutedPreference } from '@/lib/shorts-audio'
import { resolveVideoMimeFromUrl } from '@/lib/media-type'
import type { FriendshipStatus } from '@/lib/friends'
import { toast } from 'sonner'

/**
 * Strip any platform attribution from a short description so viewers can't
 * tell where an imported short came from. The `source` field is preserved in
 * the DB and shown only in admin views. This keeps author names (e.g.
 * "MrBeast") but drops "Источник:", "(YouTube)", "(TikTok)", and bare
 * platform names. Also handles legacy parser output like
 * "Источник: MrBeast (YouTube)".
 */
function sanitizeViewerDescription(desc: string | null | undefined): string | null {
  if (!desc) return null
  let s = desc
  // Drop "(YouTube)" / "(TikTok)" / "（YouTube）" etc.
  s = s.replace(/\s*[\(（]\s*(YouTube|TikTok|TikTok\.com)\s*[\)）]\s*/gi, ' ')
  // Drop a leading "Источник:" / "Source:" prefix.
  s = s.replace(/^\s*(Источник|Source)\s*:\s*/i, '')
  // If only the platform name remains, hide it entirely.
  if (/^\s*(youtube|tiktok|tiktok\.com)\s*$/i.test(s)) return null
  s = s.trim().replace(/\s{2,}/g, ' ')
  return s || null
}

export interface CreatorFriendship {
  id: string | null
  status: FriendshipStatus
}

export interface ShortParentRef {
  id: string
  title: string
  thumbnailUrl?: string | null
  videoUrl?: string | null
  creator?: {
    id: string
    name: string
    username: string
    avatarColor: string
  }
}

export interface ShortData {
  id: string
  title: string
  description?: string | null
  videoUrl: string | null
  thumbnailUrl?: string | null
  source: string // upload | youtube | tiktok
  externalId?: string | null
  duration?: number | null
  views: number
  likes: number
  comments: number
  earnings: number
  tags: string[]
  createdAt: string
  creator: {
    id: string
    name: string
    username: string
    avatarColor: string
    friendship?: CreatorFriendship
  }
  isLiked: boolean
  parentShortId?: string | null
  duetMode?: string | null
  challengeTitle?: string | null
  parentShort?: ShortParentRef | null
}

interface ShortCardProps {
  short: ShortData
  isActive: boolean
  audioUnlocked: boolean
  onAudioUnlock: () => void
  onOpenComments: () => void
  onViewTrack: () => void
  onLike: (newLikes: number, isLiked: boolean) => void
  onEdit?: (short: ShortData) => void
  onDelete?: (short: ShortData) => void
  onOpenPremium?: (creatorId: string) => void
  onDuet?: (short: ShortData, mode: 'reply' | 'duet' | 'challenge') => void
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function vibrate(ms: number) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(ms)
    } catch {
      // ignore
    }
  }
}

interface FloatingHeart {
  id: number
  x: number
  rotate: number
}

/** Extract a YouTube video ID from any common YouTube URL form. */
function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(
    /(?:youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
  )
  return m ? m[1] : null
}

export function ShortCard({
  short,
  isActive,
  audioUnlocked,
  onAudioUnlock,
  onOpenComments,
  onViewTrack,
  onLike,
  onEdit,
  onDelete,
  onOpenPremium,
  onDuet,
}: ShortCardProps) {
  const { t } = useI18n()
  const { currentUser, openShareToChat, subscribedCreatorIds, addSubscribedCreator, removeSubscribedCreator } = useAppStore()
  const isMine = short.creator.id === currentUser?.id
  // Lazy init from the persisted preference so the very first embed URL is
  // already built with the right mute state (default: sound on).
  const [muted, setMuted] = useState(() => getShortsMutedPreference())
  const [isLiked, setIsLiked] = useState(short.isLiked)
  const [likesCount, setLikesCount] = useState(short.likes)
  // Local optimistic delta on first qualified view; the canonical count comes
  // from the `short.views` prop (feed does not re-fetch on view, so we bump it
  // locally to give immediate feedback).
  const [viewDelta, setViewDelta] = useState(0)
  const [paused, setPaused] = useState(false)
  const [viewTracked, setViewTracked] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const [subscribeLoading, setSubscribeLoading] = useState(false)
  const [friendship, setFriendship] = useState<CreatorFriendship>(
    short.creator.friendship ?? { id: null, status: 'none' },
  )
  const [progress, setProgress] = useState(0) // 0..1
  const [duration, setDuration] = useState(0)
  const [bigHeart, setBigHeart] = useState<{ key: number; burst: boolean } | null>(null)
  const [floatingHearts, setFloatingHearts] = useState<FloatingHeart[]>([])
  const [creatorHasTiers, setCreatorHasTiers] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const iframeContainerRef = useRef<HTMLDivElement>(null)
  const lastTapRef = useRef(0)
  const heartIdRef = useRef(0)
  const bigHeartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setFriendship(short.creator.friendship ?? { id: null, status: 'none' })
  }, [short.creator.id, short.creator.friendship])

  // Lazy check: does this creator have Premium tiers? Drives the "Поддержать"
  // button on the action rail for non-creators. Cached per-creator.
  useEffect(() => {
    if (isMine || !onOpenPremium) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCreatorHasTiers(false)
      return
    }
    let cancelled = false
    fetch(`/api/creators/${short.creator.id}/premium`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) {
          setCreatorHasTiers(Array.isArray(data.tiers) && data.tiers.length > 0)
        }
      })
      .catch(() => {
        if (!cancelled) setCreatorHasTiers(false)
      })
    return () => {
      cancelled = true
    }
  }, [short.creator.id, isMine, onOpenPremium])

  // Note: parent uses `key={short.id}` so this component remounts on short change,
  // which resets all useState values automatically.

  useEffect(() => {
    // All sources honor the user's persisted preference (default: sound on).
    // YouTube embeds are driven через postMessage API, поэтому звук можно
    // включать без перезагрузки iframe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMuted(getShortsMutedPreference())
  }, [])

  const mutedRef = useRef(muted)
  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  /** Drive the YouTube embed without reloading it (enablejsapi postMessage). */
  const sendYtCommand = useCallback((func: string, args: unknown[] = []) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args }),
      '*',
    )
  }, [])

  const applyMuted = (next: boolean, persist = true) => {
    setMuted(next)
    if (persist) setShortsMutedPreference(next)
    if (videoRef.current) videoRef.current.muted = next
    if (short.source === 'youtube') {
      sendYtCommand(next ? 'mute' : 'unMute')
      if (!next) sendYtCommand('setVolume', [100])
    }
  }

  // Auto-play / pause when active state changes
  useEffect(() => {
    if (!isActive) {
      videoRef.current?.pause()
      return
    }
    const video = videoRef.current
    if (!video || paused) return

    const playActive = async () => {
      const wantSound = !muted && audioUnlocked
      video.muted = !wantSound
      try {
        await video.play()
        return
      } catch {
        // Browser autoplay policy: retry muted
      }
      video.muted = true
      try {
        await video.play()
      } catch {
        // ignore
      }
      if (wantSound && video.paused === false) {
        video.muted = false
        video.play().catch(() => {
          video.muted = true
        })
      }
    }

    void playActive()
  }, [isActive, muted, paused, audioUnlocked])

  // Track view when this short becomes active — store callback in ref to
  // avoid re-running the effect on every parent re-render.
  const onViewTrackRef = useRef(onViewTrack)
  useEffect(() => {
    onViewTrackRef.current = onViewTrack
  }, [onViewTrack])
  useEffect(() => {
    if (isActive && !viewTracked && short.creator.id !== currentUser?.id) {
      const timer = setTimeout(() => {
        onViewTrackRef.current()
        setViewTracked(true)
        // Optimistic local view count bump on first qualified view.
        setViewDelta(1)
      }, VIEW_QUALIFY_MS)
      return () => clearTimeout(timer)
    }
  }, [isActive, viewTracked, short.creator.id, currentUser?.id])

  // Cleanup big-heart timer on unmount.
  useEffect(() => {
    return () => {
      if (bigHeartTimerRef.current) clearTimeout(bigHeartTimerRef.current)
    }
  }, [])

  const spawnFloatingHeart = useCallback(() => {
    if (prefersReducedMotion()) return
    const id = heartIdRef.current++
    const x = (Math.random() - 0.5) * 50
    const rotate = (Math.random() - 0.5) * 40
    setFloatingHearts((prev) => [...prev, { id, x, rotate }])
    setTimeout(() => {
      setFloatingHearts((prev) => prev.filter((h) => h.id !== id))
    }, 1300)
  }, [])

  const showBigHeart = useCallback((burst: boolean) => {
    if (prefersReducedMotion()) return
    if (bigHeartTimerRef.current) clearTimeout(bigHeartTimerRef.current)
    const key = Date.now()
    setBigHeart({ key, burst })
    bigHeartTimerRef.current = setTimeout(() => {
      setBigHeart((cur) => (cur && cur.key === key ? null : cur))
    }, burst ? 900 : 700)
  }, [])

  const togglePlay = () => {
    onAudioUnlock()
    // Note: tap-to-play must NOT unmute. Only the explicit unmute button
    // (toggleMute) unmutes. Double-tap-to-like also must not unmute.
    if (short.source === 'upload' || short.source === 'instagram') {
      if (!videoRef.current) return
      if (videoRef.current.paused) {
        videoRef.current.play().catch(() => {})
        setPaused(false)
      } else {
        videoRef.current.pause()
        setPaused(true)
      }
    } else if (short.source === 'youtube') {
      if (paused) {
        sendYtCommand('playVideo')
        setPaused(false)
      } else {
        sendYtCommand('pauseVideo')
        setPaused(true)
      }
    } else if (short.source === 'tiktok') {
      // TikTok's embed has no command API — remounting the iframe on pause.
      setPaused((p) => !p)
    }
  }

  // Single vs double tap detection on the video area.
  // Double-tap → always like (TikTok behavior, never unlikes).
  // Single tap → toggle play/pause.
  const handleVideoAreaTap = () => {
    const now = Date.now()
    const dt = now - lastTapRef.current
    lastTapRef.current = now
    if (dt > 0 && dt < 280) {
      lastTapRef.current = 0
      void handleLike({ fromDoubleTap: true })
      return
    }
    const stamp = now
    setTimeout(() => {
      if (lastTapRef.current === stamp) {
        lastTapRef.current = 0
        togglePlay()
      }
    }, 280)
  }

  const toggleMute = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    onAudioUnlock()
    applyMuted(!muted)
  }

  const handleLike = async (opts?: { fromDoubleTap?: boolean }) => {
    const fromDoubleTap = !!opts?.fromDoubleTap
    vibrate(10)
    spawnFloatingHeart()

    // Double-tap always likes and never unlikes.
    if (fromDoubleTap) {
      showBigHeart(isLiked)
      if (isLiked) {
        // Already liked — just animate, no count change.
        return
      }
    }

    const newLiked = !isLiked
    setIsLiked(newLiked)
    setLikesCount((c) => (newLiked ? c + 1 : c - 1))
    try {
      const res = await fetch(`/api/shorts/${short.id}/like`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (res.ok && data && typeof data.likes === 'number' && typeof data.isLiked === 'boolean') {
        setLikesCount(data.likes)
        setIsLiked(data.isLiked)
        onLike(data.likes, data.isLiked)
      } else {
        onLike(newLiked ? likesCount + 1 : Math.max(0, likesCount - 1), newLiked)
      }
    } catch {
      // Revert on error
      setIsLiked(!newLiked)
      setLikesCount((c) => (newLiked ? c - 1 : c + 1))
    }
  }

  const handleShare = () => {
    openShareToChat(buildShortSharePayload(short))
  }

  const isFollowing =
    friendship.status === 'accepted' ||
    friendship.status === 'pending_outgoing' ||
    friendship.status === 'pending_incoming'

  const handleFollow = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (isMine || followLoading || isFollowing) return
    setFollowLoading(true)
    try {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: short.creator.id }),
      })
      const data = await res.json()
      if (data.friendship) {
        setFriendship(data.friendship)
      }
      if (!res.ok) {
        throw new Error(data.error || t('misc.error'))
      }
      if (data.autoAccepted) {
        toast.success(t('shorts.following'))
      } else {
        toast.success(t('friends.requestSent'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    } finally {
      setFollowLoading(false)
    }
  }

  const isSubscribed = subscribedCreatorIds.has(short.creator.id)

  const handleSubscribe = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (isMine || subscribeLoading) return
    const wasSubscribed = isSubscribed
    // Optimistic toggle
    if (wasSubscribed) removeSubscribedCreator(short.creator.id)
    else addSubscribedCreator(short.creator.id)
    setSubscribeLoading(true)
    try {
      const res = await fetch('/api/shorts/subscribe', {
        method: wasSubscribed ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatorId: short.creator.id }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || t('misc.error'))
      }
      // Server is source of truth — reconcile in case of race.
      if (typeof data.isSubscribed === 'boolean') {
        if (data.isSubscribed) addSubscribedCreator(short.creator.id)
        else removeSubscribedCreator(short.creator.id)
      }
      toast.success(
        wasSubscribed ? t('shorts.unsubscribe') : t('shorts.subscribed'),
      )
    } catch (err) {
      // Revert
      if (wasSubscribed) addSubscribedCreator(short.creator.id)
      else removeSubscribedCreator(short.creator.id)
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    } finally {
      setSubscribeLoading(false)
    }
  }

  const videoMime =
    (short.source === 'upload' || short.source === 'instagram') && short.videoUrl
      ? resolveVideoMimeFromUrl(short.videoUrl)
      : null

  const onTimeUpdate = () => {
    const v = videoRef.current
    if (!v) return
    if (v.duration > 0) {
      setProgress(v.currentTime / v.duration)
    }
  }

  const onLoadedMetadata = () => {
    const v = videoRef.current
    if (v && v.duration > 0) {
      setDuration(v.duration)
    }
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    const v = videoRef.current
    if (!v || !v.duration || !isFinite(v.duration)) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    v.currentTime = ratio * v.duration
    setProgress(ratio)
  }

  const isExternal = short.source === 'youtube' || short.source === 'tiktok'

  const buildEmbedSrc = useCallback(() => {
    if (short.source === 'tiktok') {
      const url = short.videoUrl || ''
      // Strip any existing query to avoid duplicate autoplay/muted params.
      const base = url.split('?')[0]
      return `${base}?autoplay=true&muted=${mutedRef.current ? 1 : 0}&loop=1`
    }
    // YouTube — nocookie domain, no controls, no keyboard, no fullscreen,
    // annotations off, and loop via single-item playlist so the related-videos
    // end screen never appears. Branding chrome is additionally cropped out by
    // oversizing the iframe (see render below).
    const videoId = short.externalId || extractYouTubeId(short.videoUrl)
    if (!videoId) return short.videoUrl || ''
    const origin =
      typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : ''
    return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=${mutedRef.current ? 1 : 0}&playsinline=1&rel=0&controls=0&iv_load_policy=3&disablekb=1&fs=0&loop=1&playlist=${videoId}&enablejsapi=1&origin=${origin}`
  }, [short.source, short.videoUrl, short.externalId])

  // Mount the embed as soon as the card becomes active (autoplay on swipe) and
  // unmount it when the card scrolls away so its audio stops immediately.
  const [embedSrc, setEmbedSrc] = useState<string | null>(null)
  const tiktokPaused = short.source === 'tiktok' && paused
  useEffect(() => {
    if (isActive && isExternal && !tiktokPaused) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEmbedSrc(buildEmbedSrc())
    } else {
       
      setEmbedSrc(null)
      if (!isActive) setPaused(false)
    }
  }, [isActive, isExternal, tiktokPaused, buildEmbedSrc])

  const embedStarted = !!embedSrc

  // Nudge the freshly loaded player: browsers may downgrade unmuted autoplay,
  // so re-issue play/unmute a few times while the player boots.
  const kickstartEmbed = useCallback(() => {
    if (short.source !== 'youtube') return
    for (const delay of [250, 800, 1600]) {
      setTimeout(() => {
        if (!iframeRef.current) return
        sendYtCommand('playVideo')
        if (mutedRef.current) {
          sendYtCommand('mute')
        } else {
          sendYtCommand('unMute')
          sendYtCommand('setVolume', [100])
        }
      }, delay)
    }
  }, [short.source, sendYtCommand])

  // Progress bar is only meaningful for natively-hosted video files (our own
  // uploads, or downloads re-hosted from an external platform like Instagram)
  // where we can read duration — not for iframe embeds (YouTube/TikTok).
  const isNativeVideo = short.source === 'upload' || short.source === 'instagram'
  const showProgressBar = isNativeVideo && !!short.videoUrl

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* Video / Embed */}
      {isNativeVideo && short.videoUrl ? (
        <video
          ref={videoRef}
          poster={short.thumbnailUrl || undefined}
          className="absolute inset-0 h-full w-full object-cover"
          loop
          muted={muted}
          playsInline
          autoPlay={isActive}
          preload={isActive ? 'auto' : 'metadata'}
          onClick={handleVideoAreaTap}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={onLoadedMetadata}
        >
          {videoMime ? <source src={short.videoUrl} type={videoMime} /> : null}
          <source src={short.videoUrl} />
        </video>
      ) : (short.source === 'youtube' || short.source === 'tiktok') && short.videoUrl ? (
        <div
          ref={iframeContainerRef}
          className="absolute inset-0 overflow-hidden bg-black"
        >
          {/* Thumbnail stays behind the iframe while the player boots. */}
          {short.thumbnailUrl ? (
            <img
              src={short.thumbnailUrl}
              alt={short.title}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-violet-900/50 to-cyan-900/50" />
          )}
          {embedStarted && (
            /* Oversized on purpose: the extra height pushes the embed's title
               bar and watermark outside the visible area; pointer-events-none
               prevents hover from summoning the player chrome. */
            <iframe
              ref={iframeRef}
              src={embedSrc as string}
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ width: '100%', height: 'calc(100% + 140px)', border: 0 }}
              allow="autoplay; encrypted-media; picture-in-picture"
              title={short.title}
              onLoad={kickstartEmbed}
            />
          )}
          {/* Our own tap layer: single tap = pause/play, double tap = like. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleVideoAreaTap()
            }}
            className="absolute inset-0 z-10"
            aria-label={short.title}
          />
        </div>
      ) : (
        <div className="flex h-full items-center justify-center p-8 text-center text-white/60">
          <p>{t('misc.error')}</p>
        </div>
      )}

      {/* Double-tap big heart (TikTok-style) */}
      <AnimatePresence>
        {bigHeart && (
          <motion.div
            key={bigHeart.key}
            className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
            initial={{ opacity: 0, scale: bigHeart.burst ? 0.4 : 0.2 }}
            animate={{
              opacity: [0, 1, 1, 0],
              scale: bigHeart.burst ? [0.4, 1.4, 1.2, 1.6] : [0.2, 1.1, 1, 1.2],
              rotate: bigHeart.burst ? [0, -10, 10, 0] : 0,
            }}
            transition={{ duration: bigHeart.burst ? 0.9 : 0.7, ease: 'easeOut' }}
          >
            <Heart className="h-28 w-28 fill-rose-500 text-rose-500 drop-shadow-[0_4px_20px_rgba(244,63,94,0.6)]" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pause indicator */}
      {paused && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-black/50 p-5 backdrop-blur">
            <Play className="h-10 w-10 fill-white text-white" />
          </div>
        </div>
      )}

      {/* Mute toggle (top-right). Sits below the feed's own persistent header
          (back/wallet/upload buttons, z-30) — top-4 used to place these right
          underneath that header's icons, so on real phones (and worse, with a
          safe-area-inset-top notch) the header's buttons physically covered
          this spot and silently ate every tap meant for mute/three-dot. */}
      <div className="absolute right-[max(1rem,env(safe-area-inset-right,1rem))] top-[max(4.5rem,calc(env(safe-area-inset-top)+4.5rem))] z-20 flex touch-manipulation items-center gap-2">
        {isMine && (onEdit || onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60 active:scale-95"
                title={t('chat.more')}
                aria-label={t('chat.more')}
              >
                <MoreVertical className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {onEdit && (
                <DropdownMenuItem
                  onClick={() => onEdit(short)}
                  onSelect={(e) => e.preventDefault()}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  {t('shorts.edit')}
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(short)}
                  className="text-destructive focus:text-destructive"
                  onSelect={(e) => e.preventDefault()}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('shorts.delete')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleMute()
          }}
          className={cn(
            'flex h-10 w-10 touch-manipulation items-center justify-center rounded-full text-white backdrop-blur transition active:scale-95 hover:bg-black/60',
            muted ? 'bg-black/60 ring-2 ring-white/30' : 'bg-black/40',
          )}
          title={muted ? t('shorts.tapToUnmute') : t('shorts.tapToMute')}
          aria-label={muted ? t('shorts.tapToUnmute') : t('shorts.tapToMute')}
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
      </div>

      {/* Prominent unmute hint (TikTok-style) — only after the embed has
          actually started; before that the poster's Play button is the
          primary call to action. */}
      {muted && isActive && (!isExternal || embedStarted) && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleMute()
          }}
          className="absolute bottom-[max(9rem,calc(env(safe-area-inset-bottom)+9rem))] left-1/2 z-30 flex -translate-x-1/2 touch-manipulation items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-sm font-medium text-white backdrop-blur-md transition active:scale-95 hover:bg-black/70"
        >
          <VolumeX className="h-4 w-4" />
          {t('shorts.tapToUnmute')}
        </button>
      )}

      {/* Source badge — intentionally omitted. The origin platform
          (YouTube/TikTok) is kept in the DB `source` field for admin
          diagnostics, but never surfaced to viewers so they can't tell
          where a short was imported from. Native uploads are simply
          Aurora content; imported embeds blend in identically. */}

      {/* Gradient overlay (bottom) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

      {/* Right action rail */}
      <div className="absolute bottom-[max(6rem,calc(env(safe-area-inset-bottom)+6rem))] right-3 z-20 flex flex-col items-center gap-4">
        {/* Avatar with follow button */}
        <div className="relative mb-1">
          <Avatar
            name={short.creator.name}
            color={short.creator.avatarColor}
            size="md"
            className="ring-2 ring-white"
          />
          {!isMine && !isFollowing && (
            <button
              type="button"
              onClick={handleFollow}
              disabled={followLoading}
              className="absolute -bottom-2 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 text-white shadow-md disabled:opacity-60"
              title={t('shorts.follow')}
            >
              <span className="text-base leading-none">+</span>
            </button>
          )}
        </div>

        {/* Like */}
        <div className="relative flex flex-col items-center gap-1">
          <button
            onClick={() => handleLike()}
            className="flex flex-col items-center gap-1 text-white transition active:scale-90"
          >
            <div className={cn(
              'flex h-12 w-12 items-center justify-center rounded-full bg-black/30 backdrop-blur transition',
              isLiked && 'bg-rose-500/30',
            )}>
              <motion.span
                animate={isLiked ? { scale: [1, 1.3, 1] } : { scale: 1 }}
                transition={{ duration: 0.25 }}
                className="inline-flex"
              >
                <Heart
                  className={cn('h-6 w-6', isLiked && 'fill-rose-500 text-rose-500')}
                />
              </motion.span>
            </div>
            <span className="text-xs font-semibold">{formatCount(likesCount)}</span>
          </button>
          {/* Floating hearts rising from the like button */}
          <AnimatePresence>
            {floatingHearts.map((h) => (
              <motion.div
                key={h.id}
                className="pointer-events-none absolute bottom-12 left-1/2 z-30 -translate-x-1/2"
                initial={{ opacity: 1, y: 0, x: 0, scale: 0.5, rotate: 0 }}
                animate={{ opacity: 0, y: -90, x: h.x, scale: 1.2, rotate: h.rotate }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              >
                <Heart className="h-6 w-6 fill-rose-500 text-rose-500 drop-shadow" />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Comments */}
        <button
          onClick={onOpenComments}
          className="flex flex-col items-center gap-1 text-white transition active:scale-90"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/30 backdrop-blur">
            <MessageCircle className="h-6 w-6" />
          </div>
          <span className="text-xs font-semibold">{formatCount(short.comments)}</span>
        </button>

        {onDuet && (
          <button
            type="button"
            onClick={() => onDuet(short, 'duet')}
            className="flex flex-col items-center gap-1 text-white transition active:scale-90"
            title={t('shorts.duet')}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/30 backdrop-blur">
              <SplitSquareHorizontal className="h-6 w-6" />
            </div>
            <span className="text-xs font-semibold">{t('shorts.duet')}</span>
          </button>
        )}
        {onDuet && (
          <button
            type="button"
            onClick={() => onDuet(short, 'challenge')}
            className="flex flex-col items-center gap-1 text-white transition active:scale-90"
            title={t('shorts.challenge')}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/30 backdrop-blur">
              <Swords className="h-6 w-6" />
            </div>
            <span className="text-xs font-semibold">{t('shorts.challenge')}</span>
          </button>
        )}

        {/* Share */}
        <button
          onClick={handleShare}
          className="flex flex-col items-center gap-1 text-white transition active:scale-90"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/30 backdrop-blur">
            <Share2 className="h-6 w-6" />
          </div>
          <span className="text-xs font-semibold">{t('shorts.share')}</span>
        </button>

        {/* Spinning music disc */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
          className="mt-1 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/30 bg-gradient-to-br from-violet-500 to-cyan-400"
        >
          <Music2 className="h-4 w-4 text-white" />
        </motion.div>
      </div>

      {/* Bottom-left info */}
      <div className="absolute bottom-[max(6rem,calc(env(safe-area-inset-bottom)+6rem))] left-4 right-20 z-20 text-white">
        {short.parentShort && (
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-black/40 px-2 py-1.5 backdrop-blur">
            {short.parentShort.thumbnailUrl ? (
              <img src={short.parentShort.thumbnailUrl} alt="" className="h-10 w-8 rounded object-cover" />
            ) : (
              <div className="flex h-10 w-8 items-center justify-center rounded bg-white/10">
                <SplitSquareHorizontal className="h-4 w-4" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-white/70">
                {short.duetMode === 'duet'
                  ? t('shorts.duetOf')
                  : short.duetMode === 'challenge'
                    ? t('shorts.challengeOf')
                    : t('shorts.replyOf')}
              </p>
              <p className="truncate text-xs font-medium">
                {short.challengeTitle || short.parentShort.title}
                {short.parentShort.creator ? ` · @${short.parentShort.creator.username}` : ''}
              </p>
            </div>
          </div>
        )}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold">@{short.creator.username}</span>
          {!isMine && (
            <Button
              size="sm"
              variant="outline"
              disabled={followLoading || isFollowing}
              onClick={handleFollow}
              className={cn(
                'h-7 border-white/30 px-3 text-xs text-white backdrop-blur',
                isFollowing
                  ? 'bg-white/5 text-white/70'
                  : 'bg-white/10 hover:bg-white/20',
              )}
            >
              {followLoading
                ? '…'
                : isFollowing
                  ? t('shorts.following')
                  : t('shorts.follow')}
            </Button>
          )}
          {!isMine && (
            <Button
              size="sm"
              variant="outline"
              disabled={subscribeLoading}
              onClick={handleSubscribe}
              className={cn(
                'h-7 border-white/30 px-3 text-xs backdrop-blur transition',
                isSubscribed
                  ? 'bg-white/5 text-white/70'
                  : 'bg-gradient-to-r from-violet-500 to-cyan-400 text-white hover:from-violet-400 hover:to-cyan-300',
              )}
            >
              {subscribeLoading
                ? '…'
                : isSubscribed
                  ? t('shorts.subscribed')
                  : t('shorts.subscribe')}
            </Button>
          )}
          {!isMine && creatorHasTiers && onOpenPremium && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onOpenPremium(short.creator.id)}
              className="h-7 border-amber-400/40 bg-gradient-to-r from-amber-500 to-violet-500 px-3 text-xs text-white backdrop-blur transition hover:from-amber-400 hover:to-violet-400"
            >
              <Crown className="mr-1 h-3 w-3" />
              {t('premium.support')}
            </Button>
          )}
        </div>
        <h3 className="mb-1 text-sm font-semibold leading-snug">{short.title}</h3>
        {(() => {
          const safeDesc = sanitizeViewerDescription(short.description)
          return safeDesc ? (
            <p className="mb-2 line-clamp-2 text-xs text-white/80">{safeDesc}</p>
          ) : null
        })()}
        {short.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {short.tags.slice(0, 5).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center gap-3 text-[11px] text-white/60">
          <span>{formatCount(short.views + viewDelta)} {t('shorts.views')}</span>
          <span>·</span>
          <span>{new Date(short.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
        </div>
      </div>

      {/* Playback progress bar (native uploads only) */}
      {showProgressBar && (
        <div
          className="absolute bottom-0 left-0 right-0 z-20 h-1.5 cursor-pointer bg-white/20"
          onClick={handleSeek}
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-white/90 transition-[width] duration-75 ease-linear"
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>
      )}
    </div>
  )
}
