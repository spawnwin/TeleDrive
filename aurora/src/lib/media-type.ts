/** MIME types accepted for video uploads. */
export const VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-matroska',
  'video/hevc',
  'video/3gpp',
  'video/x-msvideo',
] as const

/** File extensions treated as images when MIME is missing (iOS HEIC). */
export const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'avif',
  'bmp',
  'svg',
  'heic',
  'heif',
])

const EXT_TO_IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
}

/** File extensions treated as video when MIME is missing (common on iOS Safari). */
export const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'm4v',
  'mov',
  'webm',
  'ogg',
  'ogv',
  'mkv',
  'hevc',
  '3gp',
  '3g2',
  'avi',
])

const EXT_TO_VIDEO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  ogg: 'video/ogg',
  ogv: 'video/ogg',
  mkv: 'video/x-matroska',
  hevc: 'video/hevc',
  '3gp': 'video/3gpp',
  '3g2': 'video/3gpp',
  avi: 'video/x-msvideo',
}

export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || ''
}

const EXT_TO_VOICE_MIME: Record<string, string> = {
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  caf: 'audio/x-caf',
}

/** Voice message filename prefix from chat recorder. */
export function isVoiceFilename(name: string): boolean {
  const base = name.split('/').pop()?.toLowerCase() || ''
  return base.startsWith('voice-')
}

/** Detect voice from MIME and/or recorder filename (voice-*.webm). */
export function isVoiceFile(file: { type?: string; name: string }): boolean {
  const mime = (file.type || '').toLowerCase().trim()
  if (mime.startsWith('audio/')) return true
  if (isVoiceFilename(file.name)) return true
  return false
}

/** Resolve voice MIME; maps mistaken video/webm from audio-only MediaRecorder to audio/webm. */
export function resolveVoiceMime(file: { type?: string; name: string }): string | null {
  const mime = (file.type || '').toLowerCase().trim()
  if (mime.startsWith('audio/')) return mime
  if (mime === 'video/webm' && isVoiceFilename(file.name)) return 'audio/webm'
  if (isVoiceFilename(file.name)) {
    const ext = getFileExtension(file.name)
    return EXT_TO_VOICE_MIME[ext] || 'audio/webm'
  }
  return null
}

/** Resolve a usable video MIME when the browser sends an empty or generic type (iOS .mov). */
export function resolveVideoMime(file: { type?: string; name: string }): string | null {
  if (isVoiceFile(file)) return null
  const mime = (file.type || '').toLowerCase().trim()
  if (
    mime &&
    mime !== 'application/octet-stream' &&
    (VIDEO_MIME_TYPES.includes(mime as (typeof VIDEO_MIME_TYPES)[number]) || mime.startsWith('video/'))
  ) {
    return mime
  }
  const ext = getFileExtension(file.name)
  return EXT_TO_VIDEO_MIME[ext] || null
}

/** Best-effort MIME for uploads when the client omits type metadata. */
export function resolveAttachmentMime(file: { type?: string; name: string }): string {
  return (
    resolveVoiceMime(file) ||
    resolveVideoMime(file) ||
    resolveImageMime(file) ||
    (file.type || '').trim() ||
    'application/octet-stream'
  )
}

export function resolveImageMimeFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url, 'http://local').pathname
    const ext = getFileExtension(pathname)
    return EXT_TO_IMAGE_MIME[ext] || null
  } catch {
    const ext = getFileExtension(url.split('?')[0] || '')
    return EXT_TO_IMAGE_MIME[ext] || null
  }
}

export function resolveImageMime(file: { type?: string; name: string }): string | null {
  const mime = (file.type || '').toLowerCase().trim()
  if (mime && mime !== 'application/octet-stream' && mime.startsWith('image/')) {
    return mime
  }
  const ext = getFileExtension(file.name)
  return EXT_TO_IMAGE_MIME[ext] || null
}

/** Detect image from MIME and/or filename (iOS often sends empty MIME for .heic). */
export function isImageFile(file: { type?: string; name: string }): boolean {
  const mime = (file.type || '').toLowerCase()
  if (mime.startsWith('image/')) return true
  if (!mime || mime === 'application/octet-stream') {
    return IMAGE_EXTENSIONS.has(getFileExtension(file.name))
  }
  return IMAGE_EXTENSIONS.has(getFileExtension(file.name))
}

/** Detect video from MIME and/or filename (iOS often sends empty MIME for .mov). */
export function isVideoFile(file: { type?: string; name: string }): boolean {
  if (isVoiceFile(file)) return false
  const mime = (file.type || '').toLowerCase()
  if (mime.startsWith('audio/')) return false
  if (VIDEO_MIME_TYPES.includes(mime as (typeof VIDEO_MIME_TYPES)[number])) return true
  if (mime.startsWith('video/')) return true
  if (!mime || mime === 'application/octet-stream') {
    return VIDEO_EXTENSIONS.has(getFileExtension(file.name))
  }
  return false
}

/** Accept attribute for mobile-friendly video file inputs. */
export const VIDEO_INPUT_ACCEPT =
  'video/*,.mov,.mp4,.m4v,video/mp4,video/webm,video/ogg,video/quicktime,video/x-matroska,video/hevc,video/3gpp'

/** Chat paperclip: images + videos (iOS needs explicit .mov / HEIC). */
export const CHAT_ATTACHMENT_ACCEPT = `${VIDEO_INPUT_ACCEPT},image/*,image/png,image/jpeg,image/jpg,image/webp,image/gif,image/heic,image/heif,.heic,.heif`

/** Profile gallery / story photo inputs (iOS needs explicit types). */
export const PHOTO_INPUT_ACCEPT =
  'image/*,image/png,image/jpeg,image/jpg,image/webp,image/gif,image/heic,image/heif'

/** Combined photo + video for profile gallery uploads. */
export const GALLERY_INPUT_ACCEPT = `${PHOTO_INPUT_ACCEPT},${VIDEO_INPUT_ACCEPT}`

/** Resolve video MIME from a URL path (for <source type="..."> on mobile Safari). */
export function resolveVideoMimeFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url, 'http://local').pathname
    const ext = getFileExtension(pathname)
    return EXT_TO_VIDEO_MIME[ext] || null
  } catch {
    const ext = getFileExtension(url.split('?')[0] || '')
    return EXT_TO_VIDEO_MIME[ext] || null
  }
}
