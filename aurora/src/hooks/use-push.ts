'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { playNotificationSound } from '@/lib/notification-sound'

interface InAppNotification {
  id: string
  title: string
  body: string
  chatId?: string
  senderName?: string
  timestamp: number
}

interface UsePushOptions {
  userId: string | null
  enabled: boolean
  onMessage?: (title: string, body: string, chatId: string) => void
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

/** Detect Capacitor native environment (iOS or Android). */
export function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false
  return !!(window as Window & { Capacitor?: unknown }).Capacitor
}

/** Register for APNs/FCM push via Capacitor PushNotifications plugin. */
export async function registerCapacitorPush(): Promise<boolean> {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')

    // Request permission
    let perm = await PushNotifications.checkPermissions()
    if (perm.receive === 'prompt') {
      perm = await PushNotifications.requestPermissions()
    }
    if (perm.receive !== 'granted') {
      console.warn('[push] Capacitor push permission denied')
      return false
    }

    // Register for push
    await PushNotifications.register()

    // Listen for registration token
    return new Promise<boolean>((resolve) => {
      let regListener: { remove: () => void } | null = null
      let errListener: { remove: () => void } | null = null
      let settled = false

      const cleanup = () => {
        regListener?.remove()
        errListener?.remove()
      }

      PushNotifications.addListener('registration', (token) => {
        if (settled) return
        console.log('[push] Capacitor push token:', token.value.substring(0, 20) + '...')
        settled = true
        fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            endpoint: `capacitor://${token.value}`,
            keys: { p256dh: '', auth: '' },
            platform: 'ios',
            deviceToken: token.value,
          }),
        }).then(() => {
          cleanup()
          resolve(true)
        }).catch((e) => {
          console.error('[push] failed to save Capacitor token:', e)
          cleanup()
          resolve(false)
        })
      }).then((l) => { regListener = l })

      PushNotifications.addListener('registrationError', (err) => {
        if (settled) return
        console.error('[push] Capacitor registration error:', err)
        settled = true
        cleanup()
        resolve(false)
      }).then((l) => { errListener = l })

      setTimeout(() => {
        if (settled) return
        settled = true
        cleanup()
        resolve(false)
      }, 10000)
    })
  } catch (e) {
    console.error('[push] Capacitor push init failed:', e)
    return false
  }
}

/** iOS only delivers Web Push in a home-screen PWA (iOS 16.4+), not in Safari tabs. */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true)
  )
}

export function isWebPushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function isPushSupported(): boolean {
  // Keep legacy name: Notification API (in-app) works in more contexts than Web Push.
  return typeof window !== 'undefined' && 'Notification' in window
}

export function getPushPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export function getIosPushBlockReason(): string | null {
  if (!isIos()) return null
  if (!isStandalonePwa()) {
    return 'ios-home-screen'
  }
  if (!isWebPushSupported()) {
    return 'ios-version'
  }
  return null
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  if (process.env.NODE_ENV !== 'production') {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.filter((key) => key.startsWith('aurora-')).map((key) => caches.delete(key)))
      }
    } catch (e) {
      console.warn('[push] development service worker cleanup failed', e)
    }
    return null
  }
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  } catch (e) {
    console.error('[push] service worker registration failed', e)
    return null
  }
}

/** Subscribe to Web Push and persist subscription on the server. Requires granted permission. */
export async function subscribeToPush(): Promise<boolean> {
  if (!isWebPushSupported()) return false

  const iosBlock = getIosPushBlockReason()
  if (iosBlock) {
    console.warn('[push] iOS Web Push blocked:', iosBlock)
    return false
  }

  if (Notification.permission !== 'granted') return false

  try {
    const reg = (await navigator.serviceWorker.getRegistration('/')) ?? (await registerServiceWorker())
    if (!reg) {
      console.error('[push] no service worker registration')
      return false
    }

    await navigator.serviceWorker.ready

    const keyRes = await fetch('/api/push/vapid-key', { credentials: 'include' })
    if (!keyRes.ok) {
      console.error('[push] VAPID key unavailable:', keyRes.status)
      return false
    }
    const { publicKey } = await keyRes.json()
    if (!publicKey) return false

    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
    }

    const json = sub.toJSON()
    const saveRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
      }),
    })
    if (!saveRes.ok) {
      const err = await saveRes.json().catch(() => ({}))
      console.error('[push] save subscription failed:', saveRes.status, err)
      return false
    }
    console.log('[push] subscription saved on server')
    return true
  } catch (e) {
    console.error('[push] SW subscribe failed', e)
    return false
  }
}

