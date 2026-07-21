import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { getYandexMusicApi, coverUrl, type YandexTrack } from '@/lib/yandex-music'

export const GET = withJsonApi(async function GET(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ tracks: [] })

  const api = await getYandexMusicApi()
  const result = await api.searchTracks(q, 0)
  const items = result?.tracks?.items ?? []

  const tracks: YandexTrack[] = items.slice(0, 30).map((t: {
    id: string | number
    title: string
    artists?: { name: string }[]
    durationMs?: number
    coverUri?: string
  }) => ({
    id: String(t.id),
    title: t.title,
    artist: (t.artists || []).map((a) => a.name).join(', ') || '—',
    durationSec: Math.round((t.durationMs || 0) / 1000),
    coverUrl: coverUrl(t.coverUri, '200x200'),
  }))

  return NextResponse.json({ tracks })
})
