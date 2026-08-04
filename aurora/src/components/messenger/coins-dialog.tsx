'use client'

import { useEffect, useState } from 'react'
import {
  Coins,
  Gift,
  Loader2,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Eye,
  Crown,
  Send,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/lib/store'
import { useI18n } from '@/hooks/use-i18n'
import { COIN_REWARDS, TOPUP_PRESETS_RUB, TOPUP_MIN_RUB, TOPUP_MAX_RUB } from '@/lib/coins'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Transaction {
  id: string
  amount: number
  reason: string
  createdAt: string
}

interface UserSearchResult {
  id: string
  name: string
  username: string
  avatarColor: string
  avatarUrl: string | null
}

interface CoinsDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onOpenPremium?: () => void
}

const REASON_ICONS: Record<string, typeof Gift> = {
  daily_bonus: Gift,
  short_view: Eye,
  premium_purchase: Crown,
  welcome: Sparkles,
  transfer_sent: Send,
  transfer_received: Send,
}

export function CoinsDialog({ open, onOpenChange, onOpenPremium }: CoinsDialogProps) {
  const { t } = useI18n()
  const { currentUser, setCurrentUser } = useAppStore()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [purchasing, setPurchasing] = useState(false)
  const [paymentsReal, setPaymentsReal] = useState(false)
  const [amount, setAmount] = useState<number>(TOPUP_PRESETS_RUB[0])

  // Send-money (P2P transfer)
  const [sendOpen, setSendOpen] = useState(false)
  const [recipientQuery, setRecipientQuery] = useState('')
  const [recipientResults, setRecipientResults] = useState<UserSearchResult[]>([])
  const [selectedRecipient, setSelectedRecipient] = useState<UserSearchResult | null>(null)
  const [transferAmount, setTransferAmount] = useState('')
  const [transferMessage, setTransferMessage] = useState('')
  const [sending, setSending] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/coins')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTransactions(data.transactions || [])
      if (currentUser) {
        setCurrentUser({ ...currentUser, coins: data.coins })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('coins.errorLoad'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    load()
    fetch('/api/economy')
      .then((r) => r.json())
      .then((d) => setPaymentsReal(!!d.paymentsReal))
      .catch(() => {})
  }, [open])

  useEffect(() => {
    if (!sendOpen || selectedRecipient || !recipientQuery.trim()) {
      setRecipientResults([])
      return
    }
    const handle = setTimeout(() => {
      fetch(`/api/users/search?q=${encodeURIComponent(recipientQuery.trim())}`)
        .then((r) => r.json())
        .then((d) => setRecipientResults(d.users || []))
        .catch(() => setRecipientResults([]))
    }, 250)
    return () => clearTimeout(handle)
  }, [sendOpen, recipientQuery, selectedRecipient])

  const resetSendForm = () => {
    setSendOpen(false)
    setRecipientQuery('')
    setRecipientResults([])
    setSelectedRecipient(null)
    setTransferAmount('')
    setTransferMessage('')
  }

  const sendTransfer = async () => {
    if (!selectedRecipient) {
      toast.error(t('transfer.errorRecipient'))
      return
    }
    const amountRub = Math.round(Number(transferAmount))
    if (!amountRub || amountRub <= 0) {
      toast.error(t('transfer.errorAmount'))
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toUserId: selectedRecipient.id,
          amount: amountRub,
          message: transferMessage.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      toast.success(t('transfer.sent'))
      if (currentUser) setCurrentUser({ ...currentUser, coins: data.coins })
      resetSendForm()
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    } finally {
      setSending(false)
    }
  }

  const claimDaily = async () => {
    setClaiming(true)
    try {
      const res = await fetch('/api/coins/daily-bonus', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        if (data.alreadyClaimed) {
          toast.info(t('coins.alreadyClaimed'))
        } else {
          throw new Error(data.error)
        }
        return
      }
      toast.success(`${t('coins.bonusClaimed')} +${data.earned} ₽`)
      if (currentUser) {
        setCurrentUser({
          ...currentUser,
          coins: data.coins,
          lastDailyBonus: data.lastDailyBonus,
        })
      }
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('coins.errorClaim'))
    } finally {
      setClaiming(false)
    }
  }

  const purchase = async () => {
    if (!Number.isFinite(amount) || amount < TOPUP_MIN_RUB || amount > TOPUP_MAX_RUB) {
      toast.error(`${t('coins.amountRange')} ${TOPUP_MIN_RUB}–${TOPUP_MAX_RUB} ₽`)
      return
    }
    setPurchasing(true)
    try {
      const res = await fetch('/api/coins/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountRub: amount }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // Redirect to the ЮKassa hosted payment page. The app polls
      // /api/coins/purchase/confirm on return (see messenger.tsx).
      window.location.href = data.confirmationUrl
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('coins.errorPurchase'))
    } finally {
      setPurchasing(false)
    }
  }

  const reasonLabel = (reason: string) => {
    const key = `coins.reason.${reason}`
    const translated = t(key)
    return translated !== key ? translated : reason
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-h-[85vh]">
        <DialogHeader className="shrink-0 px-5 pt-5 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-amber-500" />
            {t('coins.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="shrink-0">
            {/* Balance card */}
            <div className="rounded-2xl bg-gradient-to-br from-amber-500/20 via-violet-500/10 to-cyan-400/20 p-5 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('coins.balance')}
              </p>
              <p className="mt-1 text-4xl font-bold tabular-nums">
                {currentUser?.coins ?? 0}
                <span className="ml-2 text-lg text-amber-500">₽</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{t('coins.currencyName')}</p>
            </div>

            {/* P2P transfer */}
            <div className="mt-4 rounded-xl bg-muted/50 p-3">
              {!sendOpen ? (
                <button
                  onClick={() => setSendOpen(true)}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/15">
                    <Send className="h-5 w-5 text-violet-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{t('transfer.title')}</p>
                  </div>
                </button>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{t('transfer.title')}</p>
                    <button onClick={resetSendForm} className="text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {selectedRecipient ? (
                    <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <div
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                          style={{ backgroundColor: selectedRecipient.avatarColor }}
                        >
                          {selectedRecipient.name[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{selectedRecipient.name}</p>
                          <p className="truncate text-xs text-muted-foreground">@{selectedRecipient.username}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedRecipient(null)}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Input
                        value={recipientQuery}
                        onChange={(e) => setRecipientQuery(e.target.value)}
                        placeholder={t('transfer.recipientPlaceholder')}
                        autoFocus
                      />
                      {recipientQuery.trim() && (
                        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
                          {recipientResults.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-muted-foreground">{t('transfer.noResults')}</p>
                          ) : (
                            recipientResults.map((u) => (
                              <button
                                key={u.id}
                                onClick={() => {
                                  setSelectedRecipient(u)
                                  setRecipientQuery('')
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
                              >
                                <div
                                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                                  style={{ backgroundColor: u.avatarColor }}
                                >
                                  {u.name[0]?.toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm">{u.name}</p>
                                  <p className="truncate text-xs text-muted-foreground">@{u.username}</p>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <Input
                    type="number"
                    min={1}
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    placeholder={t('transfer.amountLabel')}
                  />
                  <Input
                    value={transferMessage}
                    onChange={(e) => setTransferMessage(e.target.value)}
                    placeholder={t('transfer.messageLabel')}
                    maxLength={200}
                  />
                  <Button
                    onClick={sendTransfer}
                    disabled={sending}
                    className="w-full bg-gradient-to-r from-violet-500 to-cyan-400 text-white"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('transfer.send')}
                  </Button>
                </div>
              )}
            </div>

            {/* Daily bonus */}
            <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-muted/50 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
                  <Gift className="h-5 w-5 text-amber-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t('coins.dailyBonus')}</p>
                  <p className="text-xs text-muted-foreground">
                    +{COIN_REWARDS.DAILY_BONUS} ₽ · {t('coins.dailyBonusHint')}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={claimDaily}
                disabled={claiming}
                className="shrink-0 bg-gradient-to-r from-amber-500 to-orange-400 text-white"
              >
                {claiming ? <Loader2 className="h-4 w-4 animate-spin" /> : t('coins.claim')}
              </Button>
            </div>

            {/* Top up balance */}
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('coins.buyTitle')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {TOPUP_PRESETS_RUB.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setAmount(preset)}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-sm font-bold tabular-nums transition',
                      amount === preset
                        ? 'border-amber-500 bg-amber-500/10 text-amber-500'
                        : 'border-border text-muted-foreground hover:border-amber-500/40',
                    )}
                  >
                    {preset} ₽
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  type="number"
                  min={TOPUP_MIN_RUB}
                  max={TOPUP_MAX_RUB}
                  value={amount}
                  onChange={(e) => setAmount(Math.round(Number(e.target.value)))}
                  className="flex-1"
                />
                <Button
                  onClick={purchase}
                  disabled={purchasing || !paymentsReal}
                  className="shrink-0 bg-gradient-to-r from-amber-500 to-orange-400 text-white"
                >
                  {purchasing ? <Loader2 className="h-4 w-4 animate-spin" /> : t('coins.topUp')}
                </Button>
              </div>
              <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                {paymentsReal ? t('coins.buyRealHint') : t('coins.buyUnavailable')}
              </p>
            </div>

            {/* Premium CTA */}
            {onOpenPremium && (
              <Button
                variant="outline"
                className="mt-3 w-full border-violet-500/30 text-violet-500 hover:bg-violet-500/10"
                onClick={() => {
                  onOpenChange(false)
                  onOpenPremium()
                }}
              >
                <Crown className="mr-2 h-4 w-4" />
                {t('premium.buyWithCoins')}
              </Button>
            )}
          </div>

          {/* Transactions */}
          <div className="mt-5 flex min-h-0 flex-1 flex-col">
            <p className="mb-2 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('coins.transactions')}
            </p>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : transactions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('coins.noTransactions')}</p>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-border/40 bg-muted/20 [-webkit-overflow-scrolling:touch]">
                <div className="space-y-0.5 p-1">
                  {transactions.map((tx) => {
                    const Icon = REASON_ICONS[tx.reason] || Coins
                    const isEarn = tx.amount > 0
                    return (
                      <div
                        key={tx.id}
                        className="flex items-center gap-2 rounded-lg px-2 py-2.5 hover:bg-muted/50 sm:gap-3"
                      >
                        <div
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                            isEarn ? 'bg-emerald-500/15' : 'bg-red-500/15',
                          )}
                        >
                          <Icon className={cn('h-4 w-4', isEarn ? 'text-emerald-500' : 'text-red-500')} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm leading-tight">{reasonLabel(tx.reason)}</p>
                          <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                            {new Date(tx.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div
                          className={cn(
                            'flex shrink-0 items-center gap-0.5 text-sm font-semibold tabular-nums',
                            isEarn ? 'text-emerald-500' : 'text-red-500',
                          )}
                        >
                          {isEarn ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {isEarn ? '+' : ''}
                          {tx.amount} ₽
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