export async function getPushSubscriptionStatus(): Promise<{
  subscribed: boolean
  count: number
  vapidConfigured: boolean
}> {
  try {
    const res = await fetch('/api/push/status', { credentials: 'include' })
    if (!res.ok) return { subscribed: false, count: 0, vapidConfigured: false }
    return await res.json()
  } catch {
    return { subscribed: false, count: 0, vapidConfigured: false }
  }
}

/** Re-subscribe when permission granted but THIS DEVICE has no subscription (e.g. new tunnel URL). */
let pushSyncedThisSession = false
let pushSyncFailedUntil = 0
let pushSyncInFlight: Promise<boolean> | null = null
const PUSH_SYNC_FAILURE_COOLDOWN_MS = 10 * 60 * 1000

export async function syncPushSubscription(): Promise<boolean> {
  if (pushSyncInFlight) return pushSyncInFlight

  pushSyncInFlight = (async () => {
    if (Date.now() < pushSyncFailedUntil) return false

    // Capacitor native: use native push registration instead of Web Push
    if (isCapacitorNative()) {
      if (pushSyncedThisSession) return true
      const ok = await registerCapacitorPush()
      if (ok) {
        pushSyncedThisSession = true
        pushSyncFailedUntil = 0
      } else {
        pushSyncFailedUntil = Date.now() + PUSH_SYNC_FAILURE_COOLDOWN_MS
      }
      return ok
    }

    if (!isWebPushSupported()) return false
    if (getIosPushBlockReason()) return false
    if (Notification.permission !== 'granted') return false

    // ВАЖНО: проверяем подписку именно этого устройства, а не пользователя.
    // /api/push/status отвечает subscribed=true при наличии ЛЮБОЙ подписки
    // пользователя (например, с ПК) — из-за этого телефон после смены origin
    // никогда не переподписывался и пуши приходили только на ПК.
    const reg =
      (await navigator.serviceWorker.getRegistration('/')) ?? (await registerServiceWorker())
    if (!reg) return false
    await navigator.serviceWorker.ready

    const local = await reg.pushManager.getSubscription()
    if (local && pushSyncedThisSession) return true

    // subscribeToPush() идемпотентен: переиспользует локальную подписку,
    // если она есть, и upsert'ит её на сервере.
    const ok = await subscribeToPush()
    if (ok) {
      pushSyncedThisSession = true
      pushSyncFailedUntil = 0
    } else {
      // Avoid hammering /api/push/subscribe on every focus when Apple returns 400.
      pushSyncFailedUntil = Date.now() + PUSH_SYNC_FAILURE_COOLDOWN_MS
    }
    return ok
  })().finally(() => {
    pushSyncInFlight = null
  })

  return pushSyncInFlight
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.getRegistration('/')
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      const endpoint = sub.endpoint
      await sub.unsubscribe()
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ endpoint }),
      }).catch(() => {})
    }
  } catch (e) {
    console.error('[push] unsubscribe failed', e)
  }
}

