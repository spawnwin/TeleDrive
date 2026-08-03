import { YMApi } from 'yandex-music-api'
import { db } from '@/lib/db'
import { openSecret, sealSecret } from '@/lib/secret-box'

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
      // Shared env token is OFF by default — it would give every user
      // full tracks / likes from one account. Opt in with YANDEX_MUSIC_SHARE_ENV=1.
      const share = process.env.YANDEX_MUSIC_SHARE_ENV === '1'
      const token = process.env.YANDEX_MUSIC_TOKEN
      const uid = process.env.YANDEX_MUSIC_UID
      if (share && token && uid) {
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
  return (
    process.env.YANDEX_MUSIC_SHARE_ENV === '1' &&
    !!(process.env.YANDEX_MUSIC_TOKEN && process.env.YANDEX_MUSIC_UID)
  )
}

export async function readUserYandexCredentials(userId: string): Promise<{
  token: string
  uid: string
} | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { yandexMusicToken: true, yandexMusicUid: true },
  })
  if (!user?.yandexMusicToken || !user?.yandexMusicUid) return null
  try {
    const token = openSecret(user.yandexMusicToken)
    if (!token) return null
    return { token, uid: user.yandexMusicUid }
  } catch (e) {
    console.warn('[yandex-music] failed to open user token', String(e))
    return null
  }
}

export async function saveUserYandexCredentials(
  userId: string,
  token: string,
  uid: string,
): Promise<void> {
  if (process.env.NODE_ENV === 'production' && !process.env.TOKEN_ENCRYPTION_KEY && !process.env.YANDEX_TOKEN_KEY) {
    console.warn('[yandex-music] TOKEN_ENCRYPTION_KEY is not set — storing token sealed with fallback secret')
  }
  await db.user.update({
    where: { id: userId },
    data: {
      yandexMusicToken: sealSecret(token.trim()),
      yandexMusicUid: String(uid),
    },
  })
}

export async function clearUserYandexCredentials(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { yandexMusicToken: null, yandexMusicUid: null },
  })
}

