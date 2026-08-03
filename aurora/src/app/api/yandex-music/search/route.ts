import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { searchYandexTracks } from '@/lib/yandex-music'

export const GET = withJsonApi(async function GET(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ tracks: [] })

  try {
    const result = await searchYandexTracks(me.id, q, 30)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[yandex-music/search]', e)
    return NextResponse.json(
      { tracks: [], error: e instanceof Error ? e.message : 'Search failed' },
      { status: 502 },
    )
  }
})
