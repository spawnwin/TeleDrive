'use client'

import { useState } from 'react'
import { Gift } from 'lucide-react'
import { resolveMediaUrl } from '@/lib/media-url'
import { formatGiftSerial, parseGiftMetadata } from '@/lib/gifts'
import { cn } from '@/lib/utils'

interface GiftMessageBubbleProps {
  metadata: string | null | undefined
  content: string
  mine: boolean
}

export function GiftMessageBubble({ metadata, content, mine }: GiftMessageBubbleProps) {
  const gift = parseGiftMetadata(metadata)
  const [animating, setAnimating] = useState(true)

  if (!gift) {
    return (
      <p className="text-sm">
        <Gift className="mr-1 inline h-4 w-4 text-violet-500" />
        {content}
      </p>
    )
  }

  const mediaUrl = gift.giftAnimationUrl || gift.giftStickerUrl
  const serial = formatGiftSerial(gift.serialNumber)

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 py-1',
        mine ? 'items-end' : 'items-start',
      )}
    >
      <button
        type="button"
        className="relative flex h-40 w-40 items-center justify-center"
        onClick={() => setAnimating((v) => !v)}
      >
        <img
          src={resolveMediaUrl(animating ? mediaUrl : gift.giftThumbnailUrl)}
          alt={gift.giftTitle}
          className="max-h-full max-w-full object-contain drop-shadow-lg transition-transform hover:scale-105"
        />
        {serial && (
          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold tabular-nums text-amber-300 backdrop-blur">
            {serial}
            {gift.totalSupply ? ` / ${String(gift.totalSupply).padStart(3, '0')}` : ''}
          </span>
        )}
      </button>
      <div className={cn('text-center', mine && 'text-right')}>
        <p className="text-xs font-semibold text-violet-500">
          🎁 {gift.giftTitle}
          {serial ? ` ${serial}` : ''}
        </p>
        {content && content !== `🎁 ${gift.giftTitle}` && (
          <p className="mt-0.5 text-sm text-foreground">{content}</p>
        )}
        <p className="mt-0.5 text-[10px] text-muted-foreground">{gift.starsSpent} ₽</p>
      </div>
    </div>
  )
}
