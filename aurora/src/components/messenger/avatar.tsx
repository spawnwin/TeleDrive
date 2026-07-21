'use client'

import { cn } from '@/lib/utils'
import { resolveMediaUrl } from '@/lib/media-url'
import { useEffect, useState } from 'react'

interface AvatarProps {
  name: string
  color: string
  imageUrl?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  online?: boolean
  showStatus?: boolean
  className?: string
}

const sizeMap = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-2xl',
  '2xl': 'h-28 w-28 text-3xl',
}

const dotSize = {
  sm: 'h-2.5 w-2.5',
  md: 'h-3 w-3',
  lg: 'h-3.5 w-3.5',
  xl: 'h-4 w-4',
  '2xl': 'h-5 w-5',
}

function shadeColor(hex: string, percent: number): string {
  const h = hex.replace('#', '')
  const num = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  let r = (num >> 16) & 0xff
  let g = (num >> 8) & 0xff
  let b = num & 0xff
  r = Math.max(0, Math.min(255, r + Math.round((percent / 100) * 255)))
  g = Math.max(0, Math.min(255, g + Math.round((percent / 100) * 255)))
  b = Math.max(0, Math.min(255, b + Math.round((percent / 100) * 255)))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export function Avatar({
  name,
  color,
  imageUrl,
  size = 'md',
  online,
  showStatus = false,
  className,
}: AvatarProps) {
  const [imgError, setImgError] = useState(false)

  // Reset error state when image URL changes so new images load correctly
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setImgError(false) }, [imageUrl])

  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const resolvedImageUrl = resolveMediaUrl(imageUrl)
  const hasImage = resolvedImageUrl && !imgError

  return (
    <div className={cn('relative shrink-0 rounded-full', className)}>
      <div
        className={cn(
          'flex aspect-square items-center justify-center overflow-hidden rounded-full font-semibold text-white shadow-sm ring-2 ring-white/10',
          sizeMap[size],
        )}
        style={
          hasImage
            ? undefined
            : {
                background: `linear-gradient(135deg, ${color}, ${shadeColor(color, -20)})`,
              }
        }
      >
        {hasImage ? (
          <img
            src={resolvedImageUrl!}
            alt={name}
            className="h-full w-full rounded-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span>{initials || '?'}</span>
        )}
      </div>
      {showStatus && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full border-2 border-background',
            dotSize[size],
            online ? 'bg-emerald-500' : 'bg-slate-400',
          )}
        />
      )}
    </div>
  )
}
