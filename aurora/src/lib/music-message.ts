/** Chat music message metadata (Yandex track — no file upload). */

export type ChatMusicMetadata = {
  kind: 'music'
  source: 'yandex'
  trackId: string
  title: string
  artist: string
  coverUrl: string | null
  durationSec: number
}

export function parseChatMusicMetadata(raw: string | null | undefined): ChatMusicMetadata | null {
  if (!raw) return null
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!data || data.kind !== 'music' || data.source !== 'yandex') return null
    const trackId = String(data.trackId || '').trim()
    if (!trackId) return null
    return {
      kind: 'music',
      source: 'yandex',
      trackId,
      title: String(data.title || 'Track'),
      artist: String(data.artist || '—'),
      coverUrl: data.coverUrl ? String(data.coverUrl) : null,
      durationSec: Number(data.durationSec) || 0,
    }
  } catch {
    return null
  }
}

export function buildChatMusicMetadata(track: {
  id: string
  title: string
  artist: string
  coverUrl: string | null
  durationSec: number
}): ChatMusicMetadata {
  return {
    kind: 'music',
    source: 'yandex',
    trackId: String(track.id),
    title: track.title,
    artist: track.artist,
    coverUrl: track.coverUrl,
    durationSec: track.durationSec,
  }
}

export function musicMessageLabel(meta: ChatMusicMetadata): string {
  return `🎵 ${meta.artist} — ${meta.title}`
}
