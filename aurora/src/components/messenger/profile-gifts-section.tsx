'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Gift, X, Crown } from 'lucide-react'
import { resolveMediaUrl, isVideoUrl } from '@/lib/media-url'
import { useI18n } from '@/hooks/use-i18n'
import { cn } from '@/lib/utils'
import { Avatar } from './avatar'

export interface GiftSender {
  id: string
  name: string
  avatarColor: string
  avatarUrl?: string | null
}

export interface ProfileGiftItem {
  gift: {
    id: string
    title: string
    thumbnailUrl: string
    stickerUrl: string
    animationUrl?: string | null
    starPrice?: number
    isPremium?: boolean
    isLimited?: boolean
    totalSupply?: number | null
    issuedCount?: number
  }
  count: number
  serialLabels?: string[]
  senders?: GiftSender[]
}

export interface ProfileCollectibleItem {
  id: string
  serialNumber: number
  serialLabel: string
  createdAt: string
  gift: ProfileGiftItem['gift']
  sender?: GiftSender
}

interface ProfileGiftsSectionProps {
  gifts: ProfileGiftItem[]
  collectibles?: ProfileCollectibleItem[]
  isSelf?: boolean
  loading?: boolean
  showRecentFeed?: boolean
}

function formatFromSenders(
  senders: GiftSender[] | undefined,
  t: (key: string) => string,
): string | null {
  if (!senders || senders.length === 0) return null
  const names = senders.map((s) => s.name).filter(Boolean)
  if (names.length === 0) return null
  if (names.length === 1) {
    return t('gifts.from').replace('{name}', names[0])
  }
  if (names.length === 2) {
    return t('gifts.fromTwo')
      .replace('{name1}', names[0])
      .replace('{name2}', names[1])
  }
  return t('gifts.fromMany')
    .replace('{name}', names[0])
    .replace('{count}', String(names.length - 1))
}

