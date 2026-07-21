/* Aurora Messenger Service Worker
 *
 * Responsibilities:
 *  - reliable push notifications (original behaviour, unchanged)
 *  - app-shell precaching so cold starts from the iPhone home screen don't
 *    flash a white screen before the JS bundle hydrates
 *  - runtime cache for static assets (icons, fonts, manifest) and a
 *    network-first strategy for navigations so users always get the latest
 *    HTML but fall back to cache when offline
 */

// v18: bugfix pass (e2ee/archive/push/i18n).
const CACHE_VERSION = 'aurora-v18'
const SHELL_CACHE = `${CACHE_VERSION}-shell`
const ASSET_CACHE = `${CACHE_VERSION}-assets`

// Routes that make up the app shell — anything that isn't an API call,
// a media blob, or a hot path that should always hit the network.
const APP_SHELL_ROUTES = ['/', '/manifest.json', '/sw.js']

const PRECACHE_ASSETS = [
  '/manifest.json',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
  '/logo.png',
  '/sounds/call-ring.wav',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      // Best-effort precache — ignore failures for missing assets so the SW
      // install never fails when an icon hasn't been generated yet.
      await Promise.allSettled([
        ...APP_SHELL_ROUTES.map((url) => cache.add(url)),
        ...PRECACHE_ASSETS.map((url) => cache.add(url)),
      ])
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from previous versions
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload = {
    title: 'Aurora',
    body: 'New message',
    chatId: null,
    url: null,
    type: 'message',
    callId: null,
    fromUserId: null,
    callType: 'audio',
    ringCount: 1,
  }
  try {
    payload = { ...payload, ...event.data.json() }
  } catch {
    payload.body = event.data.text()
  }

  const isCall = payload.type === 'call'
  const isCallCancel = payload.type === 'call-cancel'
  const ringCount = Number(payload.ringCount) || 1
  const openUrl =
    payload.url ||
    (payload.chatId
      ? `/?chat=${payload.chatId}${isCall ? '&call=1' : ''}`
      : payload.fromUserId
        ? `/?callFrom=${payload.fromUserId}`
        : '/')

  event.waitUntil(
    (async () => {
      if (isCallCancel && payload.callId) {
        const prefix = `aurora-call-${payload.callId}`
        const notifications = await self.registration.getNotifications()
        for (const n of notifications) {
          if ((n.tag || '').startsWith(prefix)) n.close()
        }
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        for (const client of clients) {
          client.postMessage({ type: 'STOP_CALL_RING', callId: payload.callId })
        }
        return
      }

      // iOS requires showNotification inside push handler; PNG icons work more reliably than SVG.
      // Stable tag per call — renotify:true replaces the previous notification instead of stacking.
      const notifTag = isCall
        ? `aurora-call-${payload.callId || 'incoming'}`
        : payload.chatId
          ? `aurora-${payload.chatId}`
          : 'aurora'

      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: '/apple-touch-icon.png',
        badge: '/apple-touch-icon.png',
        tag: notifTag,
        renotify: true,
        requireInteraction: isCall,
        silent: false,
        vibrate: isCall ? [600, 250, 600, 250, 600, 250, 600] : undefined,
        sound: isCall ? '/sounds/call-ring.wav' : undefined,
        data: {
          chatId: payload.chatId,
          url: openUrl,
          type: payload.type,
          callId: payload.callId,
          fromUserId: payload.fromUserId,
          callType: payload.callType,
          ringCount,
          profileUserId: payload.profileUserId,
        },
      })

      // Update app icon badge count (Chromium PWA / Android)
      if (!isCall && 'setAppBadge' in self.navigator) {
        try {
          const notifications = await self.registration.getNotifications()
          const chatNotifications = notifications.filter((n) => n.tag && n.tag.startsWith('aurora-') && !n.tag.startsWith('aurora-call-'))
          await self.navigator.setAppBadge(chatNotifications.length || 1)
        } catch {}
      }

      // Tell the app to play the in-app ringtone when visible
      if (isCall) {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        for (const client of clients) {
          client.postMessage({
            type: 'INCOMING_CALL_RING',
            callId: payload.callId,
            fromUserId: payload.fromUserId,
            callType: payload.callType,
          })
        }
      }
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const chatId = data.chatId
  const isCall = data.type === 'call'

  // Clear app icon badge when user interacts with notification
  if ('clearAppBadge' in self.navigator) {
    try { self.navigator.clearAppBadge() } catch {}
  }

  const url =
    (chatId ? `/?chat=${chatId}${isCall ? '&call=1' : ''}` : null) ||
    data.url ||
    (data.fromUserId ? `/?callFrom=${data.fromUserId}` : '/') ||
    '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            chatId,
            callId: data.callId,
            fromUserId: data.fromUserId,
            callType: data.callType,
            isCall,
            profileUserId: data.profileUserId,
          })
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})

// Network-first for navigations (always try the latest HTML, fall back to the
// cached shell when offline — eliminates the white flash on cold starts from
// the home screen icon), cache-first for static assets.
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  // Never cache API calls, uploads, or media blobs — they must always be fresh.
  if (url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/uploads/')) return

  // Navigations: network-first with cached shell fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req)
          const cache = await caches.open(SHELL_CACHE)
          cache.put('/', fresh.clone()).catch(() => {})
          return fresh
        } catch {
          const cached = await caches.match('/')
          if (cached) return cached
          // Last-resort: a minimal HTML shell that re-routes to the app.
          return new Response(
            '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Aurora</title><style>html,body{margin:0;height:100%;background:#0b0b1a;color:#fff;font-family:system-ui,sans-serif}.c{display:flex;height:100%;align-items:center;justify-content:center;flex-direction:column;gap:12px}.s{width:36px;height:36px;border:3px solid #7c3aed;border-top-color:transparent;border-radius:50%;animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}</style><div class="c"><div class="s"></div><p>Loading Aurora…</p></div><script>location.href="/"</script>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
          )
        }
      })(),
    )
    return
  }

  // Static assets (icons, fonts, manifest, JS/CSS chunks): cache-first
  if (
    req.destination === 'image' ||
    req.destination === 'font' ||
    req.destination === 'style' ||
    req.destination === 'script' ||
    req.destination === 'manifest' ||
    url.pathname === '/manifest.json' ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.wav')
  ) {
    event.respondWith(
      (async () => {
        const assetCache = await caches.open(ASSET_CACHE)
        const cached = await assetCache.match(req)
        if (cached) return cached
        try {
          const fresh = await fetch(req)
          if (fresh.ok) assetCache.put(req, fresh.clone()).catch(() => {})
          return fresh
        } catch {
          return cached || Response.error()
        }
      })(),
    )
  }
})

self.addEventListener('notificationclose', async () => {
  try {
    const remaining = await self.registration.getNotifications()
    const chatLeft = remaining.filter((n) => n.tag?.startsWith('aurora-') && !n.tag.startsWith('aurora-call-'))
    if (chatLeft.length === 0) {
      if ('clearAppBadge' in self.navigator) self.navigator.clearAppBadge()
    } else if ('setAppBadge' in self.navigator) {
      self.navigator.setAppBadge(chatLeft.length)
    }
  } catch {}
})
