/** Resolve stored upload paths to browser-loadable URLs.
 *
 * If `NEXT_PUBLIC_CDN_BASE_URL` is set (e.g. `https://cdn.example.com`), it is
 * used as the host for relative upload URLs so those assets are served via the
 * CDN. Absolute URLs (http(s):, blob:, data:) and non-upload paths are passed
 * through unchanged. When unset, behavior is unchanged (same-origin absolute
 * URL in the browser, relative on the server).
 */
export function resolveMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  const trimmed = url.trim()
  if (!trimmed) return undefined
  if (/^(https?:|blob:|data:)/i.test(trimmed)) return trimmed
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  const cdnBase = typeof process !== 'undefined'
    ? process.env.NEXT_PUBLIC_CDN_BASE_URL
    : undefined
  if (cdnBase) {
    const base = cdnBase.replace(/\/$/, '')
    return `${base}${path}`
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${path}`
  }
  return path
}

export function isImageUrl(url: string | null | undefined, mime?: string | null, name?: string | null) {
  if (mime?.startsWith('image/')) return true
  const probe = `${url || ''} ${name || ''}`
  return /\.(png|jpe?g|webp|gif|avif|bmp|svg|heic|heif)$/i.test(probe)
}

export function isVideoUrl(url: string | null | undefined, mime?: string | null, name?: string | null) {
  if (mime?.startsWith('video/')) return true
  const probe = `${url || ''} ${name || ''}`
  return /\.(mp4|m4v|mov|webm|ogg|ogv|mkv|hevc|3gp|3g2|avi)$/i.test(probe)
}