export function ProfileGiftsSection({ gifts, collectibles = [], isSelf, loading, showRecentFeed }: ProfileGiftsSectionProps) {
  const { t } = useI18n()
  const [selected, setSelected] = useState<ProfileGiftItem | null>(null)

  if (loading) {
    return (
      <div className="min-w-0 pb-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('gifts.profileTitle')}
        </p>
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[72px] w-[72px] animate-pulse rounded-xl bg-muted/50"
            />
          ))}
        </div>
      </div>
    )
  }

  if (gifts.length === 0) {
    if (!isSelf) return null
    return (
      <div className="min-w-0 pb-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Gift className="h-3.5 w-3.5" />
          {t('gifts.profileTitle')}
        </p>
        <p className="rounded-xl border border-dashed border-violet-500/20 bg-violet-500/5 px-4 py-3 text-center text-sm text-muted-foreground">
          {t('gifts.profileEmpty')}
        </p>
      </div>
    )
  }

  const total = gifts.reduce((sum, g) => sum + g.count, 0)

  const limitedShowcase = collectibles.slice(0, 8)

  return (
    <>
      <div className="min-w-0 pb-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Gift className="h-3.5 w-3.5 text-violet-500" />
          {t('gifts.profileTitle')}
          <span className="font-normal normal-case text-muted-foreground/80">
            · {t('gifts.profileCount').replace('{count}', String(total))}
          </span>
        </p>
        <div className="grid w-full min-w-0 max-w-full grid-cols-4 gap-2 [grid-template-columns:repeat(4,minmax(0,1fr))] sm:grid-cols-5 sm:[grid-template-columns:repeat(5,minmax(0,1fr))]">
          {gifts.map((g) => {
            const isTop = g.gift.isLimited || g.gift.isPremium
            const fromLabel = formatFromSenders(g.senders, t)
            return (
              <button
                key={g.gift.id}
                type="button"
                onClick={() => setSelected(g)}
                className={cn(
                  'group relative flex aspect-square flex-col items-center justify-center rounded-xl border',
                  isTop
                    ? 'border-amber-400/40 bg-gradient-to-br from-amber-400/15 via-orange-500/5 to-transparent shadow-[0_0_12px_-4px_rgba(251,191,36,0.5)] hover:border-amber-400/70'
                    : 'border-violet-500/15 bg-gradient-to-br from-violet-500/10 to-cyan-500/5 hover:border-violet-500/30 hover:from-violet-500/15 hover:to-cyan-500/10',
                  'transition active:scale-95',
                )}
                title={fromLabel ? `${g.gift.title} · ${fromLabel}` : g.gift.title}
                aria-label={
                  fromLabel
                    ? `${t('gifts.viewGift').replace('{title}', g.gift.title)}. ${fromLabel}`
                    : t('gifts.viewGift').replace('{title}', g.gift.title)
                }
              >
                {isTop && (
                  <span className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-md ring-2 ring-background">
                    <Crown className="h-3 w-3 text-white" />
                  </span>
                )}
                <img
                  src={resolveMediaUrl(g.gift.thumbnailUrl)}
                  alt={g.gift.title}
                  className="h-10 w-10 object-contain drop-shadow-sm transition group-hover:scale-110 sm:h-12 sm:w-12"
                />
                {g.count > 1 && (
                  <span className="absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 px-1 text-[10px] font-bold text-white shadow-md ring-2 ring-background">
                    ×{g.count}
                  </span>
                )}
                {g.gift.isLimited && (g.serialLabels?.[0] || g.gift.totalSupply) && (
                  <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1 py-px text-[9px] font-bold tabular-nums text-amber-300">
                    {g.serialLabels?.[0] ||
                      `#001–#${String(g.gift.totalSupply || 999).padStart(3, '0')}`}
                  </span>
                )}
                {g.senders?.[0] && (
                  <span className="absolute left-1 top-1 overflow-hidden rounded-full ring-2 ring-background">
                    <Avatar
                      name={g.senders[0].name}
                      color={g.senders[0].avatarColor}
                      imageUrl={g.senders[0].avatarUrl}
                      size="xs"
                    />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {limitedShowcase.length > 0 && (
        <div className="min-w-0 pb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600/90">
            {t('gifts.collectiblesTitle')}
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {limitedShowcase.map((c) => (
              <div
                key={c.id}
                className="relative flex h-[84px] w-[76px] shrink-0 flex-col items-center justify-center rounded-xl border border-amber-400/40 bg-gradient-to-br from-amber-400/15 to-transparent px-1"
                title={
                  c.sender
                    ? `${c.gift.title} ${c.serialLabel} · ${t('gifts.from').replace('{name}', c.sender.name)}`
                    : `${c.gift.title} ${c.serialLabel}`
                }
              >
                <img
                  src={resolveMediaUrl(c.gift.thumbnailUrl)}
                  alt=""
                  className="h-9 w-9 object-contain"
                />
                <span className="mt-0.5 text-[10px] font-bold tabular-nums text-amber-600">
                  {c.serialLabel}
                </span>
                {c.sender && (
                  <span className="mt-0.5 w-full truncate text-center text-[9px] text-muted-foreground">
                    {c.sender.name}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showRecentFeed && <CollectiblesRecentFeed />}

      <ProfileGiftPreview gift={selected} onClose={() => setSelected(null)} />
    </>
  )
}

function ProfileGiftPreview({
  gift,
  onClose,
}: {
  gift: ProfileGiftItem | null
  onClose: () => void
}) {
  const { t } = useI18n()
  const [showAnimation, setShowAnimation] = useState(true)

  useEffect(() => {
    if (gift) setShowAnimation(true)
  }, [gift])

  const handleClose = useCallback(() => onClose(), [onClose])

  const animationUrl = gift?.gift.animationUrl
  const stickerUrl = gift?.gift.stickerUrl || gift?.gift.thumbnailUrl
  const mediaUrl = resolveMediaUrl(
    showAnimation && animationUrl ? animationUrl : stickerUrl,
  )
  const isVideo = isVideoUrl(mediaUrl)
  const fromLabel = formatFromSenders(gift?.senders, t)

  useEffect(() => {
    if (!gift) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [gift, handleClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {gift && mediaUrl && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label={gift.gift.title}
          className="fixed inset-0 z-[10000] isolate touch-manipulation"
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'calc(5.75rem + env(safe-area-inset-bottom))',
          }}
        >
          <button
            type="button"
            aria-label={t('misc.close')}
            className="absolute inset-0 bg-black/90"
            onClick={handleClose}
          />

          <div className="pointer-events-none relative flex h-full flex-col">
            <div className="pointer-events-auto flex shrink-0 items-center justify-end p-3">
              <button
                type="button"
                aria-label={t('misc.close')}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white active:bg-black/80"
                onClick={handleClose}
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 pb-2">
              <button
                type="button"
                className="pointer-events-auto flex h-56 w-56 items-center justify-center sm:h-64 sm:w-64"
                onClick={() => setShowAnimation((v) => !v)}
                title={t('gifts.tapToToggle')}
              >
                {isVideo ? (
                  <video
                    src={mediaUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="max-h-full max-w-full object-contain drop-shadow-2xl"
                  />
                ) : (
                  <img
                    src={mediaUrl}
                    alt={gift.gift.title}
                    className="max-h-full max-w-full object-contain drop-shadow-2xl transition-transform hover:scale-105"
                  />
                )}
              </button>
              <div className="pointer-events-auto text-center">
                <p className="text-sm font-semibold text-white">{gift.gift.title}</p>
                {fromLabel && (
                  <div className="mt-2 flex flex-col items-center gap-2">
                    <p className="text-sm font-medium text-violet-200">{fromLabel}</p>
                    {gift.senders && gift.senders.length > 0 && (
                      <div className="flex items-center -space-x-2">
                        {gift.senders.slice(0, 5).map((s) => (
                          <span
                            key={s.id}
                            className="rounded-full ring-2 ring-black/80"
                            title={s.name}
                          >
                            <Avatar
                              name={s.name}
                              color={s.avatarColor}
                              imageUrl={s.avatarUrl}
                              size="sm"
                            />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {gift.count > 1 && (
                  <p className="mt-1 text-xs text-violet-300">
                    {t('gifts.receivedCount').replace('{count}', String(gift.count))}
                  </p>
                )}
                {gift.serialLabels && gift.serialLabels.length > 0 && (
                  <p className="mt-1 text-xs font-semibold tabular-nums text-amber-300">
                    {gift.serialLabels.join(' · ')}
                  </p>
                )}
              </div>
            </div>

            <div className="pointer-events-auto shrink-0 px-4 pb-4 text-center">
              <button
                type="button"
                className="min-h-11 px-4 text-sm text-white/80 active:text-white"
                onClick={handleClose}
              >
                {t('misc.close')}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function CollectiblesRecentFeed() {
  const { t } = useI18n()
  const [items, setItems] = useState<
    Array<{
      id: string
      serialLabel: string | null
      gift: { title: string; thumbnailUrl: string }
      recipient: { name: string; username: string }
      sender?: { name: string }
    }>
  >([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/gifts/recent')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setItems(data.items || [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (items.length === 0) return null

  return (
    <div className="min-w-0 pb-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('gifts.recentFeed')}
      </p>
      <ul className="space-y-2">
        {items.slice(0, 8).map((item) => (
          <li key={item.id} className="flex items-center gap-2 rounded-lg bg-muted/30 px-2 py-1.5 text-xs">
            <img src={item.gift.thumbnailUrl} alt="" className="h-8 w-8 object-contain" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{item.recipient.name}</p>
              <p className="truncate text-muted-foreground">
                {item.gift.title} {item.serialLabel}
                {item.sender?.name
                  ? ` · ${t('gifts.from').replace('{name}', item.sender.name)}`
                  : ''}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
