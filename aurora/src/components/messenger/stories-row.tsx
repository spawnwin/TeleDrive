'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { Avatar } from './avatar'
import { StoryRing } from './story-ring'
import { useI18n } from '@/hooks/use-i18n'
import { cn } from '@/lib/utils'
import type { StoryFeedUser } from '@/lib/stories'

interface StoriesRowProps {
  feed: StoryFeedUser[]
  currentUser?: {
    id: string
    name: string
    avatarColor: string
    avatarUrl?: string | null
  } | null
  onAddStory: () => void
  onOpenViewer: (userIndex: number) => void
}

const COLLAPSED_HEIGHT = 96 // px, одна горизонтальная строка
const EXPANDED_HEIGHT = 264 // px, сетка с прокруткой

export function StoriesRow({ feed, currentUser, onAddStory, onOpenViewer }: StoriesRowProps) {
  const { t } = useI18n()
  const selfEntry = feed.find((u) => u.isSelf)
  const others = feed.filter((u) => !u.isSelf)
  const [expanded, setExpanded] = useState(false)
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const dragStartY = useRef<number | null>(null)
  const didDragRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const resetDrag = useCallback(() => {
    dragStartY.current = null
    setDragHeight(null)
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // только если тянем за верхнюю зону-ручку
    if ((e.target as HTMLElement).closest('[data-stories-handle]')) {
      dragStartY.current = e.clientY
      didDragRef.current = false
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (dragStartY.current === null) return
    const delta = e.clientY - dragStartY.current
    if (Math.abs(delta) > 4) didDragRef.current = true
    if (delta <= 0) {
      setDragHeight(null)
      return
    }
    const h = Math.min(EXPANDED_HEIGHT, Math.max(COLLAPSED_HEIGHT, COLLAPSED_HEIGHT + delta))
    setDragHeight(h)
  }, [])

  const onPointerUp = useCallback(() => {
    if (dragStartY.current === null) return
    const didDrag = didDragRef.current
    if (didDrag) {
      const h = dragHeight ?? COLLAPSED_HEIGHT
      setExpanded(h > (COLLAPSED_HEIGHT + EXPANDED_HEIGHT) / 2)
    } else {
      // Чистый тап. setPointerCapture на контейнере перехватывает target клика,
      // поэтому onClick ручки не срабатывает — обрабатываем тап здесь.
      setExpanded((v) => !v)
    }
    resetDrag()
  }, [dragHeight, resetDrag])

  useEffect(() => {
    if (!expanded) setDragHeight(null)
  }, [expanded])

  if (!currentUser) return null

  const height = dragHeight ?? (expanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT)

  const SelfButton = (
    <button
      type="button"
      onClick={() => {
        if (selfEntry && selfEntry.stories.length > 0) {
          onOpenViewer(feed.findIndex((u) => u.isSelf))
        } else {
          onAddStory()
        }
      }}
      className="flex w-16 shrink-0 flex-col items-center gap-1"
    >
      <div className="relative">
        <StoryRing
          hasStory={!!selfEntry?.stories.length}
          hasUnviewed={false}
          isSelf
          size="md"
          totalStories={selfEntry?.stories.length}
          viewedStories={selfEntry?.stories.filter((s) => s.viewed).length}
          selfExpiresAt={selfEntry?.stories[selfEntry.stories.length - 1]?.expiresAt}
        >
          <Avatar
            name={currentUser.name}
            color={currentUser.avatarColor}
            imageUrl={currentUser.avatarUrl}
            size="md"
          />
        </StoryRing>
        <span
          className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 text-white shadow"
          onClick={(e) => {
            e.stopPropagation()
            onAddStory()
          }}
        >
          <Plus className="h-3 w-3" />
        </span>
      </div>
      <span className="max-w-[64px] truncate text-[10px] text-muted-foreground">
        {t('stories.myStory')}
      </span>
    </button>
  )

  const OtherButton = ({ user }: { user: StoryFeedUser }) => {
    const userIndex = feed.findIndex((u) => u.id === user.id)
    const viewedCount = user.stories.filter((s) => s.viewed).length
    return (
      <button
        key={user.id}
        type="button"
        onClick={() => onOpenViewer(userIndex)}
        className="flex w-16 shrink-0 flex-col items-center gap-1"
      >
        <StoryRing
          hasStory
          hasUnviewed={user.hasUnviewed}
          size="md"
          totalStories={user.stories.length}
          viewedStories={viewedCount}
        >
          <Avatar
            name={user.name}
            color={user.avatarColor}
            imageUrl={user.avatarUrl}
            size="md"
            showStatus
            online={false}
          />
        </StoryRing>
        <span
          className={cn(
            'max-w-[64px] truncate text-[10px]',
            user.hasUnviewed ? 'font-semibold text-foreground' : 'text-muted-foreground',
          )}
        >
          {user.name.split(' ')[0]}
        </span>
      </button>
    )
  }

  const isDragging = dragHeight !== null

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative shrink-0 border-b border-sidebar-border bg-sidebar/70 backdrop-blur-sm',
        !isDragging && 'transition-[height] duration-200 ease-out',
      )}
      style={{ height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={resetDrag}
    >
      {/* Pull handle — тянем вниз чтобы развернуть сетку.
          Увеличенная зона для удобного хвата на тач-устройствах. */}
      <div
        data-stories-handle
        className="flex h-7 cursor-grab touch-none select-none items-center justify-center active:cursor-grabbing"
      >
        <div className="h-1 w-10 rounded-full bg-muted-foreground/40" />
      </div>

      <div
        className={cn(
          'h-[calc(100%-1.75rem)] overflow-y-auto px-2',
          expanded ? 'flex flex-wrap gap-x-3 gap-y-2 content-start' : 'flex gap-3 overflow-x-auto pb-1 scrollbar-none',
        )}
      >
        {SelfButton}
        {others.map((user) => (
          <OtherButton key={user.id} user={user} />
        ))}
      </div>

      {/* Chevron-индикатор состояния */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="absolute right-2 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        aria-label={expanded ? t('stories.collapse') : t('stories.expand')}
        title={expanded ? t('stories.collapse') : t('stories.expand')}
      >
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')}
        />
      </button>
    </div>
  )
}
