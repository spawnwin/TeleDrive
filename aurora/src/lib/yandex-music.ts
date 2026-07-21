import { YMApi } from 'yandex-music-api'

// Singleton API instance. Anonymous access is enough for search and for
// generating public download URLs (often preview-only). If a token is provided
// via env, we init with it for full-track access.
let apiPromise: Promise<YMApi> | null = null

export function getYandexMusicApi(): Promise<YMApi> {
  if (!apiPromise) {
    apiPromise = (async () => {
      const api = new YMApi()
      const token = process.env.YANDEX_MUSIC_TOKEN
      const uid = process.env.YANDEX_MUSIC_UID
      if (token && uid) {
        try {
          await api.init({ access_token: token, uid: String(uid) })
        } catch (e) {
          console.warn('[yandex-music] init with token failed, falling back to anonymous', String(e))
        }
      }
      return api
    })()
  }
  return apiPromise
}

/** Yandex cover URIs use `%%` as a size placeholder. */
export function coverUrl(uri?: string | null, size = '200x200'): string | null {
  if (!uri) return null
  if (/^https?:\/\//i.test(uri)) return uri.replace('%%', size)
  return `https://${uri.replace('%%', size)}`
}

export interface YandexTrack {
  id: string
  title: string
  artist: string
  durationSec: number
  coverUrl: string | null
}

type DownloadInfo = {
  codec?: string
  preview?: boolean
  bitrateInKbps?: number
  downloadInfoUrl?: string
}

/** Resolve a temporary direct MP3 URL (not stored on our servers). */
export async function getYandexTrackStreamUrl(trackId: string): Promise<string | null> {
  const api = (await getYandexMusicApi()) as YMApi & {
    getTrackDownloadInfo: (id: string) => Promise<DownloadInfo[] | null>
    getTrackDirectLink: (downloadInfoUrl: string) => Promise<string>
  }
  try {
    const infos = await api.getTrackDownloadInfo(trackId)
    if (!infos?.length) return null

    // Prefer a full (non-preview) mp3; fall back to whatever is available.
    const ranked = [...infos].sort((a, b) => {
      const ap = a.preview ? 1 : 0
      const bp = b.preview ? 1 : 0
      if (ap !== bp) return ap - bp
      const ac = a.codec === 'mp3' ? 0 : 1
      const bc = b.codec === 'mp3' ? 0 : 1
      if (ac !== bc) return ac - bc
      return (b.bitrateInKbps || 0) - (a.bitrateInKbps || 0)
    })

    for (const info of ranked) {
      if (!info.downloadInfoUrl) continue
      try {
        const url = await api.getTrackDirectLink(info.downloadInfoUrl)
        if (url) return url
      } catch (e) {
        console.warn(
          `[yandex-music] getTrackDirectLink(${trackId}, ${info.bitrateInKbps}kbps) failed`,
          String(e),
        )
      }
    }
  } catch (e) {
    console.warn(`[yandex-music] getTrackDownloadInfo(${trackId}) failed`, String(e))
  }
  return null
}
