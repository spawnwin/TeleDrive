import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { withJsonApi } from '@/lib/with-json-api'

function deviceLabel(ua: string | null | undefined): string {
  const raw = (ua || '').trim()
  if (!raw || raw === 'unknown' || raw === 'null' || raw === 'undefined') {
    return 'Старая сессия'
  }
  const s = raw.toLowerCase()
  if (s.includes('iphone') || s.includes('ipad') || s.includes('ios')) return 'iPhone / iPad'
  if (s.includes('android')) return 'Android'
  if (s.includes('mac os') || s.includes('macintosh')) return 'Mac'
  if (s.includes('windows')) return 'Windows'
  if (s.includes('cros')) return 'Chrome OS'
  if (s.includes('linux')) return 'Linux'
  if (s.includes('edg/') || s.includes('edgios') || s.includes('edge')) return 'Edge'
  if (s.includes('opr/') || s.includes('opera')) return 'Opera'
  if (s.includes('yaBrowser'.toLowerCase()) || s.includes('yabrowser')) return 'Яндекс.Браузер'
  if (s.includes('crios') || s.includes('chrome')) return 'Chrome'
  if (s.includes('firefox') || s.includes('fxios')) return 'Firefox'
  if (s.includes('safari')) return 'Safari'
  return raw.slice(0, 48)
}

export const GET = withJsonApi(async function GET() {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const jar = await cookies()
  const currentToken =
    jar.get('messenger_session')?.value ||
    jar.get('aurora_session')?.value ||
    jar.get('session')?.value ||
    jar.get('token')?.value ||
    null

  const sessions = await db.session.findMany({
    where: { userId: me.id, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      token: true,
      createdAt: true,
      expiresAt: true,
      userAgent: true,
      ip: true,
      lastActiveAt: true,
    },
  })

  return NextResponse.json({
    sessions: sessions.map((s: {
      id: string
      token: string
      createdAt: Date
      expiresAt: Date
      userAgent: string | null
      ip: string | null
      lastActiveAt: Date | null
    }) => ({
      id: s.id,
      current: !!currentToken && s.token === currentToken,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      lastActiveAt: s.lastActiveAt || s.createdAt,
      ip: s.ip,
      userAgent: s.userAgent,
      label: deviceLabel(s.userAgent),
    })),
  })
})

export const DELETE = withJsonApi(async function DELETE(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const jar = await cookies()
  const currentToken =
    jar.get('messenger_session')?.value ||
    jar.get('aurora_session')?.value ||
    jar.get('session')?.value ||
    jar.get('token')?.value ||
    null

  const body = await req.json().catch(() => ({}))
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null
  const others = body.others === true

  if (others) {
    await db.session.deleteMany({
      where: {
        userId: me.id,
        ...(currentToken ? { token: { not: currentToken } } : {}),
      },
    })
    return NextResponse.json({ ok: true })
  }

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
  }

  const row = await db.session.findFirst({
    where: { id: sessionId, userId: me.id },
  })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (currentToken && row.token === currentToken) {
    return NextResponse.json({ error: 'Нельзя завершить текущую сессию здесь' }, { status: 400 })
  }

  await db.session.delete({ where: { id: sessionId } })
  return NextResponse.json({ ok: true })
})