/** Prefer the user's linked Yandex account; otherwise anonymous preview only. */
export async function getYandexMusicApiForUser(userId: string): Promise<{
  api: YMApi
  source: 'user' | 'env' | 'anon'
  expired?: boolean
}> {
  const creds = await readUserYandexCredentials(userId)
  if (creds) {
    try {
      const api = createApi()
      await initApi(api, creds.token, creds.uid)
      await (api as YandexApiExtended).getAccountStatus()
      return { api, source: 'user' }
    } catch (e) {
      console.warn('[yandex-music] user token init failed — clearing', String(e))
      await clearUserYandexCredentials(userId).catch(() => {})
      return { api: await getYandexMusicApi(), source: 'anon', expired: true }
    }
  }
  // Env shared token only when explicitly enabled.
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
  const status = (await (api as YandexApiExtended).getAccountStatus()) as {
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
const YANDEX_COVER_HOSTS = new Set([
  'avatars.yandex.net',
  'avatars.mds.yandex.net',
  'music.yandex.ru',
  'music.yandex.net',
  'yastatic.net',
])

/** Build a cover URL; only Yandex CDN hosts are allowed (blocks SSRF via client cover=). */
export function coverUrl(uri?: string | null, size = '200x200'): string | null {
  if (!uri) return null
  const replaced = uri.replace('%%', size)
  if (/^https?:\/\//i.test(replaced)) {
    try {
      const u = new URL(replaced)
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
      const host = u.hostname.toLowerCase()
      if (
        !YANDEX_COVER_HOSTS.has(host) &&
        !host.endsWith('.yandex.net') &&
        !host.endsWith('.yandex.ru') &&
        !host.endsWith('.yastatic.net')
      ) {
        return null
      }
      return u.toString()
    } catch {
      return null
    }
  }
  // Relative CDN path from the API (e.g. avatars.yandex.net/get-music-content/...)
  const hostGuess = replaced.split('/')[0]?.toLowerCase() || ''
  if (
    hostGuess &&
    (YANDEX_COVER_HOSTS.has(hostGuess) ||
      hostGuess.endsWith('.yandex.net') ||
      hostGuess.endsWith('.yandex.ru') ||
      hostGuess.endsWith('.yastatic.net'))
  ) {
    return `https://${replaced}`
  }
  return null
}

export interface YandexTrack {
  id: string
  title: string
  artist: string
  durationSec: number
  coverUrl: string | null
}

export interface YandexPlaylist {
  kind: string
  title: string
  trackCount: number
  coverUrl: string | null
  uid: string
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
  searchTracks: (query: string, page?: number) => Promise<unknown>
  getUserPlaylists?: () => Promise<
    Array<{
      kind?: string | number
      title?: string
      trackCount?: number
      cover?: { uri?: string }
      owner?: { uid?: string | number }
      uid?: string | number
    }>
  >
  getPlaylist?: (
    user: string | number,
    kind: string | number,
  ) => Promise<{
    tracks?: Array<{
      track?: {
        id: string | number
        title: string
        artists?: { name: string }[]
        durationMs?: number
        coverUri?: string
      }
      id?: string | number
    }>
  }>
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

export async function searchYandexTracks(
  userId: string,
  query: string,
  limit = 30,
): Promise<{ tracks: YandexTrack[]; source: 'user' | 'env' | 'anon'; expired?: boolean }> {
  const { api, source, expired } = await getYandexMusicApiForUser(userId)
  const ym = api as YandexApiExtended
  const result = await ym.searchTracks(query, 0)
  const raw = (result?.tracks as { results?: unknown[]; items?: unknown[] } | undefined) || {}
  const items = (raw.results || raw.items || []) as {
    id: string | number
    title: string
    artists?: { name: string }[]
    durationMs?: number
    coverUri?: string
  }[]
  return {
    tracks: items.slice(0, limit).map(mapRawTrack),
    source,
    expired,
  }
}

/** Liked tracks for the authenticated Yandex account (user or env). */
export async function getYandexLikedTracks(
  userId: string,
  limit = 40,
  offset = 0,
): Promise<{
  tracks: YandexTrack[]
  source: 'user' | 'env' | 'anon'
  connected: boolean
  expired?: boolean
  total: number
  hasMore: boolean
}> {
  const { api, source, expired } = await getYandexMusicApiForUser(userId)
  if (source === 'anon') {
    return { tracks: [], source, connected: false, expired, total: 0, hasMore: false }
  }
  const ym = api as YandexApiExtended
  const liked = await ym.getLikedTracks()
  const metas = liked?.library?.tracks || []
  const total = metas.length
  const slice = metas.slice(offset, offset + limit)
  const tracks: YandexTrack[] = []

  const batchSize = 8
  for (let i = 0; i < slice.length; i += batchSize) {
    const batch = slice.slice(i, i + batchSize)
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

  return {
    tracks,
    source,
    connected: true,
    expired,
    total,
    hasMore: offset + limit < total,
  }
}

export async function getYandexPlaylists(userId: string): Promise<{
  playlists: YandexPlaylist[]
  source: 'user' | 'env' | 'anon'
  connected: boolean
  expired?: boolean
}> {
  const { api, source, expired } = await getYandexMusicApiForUser(userId)
  if (source === 'anon') {
    return { playlists: [], source, connected: false, expired }
  }
  const ym = api as YandexApiExtended
  if (typeof ym.getUserPlaylists !== 'function') {
    return { playlists: [], source, connected: true, expired }
  }
  try {
    const list = await ym.getUserPlaylists()
    const playlists = (list || [])
      .filter((p) => p && p.kind != null)
      .map((p) => ({
        kind: String(p.kind),
        title: p.title || `Плейлист ${p.kind}`,
        trackCount: Number(p.trackCount) || 0,
        coverUrl: coverUrl(p.cover?.uri, '200x200'),
        uid: String(p.owner?.uid || p.uid || ''),
      }))
    return { playlists, source, connected: true, expired }
  } catch (e) {
    console.warn('[yandex-music] getUserPlaylists failed', String(e))
    return { playlists: [], source, connected: true, expired }
  }
}

export async function getYandexPlaylistTracks(
  userId: string,
  ownerUid: string,
  kind: string,
  limit = 50,
): Promise<{ tracks: YandexTrack[]; connected: boolean }> {
  const { api, source } = await getYandexMusicApiForUser(userId)
  if (source === 'anon') return { tracks: [], connected: false }
  const ym = api as YandexApiExtended
  if (typeof ym.getPlaylist !== 'function') return { tracks: [], connected: true }
  try {
    const pl = await ym.getPlaylist(ownerUid, kind)
    const raw = (pl?.tracks || []).slice(0, limit)
    const tracks: YandexTrack[] = []
    for (const row of raw) {
      const t = row.track
      if (t) tracks.push(mapRawTrack(t))
    }
    return { tracks, connected: true }
  } catch (e) {
    console.warn('[yandex-music] getPlaylist failed', String(e))
    return { tracks: [], connected: true }
  }
}

export { mapRawTrack }
