import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getYandexPlaylistTracks, getYandexPlaylists } from '@/lib/yandex-music'
import { withJsonApi } from '@/lib/with-json-api'

export const GET = withJsonApi(async function GET(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const kind = req.nextUrl.searchParams.get('kind')?.trim()
  const uid = req.nextUrl.searchParams.get('uid')?.trim()

  try {
    if (kind && uid) {
      const result = await getYandexPlaylistTracks(me.id, uid, kind, 80)
      return NextResponse.json(result)
    }
    const result = await getYandexPlaylists(me.id)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[yandex-music/playlists]', e)
    return NextResponse.json(
      {
        playlists: [],
        tracks: [],
        connected: false,
        error: e instanceof Error ? e.message : 'Не удалось загрузить плейлисты',
      },
      { status: 502 },
    )
  }
})