/** User-gesture friendly flow: permission → SW → push subscription. */
export async function enableWebPush(): Promise<{ ok: boolean; reason?: string }> {
  // Capacitor native: use native push
  if (isCapacitorNative()) {
    const ok = await registerCapacitorPush()
    return ok ? { ok: true } : { ok: false, reason: 'capacitor-register-failed' }
  }

  if (!isWebPushSupported()) {
    return { ok: false, reason: 'unsupported' }
  }

  const iosBlock = getIosPushBlockReason()
  if (iosBlock) {
    return { ok: false, reason: iosBlock }
  }

  let perm = Notification.permission
  if (perm === 'default') {
    perm = await Notification.requestPermission()
  }
  if (perm !== 'granted') {
    return { ok: false, reason: 'denied' }
  }

  const ok = await subscribeToPush()
  return ok ? { ok: true } : { ok: false, reason: 'subscribe-failed' }
}

export function usePush({ userId, enabled, onMessage }: UsePushOptions) {
  const { chats, activeChatId, messageSoundEnabled } = useAppStore()
  const chatsRef = useRef(chats)
  const activeChatIdRef = useRef(activeChatId)
  const messageSoundEnabledRef = useRef(messageSoundEnabled)

  useEffect(() => {
    chatsRef.current = chats
  }, [chats])
  useEffect(() => {
    activeChatIdRef.current = activeChatId
  }, [activeChatId])
  useEffect(() => {
    messageSoundEnabledRef.current = messageSoundEnabled
  }, [messageSoundEnabled])

  const [inAppNotifications, setInAppNotifications] = useState<InAppNotification[]>([])
  const notifTimerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Cleanup all notification timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of notifTimerRefs.current.values()) clearTimeout(timer)
      notifTimerRefs.current.clear()
    }
  }, [])

  useEffect(() => {
    if (!enabled || !userId) return
    registerServiceWorker().catch(() => {})
    if (Notification.permission === 'granted') {
      syncPushSubscription().catch(() => {})
    }
  }, [enabled, userId])

  useEffect(() => {
    if (!enabled || !userId) return
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Notification.permission === 'granted') {
        syncPushSubscription().catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [enabled, userId])

  const notify = useCallback(
    (title: string, body: string, chatId: string, senderName?: string) => {
      // Both checks used to run only below, after the toast was already
      // queued — so a message in the chat you're currently looking at (or in
      // a muted chat) still popped an in-app toast banner over content
      // that's already on screen / that the user asked not to be notified
      // about. Bail out before creating the toast, not just before the
      // sound/system Notification.
      const isActiveChat = activeChatIdRef.current === chatId
      if (isActiveChat && document.visibilityState === 'visible') return

      const chat = chatsRef.current.find((c) => c.id === chatId)
      if (chat?.isMuted) return

      const notif: InAppNotification = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        body,
        chatId,
        senderName,
        timestamp: Date.now(),
      }
      setInAppNotifications((prev) => [notif, ...prev].slice(0, 5))

      const timerId = setTimeout(() => {
        notifTimerRefs.current.delete(notif.id)
        setInAppNotifications((prev) => prev.filter((n) => n.id !== notif.id))
      }, 5000)
      notifTimerRefs.current.set(notif.id, timerId)

      if (messageSoundEnabledRef.current) {
        playNotificationSound()
      }

      if (isPushSupported() && Notification.permission === 'granted') {
        try {
          const n = new Notification(title, {
            body,
            icon: '/apple-touch-icon.png',
            tag: `aurora-${chatId}`,
            badge: '/apple-touch-icon.png',
          })
          n.onclick = () => {
            window.focus()
            n.close()
            onMessage?.(title, body, chatId)
          }
          setTimeout(() => n.close(), 5000)
        } catch (e) {
          console.error('[push] failed', e)
        }
      }
    },
    [onMessage],
  )

  const dismissNotification = useCallback((id: string) => {
    setInAppNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const clickNotification = useCallback(
    (id: string) => {
      const notif = inAppNotifications.find((n) => n.id === id)
      if (notif?.chatId) {
        onMessage?.(notif.title, notif.body, notif.chatId)
      }
      dismissNotification(id)
    },
    [inAppNotifications, onMessage, dismissNotification],
  )

  return { notify, inAppNotifications, dismissNotification, clickNotification, subscribeToPush }
}
