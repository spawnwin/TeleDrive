'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, Wallet, X, ChevronUp, ChevronLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/hooks/use-i18n'
import { ShortCard, type ShortData } from './short-card'
import { AdCard } from './ad-card'
import { UploadShortDialog } from './upload-short-dialog'
import { EditShortDialog } from './edit-short-dialog'
import { CreatorPremiumDialog } from './creator-premium-dialog'
import { CommentsDialog } from './comments-dialog'
import { EarningsDialog } from './earnings-dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useAppStore } from '@/lib/store'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type FeedItem =
  | { type: 'short'; data: ShortData; key: string }
  | { type: 'ad'; data: any; key: string; creatorId?: string }

type Segment = 'foryou' | 'subscriptions'

const SHORTS_SEGMENT_KEY = 'aurora.shorts.segment'

function loadSegmentPreference(): Segment {
  if (typeof window === 'undefined') return 'foryou'
  try {
    const v = window.localStorage.getItem(SHORTS_SEGMENT_KEY)
    return v === 'subscriptions' ? 'subscriptions' : 'foryou'
  } catch {
    return 'foryou'
  }
}

function saveSegmentPreference(segment: Segment) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SHORTS_SEGMENT_KEY, segment)
  } catch {
    // ignore
  }
}

interface ShortsFeedProps {
  onBack: () => void
}

