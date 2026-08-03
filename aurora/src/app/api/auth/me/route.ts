import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { withJsonApi } from '@/lib/with-json-api'

export const GET = withJsonApi(async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ user: null }, { status: 200 })

    const ym = await db.user.findUnique({
      where: { id: user.id },
      select: { yandexMusicToken: true, yandexMusicUid: true },
    })
    const yandexMusicConnected = !!(ym?.yandexMusicToken && ym?.yandexMusicUid)

    return NextResponse.json({
      user: {
        ...user,
        yandexMusicConnected,
      },
    })
  } catch (err) {
    console.error('[GET /api/auth/me]', err)
    return NextResponse.json({ error: 'Ошибка сервера', user: null }, { status: 500 })
  }
})
