const INTERNAL_API_URL = process.env.INTERNAL_API_URL || 'http://localhost:3000'
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || ''

/**
 * Called when a user's socket disconnects — if they were hosting a live
 * stream and never explicitly ended it (closed the tab, crashed, lost
 * network), the stream would otherwise stay "live" forever and every viewer
 * who clicks in gets stuck on "Подключение к эфиру..." since no host is
 * there to answer. Returns the roomIds of any streams that got ended so the
 * caller can broadcast `group:end` to whoever is still watching.
 */
export async function endLiveStreamsForUser(userId: string): Promise<string[]> {
  if (!INTERNAL_API_SECRET) return []
  try {
    const res = await fetch(`${INTERNAL_API_URL}/api/internal/end-live-streams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_API_SECRET,
      },
      body: JSON.stringify({ userId }),
    })
    if (!res.ok) {
      console.warn('[call-service] end-live-streams failed', res.status)
      return []
    }
    const data = (await res.json()) as { roomIds?: string[] }
    return data.roomIds ?? []
  } catch (err) {
    console.error('[call-service] end-live-streams error', err)
    return []
  }
}
