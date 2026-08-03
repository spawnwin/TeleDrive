import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { getFriendshipView, isBlockedEitherWay } from '@/lib/friends'
import { withJsonApi } from '@/lib/with-json-api'

export const PATCH = withJsonApi(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const action = body.action as string

  if (!['accept', 'decline', 'remove'].includes(action)) {
    return NextResponse.json({ error: 'Неверное действие' }, { status: 400 })
  }

  const friendship = await db.friendship.findUnique({ where: { id } })
  if (!friendship) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
  }

  const isParticipant =
    friendship.requesterId === me.id || friendship.addresseeId === me.id
  if (!isParticipant) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
  }

  if (action === 'accept') {
    if (friendship.status !== 'pending') {
      return NextResponse.json({ error: 'Заявка уже обработана' }, { status: 400 })
    }
    if (friendship.addresseeId !== me.id) {
      return NextResponse.json({ error: 'Только получатель может принять заявку' }, { status: 403 })
    }
    const peerId =
      friendship.requesterId === me.id ? friendship.addresseeId : friendship.requesterId
    if (await isBlockedEitherWay(me.id, peerId)) {
      await db.friendship.delete({ where: { id } })
      return NextResponse.json({ error: 'Пользователь недоступен' }, { status: 403 })
    }
    const updated = await db.friendship.update({
      where: { id },
      data: { status: 'accepted' },
    })
    return NextResponse.json({ friendship: getFriendshipView(updated, me.id) })
  }

  if (action === 'decline') {
    if (friendship.status !== 'pending') {
      return NextResponse.json({ error: 'Заявка уже обработана' }, { status: 400 })
    }
    if (friendship.addresseeId !== me.id) {
      return NextResponse.json({ error: 'Только получатель может отклонить заявку' }, { status: 403 })
    }
    const updated = await db.friendship.update({
      where: { id },
      data: { status: 'declined' },
    })
    return NextResponse.json({ friendship: getFriendshipView(updated, me.id) })
  }

  // remove — delete friendship (accepted or cancel outgoing pending)
  if (friendship.status === 'pending' && friendship.requesterId !== me.id) {
    return NextResponse.json({ error: 'Используйте отклонение для входящих заявок' }, { status: 400 })
  }

  await db.friendship.delete({ where: { id } })
  return NextResponse.json({ friendship: { id: null, status: 'none' } })
})
