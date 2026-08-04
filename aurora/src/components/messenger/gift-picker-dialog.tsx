'use client'

import { useEffect, useMemo, useState } from 'react'
import { Gift, Loader2, Crown } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useI18n } from '@/hooks/use-i18n'
import { resolveMediaUrl } from '@/lib/media-url'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface GiftItem {
  id: string
  title: string
  titleEn?: string | null
  starPrice: number
  thumbnailUrl: string
  stickerUrl: string
  animationUrl?: string | null
  isPremium: boolean
  isLimited: boolean
  totalSupply?: number | null
  issuedCount?: number
  remaining?: number | null
  soldOut?: boolean
}

interface GiftPickerDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  recipientId: string
  recipientName: string
  chatId?: string | null
  onSent?: (chatId: string) => void
}

export function GiftPickerDialog({
  open,
  onOpenChange,
  recipientId,
  recipientName,
  chatId,
  onSent,
}: GiftPickerDialogProps) {
  const { t, lang } = useI18n()
  const [gifts, setGifts] = useState<GiftItem[]>([])
  const [balance, setBalance] = useState(0)
  const [isPremium, setIsPremium] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<GiftItem | null>(null)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open) {
      setSelected(null)
      setNote('')
      return
    }
    setLoading(true)
    fetch('/api/gifts/catalog')
      .then((r) => r.json())
      .then((d) => {
        setGifts(d.gifts || [])
        setBalance(d.balance ?? 0)
        setIsPremium(!!d.isPremium)
      })
      .catch(() => toast.error(t('gifts.errorLoad')))
      .finally(() => setLoading(false))
  }, [open, t])

  const sendGift = async () => {
    if (!selected || sending || selected.soldOut) return
    setSending(true)
    try {
      const res = await fetch('/api/gifts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          giftId: selected.id,
          recipientId,
          chatId: chatId || undefined,
          note: note.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setBalance(data.balance ?? balance)
      const serial =
        data.giftSent?.serialNumber != null
          ? `#${String(data.giftSent.serialNumber).padStart(3, '0')}`
          : null
      toast.success(
        serial
          ? `${t('gifts.sent').replace('{name}', recipientName)} · ${serial}`
          : t('gifts.sent').replace('{name}', recipientName),
      )
      onOpenChange(false)
      if (data.chatId) onSent?.(data.chatId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('gifts.errorSend'))
    } finally {
      setSending(false)
    }
  }

  const title = (g: GiftItem) => (lang === 'en' && g.titleEn ? g.titleEn : g.title)

  const sortedGifts = useMemo(
    () =>
      [...gifts].sort((a, b) => {
        const rank = (g: GiftItem) =>
          (g.isLimited ? 2 : 0) + (g.isPremium ? 1 : 0) + (g.soldOut ? -3 : 0)
        const rankDiff = rank(b) - rank(a)
        if (rankDiff !== 0) return rankDiff
        const remA = a.remaining ?? 9999
        const remB = b.remaining ?? 9999
        return remA - remB
      }),
    [gifts],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-[#3390ec]" />
            {t('gifts.sendTo').replace('{name}', recipientName)}
          </DialogTitle>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {t('gifts.balance')}: {balance} ₽
          </p>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh] p-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[#3390ec]" />
            </div>
          ) : gifts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('gifts.empty')}</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {sortedGifts.map((g) => {
                const locked = (g.isPremium && !isPremium) || !!g.soldOut
                const isTop = g.isLimited || g.isPremium
                return (
                  <button
                    key={g.id}
                    type="button"
                    disabled={locked}
                    onClick={() => setSelected(g)}
                    className={cn(
                      'relative flex flex-col items-center rounded-xl border p-2 transition',
                      selected?.id === g.id
                        ? 'border-[#3390ec] bg-[#3390ec]/10'
                        : isTop
                          ? 'border-amber-400/40 bg-gradient-to-b from-amber-400/10 to-transparent hover:border-amber-400/70'
                          : 'border-border hover:bg-muted/50',
                      locked && 'opacity-40',
                    )}
                  >
                    {isTop && (
                      <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-md ring-2 ring-background">
                        <Crown className="h-3 w-3 text-white" />
                      </span>
                    )}
                    <img
                      src={resolveMediaUrl(g.thumbnailUrl)}
                      alt={title(g)}
                      className="h-14 w-14 object-contain"
                    />
                    <span className="mt-1 line-clamp-1 text-[10px] font-medium">{title(g)}</span>
                    <span className="flex items-center gap-0.5 text-[10px] text-amber-500">
                      {g.starPrice} ₽
                    </span>
                    {g.isLimited && (
                      <span
                        className={cn(
                          'mt-0.5 text-[9px] font-bold tabular-nums',
                          g.soldOut ? 'text-destructive' : 'text-amber-600',
                        )}
                      >
                        {g.soldOut
                          ? t('gifts.soldOut')
                          : t('gifts.remaining').replace(
                              '{count}',
                              String(g.remaining ?? g.totalSupply ?? 999),
                            )}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>

        {selected && (
          <div className="border-t px-4 py-3">
            <div className="mb-3 flex flex-col items-center justify-center gap-1">
              <img
                src={resolveMediaUrl(selected.animationUrl || selected.stickerUrl)}
                alt={title(selected)}
                className="h-32 w-32 object-contain"
              />
              {selected.isLimited && (
                <p className="text-xs font-semibold tabular-nums text-amber-600">
                  {selected.soldOut
                    ? t('gifts.soldOut')
                    : `#001–#${String(selected.totalSupply || 999).padStart(3, '0')} · ${t(
                        'gifts.remaining',
                      ).replace('{count}', String(selected.remaining ?? 0))}`}
                </p>
              )}
            </div>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('gifts.notePlaceholder')}
              maxLength={200}
              className="mb-3"
            />
            <Button
              className="w-full gap-2"
              disabled={sending || !!selected.soldOut}
              onClick={() => void sendGift()}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Gift className="h-4 w-4" />
                  {selected.soldOut
                    ? t('gifts.soldOut')
                    : t('gifts.sendBtn').replace('{price}', String(selected.starPrice))}
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
