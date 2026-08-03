import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { getOrCreateSavedChat } from '@/lib/saved-chat'
import { areUsersBlocked } from '@/lib/user-blocks'
import { parseChatWallpaper } from '@/lib/chat-wallpaper'
import { getContactDisplayNameMap } from '@/lib/contacts'
import { withJsonApi } from '@/lib/with-json-api'

export const GET = withJsonApi(async function GET() {
  try {
    const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  await getOrCreateSavedChat(me.id)

  // Telegram-style: channel discussion groups are backing storage for
  // post comments. They must NOT appear as separate chats in the sidebar —
  // comments are accessed only via the comments sheet under each post.
  // Exclude any chat that is linked as a channel's discussionChatId.
  const discussionChatIds = (
    await db.chat.findMany({
      where: { type: 'channel', discussionChatId: { not: null } },
      select: { discussionChatId: true },
    })
  )
    .map((c) => c.discussionChatId)
    .filter((id): id is string => !!id)

  const memberships = await db.chatMember.findMany({
    where: {
      userId: me.id,
      isHidden: false,
      ...(discussionChatIds.length
        ? { chatId: { notIn: discussionChatIds } }
        : {}),
    },
    select: {
      chatId: true,
      lastReadAt: true,
      markedUnread: true,
      isPinned: true,
      isMuted: true,
      isArchived: true,
      pinnedAt: true,
      wallpaper: true,
      chat: {
        include: {
          members: { include: { user: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { sender: true },
          },
        },
      },
    },
    orderBy: [
      { isPinned: 'desc' },
      { pinnedAt: 'desc' },
      { chat: { updatedAt: 'desc' } },
    ],
  })

  const privatePeerIds = memberships
    .filter((m) => m.chat.type === 'private')
    .map((m) => m.chat.members.find((mem) => mem.userId !== me.id)?.userId)
    .filter((id): id is string => !!id)
  const contactNames = await getContactDisplayNameMap(me.id, privatePeerIds)

  // Count unread messages for each chat
  const chats = await Promise.all(
    memberships.map(async (m) => {
      const unreadRaw = await db.message.count({
        where: {
          chatId: m.chatId,
          senderId: { not: me.id },
          createdAt: { gt: m.lastReadAt },
        },
      })
      const unread = m.markedUnread && unreadRaw === 0 ? 1 : unreadRaw
      const otherMember =
        m.chat.type === 'private'
          ? m.chat.members.find((mem) => mem.userId !== me.id)
          : null
      const peerLastReadAt =
        m.chat.type === 'private' && otherMember ? otherMember.lastReadAt : null
      const title =
        m.chat.type === 'saved'
          ? me.language === 'en'
            ? 'Saved Messages'
            : 'Избранное'
          : m.chat.type === 'private' && otherMember
            ? contactNames.get(otherMember.userId) || otherMember.user.name
            : m.chat.title || (m.chat.type === 'channel' ? 'Канал' : 'Чат')
      const avatarColor =
        m.chat.type === 'saved'
          ? '#7c3aed'
          : m.chat.type === 'private' && otherMember
            ? otherMember.user.avatarColor
            : m.chat.avatarColor
      const subscriberCount =
        m.chat.type === 'channel'
          ? await db.chatMember.count({ where: { chatId: m.chatId } })
          : undefined
      const lastMessage = m.chat.messages[0]
      return {
        id: m.chat.id,
        type: m.chat.type,
        title,
        avatarColor,
        avatarUrl:
          m.chat.type === 'group' || m.chat.type === 'channel'
            ? m.chat.avatarUrl
            : undefined,
        slug: m.chat.slug,
        description: m.chat.description,
        isForum: m.chat.isForum,
        subscriberCount,
        slowModeSeconds: m.chat.slowModeSeconds,
        unread,
        lastReadAt: m.lastReadAt,
        peerLastReadAt,
        isPinned: m.isPinned,
        isMuted: m.isMuted,
        isArchived: m.isArchived,
        pinnedAt: m.pinnedAt,
        wallpaper: parseChatWallpaper(m.wallpaper),
        members: m.chat.members.map((mem) => ({
          id: mem.user.id,
          name:
            m.chat.type === 'private' && mem.userId !== me.id
              ? contactNames.get(mem.userId) || mem.user.name
              : mem.user.name,
          username: mem.user.username,
          avatarColor: mem.user.avatarColor,
          avatarUrl: mem.user.avatarUrl,
          emojiStatus: mem.user.emojiStatus,
          role: mem.role,
          online: mem.user.online,
          lastSeen: mem.user.lastSeen,
          isBot: mem.user.isBot,
        })),
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              content: lastMessage.content,
              createdAt: lastMessage.createdAt,
              senderName: lastMessage.sender.name,
              senderId: lastMessage.senderId,
              type: lastMessage.type,
              attachmentUrl: lastMessage.attachmentUrl,
              attachmentName: lastMessage.attachmentName,
              durationSec: lastMessage.durationSec,
            }
          : null,
        updatedAt: m.chat.updatedAt,
      }
    }),
  )

  // Saved Messages first, then pinned, then by updatedAt
  const saved = chats.filter((c) => c.type === 'saved')
  const rest = chats.filter((c) => c.type !== 'saved')
  const ordered = [...saved, ...rest]

  // Redact online/lastSeen per each peer's privacy settings
  try {
    const { applyLastSeenPrivacy } = await import('@/lib/privacy-server')
    const peers: Array<{ id: string; online?: boolean | null; lastSeen?: Date | string | null }> = []
    for (const c of ordered) {
      for (const mem of c.members || []) {
        if (mem.id !== me.id) peers.push(mem)
      }
    }
    const redacted = await applyLastSeenPrivacy(me.id, peers)
    const byId = new Map(redacted.map((p) => [p.id, p] as const))
    for (const c of ordered) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      c.members = (c.members || []).map((mem: any) => {
        if (mem.id === me.id) return mem
        const r = byId.get(mem.id)
        return r ? { ...mem, online: !!r.online, lastSeen: r.lastSeen ?? mem.lastSeen } : mem
      })
    }
  } catch (e) {
    console.warn('[GET /api/chats] lastSeen privacy', e)
  }

  return NextResponse.json({ chats: ordered })
  } catch (err) {
    console.error('[GET /api/chats]', err)
    return NextResponse.json({ error: 'Не удалось загрузить чаты', chats: [] }, { status: 500 })
  }
})

