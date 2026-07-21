'use client'

import { cn } from '@/lib/utils'

export function formatUnreadCount(count: number): string {
  if (count <= 0) return ''
  return count > 99 ? '99+' : String(count)
}

export function UnreadBadge({
  count,
  muted,
  className,
  title,
}: {
  count: number
  muted?: boolean
  className?: string
  title?: string
}) {
  if (count <= 0) return null

  return (
    <span
      title={title}
      aria-label={title}
      className={cn(
        'flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-none text-white shadow-sm',
        muted
          ? 'bg-[#8e8e93]'
          : 'bg-[#3390ec]',
        className,
      )}
    >
      {formatUnreadCount(count)}
    </span>
  )
}

export function UnreadLeftMarker({ show }: { show: boolean }) {
  if (!show) return null

  return (
    <div
      className="pointer-events-none absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-[#3390ec]"
      aria-hidden
    />
  )
}
