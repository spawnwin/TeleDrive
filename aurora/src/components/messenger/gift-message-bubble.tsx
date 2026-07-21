'use client'

import { useState } from 'react'
import { Gift } from 'lucide-react'
import { resolveMediaUrl } from '@/lib/media-url'
import { formatGiftSerial, parseGiftMetadata } from '@/lib/gifts'
import { cn } from '@/lib/utils'
import { useI18n } from '@/hooks/use-i18n'

interface GiftMessageBubbleProps {
  metadata: string | null | undefined
  content: string
  mine: boolean
  /** Display name of the user who sent the gift message. */
  senderName?: string
}

export function GiftMessageBubble({
  metadata,
  content,
  mine,
  senderName,
}: GiftMessageBubbleProps) {
  const { t } = useI18n()
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
  const fromLine = mine
    ? t('gifts.youSent')
    : senderName
      ? t('gifts.from').replace('{name}', senderName)
      : t('gifts.receivedLabel')

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 py-1',
        mine ? 'items-end' : 'items-start',
      )}
    >
      <button
        type="button"
        className="relative flex h-[min(10rem,60vw)] w-[min(10rem,60vw)] max-h-40 max-w-40 items-center justify-center"
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
      <div className={cn('max-w-[min(220px,100%)] min-w-0 text-center', mine && 'text-right')}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-400/90">
          {fromLine}
        </p>
        <p className="mt-0.5 text-xs font-semibold text-violet-500">
          🎁 {gift.giftTitle}
          {serial ? ` ${serial}` : ''}
        </p>
        {content && content !== `🎁 ${gift.giftTitle}` && (
          <p className="mt-0.5 break-words text-sm text-foreground">{content}</p>
        )}
        <p className="mt-0.5 text-[10px] text-muted-foreground">{gift.starsSpent} ₽</p>
      </div>
    </div>
  )
}
