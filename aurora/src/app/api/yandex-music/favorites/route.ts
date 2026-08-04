import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getYandexLikedTracks } from '@/lib/yandex-music'
import { withJsonApi } from '@/lib/with-json-api'
import { rateLimit } from '@/lib/rate-limit'

export const GET = withJsonApi(async function GET(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  if (!rateLimit(`ym-fav:${me.id}`, 30, 60 * 1000)) {
    return NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 })
  }

  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || 40))
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset')) || 0)

  try {
    const result = await getYandexLikedTracks(me.id, limit, offset)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[yandex-music/favorites]', e)
    return NextResponse.json(
      {
        tracks: [],
        connected: false,
        source: 'anon',
        total: 0,
        hasMore: false,
        error: e instanceof Error ? e.message : 'Не удалось загрузить избранное',
      },
      { status: 502 },
    )
  }
})
