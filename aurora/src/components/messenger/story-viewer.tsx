'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Trash2, Eye, Share2, Heart } from 'lucide-react'
import { Avatar } from './avatar'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/hooks/use-i18n'
import { resolveMediaUrl } from '@/lib/media-url'
import { STORY_SLIDE_MS, type StoryFeedUser } from '@/lib/stories'
import { buildStorySharePayload } from '@/lib/share-payload'
import { useAppStore } from '@/lib/store'
import { StoryViewersPanel } from './story-viewers-panel'
import { cn } from '@/lib/utils'

interface StoryViewerProps {
  feed: StoryFeedUser[]
  initialUserIndex?: number
  onClose: () => void
  onRefresh?: () => void
}

export function StoryViewer({
  feed,
  initialUserIndex = 0,
  onClose,
  onRefresh,
}: StoryViewerProps) {
  const { t } = useI18n()
  const { openShareToChat } = useAppStore()
  const [userIndex, setUserIndex] = useState(initialUserIndex)
  const [storyIndex, setStoryIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [views, setViews] = useState<number | null>(null)
  const [likes, setLikes] = useState(0)
  const [isLiked, setIsLiked] = useState(false)
  const [likeBusy, setLikeBusy] = useState(false)
  const [showViewers, setShowViewers] = useState(false)
  const [, setNowTick] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const viewedRef = useRef<Set<string>>(new Set())

  const currentUser = feed[userIndex]
  const currentStory = currentUser?.stories[storyIndex]

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('aurora:overlay', { detail: { open: true, kind: 'story' } }))
    return () => {
      window.dispatchEvent(new CustomEvent('aurora:overlay', { detail: { open: false, kind: 'story' } }))
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const remainingText = (() => {
    if (!currentStory?.expiresAt) return null
    const ms = new Date(currentStory.expiresAt).getTime() - Date.now()
    if (ms <= 0) return t('stories.expired')
    const totalMin = Math.max(1, Math.ceil(ms / 60000))
    if (totalMin >= 60) {
      const h = Math.floor(totalMin / 60)
      const m = totalMin % 60
      return `${t('stories.timeLeft')} ${h}ч ${m}м`
    }
    return `${t('stories.timeLeft')} ${totalMin}м`
  })()

  const markViewed = useCallback(async (storyId: string) => {
    if (viewedRef.current.has(storyId)) return
    viewedRef.current.add(storyId)
    try {
      const res = await fetch(`/api/stories/${storyId}/view`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setViews(data.views ?? null)
        if (typeof data.likes === 'number') setLikes(data.likes)
        if (typeof data.isLiked === 'boolean') setIsLiked(data.isLiked)
      }
    } catch {
      // ignore
    }
  }, [])

  const toggleLike = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!currentStory || currentUser?.isSelf || likeBusy) return
    setLikeBusy(true)
    const prevLiked = isLiked
    const prevLikes = likes
    setIsLiked(!prevLiked)
    setLikes(Math.max(0, prevLiked ? prevLikes - 1 : prevLikes + 1))
    try {
      const res = await fetch(`/api/stories/${currentStory.id}/like`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setIsLiked(prevLiked)
        setLikes(prevLikes)
        return
      }
      if (typeof data.likes === 'number') setLikes(data.likes)
      if (typeof data.isLiked === 'boolean') setIsLiked(data.isLiked)
    } catch {
      setIsLiked(prevLiked)
      setLikes(prevLikes)
    } finally {
      setLikeBusy(false)
    }
  }

  const goNext = useCallback(() => {
    if (!currentUser) return
    if (storyIndex < currentUser.stories.length - 1) {
      setStoryIndex((i) => i + 1)
      setProgress(0)
      return
    }
    if (userIndex < feed.length - 1) {
      setUserIndex((i) => i + 1)
      setStoryIndex(0)
      setProgress(0)
      return
    }
    onClose()
  }, [currentUser, storyIndex, userIndex, feed.length, onClose])

  const goPrev = useCallback(() => {
    if (storyIndex > 0) {
      setStoryIndex((i) => i - 1)
      setProgress(0)
      return
    }
    if (userIndex > 0) {
      const prevUser = feed[userIndex - 1]
      setUserIndex((i) => i - 1)
      setStoryIndex(Math.max(0, prevUser.stories.length - 1))
      setProgress(0)
    }
  }, [storyIndex, userIndex, feed])

  useEffect(() => {
    if (!currentStory) return
    setViews(currentStory.views)
    setLikes((currentStory as { likes?: number }).likes ?? 0)
    setIsLiked(Boolean((currentStory as { liked?: boolean }).liked))
    setShowViewers(false)
    void markViewed(currentStory.id)
  }, [currentStory, markViewed])

  useEffect(() => {
    if (!currentStory || paused || showViewers) return
    const duration = currentStory.type === 'video' ? STORY_SLIDE_MS * 2 : STORY_SLIDE_MS
    const step = 50
    timerRef.current = setInterval(() => {
      setProgress((p) => {
        const next = p + (step / duration) * 100
        if (next >= 100) {
          goNext()
          return 0
        }
        return next
      })
    }, step)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [currentStory, paused, showViewers, goNext])

  const handleDelete = async () => {
    if (!currentStory || !currentUser?.isSelf) return
    try {
      const res = await fetch(`/api/stories/${currentStory.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      onRefresh?.()
      if (currentUser.stories.length <= 1) {
        onClose()
        return
      }
      if (storyIndex >= currentUser.stories.length - 1) {
        setStoryIndex((i) => Math.max(0, i - 1))
      }
      setProgress(0)
    } catch {
      // ignore
    }
  }

  if (!currentUser || !currentStory) return null

  const mediaSrc = resolveMediaUrl(currentStory.mediaUrl)

  const viewer = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[400] flex flex-col bg-black"
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
      >
        <div className="absolute left-0 right-0 top-0 z-20 flex gap-1 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
          {currentUser.stories.map((s, i) => (
            <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
              <div
                className="h-full rounded-full bg-white transition-all duration-75"
                style={{
                  width: i < storyIndex ? '100%' : i === storyIndex ? `${progress}%` : '0%',
                }}
              />
            </div>
          ))}
        </div>

        <div className="absolute left-0 right-0 top-[max(2rem,calc(env(safe-area-inset-top)+1.25rem))] z-20 flex items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <Avatar
              name={currentUser.name}
              color={currentUser.avatarColor}
              imageUrl={currentUser.avatarUrl}
              size="sm"
            />
            <div>
              <p className="text-sm font-semibold text-white">{currentUser.name}</p>
              <p className="text-[10px] text-white/70">
                {new Date(currentStory.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {remainingText && (
                  <span className="ml-1.5 text-white/50">· {remainingText}</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {currentUser.isSelf && views != null && (
              <button
                type="button"
                className="mr-1 flex items-center gap-1 rounded-full px-2 py-1 text-xs text-white/90 transition hover:bg-white/10"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowViewers(true)
                  setPaused(true)
                }}
                title={t('stories.tapViewers')}
              >
                <Eye className="h-3.5 w-3.5" />
                {views}
                {likes > 0 && (
                  <>
                    <Heart className="ml-1 h-3.5 w-3.5 fill-rose-400 text-rose-400" />
                    {likes}
                  </>
                )}
              </button>
            )}
            {currentUser.isSelf && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/10"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/10"
              onClick={(e) => {
                e.stopPropagation()
                openShareToChat(
                  buildStorySharePayload(currentStory, {
                    id: currentUser.id,
                    name: currentUser.name,
                    username: currentUser.username,
                  }),
                )
              }}
              title={t('share.title')}
            >
              <Share2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/10"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <button
          type="button"
          className="absolute left-0 top-0 z-10 h-full w-1/3"
          onClick={goPrev}
          aria-label={t('stories.prev')}
        />
        <button
          type="button"
          className="absolute right-0 top-0 z-10 h-full w-1/3"
          onClick={goNext}
          aria-label={t('stories.next')}
        />

        <div className="flex flex-1 items-center justify-center px-0 py-0 sm:px-4 sm:py-6">
          {currentStory.type === 'text' ? (
            <div
              className="flex h-full max-h-[100vh] w-full max-w-full aspect-[9/16] items-center justify-center px-8 sm:max-h-[85vh]"
              style={{
                background:
                  currentStory.backgroundColor ||
                  'linear-gradient(135deg, #7c3aed, #06b6d4)',
              }}
            >
              <p className="max-w-lg text-center text-2xl font-semibold leading-snug text-white">
                {currentStory.content}
              </p>
            </div>
          ) : (
            <div className="relative aspect-[9/16] h-full max-h-[100vh] w-auto max-w-full overflow-hidden rounded-none bg-black shadow-2xl sm:max-h-[85vh] sm:rounded-xl">
              {currentStory.type === 'video' ? (
                <video
                  key={`bg-${currentStory.id}`}
                  src={mediaSrc}
                  className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
                  muted
                  playsInline
                  aria-hidden
                />
              ) : (
                <img
                  key={`bg-${currentStory.id}`}
                  src={mediaSrc}
                  alt=""
                  className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
                  aria-hidden
                />
              )}
              {currentStory.type === 'video' ? (
                <video
                  key={currentStory.id}
                  src={mediaSrc}
                  className="relative h-full w-full object-contain"
                  autoPlay
                  playsInline
                  muted
                />
              ) : (
                <img
                  key={currentStory.id}
                  src={mediaSrc}
                  alt=""
                  className="relative h-full w-full object-contain"
                />
              )}
            </div>
          )}
        </div>

        {!currentUser.isSelf && !showViewers && (
          <div
            className="absolute bottom-0 left-0 right-0 z-20 flex justify-center bg-gradient-to-t from-black/80 to-transparent px-4 pb-[max(2rem,calc(env(safe-area-inset-bottom)+2rem))] pt-12"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={toggleLike}
              disabled={likeBusy}
              className={cn(
                'flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white backdrop-blur transition active:scale-95',
                isLiked ? 'bg-rose-500/40' : 'bg-white/15 hover:bg-white/25',
              )}
            >
              <Heart className={cn('h-5 w-5', isLiked && 'fill-rose-400 text-rose-400')} />
              {isLiked ? t('stories.liked') : t('stories.like')}
              {likes > 0 && <span className="text-white/80">{likes}</span>}
            </button>
          </div>
        )}

        {currentStory.content && currentStory.type !== 'text' && !showViewers && currentUser.isSelf && (
          <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 to-transparent px-[max(1rem,env(safe-area-inset-right,1rem))] pb-[max(2rem,calc(env(safe-area-inset-bottom)+2rem))] pt-12">
            <p className="text-center text-sm text-white">{currentStory.content}</p>
          </div>
        )}

        {currentUser.isSelf && (
          <StoryViewersPanel
            storyId={currentStory.id}
            open={showViewers}
            onClose={() => {
              setShowViewers(false)
              setPaused(false)
            }}
          />
        )}

        {showViewers && (
          <button
            type="button"
            className="absolute inset-0 z-20 bg-black/40"
            aria-label={t('misc.close')}
            onClick={() => {
              setShowViewers(false)
              setPaused(false)
            }}
          />
        )}
      </motion.div>
    </AnimatePresence>
  )

  if (typeof document === 'undefined') return viewer
  return createPortal(viewer, document.body)
}
