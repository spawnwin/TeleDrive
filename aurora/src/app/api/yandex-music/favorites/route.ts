import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getYandexLikedTracks } from '@/lib/yandex-music'
import { withJsonApi } from '@/lib/with-json-api'

export const GET = withJsonApi(async function GET() {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  try {
    const result = await getYandexLikedTracks(me.id, 50)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[yandex-music/favorites]', e)
    return NextResponse.json(
      {
        tracks: [],
        connected: false,
        source: 'anon',
        error: e instanceof Error ? e.message : 'Не удалось загрузить избранное',
      },
      { status: 502 },
    )
  }
})
