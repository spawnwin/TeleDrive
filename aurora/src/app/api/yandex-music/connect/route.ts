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
import { clientIp, rateLimit } from '@/lib/rate-limit'

export const GET = withJsonApi(async function GET() {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const creds = await readUserYandexCredentials(me.id)
  let expired = false
  let uid: string | null = creds?.uid ?? null
  if (creds) {
    // Validates token and clears it from DB when expired
    const status = await getYandexMusicApiForUser(me.id)
    expired = !!status.expired
    if (expired || status.source !== 'user') {
      uid = null
    }
  }

  const connected = !!uid

  return NextResponse.json({
    connected,
    expired,
    envConfigured: isEnvYandexAuthed(),
    fullTracks: connected || isEnvYandexAuthed(),
    uid,
  })
})

export const POST = withJsonApi(async function POST(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  if (!rateLimit(`ym-connect:${me.id}:${clientIp(req)}`, 8, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Слишком много попыток' }, { status: 429 })
  }

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
