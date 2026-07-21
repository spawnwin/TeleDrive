import { db } from '@/lib/db'

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@aurora.local'

// APNs configuration (Apple Push Notification service)
const APNS_KEY_ID = process.env.APNS_KEY_ID || ''
const APNS_TEAM_ID = process.env.APNS_TEAM_ID || ''
const APNS_KEY_PATH = process.env.APNS_KEY_PATH || '' // Path to .p8 auth key file
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID || 'com.aurora.messenger'
const APNS_PRODUCTION = process.env.APNS_PRODUCTION === 'true' // false = sandbox

let configured = false

let webpush: any = null

async function getWebPush() {
  if (webpush) return webpush
  try {
    webpush = await import('web-push')
    return webpush
  } catch (err) {
    console.error('[push] web-push import failed:', err)
    return null
  }
}

async function ensureVapid() {
  if (configured) return !!VAPID_PUBLIC && !!VAPID_PRIVATE
  const wp = await getWebPush()
  if (!wp || !VAPID_PUBLIC || !VAPID_PRIVATE) {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      console.warn('[push] VAPID keys missing — push disabled')
    }
    return false
  }
  wp.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
  configured = true
  return true
}

/** Send APNs push notification to an iOS device token. */
async function sendApnsPush(
  deviceToken: string,
  payload: { title: string; body: string; chatId?: string; [key: string]: unknown },
): Promise<boolean> {
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_KEY_PATH) {
    console.warn('[push] APNs not configured — skipping iOS push')
    return false
  }

  try {
    const fs = await import('fs')
    const jwt = await import('jsonwebtoken')

    const key = fs.readFileSync(APNS_KEY_PATH, 'utf8')
    const token = jwt.default.sign(
      { iss: APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) },
      key,
      { algorithm: 'ES256', header: { alg: 'ES256', kid: APNS_KEY_ID } },
    )

    const host = APNS_PRODUCTION ? 'api.push.apple.com' : 'api.sandbox.push.apple.com'
    const apnsPayload = {
      aps: {
        alert: { title: payload.title, body: payload.body },
        sound: 'default',
        badge: 1,
        'mutable-content': 1,
      },
      chatId: payload.chatId || '',
      ...payload,
    }

    const res = await fetch(`https://${host}/3/device/${deviceToken}`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${token}`,
        'apns-topic': APNS_BUNDLE_ID,
        'apns-push-type': 'alert',
        'apns-priority': '10',
      },
      body: JSON.stringify(apnsPayload),
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error('[push] APNs error:', res.status, errBody)
      return false
    }
    return true
  } catch (err) {
    console.error('[push] APNs send failed:', err)
    return false
  }
}

export function getVapidPublicKey(): string | null {
  return VAPID_PUBLIC || null
}

export type PushPayload = {
  title: string
  body: string
  chatId?: string
  url?: string
  type?: 'message' | 'call' | 'call-cancel'
  callId?: string
  fromUserId?: string
  callType?: 'audio' | 'video'
  ringCount?: number
  /** Opens this user's profile (wall) when the notification is clicked while the app is already running. */
  profileUserId?: string
}

export type PushSendResult = {
  sent: number
  failed: number
  removed: number
  errors: string[]
}

export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  opts?: { skipEndpointsOfUserId?: string },
): Promise<PushSendResult> {
  const result: PushSendResult = { sent: 0, failed: 0, removed: 0, errors: [] }

  const subs = await db.pushSubscription.findMany({ where: { userId } })
  if (subs.length === 0) {
    console.log('[push] no subscriptions for user', userId)
    return result
  }

  // Defense in depth: never deliver to a device endpoint that is also
  // registered to the sender (shared iPhone / account-switch leftovers).
  let skipEndpoints = new Set<string>()
  if (opts?.skipEndpointsOfUserId) {
    const senderSubs = await db.pushSubscription.findMany({
      where: { userId: opts.skipEndpointsOfUserId },
      select: { endpoint: true },
    })
    skipEndpoints = new Set(senderSubs.map((s) => s.endpoint))
  }

  const deliverable = subs.filter((sub) => !skipEndpoints.has(sub.endpoint))
  if (deliverable.length === 0) {
    console.log('[push] all endpoints skipped (shared with sender)', { userId })
    return result
  }

  const data = JSON.stringify(payload)
  console.log('[push] sending', {
    userId,
    subs: deliverable.length,
    skipped: subs.length - deliverable.length,
    title: payload.title,
  })

  // Determine if we have web push configured
  const hasVapid = await ensureVapid()
  const wp = hasVapid ? await getWebPush() : null

  await Promise.allSettled(
    deliverable.map(async (sub) => {
      // Detect native iOS subscription (Capacitor)
      const isNativeIos = sub.endpoint.startsWith('capacitor://')

      if (isNativeIos) {
        // Send via APNs
        const deviceToken = sub.endpoint.replace('capacitor://', '')
        const ok = await sendApnsPush(deviceToken, payload)
        if (ok) {
          result.sent++
          console.log('[push] apns ok', { userId, token: deviceToken.slice(0, 16) + '...' })
        } else {
          result.failed++
          result.errors.push('apns-send-failed')
        }
        return
      }

      // Web Push (FCM/VAPID)
      if (!wp) {
        result.failed++
        result.errors.push('web-push-unavailable')
        return
      }

      try {
        await wp.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          data,
        )
        result.sent++
        console.log('[push] ok', { userId, endpoint: sub.endpoint.slice(0, 48) })
      } catch (err: unknown) {
        result.failed++
        const status = (err as { statusCode?: number })?.statusCode
        const message = err instanceof Error ? err.message : String(err)
        result.errors.push(`${status ?? 'err'}: ${message}`)
        console.warn('[push] failed', {
          userId,
          status,
          endpoint: sub.endpoint.slice(0, 48),
          message,
        })
        if (status === 404 || status === 410) {
          await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
          result.removed++
        }
      }
    }),
  )

  return result
}

export async function sendPushToOfflineChatMembers(
  chatId: string,
  senderId: string,
  payload: { title: string; body: string },
) {
  const members = await db.chatMember.findMany({
    where: { chatId, userId: { not: senderId } },
  })

  const ONLINE_RECENT_MS = 90 * 1000

  for (const m of members) {
    if (m.isMuted) continue
    const user = await db.user.findUnique({
      where: { id: m.userId },
      select: { online: true, lastSeen: true },
    })
    if (
      user?.online &&
      user.lastSeen &&
      Date.now() - user.lastSeen.getTime() < ONLINE_RECENT_MS
    ) {
      continue
    }
    const subCount = await db.pushSubscription.count({ where: { userId: m.userId } })
    if (subCount === 0) continue
    await sendPushToUser(
      m.userId,
      { ...payload, chatId, fromUserId: senderId },
      { skipEndpointsOfUserId: senderId },
    )
  }
}
