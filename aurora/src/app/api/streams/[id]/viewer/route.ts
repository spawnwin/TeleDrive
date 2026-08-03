import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { areUsersBlocked } from '@/lib/user-blocks'

// Best-effort viewer counter — not money-related, approximate is fine.
// POST { action: 'join' | 'leave' }
export const POST = withJsonApi(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const action = body?.action

  if (action === 'join') {
    const stream = await db.liveStream.findUnique({
      where: { id },
      select: { hostId: true, status: true },
    })
    if (!stream || stream.status !== 'live') {
      return NextResponse.json({ error: 'Стрим не найден' }, { status: 404 })
    }
    if (stream.hostId !== me.id && (await areUsersBlocked(me.id, stream.hostId))) {
      return NextResponse.json({ error: 'Стрим недоступен' }, { status: 403 })
    }
    await db.liveStream.updateMany({
      where: { id, status: 'live' },
      data: { viewerCount: { increment: 1 } },
    })
  } else if (action === 'leave') {
    const stream = await db.liveStream.findUnique({ where: { id }, select: { viewerCount: true } })
    if (stream && stream.viewerCount > 0) {
      await db.liveStream.update({ where: { id }, data: { viewerCount: { decrement: 1 } } })
    }
  } else {
    return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
})
