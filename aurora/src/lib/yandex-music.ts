import { YMApi } from 'yandex-music-api'

// Singleton API instance. Anonymous access is enough for search and for
// generating public download URLs. If a token is provided via env, we init
// with it for higher quality / full-track access.
let apiPromise: Promise<YMApi> | null = null

export function getYandexMusicApi(): Promise<YMApi> {
  if (!apiPromise) {
    apiPromise = (async () => {
      const api = new YMApi()
      const token = process.env.YANDEX_MUSIC_TOKEN
      const uid = process.env.YANDEX_MUSIC_UID
      if (token && uid) {
        try {
          await api.init({ access_token: token, uid: Number(uid) || uid })
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

/** Resolve a temporary direct MP3 URL (not stored on our servers). */
export async function getYandexTrackStreamUrl(trackId: string): Promise<string | null> {
  const api = await getYandexMusicApi()
  for (const bitrate of [192, 128, 320]) {
    try {
      const url = await api.getMp3DownloadUrl(trackId, bitrate)
      if (url) return url
    } catch (e) {
      console.warn(`[yandex-music] getMp3DownloadUrl(${trackId}, ${bitrate}) failed`, String(e))
    }
  }
  return null
}
