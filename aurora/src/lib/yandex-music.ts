import { YMApi } from 'yandex-music-api'
import { db } from '@/lib/db'

// Env-based singleton (anonymous or shared server token).
let envApiPromise: Promise<YMApi> | null = null

function createApi(): YMApi {
  return new YMApi()
}

async function initApi(api: YMApi, token: string, uid: string): Promise<YMApi> {
  await api.init({ access_token: token, uid: String(uid) })
  return api
}

export function getYandexMusicApi(): Promise<YMApi> {
  if (!envApiPromise) {
    envApiPromise = (async () => {
      const api = createApi()
      const token = process.env.YANDEX_MUSIC_TOKEN
      const uid = process.env.YANDEX_MUSIC_UID
      if (token && uid) {
        try {
          await initApi(api, token, String(uid))
        } catch (e) {
          console.warn('[yandex-music] env token init failed, falling back to anonymous', String(e))
        }
      }
      return api
    })()
  }
  return envApiPromise
}

export function isEnvYandexAuthed(): boolean {
  return !!(process.env.YANDEX_MUSIC_TOKEN && process.env.YANDEX_MUSIC_UID)
}

/** Prefer the user's linked Yandex account; fall back to env / anonymous. */
export async function getYandexMusicApiForUser(userId: string): Promise<{
  api: YMApi
  source: 'user' | 'env' | 'anon'
}> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { yandexMusicToken: true, yandexMusicUid: true },
  })
  if (user?.yandexMusicToken && user?.yandexMusicUid) {
    try {
      const api = createApi()
      await initApi(api, user.yandexMusicToken, user.yandexMusicUid)
      return { api, source: 'user' }
    } catch (e) {
      console.warn('[yandex-music] user token init failed', String(e))
    }
  }
  if (isEnvYandexAuthed()) {
    return { api: await getYandexMusicApi(), source: 'env' }
  }
  return { api: await getYandexMusicApi(), source: 'anon' }
}

/** Validate a token and resolve the account uid. */
export async function resolveYandexAccount(token: string): Promise<{
  uid: string
  displayName: string | null
  login: string | null
}> {
  const api = createApi()
  // uid is required by ym-api.init shape; real uid comes from account/status.
  await initApi(api, token.trim(), '1')
  const status = (await api.getAccountStatus()) as {
    account?: { uid?: number | string; displayName?: string; login?: string }
  }
  const uid = status?.account?.uid
  if (uid == null || uid === '') {
    throw new Error('Не удалось получить аккаунт Яндекс Музыки')
  }
  return {
    uid: String(uid),
    displayName: status.account?.displayName || null,
    login: status.account?.login || null,
  }
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

type YandexApiExtended = YMApi & {
  getTrackDownloadInfo: (id: string) => Promise<DownloadInfo[] | null>
  getTrackDirectLink: (downloadInfoUrl: string) => Promise<string>
  getLikedTracks: (user?: string | number | null) => Promise<{
    library?: { tracks?: Array<{ id: string; albumId?: string }> }
  }>
  getTrack: (trackId: string) => Promise<
    Array<{
      id: string | number
      title: string
      artists?: { name: string }[]
      durationMs?: number
      coverUri?: string
    }>
  >
  getAccountStatus: () => Promise<unknown>
}

export async function getYandexTrackStreamUrl(
  trackId: string,
  userId?: string,
): Promise<{ url: string; preview: boolean } | null> {
  const { api } = userId
    ? await getYandexMusicApiForUser(userId)
    : { api: await getYandexMusicApi() }
  const ym = api as YandexApiExtended
  try {
    const infos = await ym.getTrackDownloadInfo(trackId)
    if (!infos?.length) return null

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
        const url = await ym.getTrackDirectLink(info.downloadInfoUrl)
        if (url) return { url, preview: !!info.preview }
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

function mapRawTrack(t: {
  id: string | number
  title: string
  artists?: { name: string }[]
  durationMs?: number
  coverUri?: string
}): YandexTrack {
  return {
    id: String(t.id),
    title: t.title,
    artist: (t.artists || []).map((a) => a.name).join(', ') || '—',
    durationSec: Math.round((t.durationMs || 0) / 1000),
    coverUrl: coverUrl(t.coverUri, '200x200'),
  }
}

/** Liked tracks for the authenticated Yandex account (user or env). */
export async function getYandexLikedTracks(
  userId: string,
  limit = 40,
): Promise<{ tracks: YandexTrack[]; source: 'user' | 'env' | 'anon'; connected: boolean }> {
  const { api, source } = await getYandexMusicApiForUser(userId)
  if (source === 'anon') {
    return { tracks: [], source, connected: false }
  }
  const ym = api as YandexApiExtended
  const liked = await ym.getLikedTracks()
  const metas = (liked?.library?.tracks || []).slice(0, limit)
  const tracks: YandexTrack[] = []

  const batchSize = 8
  for (let i = 0; i < metas.length; i += batchSize) {
    const batch = metas.slice(i, i + batchSize)
    const resolved = await Promise.all(
      batch.map(async (m) => {
        try {
          const key = m.albumId ? `${m.id}:${m.albumId}` : m.id
          const arr = await ym.getTrack(key)
          const t = Array.isArray(arr) ? arr[0] : null
          return t ? mapRawTrack(t) : null
        } catch {
          return null
        }
      }),
    )
    for (const t of resolved) {
      if (t) tracks.push(t)
    }
  }

  return { tracks, source, connected: true }
}

export { mapRawTrack }
