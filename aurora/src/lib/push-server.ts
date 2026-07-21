import { db } from '@/lib/db'
import { getApnsRuntimeConfig } from '@/lib/apns-config'

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@aurora.local'

let configured = false
let webpush: any = null

type ApnsJwtCache = { token: string; exp: number; keyId: string; teamId: string }
let apnsJwtCache: ApnsJwtCache | null = null

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

async function getApnsJwt(keyId: string, teamId: string, keyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (
    apnsJwtCache &&
    apnsJwtCache.keyId === keyId &&
    apnsJwtCache.teamId === teamId &&
    apnsJwtCache.exp - 60 > now
  ) {
    return apnsJwtCache.token
  }

  const jwt = await import('jsonwebtoken')
  const token = jwt.default.sign({ iss: teamId, iat: now }, keyPem, {
    algorithm: 'ES256',
    header: { alg: 'ES256', kid: keyId },
  })
  apnsJwtCache = { token, exp: now + 50 * 60, keyId, teamId }
  return token
}

/** Send APNs push via HTTP/2 (required by Apple). */
async function sendApnsPush(
  deviceToken: string,
  payload: PushPayload,
): Promise<{ ok: true } | { ok: false; status?: number; reason?: string }> {
  const cfg = getApnsRuntimeConfig()
  if (!cfg) {
    console.warn('[push] APNs not configured — skipping iOS push')
    return { ok: false, reason: 'not-configured' }
  }

  try {
    const fs = await import('fs')
    const http2 = await import('http2')
    const keyPem = fs.readFileSync(cfg.keyPath, 'utf8')
    const bearer = await getApnsJwt(cfg.keyId, cfg.teamId, keyPem)

    const host = cfg.production ? 'api.push.apple.com' : 'api.sandbox.push.apple.com'
    const isCall = payload.type === 'call'
    const isCancel = payload.type === 'call-cancel'

    const apnsPayload = isCancel
      ? {
          aps: {
            'content-available': 1,
          },
          type: 'call-cancel',
          callId: payload.callId || '',
          chatId: payload.chatId || '',
        }
      : {
          aps: {
            alert: { title: payload.title, body: payload.body },
            sound: isCall ? 'default' : 'default',
            badge: 1,
            'mutable-content': 1,
            ...(isCall ? { 'interruption-level': 'time-sensitive' } : {}),
          },
          chatId: payload.chatId || '',
          url: payload.url || '',
          type: payload.type || 'message',
          callId: payload.callId || '',
          fromUserId: payload.fromUserId || '',
          callType: payload.callType || '',
          profileUserId: payload.profileUserId || '',
        }

    const body = JSON.stringify(apnsPayload)

    const result = await new Promise<{ ok: true } | { ok: false; status?: number; reason?: string }>(
      (resolve) => {
        const client = http2.connect(`https://${host}`)
        let settled = false

        const finish = (value: { ok: true } | { ok: false; status?: number; reason?: string }) => {
          if (settled) return
          settled = true
          try {
            client.close()
          } catch {
            /* ignore */
          }
          resolve(value)
        }

        client.on('error', (err) => {
          finish({ ok: false, reason: err.message })
        })

        const req = client.request({
          ':method': 'POST',
          ':path': `/3/device/${deviceToken}`,
          authorization: `Bearer ${bearer}`,
          'apns-topic': cfg.bundleId,
          'apns-push-type': isCancel ? 'background' : 'alert',
          'apns-priority': isCancel ? '5' : '10',
          'apns-expiration': '0',
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        })

        let status = 0
        let responseBody = ''

        req.on('response', (headers) => {
          status = Number(headers[':status'] || 0)
        })
        req.setEncoding('utf8')
        req.on('data', (chunk) => {
          responseBody += chunk
        })
        req.on('end', () => {
          if (status >= 200 && status < 300) {
            finish({ ok: true })
            return
          }
          let reason: string | undefined
          try {
            reason = (JSON.parse(responseBody) as { reason?: string }).reason
          } catch {
            reason = responseBody.slice(0, 120) || undefined
          }
          console.error('[push] APNs error:', status, reason || responseBody)
          finish({ ok: false, status, reason })
        })
        req.on('error', (err) => {
          finish({ ok: false, reason: err.message })
        })

        req.end(body)
      },
    )

    return result
  } catch (err) {
    console.error('[push] APNs send failed:', err)
    return { ok: false, reason: err instanceof Error ? err.message : 'send-failed' }
  }
}

export function getVapidPublicKey(): string | null {
  return VAPID_PUBLIC || null
}

export function isApnsConfigured(): boolean {
  return !!getApnsRuntimeConfig()
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

  const normalized: PushPayload = {
    ...payload,
    url:
      payload.url ||
      (payload.chatId
        ? `/?chat=${payload.chatId}${payload.type === 'call' ? '&call=1' : ''}`
        : payload.fromUserId
          ? `/?callFrom=${payload.fromUserId}`
          : undefined),
  }

  const data = JSON.stringify(normalized)
  console.log('[push] sending', {
    userId,
    subs: deliverable.length,
    skipped: subs.length - deliverable.length,
    title: normalized.title,
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
        const apns = await sendApnsPush(deviceToken, normalized)
        if (apns.ok) {
          result.sent++
          console.log('[push] apns ok', { userId, token: deviceToken.slice(0, 16) + '...' })
        } else {
          result.failed++
          result.errors.push(`apns-${apns.status ?? 'err'}:${apns.reason || 'send-failed'}`)
          const dead =
            apns.status === 410 ||
            apns.reason === 'BadDeviceToken' ||
            apns.reason === 'Unregistered' ||
            apns.reason === 'DeviceTokenNotForTopic' ||
            apns.reason === 'ExpiredToken'
          if (dead) {
            await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
            result.removed++
          }
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
