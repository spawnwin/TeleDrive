'use client'

import { useEffect, useId, useState } from 'react'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface StoryRingProps {
  children: ReactNode
  hasStory?: boolean
  hasUnviewed?: boolean
  isSelf?: boolean
  size?: 'sm' | 'md' | 'lg'
  /** Кол-во статусов у пользователя — рисуем segmented-кольцо */
  totalStories?: number
  /** Сколько из них уже просмотрено */
  viewedStories?: number
  /** Для «моего статуса» — ISO времени истечения последнего. Рисуем тающийprogress-арка. */
  selfExpiresAt?: string | null
  onClick?: (e: React.MouseEvent) => void
  className?: string
}

// Fixed outer dimensions per size — bounding box не зависит от состояния.
const outerSize = {
  sm: 'h-12 w-12',
  md: 'h-14 w-14',
  lg: 'h-32 w-32',
}

const ringPx = { sm: 48, md: 56, lg: 128 }

export function StoryRing({
  children,
  hasStory = false,
  hasUnviewed = false,
  isSelf = false,
  size = 'md',
  totalStories,
  viewedStories = 0,
  selfExpiresAt,
  onClick,
  className,
}: StoryRingProps) {
  const px = ringPx[size]
  const stroke = size === 'lg' ? 4 : 3
  const r = (px - stroke) / 2
  const c = 2 * Math.PI * r
  const reactId = useId()
  const safeId = reactId.replace(/[^a-zA-Z0-9-]/g, '')
  const gradId = `storyGrad-${safeId}`
  const selfGradId = `storySelfGrad-${safeId}`

  const total = Math.max(1, totalStories ?? 1)
  const viewed = Math.min(total, viewedStories)
  const useSegments = hasStory && !!totalStories && totalStories > 1

  // self progress arc
  const [progress, setProgress] = useState(1)
  useEffect(() => {
    if (!isSelf || !selfExpiresAt) return
    const update = () => {
      const expires = new Date(selfExpiresAt).getTime()
      const start = expires - 24 * 60 * 60 * 1000
      const now = Date.now()
      const p = Math.min(1, Math.max(0, (expires - now) / (expires - start)))
      setProgress(p)
    }
    update()
    const id = setInterval(update, 30_000)
    return () => clearInterval(id)
  }, [isSelf, selfExpiresAt])

  // Build segments — gap between arcs
  const segments = useSegments
    ? Array.from({ length: total }, (_, i) => {
        const frac = 1 / total
        const offset = i * frac * c
        const len = frac * c
        const gap = Math.min(len * 0.12, 4)
        const viewedSeg = i < viewed
        return { offset, len: len - gap, viewed: viewedSeg }
      })
    : []

  const ringLayer = (() => {
    if (isSelf && !hasStory) {
      return 'border-[3px] border-dashed border-muted-foreground/60 bg-transparent'
    }
    if (!hasStory) {
      return 'bg-transparent'
    }
    if (useSegments || isSelf) return 'bg-transparent' // ring рисуем через SVG
    if (hasUnviewed) {
      return 'bg-gradient-to-tr from-orange-400 via-pink-500 to-purple-500'
    }
    return 'bg-muted-foreground/35'
  })()

  const innerBg = hasStory || isSelf ? 'bg-sidebar' : 'bg-transparent'

  const inner = (
    <div className={cn('relative shrink-0 overflow-visible rounded-full', outerSize[size])}>
      {/* Базовый слой (цельный фон или пусто) */}
      <div
        className={cn(
          'absolute inset-0 rounded-full',
          ringLayer,
          onClick && 'transition hover:opacity-90',
        )}
      />

      {/* SVG segmented/progress ring */}
      {(useSegments || (isSelf && hasStory)) && (
        <svg
          className="absolute inset-0 -rotate-90"
          width={px}
          height={px}
          viewBox={`0 0 ${px} ${px}`}
          fill="none"
        >
          {useSegments ? (
            <>
              {/* фоновое серое кольцо */}
              <circle
                cx={px / 2}
                cy={px / 2}
                r={r}
                stroke="currentColor"
                className="text-muted-foreground/30"
                strokeWidth={stroke}
              />
              {segments.map((seg, i) => (
                <circle
                  key={i}
                  cx={px / 2}
                  cy={px / 2}
                  r={r}
                  stroke={`url(#${gradId})`}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={`${seg.len} ${c - seg.len}`}
                  strokeDashoffset={-seg.offset}
                  opacity={seg.viewed ? 0.35 : 1}
                />
              ))}
            </>
          ) : (
            // self progress arc — тает по мере истечения 24ч
            <>
              <circle
                cx={px / 2}
                cy={px / 2}
                r={r}
                stroke="currentColor"
                className="text-muted-foreground/30"
                strokeWidth={stroke}
              />
              <circle
                cx={px / 2}
                cy={px / 2}
                r={r}
                stroke={`url(#${selfGradId})`}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${c * progress} ${c}`}
              />
            </>
          )}
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="50%" stopColor="#ec4899" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
            <linearGradient id={selfGradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
        </svg>
      )}

      <div className={cn('absolute inset-[3px] rounded-full', innerBg)} />
      {/* overflow-visible: online status dot on Avatar must not be clipped */}
      <div className="absolute inset-[5px] flex items-center justify-center overflow-visible rounded-full">
        {children}
      </div>
    </div>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn('relative shrink-0 overflow-visible rounded-full', className)}
      >
        {inner}
      </button>
    )
  }

  return (
    <div className={cn('relative shrink-0 overflow-visible rounded-full', className)}>
      {inner}
    </div>
  )
}
