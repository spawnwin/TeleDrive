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
          'flex aspect-square items-center justify-center overflow-hidden rounded-full font-semibold text-white',
          sizeMap[size],
        )}
        style={
          hasImage
            ? undefined
            : {
                // Telegram: flat solid color, no gradient / ring / shadow
                background: color || '#3390ec',
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
            online ? 'bg-[#4dcd5e]' : 'bg-[#8e8e93]',
          )}
        />
      )}
    </div>
  )
}
