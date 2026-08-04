import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { readUserYandexCredentials } from '@/lib/yandex-music'
import { withJsonApi } from '@/lib/with-json-api'

export const GET = withJsonApi(async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ user: null }, { status: 200 })

    // Lightweight check (sealed token present). Expired tokens are cleared
    // lazily by music endpoints / settings connect status.
    const ym = await readUserYandexCredentials(user.id)
    const yandexMusicConnected = !!ym

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