export const POST = withJsonApi(async function POST(req: Request) {
  try {
    const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json()
  const { type, targetUserId, title } = body ?? {}

  if (type === 'private') {
    if (!targetUserId)
      return NextResponse.json({ error: 'Укажите собеседника' }, { status: 400 })
    if (targetUserId === me.id) {
      return NextResponse.json({ error: 'Нельзя создать чат с собой' }, { status: 400 })
    }

    const target = await db.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, isBanned: true },
    })
    if (!target) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
    }
    if (target.isBanned) {
      return NextResponse.json({ error: 'Пользователь недоступен' }, { status: 403 })
    }
    if (await areUsersBlocked(me.id, targetUserId)) {
      return NextResponse.json({ error: 'Пользователь заблокирован' }, { status: 403 })
    }

    const { assertCanMessage } = await import('@/lib/privacy-server')
    const gate = await assertCanMessage(me.id, targetUserId)
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status })
    }

    // Look for an existing private chat with this pair
    const existing = await db.chat.findFirst({
      where: {
        type: 'private',
        AND: [
          { members: { some: { userId: me.id } } },
          { members: { some: { userId: targetUserId } } },
        ],
      },
      include: {
        members: { include: { user: true } },
      },
    })
    if (existing) {
      await db.chatMember.updateMany({
        where: { userId: me.id, chatId: existing.id, isHidden: true },
        data: { isHidden: false },
      })
      return NextResponse.json({ chat: { id: existing.id, type: existing.type } })
    }

    const colors = ['#7c3aed', '#06b6d4', '#ec4899', '#f97316', '#10b981']
    try {
      const chat = await db.chat.create({
        data: {
          type: 'private',
          avatarColor: colors[Math.floor(Math.random() * colors.length)],
          members: {
            create: [
              { userId: me.id, role: 'owner' },
              { userId: targetUserId, role: 'member' },
            ],
          },
        },
      })
      return NextResponse.json({ chat: { id: chat.id, type: chat.type } })
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === 'P2002') {
        // Race: chat was created between our check and create. Re-query.
        const recheck = await db.chat.findFirst({
          where: {
            type: 'private',
            AND: [
              { members: { some: { userId: me.id } } },
              { members: { some: { userId: targetUserId } } },
            ],
          },
        })
        if (recheck) return NextResponse.json({ chat: { id: recheck.id, type: recheck.type } })
      }
      throw e
    }
  }

  if (type === 'group') {
    if (!title) return NextResponse.json({ error: 'Укажите название группы' }, { status: 400 })
    const rawMemberIds: string[] = Array.isArray(body.memberIds) ? body.memberIds : []
    const uniqueMemberIds = [...new Set(rawMemberIds.filter((id) => typeof id === 'string' && id && id !== me.id))]
    // Only add real, non-banned, non-blocked users (blocks previously bypassed via group spam).
    const allowedMembers: string[] = []
    if (uniqueMemberIds.length > 0) {
      const users = await db.user.findMany({
        where: { id: { in: uniqueMemberIds } },
        select: { id: true, isBanned: true },
      })
      const byId = new Map(users.map((u) => [u.id, u]))
      for (const id of uniqueMemberIds) {
        const u = byId.get(id)
        if (!u || u.isBanned) continue
        if (await areUsersBlocked(me.id, id)) continue
        allowedMembers.push(id)
      }
    }
    const isForum = !!body.isForum
    const { normalizeChannelSlug } = await import('@/lib/channels')
    let normalizedSlug: string | null = null
    if (body.slug?.trim()) {
      normalizedSlug = normalizeChannelSlug(body.slug)
      if (!normalizedSlug) {
        return NextResponse.json({ error: 'Некорректная публичная ссылка' }, { status: 400 })
      }
      const existing = await db.chat.findUnique({ where: { slug: normalizedSlug } })
      if (existing) {
        return NextResponse.json({ error: 'Группа или канал с таким именем уже существует' }, { status: 409 })
      }
    }
    const colors = ['#7c3aed', '#06b6d4', '#ec4899', '#f97316', '#10b981']
    const chat = await db.chat.create({
      data: {
        type: 'group',
        title,
        isForum,
        slug: normalizedSlug,
        avatarColor: colors[Math.floor(Math.random() * colors.length)],
        members: {
          create: [
            { userId: me.id, role: 'owner' },
            ...allowedMembers.map((id) => ({ userId: id, role: 'member' as const })),
          ],
        },
      },
    })
    // Create a "General" topic if forum mode
    if (isForum) {
      await db.topic.create({
        data: {
          chatId: chat.id,
          title: 'General',
          icon: '💬',
          creatorId: me.id,
        },
      })
    }
    return NextResponse.json({ chat: { id: chat.id, type: chat.type, title, isForum, slug: chat.slug } })
  }

  if (type === 'channel') {
    if (!title) return NextResponse.json({ error: 'Укажите название канала' }, { status: 400 })
    const { normalizeChannelSlug } = await import('@/lib/channels')
    let normalizedSlug: string | null = null
    if (body.slug?.trim()) {
      normalizedSlug = normalizeChannelSlug(body.slug)
      const existing = await db.chat.findUnique({ where: { slug: normalizedSlug } })
      if (existing) {
        return NextResponse.json({ error: 'Канал с таким именем уже существует' }, { status: 409 })
      }
    }
    const colors = ['#7c3aed', '#06b6d4', '#ec4899', '#f97316', '#10b981']
    const chat = await db.chat.create({
      data: {
        type: 'channel',
        title,
        description: body.description?.trim() || null,
        slug: normalizedSlug,
        avatarColor: colors[Math.floor(Math.random() * colors.length)],
        members: {
          create: { userId: me.id, role: 'owner' },
        },
      },
    })
    return NextResponse.json({
      chat: { id: chat.id, type: chat.type, title, slug: chat.slug },
    })
  }

  return NextResponse.json({ error: 'Неизвестный тип чата' }, { status: 400 })
  } catch (err) {
    console.error('[POST /api/chats]', err)
    return NextResponse.json({ error: 'Не удалось создать чат' }, { status: 500 })
  }
})
