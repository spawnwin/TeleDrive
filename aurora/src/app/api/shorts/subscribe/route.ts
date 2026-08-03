import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { areUsersBlocked } from '@/lib/user-blocks'

// Subscribe the current user to a creator (shorts feed).
export const POST = withJsonApi(async function POST(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const creatorId = (body?.creatorId || '').toString().trim()
  if (!creatorId) {
    return NextResponse.json({ error: 'Не указан автор' }, { status: 400 })
  }
  if (creatorId === me.id) {
    return NextResponse.json({ error: 'Нельзя подписаться на себя' }, { status: 400 })
  }

  const creator = await db.user.findUnique({ where: { id: creatorId }, select: { id: true } })
  if (!creator) {
    return NextResponse.json({ error: 'Автор не найден' }, { status: 404 })
  }
  if (await areUsersBlocked(me.id, creatorId)) {
    return NextResponse.json({ error: 'Автор недоступен' }, { status: 403 })
  }

  try {
    await db.shortSubscription.create({
      data: { subscriberId: me.id, creatorId },
    })
  } catch (err: unknown) {
    // Already subscribed — treat as success.
    if ((err as { code?: string })?.code !== 'P2002') throw err
  }

  const count = await db.shortSubscription.count({ where: { creatorId } })
  return NextResponse.json({ ok: true, isSubscribed: true, subscriberCount: count })
})

// Unsubscribe the current user from a creator.
export const DELETE = withJsonApi(async function DELETE(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const url = new URL(req.url)
  const creatorId = (url.searchParams.get('creatorId') || '').toString().trim()
  if (!creatorId) {
    // Allow body fallback for clients that send a body with DELETE.
    const body = await req.json().catch(() => ({}))
    const fromBody = (body?.creatorId || '').toString().trim()
    if (!fromBody) {
      return NextResponse.json({ error: 'Не указан автор' }, { status: 400 })
    }
    return unsubscribe(me.id, fromBody)
  }
  return unsubscribe(me.id, creatorId)
})

async function unsubscribe(subscriberId: string, creatorId: string) {
  await db.shortSubscription
    .delete({ where: { subscriberId_creatorId: { subscriberId, creatorId } } })
    .catch(() => {})
  const count = await db.shortSubscription.count({ where: { creatorId } })
  return NextResponse.json({ ok: true, isSubscribed: false, subscriberCount: count })
}
