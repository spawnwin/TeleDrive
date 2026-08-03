import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { applyLastSeenPrivacy } from '@/lib/privacy-server'
import { areUsersBlocked } from '@/lib/user-blocks'

export const GET = withJsonApi(async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const membership = await db.chatMember.findUnique({
    where: { userId_chatId: { userId: me.id, chatId: id } },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          avatarColor: true,
          avatarUrl: true,
          online: true,
          lastSeen: true,
          bio: true,
          publicKey: true,
        },
      },
    },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Чат не найден' }, { status: 404 })
  }

  const url = new URL(req.url)
  const roleFilter = url.searchParams.get('role')
  const q = url.searchParams.get('q')?.trim().toLowerCase()
  const take = Math.min(100, Math.max(1, Number(url.searchParams.get('take') || 50)))
  const skip = Math.max(0, Number(url.searchParams.get('skip') || 0))

  const chat = await db.chat.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              avatarColor: true,
              avatarUrl: true,
              online: true,
              lastSeen: true,
              bio: true,
              publicKey: true,
            },
          },
        },
        orderBy: [{ joinedAt: 'asc' }],
      },
    },
  })

  if (!chat) return NextResponse.json({ error: 'Чат не найден' }, { status: 404 })

  const isAdmin = membership.role === 'owner' || membership.role === 'admin'
  if (chat.type === 'channel' && !isAdmin) {
    const subscriberCount = await db.chatMember.count({
      where: { chatId: id, role: 'subscriber' },
    })
    return NextResponse.json({
      myMembership: {
        id: membership.user.id,
        name: membership.user.name,
        username: membership.user.username,
        avatarColor: membership.user.avatarColor,
        avatarUrl: membership.user.avatarUrl,
        online: membership.user.online,
        lastSeen: membership.user.lastSeen,
        bio: membership.user.bio,
        publicKey: membership.user.publicKey,
        role: membership.role,
        joinedAt: membership.joinedAt,
        canDeleteMessages: membership.canDeleteMessages,
        canBanUsers: membership.canBanUsers,
        canPinMessages: membership.canPinMessages,
        canEditInfo: membership.canEditInfo,
        canEditMessages: membership.canEditMessages,
      },
      chat: {
        id: chat.id,
        type: chat.type,
        title: chat.title,
        avatarColor: chat.avatarColor,
        avatarUrl: chat.avatarUrl,
        slug: chat.slug,
        description: chat.description,
        slowModeSeconds: chat.slowModeSeconds,
        commentsEnabled: chat.commentsEnabled,
        discussionChatId: chat.discussionChatId,
        pinnedMessageId: chat.pinnedMessageId,
        createdAt: chat.createdAt,
        members: [],
        memberTotal: subscriberCount,
      },
    })
  }
  // (myMembership presence for channel non-admins is self — no peer leak)

  const roleOrder: Record<string, number> = { owner: 0, admin: 1, member: 2, subscriber: 3 }
  let members = [...chat.members].sort((a, b) => {
    const ra = roleOrder[a.role] ?? 99
    const rb = roleOrder[b.role] ?? 99
    if (ra !== rb) return ra - rb
    return a.joinedAt.getTime() - b.joinedAt.getTime()
  })
  if (roleFilter) {
    if (roleFilter === 'admin') {
      members = members.filter((m) => m.role === 'owner' || m.role === 'admin')
    } else if (roleFilter === 'subscriber') {
      members = members.filter((m) => m.role === 'subscriber')
    } else if (roleFilter === 'member') {
      members = members.filter((m) => m.role !== 'subscriber')
    } else {
      members = members.filter((m) => m.role === roleFilter)
    }
  }
  if (q) {
    members = members.filter(
      (m) =>
        m.user.name.toLowerCase().includes(q) ||
        m.user.username.toLowerCase().includes(q),
    )
  }

  const total = members.length
  const slice = members.slice(skip, skip + take)

  const presenceUsers = [
    membership.user,
    ...slice.map((m) => m.user),
  ]
  const redacted = await applyLastSeenPrivacy(me.id, presenceUsers)
  const byId = new Map(redacted.map((u) => [u.id, u] as const))
  const presenceOf = (u: (typeof membership.user)) => {
    if (u.id === me.id) return { online: u.online, lastSeen: u.lastSeen }
    const r = byId.get(u.id)
    return {
      online: r ? !!r.online : false,
      lastSeen: r ? r.lastSeen ?? null : null,
    }
  }
  const myPresence = presenceOf(membership.user)

  return NextResponse.json({
    myMembership: {
      id: membership.user.id,
      name: membership.user.name,
      username: membership.user.username,
      avatarColor: membership.user.avatarColor,
      avatarUrl: membership.user.avatarUrl,
      online: myPresence.online,
      lastSeen: myPresence.lastSeen,
      bio: membership.user.bio,
      publicKey: membership.user.publicKey,
      role: membership.role,
      joinedAt: membership.joinedAt,
      canDeleteMessages: membership.canDeleteMessages,
      canBanUsers: membership.canBanUsers,
      canPinMessages: membership.canPinMessages,
      canEditInfo: membership.canEditInfo,
      canEditMessages: membership.canEditMessages,
    },
    chat: {
      id: chat.id,
      type: chat.type,
      title: chat.title,
      avatarColor: chat.avatarColor,
      avatarUrl: chat.avatarUrl,
      slug: chat.slug,
      description: chat.description,
      slowModeSeconds: chat.slowModeSeconds,
      commentsEnabled: chat.commentsEnabled,
      discussionChatId: chat.discussionChatId,
      pinnedMessageId: chat.pinnedMessageId,
      createdAt: chat.createdAt,
      members: slice.map((m) => {
        const p = presenceOf(m.user)
        return {
          id: m.user.id,
          name: m.user.name,
          username: m.user.username,
          avatarColor: m.user.avatarColor,
          avatarUrl: m.user.avatarUrl,
          online: p.online,
          lastSeen: p.lastSeen,
          bio: m.user.bio,
          publicKey: m.user.publicKey,
          role: m.role,
          joinedAt: m.joinedAt,
          canDeleteMessages: m.canDeleteMessages,
          canBanUsers: m.canBanUsers,
          canPinMessages: m.canPinMessages,
          canEditInfo: m.canEditInfo,
          canEditMessages: m.canEditMessages,
        }
      }),
      memberTotal: total,
    },
  })
})

