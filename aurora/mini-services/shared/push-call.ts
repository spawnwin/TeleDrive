const INTERNAL_API_URL = process.env.INTERNAL_API_URL || 'http://localhost:3000'
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || ''

export async function sendCallPushNotification(data: {
  targetUserId: string
  fromUserId: string
  fromName: string
  callId: string
  callType: 'audio' | 'video'
  ringCount?: number
}): Promise<void> {
  if (!INTERNAL_API_SECRET) return
  try {
    const res = await fetch(`${INTERNAL_API_URL}/api/internal/push-call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_API_SECRET,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      console.warn('[call-service] push-call failed', res.status)
    }
  } catch (err) {
    console.error('[call-service] push-call error', err)
  }
}

/** Закрыть push-уведомления о звонке на устройстве получателя. */
export async function sendCallCancelPush(data: {
  targetUserId: string
  callId: string
}): Promise<void> {
  if (!INTERNAL_API_SECRET) return
  try {
    await fetch(`${INTERNAL_API_URL}/api/internal/push-call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_API_SECRET,
      },
      body: JSON.stringify({ ...data, cancel: true }),
    })
  } catch (err) {
    console.error('[call-service] push-cancel error', err)
  }
}
