'use client'

import { useEffect, useState } from 'react'
import {
  Crown,
  Loader2,
  Sparkles,
  Ban,
  Upload,
  Palette,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAppStore } from '@/lib/store'
import { useI18n } from '@/hooks/use-i18n'
import { PREMIUM_PRICE, PREMIUM_DURATION_DAYS, PREMIUM_THEMES, isPremiumActive } from '@/lib/coins'
import { EmojiStatusPicker } from './emoji-status-picker'
import { EmojiStatusBadge } from './emoji-status-badge'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface PremiumDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
}

const THEME_PREVIEWS: Record<string, string> = {
  classic: 'linear-gradient(135deg, #0e1621, #3390ec)',
  night: 'linear-gradient(135deg, #000000, #5eb3f6)',
  graphite: 'linear-gradient(135deg, #1c1c1e, #64d2ff)',
  arctic: 'linear-gradient(135deg, #0a1628, #4fc3f7)',
  mint: 'linear-gradient(135deg, #0b1a16, #2dd4a8)',
  cherry: 'linear-gradient(135deg, #1a0c12, #ff5a7a)',
  ocean: 'linear-gradient(135deg, #061820, #00bcd4)',
  golden: 'linear-gradient(135deg, #16120a, #f5c542)',
  lavender: 'linear-gradient(135deg, #140f1e, #b388ff)',
  coffee: 'linear-gradient(135deg, #1a1410, #c4a484)',
  emerald: 'linear-gradient(135deg, #071712, #34d399)',
  rose: 'linear-gradient(135deg, #1a0f16, #f472b6)',
  steel: 'linear-gradient(135deg, #12161a, #90caf9)',
  aurora: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
  galaxy: 'linear-gradient(135deg, #1e1b4b, #7c3aed, #ec4899)',
  sunset: 'linear-gradient(135deg, #f97316, #ec4899, #8b5cf6)',
}

export function PremiumDialog({ open, onOpenChange }: PremiumDialogProps) {
  const { t } = useI18n()
  const { currentUser, setCurrentUser } = useAppStore()
  const [selectedTheme, setSelectedTheme] = useState(currentUser?.premiumTheme || 'classic')
  const [purchasing, setPurchasing] = useState(false)
  // Admin-configurable price/duration (src/app/admin/payments); these static
  // imports are just the fallback shown before the fetch resolves.
  const [price, setPrice] = useState<number>(PREMIUM_PRICE)
  const [durationDays, setDurationDays] = useState<number>(PREMIUM_DURATION_DAYS)

  useEffect(() => {
    if (!open) return
    fetch('/api/economy')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.premiumPriceCoins === 'number') setPrice(d.premiumPriceCoins)
        if (typeof d.premiumDurationDays === 'number') setDurationDays(d.premiumDurationDays)
      })
      .catch(() => {})
  }, [open])

  const isActive = currentUser ? isPremiumActive(currentUser) : false
  const coins = currentUser?.coins ?? 0
  const canAfford = coins >= price

  const purchase = async () => {
    setPurchasing(true)
    try {
      const res = await fetch('/api/premium/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: selectedTheme }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (!currentUser) return
      setCurrentUser({
        ...currentUser,
        coins: data.user.coins,
        isPremium: true,
        premiumUntil: data.user.premiumUntil,
        premiumTheme: data.user.premiumTheme,
      })
      toast.success(t('premium.purchased'))
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('premium.errorPurchase'))
    } finally {
      setPurchasing(false)
    }
  }

  const benefits = [
    { icon: Crown, label: t('premium.benefitBadge') },
    { icon: Sparkles, label: t('premium.benefitEmojiStatus') },
    { icon: Ban, label: t('premium.benefitNoAds') },
    { icon: Upload, label: t('premium.benefitUpload') },
    { icon: Palette, label: t('premium.benefitTheme') },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-h-[85vh]">
        <div className="shrink-0 bg-gradient-to-br from-amber-500 via-violet-500 to-cyan-400 px-5 py-6 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Crown className="h-6 w-6" />
              Aurora Premium
            </DialogTitle>
          </DialogHeader>
          <p className="mt-2 text-sm text-white/80">{t('premium.subtitle')}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 [-webkit-overflow-scrolling:touch]">
          {isActive && (
            <div className="mb-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-center">
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                {t('premium.active')}
              </p>
              {currentUser?.premiumUntil && (
                <p className="text-xs text-muted-foreground">
                  {t('premium.until')} {new Date(currentUser.premiumUntil).toLocaleDateString()}
                </p>
              )}
            </div>
          )}

          {isActive && (
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('premium.emojiStatus')}
                </p>
                {currentUser?.emojiStatus && (
                  <EmojiStatusBadge emojiStatus={currentUser.emojiStatus} size="md" />
                )}
              </div>
              <p className="mb-2 text-xs text-muted-foreground">{t('premium.emojiStatusHint')}</p>
              <EmojiStatusPicker
                value={currentUser?.emojiStatus}
                autoSave
                compact
                onSaved={(id) => {
                  if (currentUser) {
                    setCurrentUser({ ...currentUser, emojiStatus: id })
                  }
                }}
              />
            </div>
          )}

          {/* Benefits */}
          <div className="space-y-2">
            {benefits.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
                <Icon className="h-4 w-4 text-violet-500" />
                <span className="text-sm">{label}</span>
              </div>
            ))}
          </div>

          {/* Theme picker */}
          <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('premium.selectTheme')}
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {PREMIUM_THEMES.map((theme) => (
              <button
                key={theme}
                onClick={() => setSelectedTheme(theme)}
                className={cn(
                  'relative flex flex-col items-center gap-1.5 rounded-xl border p-3 transition',
                  selectedTheme === theme
                    ? 'border-violet-500 bg-violet-500/10'
                    : 'border-border hover:bg-muted',
                )}
              >
                <div
                  className="h-10 w-full rounded-lg"
                  style={{ background: THEME_PREVIEWS[theme] }}
                />
                <span className="text-xs font-medium capitalize">{t(`premium.theme.${theme}`)}</span>
                {selectedTheme === theme && (
                  <Check className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-violet-500" />
                )}
              </button>
            ))}
          </div>

          {/* Price */}
          <div className="mt-5 rounded-xl bg-muted/50 p-4 text-center">
            <p className="text-2xl font-bold">
              {price} <span className="text-amber-500">₽</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {durationDays} {t('premium.duration')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('coins.balance')}: {coins} ₽
            </p>
          </div>

          <Button
            onClick={purchase}
            disabled={purchasing || !canAfford}
            className="mt-4 w-full bg-gradient-to-r from-amber-500 via-violet-500 to-cyan-400 text-white"
          >
            {purchasing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                {isActive ? t('premium.extend') : t('premium.buy')}
              </>
            )}
          </Button>
          {!canAfford && (
            <p className="mt-2 text-center text-xs text-destructive">{t('premium.notEnoughCoins')}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