export const POST = withJsonApi(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { userId, role: requestedRole } = body ?? {}
  if (!userId) {
    return NextResponse.json({ error: 'Укажите userId' }, { status: 400 })
  }

  const myMembership = await db.chatMember.findUnique({
    where: { userId_chatId: { userId: me.id, chatId: id } },
  })
  if (!myMembership || !['owner', 'admin'].includes(myMembership.role)) {
    return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
  }

  const chat = await db.chat.findUnique({ where: { id } })
  if (!chat || (chat.type !== 'group' && chat.type !== 'channel')) {
    return NextResponse.json({ error: 'Только для групп и каналов' }, { status: 400 })
  }

  const existing = await db.chatMember.findUnique({
    where: { userId_chatId: { userId, chatId: id } },
  })
  if (existing) {
    return NextResponse.json({ error: 'Уже участник' }, { status: 409 })
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, isBanned: true },
  })
  if (!target || target.isBanned) {
    return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
  }
  if (await areUsersBlocked(me.id, userId)) {
    return NextResponse.json({ error: 'Пользователь заблокирован' }, { status: 403 })
  }

  // Admin re-invite clears chat ban (e.g. stale ban from old kick bug)
  await db.chatBan.deleteMany({ where: { chatId: id, userId } })

  let role = 'member'
  if (chat.type === 'channel') {
    role = requestedRole === 'admin' ? 'admin' : 'subscriber'
    if (role === 'admin' && myMembership.role !== 'owner') {
      return NextResponse.json({ error: 'Только владелец может добавлять админов' }, { status: 403 })
    }
  }

  await db.chatMember.create({
    data: { userId, chatId: id, role },
  })

  return NextResponse.json({ ok: true, role })
})
