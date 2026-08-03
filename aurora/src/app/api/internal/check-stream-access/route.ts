import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireInternalSecret } from '@/lib/internal-api'
import { areUsersBlocked } from '@/lib/user-blocks'

/** Internal: can userId join live stream roomId? Used by call-service group:join. */
export async function POST(req: NextRequest) {
  const unauthorized = requireInternalSecret(req)
  if (unauthorized) return unauthorized

  let userId: string | undefined
  let roomId: string | undefined
  try {
    const body = await req.json()
    userId = typeof body?.userId === 'string' ? body.userId : undefined
    roomId = typeof body?.roomId === 'string' ? body.roomId : undefined
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!userId || !roomId) {
    return NextResponse.json({ error: 'userId and roomId required' }, { status: 400 })
  }

  const stream = await db.liveStream.findFirst({
    where: { roomId, status: 'live' },
    select: { id: true, hostId: true },
  })
  if (!stream) {
    return NextResponse.json({ ok: false, allowed: false, error: 'not_live' })
  }
  if (stream.hostId !== userId && (await areUsersBlocked(userId, stream.hostId))) {
    return NextResponse.json({ ok: false, allowed: false, error: 'blocked' })
  }
  return NextResponse.json({
    ok: true,
    allowed: true,
    hostId: stream.hostId,
    streamId: stream.id,
  })
}