export function ShortsFeed({ onBack }: ShortsFeedProps) {
  const { t } = useI18n()
  const { currentUser, pendingShortId, setPendingShortId, setProfileUserId, setSubscribedCreatorIds, shortsSegment, setShortsSegment } = useAppStore()
  const [items, setItems] = useState<FeedItem[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [duetParent, setDuetParent] = useState<ShortData | null>(null)
  const [duetMode, setDuetMode] = useState<'reply' | 'duet' | 'challenge' | null>(null)
  const [showEarnings, setShowEarnings] = useState(false)
  const [commentsFor, setCommentsFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSwipeProfileHint, setShowSwipeProfileHint] = useState(false)
  const [editingShort, setEditingShort] = useState<ShortData | null>(null)
  const [deletingShort, setDeletingShort] = useState<ShortData | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [premiumCreatorId, setPremiumCreatorId] = useState<string | null>(null)
  const cursorRef = useRef<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [itemHeight, setItemHeight] = useState<number | null>(null)
  const trackedViewsRef = useRef<Set<string>>(new Set())
  const trackedAdsRef = useRef<Set<string>>(new Set())
  const [audioUnlocked, setAudioUnlocked] = useState(false)

  // Hydrate persisted segment preference once on mount (store default is 'foryou').
  const didHydrateSegmentRef = useRef(false)
  useEffect(() => {
    if (didHydrateSegmentRef.current) return
    didHydrateSegmentRef.current = true
    const persisted = loadSegmentPreference()
    if (persisted !== shortsSegment) setShortsSegment(persisted)
  }, [])

  // Hydrate subscription set once on mount so cards render correct subscribe state.
  useEffect(() => {
    if (!currentUser) return
    let cancelled = false
    fetch('/api/shorts/subscriptions')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data.creatorIds)) return
        setSubscribedCreatorIds(data.creatorIds)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [currentUser, setSubscribedCreatorIds])

  // Show the swipe-left → profile hint briefly on first interaction.
  useEffect(() => {
    if (typeof window === 'undefined') return
    let dismissed = false
    try {
      dismissed = window.localStorage.getItem('aurora.shorts.swipeHintDismissed') === '1'
    } catch {
      dismissed = false
    }
    if (dismissed) return
    const t1 = setTimeout(() => setShowSwipeProfileHint(true), 1200)
    const t2 = setTimeout(() => setShowSwipeProfileHint(false), 6000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  const dismissSwipeHint = useCallback(() => {
    setShowSwipeProfileHint(false)
    try {
      window.localStorage.setItem('aurora.shorts.swipeHintDismissed', '1')
    } catch {
      // ignore
    }
  }, [])

  // Swipe-left → open the active short's author profile.
  // Passive touch detection on the item wrapper: doesn't intercept clicks or
  // vertical scroll, only triggers on a clearly horizontal leftward swipe.
  const swipeStartRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const openAuthorProfile = useCallback(
    (creatorId: string) => {
      if (!creatorId) return
      setProfileUserId(creatorId)
      dismissSwipeHint()
    },
    [setProfileUserId, dismissSwipeHint],
  )

  const onItemTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    if (!touch) return
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY, t: Date.now() }
  }

  const onItemTouchEnd = (e: React.TouchEvent, creatorId: string) => {
    const start = swipeStartRef.current
    swipeStartRef.current = null
    if (!start) return
    const touch = e.changedTouches[0]
    if (!touch) return
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    const dt = Date.now() - start.t
    // Leftward swipe: negative dx, dominant horizontal, fast enough.
    if (
      dx < -60 &&
      Math.abs(dx) > Math.abs(dy) * 2 &&
      dt < 700
    ) {
      openAuthorProfile(creatorId)
    }
  }

  // Opening Shorts is a user gesture; also unlock on first tap/scroll in feed.
  useEffect(() => {
    setAudioUnlocked(true)
  }, [])

  const unlockAudio = useCallback(() => {
    setAudioUnlocked(true)
  }, [])

  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])

  const segmentRef = useRef(shortsSegment)
  useEffect(() => {
    segmentRef.current = shortsSegment
  }, [shortsSegment])

  const loadFeed = useCallback(async (reset = false) => {
    if (reset) {
      setLoading(true)
      setItems([])
      setActiveIndex(0)
      cursorRef.current = null
      trackedViewsRef.current = new Set()
      trackedAdsRef.current = new Set()
    } else {
      setLoadingMore(true)
    }
    setError(null)
    try {
      const cursor = cursorRef.current
      const segment = segmentRef.current
      const url = `/api/shorts/feed?take=12${cursor ? `&cursor=${cursor}` : ''}&segment=${segment}`
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || tRef.current('misc.error'))

      const newItems: FeedItem[] = data.items.map((it: any) => ({
        type: it.type,
        data: it.data,
        key: `${it.type}-${it.data.id}-${Math.random().toString(36).slice(2, 6)}`,
        ...(it.type === 'ad' ? { creatorId: it.creatorId } : {}),
      }))

      setItems((prev) => (reset ? newItems : [...prev, ...newItems]))
      cursorRef.current = data.nextCursor
    } catch (err) {
      setError(err instanceof Error ? err.message : tRef.current('misc.error'))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    loadFeed(true)
  }, [loadFeed, shortsSegment])

  // Measure scroll container height for reliable snap items on mobile Safari.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const h = el.clientHeight
      if (h > 0) setItemHeight(h)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('orientationchange', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('orientationchange', update)
    }
  }, [loading, items.length])

  // Open shared short when navigated from chat share card
  useEffect(() => {
    if (!pendingShortId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/shorts/${pendingShortId}`)
        const data = await res.json()
        if (cancelled || !data?.short) return
        const shortItem: FeedItem = {
          type: 'short',
          data: data.short,
          key: `shared-short-${data.short.id}`,
        }
        setItems((prev) => {
          const idx = prev.findIndex(
            (it) => it.type === 'short' && it.data.id === data.short.id,
          )
          if (idx >= 0) {
            setActiveIndex(idx)
            return prev
          }
          setActiveIndex(0)
          return [shortItem, ...prev]
        })
      } catch {
        // ignore
      } finally {
        if (!cancelled) setPendingShortId(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pendingShortId, setPendingShortId])

  // Pre-load more when close to the end
  const isLoadingMoreRef = useRef(false)
  useEffect(() => {
    if (items.length === 0) return
    if (activeIndex >= items.length - 3 && cursorRef.current && !loadingMore && !isLoadingMoreRef.current) {
      isLoadingMoreRef.current = true
      loadFeed(false).finally(() => {
        isLoadingMoreRef.current = false
      })
    }
  }, [activeIndex, items.length, loadingMore, loadFeed])

  // Wheel/scroll handling: snap between items.
  // Use refs for activeIndex/items.length so the scroll listener doesn't need
  // to be re-registered on every change.
  const activeIndexRef = useRef(activeIndex)
  const itemsLengthRef = useRef(items.length)
  useEffect(() => {
    activeIndexRef.current = activeIndex
  }, [activeIndex])
  useEffect(() => {
    itemsLengthRef.current = items.length
  }, [items.length])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let isScrolling = false
    let scrollTimeout: ReturnType<typeof setTimeout>

    const onScroll = () => {
      if (isScrolling) return
      isScrolling = true
      clearTimeout(scrollTimeout)
      scrollTimeout = setTimeout(() => {
        isScrolling = false
        if (!el || el.clientHeight === 0) return
        const idx = Math.round(el.scrollTop / el.clientHeight)
        if (idx !== activeIndexRef.current && idx >= 0 && idx < itemsLengthRef.current) {
          setActiveIndex(idx)
        }
      }, 80)
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      clearTimeout(scrollTimeout)
    }
  }, [])

  const trackView = useCallback(
    async (shortId: string, creatorId: string) => {
      if (creatorId === currentUser?.id) return
      if (trackedViewsRef.current.has(shortId)) return
      trackedViewsRef.current.add(shortId)
      try {
        const res = await fetch(`/api/shorts/${shortId}/view`, { method: 'POST' })
        const data = await res.json()
        if (data.coins != null && currentUser) {
          useAppStore.getState().setCurrentUser({ ...currentUser, coins: data.coins })
        }
        if (data.coinsEarned > 0) {
          toast.success(`+${data.coinsEarned} ₽`, { duration: 2000 })
        }
        // Sync authoritative view count back into the feed item so the count
        // persists when the card remounts (e.g. after scrolling away and back).
        if (typeof data.views === 'number') {
          setItems((prev) =>
            prev.map((it) =>
              it.type === 'short' && it.data.id === shortId
                ? { ...it, data: { ...it.data, views: data.views as number } }
                : it,
            ),
          )
        }
      } catch {}
    },
    [currentUser],
  )

  // Feed-level counter sync: invoked by ShortCard after a like API round-trip.
  const handleLikeSync = useCallback((shortId: string, newLikes: number, isLiked: boolean) => {
    setItems((prev) =>
      prev.map((it) =>
        it.type === 'short' && it.data.id === shortId
          ? { ...it, data: { ...it.data, likes: newLikes, isLiked } }
          : it,
      ),
    )
  }, [])

  // Feed-level counter sync: invoked by CommentsDialog when a comment is posted.
  const handleCommented = useCallback((shortId: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.type === 'short' && it.data.id === shortId
          ? { ...it, data: { ...it.data, comments: it.data.comments + 1 } }
          : it,
      ),
    )
  }, [])

  // Edit dialog save: replace the feed item with the updated short.
  const handleEditSaved = useCallback((updated: ShortData) => {
    setItems((prev) =>
      prev.map((it) =>
        it.type === 'short' && it.data.id === updated.id
          ? { ...it, data: updated }
          : it,
      ),
    )
  }, [])

  // Delete confirm flow.
  const handleDelete = useCallback(async () => {
    if (!deletingShort) return
    const target = deletingShort
    setDeleting(true)
    try {
      const res = await fetch(`/api/shorts/${target.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || tRef.current('misc.error'))
      setItems((prev) => prev.filter((it) => !(it.type === 'short' && it.data.id === target.id)))
      toast.success(tRef.current('shorts.deleteSuccess'))
      setDeletingShort(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tRef.current('misc.error'))
    } finally {
      setDeleting(false)
    }
  }, [deletingShort])

  const trackAdImpression = useCallback(
    async (adId: string, creatorId?: string) => {
      if (trackedAdsRef.current.has(adId)) return
      trackedAdsRef.current.add(adId)
      try {
        await fetch('/api/ads/impression', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adId, creatorId }),
        })
      } catch {}
    },
    [],
  )

  const trackAdClick = useCallback(async (adId: string) => {
    try {
      await fetch(`/api/ads/${adId}/click`, { method: 'POST' })
    } catch {}
  }, [])

  // Find the previous short's creator for ad share attribution
  const getCreatorForAd = (adIndex: number): string | undefined => {
    // Look back for the most recent short
    for (let i = adIndex - 1; i >= 0; i--) {
      if (items[i].type === 'short') {
        return (items[i].data as ShortData).creator.id
      }
    }
    return undefined
  }

  const feedHeightClass = 'h-full min-h-0 flex-1'

  return (
    <div className={cn('relative flex w-full flex-col bg-black', feedHeightClass)}>
      {/* Top bar. On phones with a safe-area inset (notch/status bar), this
          bar's box grows tall enough to overlap ShortCard's top-right
          mute/three-dot buttons (z-20) underneath — its gradient background
          is only *visually* transparent, so without pointer-events-none the
          empty space here silently swallows taps meant for those buttons. */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-30 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-4 pr-[max(1rem,env(safe-area-inset-right,1rem))] pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <Button
          variant="ghost"
          size="icon"
          className="pointer-events-auto h-9 w-9 rounded-full bg-black/30 text-white backdrop-blur hover:bg-black/50"
          onClick={onBack}
        >
          <X className="h-5 w-5" />
        </Button>
        <div className="flex flex-col items-center">
          <h1 className="text-base font-bold text-white">{t('shorts.title')}</h1>
          <p className="text-[10px] text-white/60">{t('shorts.subtitle')}</p>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full bg-black/30 text-white backdrop-blur hover:bg-black/50"
            onClick={() => setShowEarnings(true)}
            title={t('earnings.title')}
          >
            <Wallet className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 text-white shadow-md shadow-violet-500/30 transition hover:from-violet-400 hover:to-cyan-300 hover:shadow-lg hover:shadow-violet-500/40 sm:h-9 sm:w-auto sm:gap-1.5 sm:px-3.5"
            onClick={() => setShowUpload(true)}
            title={t('shorts.upload')}
          >
            <Upload className="h-4 w-4" />
            {/* Full label only where the header has room — on phone-width
                viewports this button must stay small so it doesn't extend
                into ShortCard's own top-right mute/three-dot buttons. */}
            <span className="hidden text-sm font-semibold sm:inline">{t('shorts.uploadShort')}</span>
          </Button>
        </div>
      </div>

      {/* Segmented feed tabs (Для вас / Подписки) */}
      <div className="absolute left-1/2 top-[max(3.25rem,calc(env(safe-area-inset-top)+3.25rem))] z-30 -translate-x-1/2">
        <div className="flex items-center gap-1 rounded-full bg-black/40 p-1 backdrop-blur-md">
          {(['foryou', 'subscriptions'] as const).map((seg) => (
            <button
              key={seg}
              type="button"
              onClick={() => {
                if (seg === shortsSegment) return
                setShortsSegment(seg)
                saveSegmentPreference(seg)
              }}
              className={cn(
                'relative rounded-full px-3 py-1 text-xs font-semibold transition',
                shortsSegment === seg
                  ? 'bg-gradient-to-r from-violet-500 to-cyan-400 text-white shadow'
                  : 'text-white/70 hover:text-white',
              )}
              aria-pressed={shortsSegment === seg}
            >
              {seg === 'foryou' ? t('shorts.tabForYou') : t('shorts.tabSubscriptions')}
            </button>
          ))}
        </div>
      </div>

      {/* Feed (vertical scroll-snap) */}
      <div
        ref={containerRef}
        className={cn(
          'w-full flex-1 snap-y snap-mandatory overflow-y-auto overscroll-y-contain scroll-smooth',
          feedHeightClass,
        )}
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        onPointerDown={unlockAudio}
      >
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-white">
            <p className="text-sm">{error}</p>
            <Button
              onClick={() => loadFeed(true)}
              size="sm"
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10"
            >
              {t('misc.back')}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center text-white">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500/30 to-cyan-400/30">
              <Upload className="h-10 w-10 text-white" />
            </div>
            <div>
              <p className="text-lg font-semibold">
                {shortsSegment === 'subscriptions'
                  ? t('shorts.subscriptionsEmpty')
                  : t('shorts.empty')}
              </p>
              <p className="mt-1 text-sm text-white/60">
                {shortsSegment === 'subscriptions'
                  ? t('shorts.subscriptionsEmptyHint')
                  : t('shorts.emptyHint')}
              </p>
            </div>
            {shortsSegment !== 'subscriptions' && (
              <Button
                onClick={() => setShowUpload(true)}
                className="bg-gradient-to-r from-violet-500 to-cyan-400 text-white"
              >
                <Upload className="mr-2 h-4 w-4" />
                {t('shorts.upload')}
              </Button>
            )}
            {shortsSegment === 'subscriptions' && (
              <Button
                onClick={() => setShortsSegment('foryou')}
                className="bg-gradient-to-r from-violet-500 to-cyan-400 text-white"
              >
                {t('shorts.tabForYou')}
              </Button>
            )}
          </div>
        ) : (
          <>
            {items.map((item, idx) => {
              const isShort = item.type === 'short'
              const creatorId = isShort ? (item.data as ShortData).creator.id : undefined
              return (
                <div
                  key={item.key}
                  className="relative flex w-full shrink-0 snap-start snap-always items-center justify-center bg-black"
                  style={
                    itemHeight
                      ? { height: itemHeight, minHeight: itemHeight }
                      : { height: '100%', minHeight: '100%' }
                  }
                  onTouchStart={isShort ? onItemTouchStart : undefined}
                  onTouchEnd={
                    isShort && creatorId
                      ? (e) => onItemTouchEnd(e, creatorId)
                      : undefined
                  }
                >
                {/* Uniform 9:16 frame: fills screen on mobile, capped centered column on desktop */}
                <div className="relative h-full w-full overflow-hidden bg-black sm:h-[88vh] sm:w-auto sm:max-w-[450px] sm:aspect-[9/16] sm:rounded-2xl sm:shadow-2xl sm:ring-1 sm:ring-white/10">
                  {item.type === 'short' ? (
                    <ShortCard
                      key={`short-${(item.data as ShortData).id}`}
                      short={item.data as ShortData}
                      isActive={idx === activeIndex}
                      audioUnlocked={audioUnlocked}
                      onAudioUnlock={unlockAudio}
                      onOpenComments={() => setCommentsFor((item.data as ShortData).id)}
                      onViewTrack={() => {
                        const s = item.data as ShortData
                        trackView(s.id, s.creator.id)
                      }}
                      onLike={(newLikes, isLiked) =>
                        handleLikeSync((item.data as ShortData).id, newLikes, isLiked)
                      }
                      onEdit={(s) => setEditingShort(s)}
                      onDelete={(s) => setDeletingShort(s)}
                      onOpenPremium={(creatorId) => setPremiumCreatorId(creatorId)}
                      onDuet={(short, mode) => {
                        setDuetParent(short)
                        setDuetMode(mode)
                        setShowUpload(true)
                      }}
                    />
                  ) : (
                    <AdCard
                      ad={item.data}
                      onTrackImpression={() =>
                        trackAdImpression(item.data.id, getCreatorForAd(idx))
                      }
                      onTrackClick={() => trackAdClick(item.data.id)}
                    />
                  )}
                </div>
              </div>
              )
            })}
            {loadingMore && (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-white/60" />
              </div>
            )}
            {!cursorRef.current && items.length > 0 && (
              <div className="flex h-32 items-center justify-center text-white/40">
                <p className="text-xs">· конец ленты ·</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Swipe-up hint (only when on first item) */}
      <AnimatePresence>
        {activeIndex === 0 && items.length > 1 && !loading && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1 text-white/70"
          >
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <ChevronUp className="h-5 w-5" />
            </motion.div>
            <span className="text-[10px]">{t('shorts.swipeUp')}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Swipe-left → author profile hint (dismissible, shown once) */}
      <AnimatePresence>
        {showSwipeProfileHint && !loading && items.length > 0 && (
          <motion.button
            type="button"
            onClick={dismissSwipeHint}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="absolute left-4 top-1/2 z-20 flex -translate-y-1/2 items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur-md"
          >
            <motion.span
              animate={{ x: [0, -6, 0] }}
              transition={{ duration: 1.4, repeat: Infinity }}
              className="inline-flex"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </motion.span>
            {t('shorts.swipeProfile')}
          </motion.button>
        )}
      </AnimatePresence>

      <UploadShortDialog
        open={showUpload}
        onOpenChange={(v) => {
          setShowUpload(v)
          if (!v) {
            setDuetParent(null)
            setDuetMode(null)
          }
        }}
        parentShort={duetParent}
        duetMode={duetMode}
        onPublished={() => {
          setDuetParent(null)
          setDuetMode(null)
          loadFeed(true)
        }}
      />
      <EarningsDialog
        open={showEarnings}
        onOpenChange={setShowEarnings}
      />
      <CommentsDialog
        open={!!commentsFor}
        onOpenChange={(v) => !v && setCommentsFor(null)}
        shortId={commentsFor}
        onCommented={handleCommented}
      />
      <EditShortDialog
        open={!!editingShort}
        short={editingShort}
        onOpenChange={(v) => !v && setEditingShort(null)}
        onSaved={handleEditSaved}
      />
      <AlertDialog
        open={!!deletingShort}
        onOpenChange={(v) => !v && !deleting && setDeletingShort(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('shorts.delete')}</AlertDialogTitle>
            <AlertDialogDescription>{t('shorts.deleteConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('misc.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('shorts.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <CreatorPremiumDialog
        open={!!premiumCreatorId}
        creatorId={premiumCreatorId}
        onOpenChange={(v) => !v && setPremiumCreatorId(null)}
      />
    </div>
  )
}
