import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  findFriendshipBetween,
  getFriendFromFriendship,
  getFriendshipView,
  isBlockedEitherWay,
} from '@/lib/friends'
import { getContactDisplayNameMap, normalizeContactNameInput, upsertContactName } from '@/lib/contacts'
import { withJsonApi } from '@/lib/with-json-api'

const userSelect = {
  id: true,
  username: true,
  name: true,
  avatarColor: true,
  avatarUrl: true,
  online: true,
  lastSeen: true,
} as const

export const GET = withJsonApi(async function GET() {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const friendships = await db.friendship.findMany({
    where: {
      OR: [{ requesterId: me.id }, { addresseeId: me.id }],
      status: { in: ['pending', 'accepted'] },
    },
    include: {
      requester: { select: userSelect },
      addressee: { select: userSelect },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const friends: Array<
    ReturnType<typeof getFriendFromFriendship> & { friendshipId: string }
  > = []
  const incoming: Array<{
    id: string
    user: ReturnType<typeof getFriendFromFriendship>
    createdAt: string
  }> = []
  const outgoing: Array<{
    id: string
    user: ReturnType<typeof getFriendFromFriendship>
    createdAt: string
  }> = []

  for (const f of friendships) {
    const user = getFriendFromFriendship(f, me.id)
    if (f.status === 'accepted') {
      friends.push({ ...user, friendshipId: f.id })
    } else if (f.status === 'pending') {
      if (f.requesterId === me.id) {
        outgoing.push({ id: f.id, user, createdAt: f.createdAt.toISOString() })
      } else {
        incoming.push({ id: f.id, user, createdAt: f.createdAt.toISOString() })
      }
    }
  }

  const peerIds = [
    ...friends.map((f) => f.id),
    ...incoming.map((r) => r.user.id),
    ...outgoing.map((r) => r.user.id),
  ]
  const contactNames = await getContactDisplayNameMap(me.id, peerIds)

  const applyName = <T extends { id: string; name: string }>(u: T): T & { originalName: string } => ({
    ...u,
    originalName: u.name,
    name: contactNames.get(u.id) || u.name,
  })

  const friendsNamed = friends.map((f) => ({ ...applyName(f), friendshipId: f.friendshipId }))
  const incomingNamed = incoming.map((r) => ({ ...r, user: applyName(r.user) }))
  const outgoingNamed = outgoing.map((r) => ({ ...r, user: applyName(r.user) }))

  friendsNamed.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return NextResponse.json({
    friends: friendsNamed,
    incoming: incomingNamed,
    outgoing: outgoingNamed,
  })
})

export const POST = withJsonApi(async function POST(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const userId = typeof body.userId === 'string' ? body.userId : ''
  const contactNameInput =
    body.firstName !== undefined || body.lastName !== undefined
      ? normalizeContactNameInput(body)
      : null
  if (contactNameInput && 'error' in contactNameInput) {
    return NextResponse.json({ error: contactNameInput.error }, { status: 400 })
  }

  if (!userId) {
    return NextResponse.json({ error: 'Укажите пользователя' }, { status: 400 })
  }
  if (userId === me.id) {
    return NextResponse.json({ error: 'Нельзя добавить себя в друзья' }, { status: 400 })
  }

  const target = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!target) {
    return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
  }

  if (await isBlockedEitherWay(me.id, userId)) {
    return NextResponse.json({ error: 'Невозможно отправить заявку' }, { status: 403 })
  }

  const saveContact = async () => {
    if (!contactNameInput || 'error' in contactNameInput) return null
    return upsertContactName(me.id, userId, contactNameInput.firstName, contactNameInput.lastName)
  }

  const existing = await findFriendshipBetween(me.id, userId)

  if (existing?.status === 'accepted') {
    const contact = await saveContact()
    return NextResponse.json(
      {
        error: 'Уже в друзьях',
        friendship: getFriendshipView(existing, me.id),
        contact: contact
          ? { ...contact, displayName: `${contact.firstName}${contact.lastName ? ` ${contact.lastName}` : ''}` }
          : undefined,
      },
      { status: 409 },
    )
  }

  if (existing?.status === 'pending') {
    if (existing.requesterId === me.id) {
      const contact = await saveContact()
      return NextResponse.json({
        friendship: getFriendshipView(existing, me.id),
        message: 'Заявка уже отправлена',
        contact: contact || undefined,
      })
    }
    // Reverse pending — auto-accept
    const updated = await db.friendship.update({
      where: { id: existing.id },
      data: { status: 'accepted' },
      include: {
        requester: { select: userSelect },
        addressee: { select: userSelect },
      },
    })
    const contact = await saveContact()
    return NextResponse.json({
      friendship: getFriendshipView(updated, me.id),
      autoAccepted: true,
      contact: contact || undefined,
    })
  }

  if (existing?.status === 'declined') {
    const updated = await db.friendship.update({
      where: { id: existing.id },
      data: {
        status: 'pending',
        requesterId: me.id,
        addresseeId: userId,
      },
      include: {
        requester: { select: userSelect },
        addressee: { select: userSelect },
      },
    })
    const contact = await saveContact()
    return NextResponse.json({
      friendship: getFriendshipView(updated, me.id),
      contact: contact || undefined,
    })
  }

  try {
    const created = await db.friendship.create({
      data: {
        requesterId: me.id,
        addresseeId: userId,
        status: 'pending',
      },
      include: {
        requester: { select: userSelect },
        addressee: { select: userSelect },
      },
    })

    const contact = await saveContact()

    // Push notification for friend request
    const { sendPushToUser } = await import('@/lib/push-server')
    sendPushToUser(userId, {
      title: 'Aurora',
      body: `${me.name} отправил(а) вам заявку в друзья`,
    }).catch(() => {})

    return NextResponse.json({
      friendship: getFriendshipView(created, me.id),
      contact: contact || undefined,
    })
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === 'P2002') {
      // Race condition: friendship was created between our check and create.
      // Re-query and return the existing one.
      const existing = await db.friendship.findFirst({
        where: {
          OR: [
            { requesterId: me.id, addresseeId: userId },
            { requesterId: userId, addresseeId: me.id },
          ],
        },
        include: {
          requester: { select: userSelect },
          addressee: { select: userSelect },
        },
      })
      if (existing) {
        const contact = await saveContact()
        return NextResponse.json({
          friendship: getFriendshipView(existing, me.id),
          contact: contact || undefined,
        })
      }
    }
    throw e
  }
})
