import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import {
  clearUserYandexCredentials,
  isEnvYandexAuthed,
  readUserYandexCredentials,
  resolveYandexAccount,
  saveUserYandexCredentials,
  getYandexMusicApiForUser,
} from '@/lib/yandex-music'
import { withJsonApi } from '@/lib/with-json-api'

export const GET = withJsonApi(async function GET() {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const creds = await readUserYandexCredentials(me.id)
  const connected = !!creds
  let expired = false
  if (connected) {
    const status = await getYandexMusicApiForUser(me.id)
    expired = !!status.expired && status.source !== 'user'
  }

  return NextResponse.json({
    connected: connected && !expired,
    expired,
    envConfigured: isEnvYandexAuthed(),
    fullTracks: (connected && !expired) || isEnvYandexAuthed(),
    uid: connected && !expired ? creds?.uid : null,
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

  await saveUserYandexCredentials(me.id, token, account.uid)

  return NextResponse.json({
    connected: true,
    expired: false,
    fullTracks: true,
    uid: account.uid,
    displayName: account.displayName,
    login: account.login,
  })
})

export const DELETE = withJsonApi(async function DELETE() {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  await clearUserYandexCredentials(me.id)

  return NextResponse.json({
    connected: false,
    fullTracks: isEnvYandexAuthed(),
    envConfigured: isEnvYandexAuthed(),
  })
})
