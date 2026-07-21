'use client'

import { useEffect, useState } from 'react'
import { Bell, Download, Share, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/hooks/use-i18n'
import {
  enableWebPush,
  getIosPushBlockReason,
  isIos,
  isStandalonePwa,
  isWebPushSupported,
} from '@/hooks/use-push'

const PUSH_BANNER_DISMISSED_KEY = 'aurora-push-banner-dismissed'

/**
 * Asks the user to grant notification permission. Web Push requires a user
 * gesture for the permission prompt, so without this banner users only find
 * the switch deep in settings — and no subscription ever gets created.
 */
export function EnablePushBanner() {
  const { t } = useI18n()
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem(PUSH_BANNER_DISMISSED_KEY)) return
    if (!isWebPushSupported() || getIosPushBlockReason()) return
    if (Notification.permission !== 'default') return
    setVisible(true)
  }, [])

  if (!visible) return null

  const dismiss = () => {
    localStorage.setItem(PUSH_BANNER_DISMISSED_KEY, '1')
    setVisible(false)
  }

  const enable = async () => {
    setBusy(true)
    const result = await enableWebPush()
    setBusy(false)
    setVisible(false)
    if (result.ok) {
      toast.success(t('pwa.pushBannerEnabled'))
      localStorage.setItem(PUSH_BANNER_DISMISSED_KEY, '1')
    } else if (result.reason === 'denied') {
      toast.error(t('pwa.pushBannerDenied'))
    }
  }

  return (
    <div className="aurora-floating-banner fixed z-50 mx-auto flex max-w-md items-center gap-2.5 rounded-2xl border border-[#3390ec]/30 bg-background/95 p-3 shadow-lg backdrop-blur sm:gap-3 sm:p-4">
      <Bell className="h-5 w-5 shrink-0 text-[#3390ec]" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t('pwa.pushBannerTitle')}</p>
        <p className="text-xs text-muted-foreground">{t('pwa.pushBannerHint')}</p>
      </div>
      <Button size="sm" onClick={enable} disabled={busy} className="bg-[#3390ec] text-white hover:bg-[#2b82d9]">
        {t('pwa.pushBannerEnable')}
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={dismiss}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PwaInstallPrompt() {
  const { t } = useI18n()
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isStandalonePwa()) return

    if (isIos()) {
      setIosHint(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (dismissed) return null

  if (iosHint && !isStandalonePwa()) {
    return (
      <div className="aurora-floating-banner fixed z-50 mx-auto flex max-w-md items-center gap-2.5 rounded-2xl border border-[#3390ec]/30 bg-background/95 p-3 shadow-lg backdrop-blur sm:gap-3 sm:p-4">
        <Share className="h-5 w-5 shrink-0 text-[#3390ec]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t('pwa.iosTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('pwa.iosHint')}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setDismissed(true)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  if (!deferred) return null

  const install = async () => {
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    if (outcome === 'accepted') setDeferred(null)
    setDismissed(true)
  }

  return (
    <div className="aurora-floating-banner fixed z-50 mx-auto flex max-w-md items-center gap-2.5 rounded-2xl border border-[#3390ec]/30 bg-background/95 p-3 shadow-lg backdrop-blur sm:gap-3 sm:p-4">
      <Download className="h-5 w-5 shrink-0 text-[#3390ec]" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t('pwa.installTitle')}</p>
        <p className="text-xs text-muted-foreground">{t('pwa.installHint')}</p>
      </div>
      <Button size="sm" onClick={install} className="bg-[#3390ec] text-white hover:bg-[#2b82d9]">
        {t('pwa.install')}
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setDismissed(true)}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
