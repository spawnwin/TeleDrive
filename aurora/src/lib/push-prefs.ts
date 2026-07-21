const PUSH_ENABLED_KEY = 'aurora-push-enabled'
const SHOW_PREVIEW_KEY = 'aurora-show-notification-preview'
const PREFS_CACHE = 'aurora-prefs'
const PREVIEW_CACHE_URL = '/aurora-prefs/show-preview'

export function loadPushEnabledPreference(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(PUSH_ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

export function savePushEnabledPreference(enabled: boolean) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(PUSH_ENABLED_KEY, enabled ? '1' : '0')
  } catch {}
}

/** Default ON — match previous Switch defaultChecked behaviour. */
export function loadShowNotificationPreview(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const raw = localStorage.getItem(SHOW_PREVIEW_KEY)
    if (raw === null) return true
    return raw === '1'
  } catch {
    return true
  }
}

export function saveShowNotificationPreview(enabled: boolean) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SHOW_PREVIEW_KEY, enabled ? '1' : '0')
  } catch {}
  void syncShowPreviewToServiceWorker(enabled)
}

/** Persist preview flag for the service worker (background push). */
export async function syncShowPreviewToServiceWorker(enabled?: boolean) {
  if (typeof window === 'undefined' || !('caches' in window)) return
  const value = enabled ?? loadShowNotificationPreview()
  try {
    const cache = await caches.open(PREFS_CACHE)
    await cache.put(
      PREVIEW_CACHE_URL,
      new Response(JSON.stringify({ showPreview: value }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  } catch {
    /* ignore */
  }
}
