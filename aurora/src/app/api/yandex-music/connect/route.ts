import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { resolveYandexAccount, isEnvYandexAuthed } from '@/lib/yandex-music'
import { withJsonApi } from '@/lib/with-json-api'

export const GET = withJsonApi(async function GET() {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const row = await db.user.findUnique({
    where: { id: me.id },
    select: { yandexMusicUid: true, yandexMusicToken: true },
  })
  const connected = !!(row?.yandexMusicToken && row?.yandexMusicUid)
  return NextResponse.json({
    connected,
    envConfigured: isEnvYandexAuthed(),
    /** Full tracks available when user or server token is set. */
    fullTracks: connected || isEnvYandexAuthed(),
    uid: connected ? row?.yandexMusicUid : null,
  })
})

export const POST = withJsonApi(async function POST(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'Вставьте токен Яндекс Музыки' }, { status: 400 })
  }

  let account: { uid: string; displayName: string | null; login: string | null }
  try {
    account = await resolveYandexAccount(token)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Неверный токен' },
      { status: 400 },
    )
  }

  await db.user.update({
    where: { id: me.id },
    data: {
      yandexMusicToken: token,
      yandexMusicUid: account.uid,
    },
  })

  return NextResponse.json({
    connected: true,
    fullTracks: true,
    uid: account.uid,
    displayName: account.displayName,
    login: account.login,
  })
})

export const DELETE = withJsonApi(async function DELETE() {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  await db.user.update({
    where: { id: me.id },
    data: { yandexMusicToken: null, yandexMusicUid: null },
  })

  return NextResponse.json({
    connected: false,
    fullTracks: isEnvYandexAuthed(),
    envConfigured: isEnvYandexAuthed(),
  })
})
