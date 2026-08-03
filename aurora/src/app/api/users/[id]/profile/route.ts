import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { isPremiumActive } from '@/lib/coins'
import { getProfileMediaCounts } from '@/lib/profile-shared'
import { findFriendshipBetween, getFriendshipView } from '@/lib/friends'
import { formatContactDisplayName, getContactForPeer } from '@/lib/contacts'
import { resolveUserByIdOrUsername } from '@/lib/resolve-user'
import { recordProfileVisit } from '@/lib/profile-visits'
import { withJsonApi } from '@/lib/with-json-api'

export const GET = withJsonApi(async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const scopeChatId = new URL(req.url).searchParams.get('chatId')

  const user = await resolveUserByIdOrUsername(id, {
    id: true,
    username: true,
    name: true,
    avatarColor: true,
    avatarUrl: true,
    bio: true,
    online: true,
    lastSeen: true,
    isPremium: true,
    premiumUntil: true,
    emojiStatus: true,
    createdAt: true,
    lastSeenVisibility: true,
  })

  if (!user) {
    return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
  }

  const targetUserId = user.id
  const isSelf = targetUserId === me.id

  let privateChatId: string | null = null
  let isMuted = false
  const sharedChatTypes = ['group', 'channel'] as const
  let sharedChats: Array<{ id: string; title: string; avatarColor: string; type: 'group' | 'channel' }> = []
  let mediaCounts = {
    profilePhotos: 0,
    media: 0,
    files: 0,
    links: 0,
    voice: 0,
    gifs: 0,
  }
  let isBlocked = false
  let friendship: ReturnType<typeof getFriendshipView> | null = null
  let contact: {
    firstName: string
    lastName: string | null
    displayName: string
  } | null = null

  if (isSelf) {
    mediaCounts = await getProfileMediaCounts(null, user.id, !!user.avatarUrl)
  } else {
    void recordProfileVisit(targetUserId, me.id).catch(() => {})

    const block = await db.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId: me.id, blockedId: targetUserId } },
    })
    isBlocked = !!block

    const existingFriendship = await findFriendshipBetween(me.id, targetUserId)
    friendship = getFriendshipView(existingFriendship, me.id)

    const existingContact = await getContactForPeer(me.id, targetUserId)
    if (existingContact) {
      contact = {
        firstName: existingContact.firstName,
        lastName: existingContact.lastName,
        displayName: formatContactDisplayName(existingContact),
      }
    }

    const privateChat = await db.chat.findFirst({
      where: {
        type: 'private',
        AND: [
          { members: { some: { userId: me.id } } },
          { members: { some: { userId: targetUserId } } },
        ],
      },
      include: {
        members: { where: { userId: me.id }, select: { isMuted: true } },
      },
    })

    if (privateChat) {
      privateChatId = privateChat.id
      isMuted = privateChat.members[0]?.isMuted ?? false
    }

    mediaCounts = await getProfileMediaCounts(privateChatId, targetUserId, !!user.avatarUrl)

    const mySharedChatIds = (
      await db.chatMember.findMany({
        where: { userId: me.id, chat: { type: { in: [...sharedChatTypes] } } },
        select: { chatId: true },
      })
    ).map((m) => m.chatId)

    if (mySharedChatIds.length > 0) {
      const mutual = await db.chatMember.findMany({
        where: {
          userId: targetUserId,
          chatId: { in: mySharedChatIds },
          chat: { type: { in: [...sharedChatTypes] } },
        },
        include: {
          chat: { select: { id: true, title: true, avatarColor: true, type: true } },
        },
        take: 20,
      })
      sharedChats = mutual.map((m) => ({
        id: m.chat.id,
        title: m.chat.title || (m.chat.type === 'channel' ? 'Канал' : 'Группа'),
        avatarColor: m.chat.avatarColor,
        type: m.chat.type as 'group' | 'channel',
      }))
    }
  }

  const displayName = contact?.displayName || user.name

  // Privacy: hide last seen / online when restricted
  let lastSeen: Date | string | null = user.lastSeen
  let online = user.online
  if (!isSelf) {
    const { canSeeLastSeen, parseVisibility } = await import('@/lib/privacy')
    const isContact = !!contact || !!(await getContactForPeer(targetUserId, me.id))
    const visibility = parseVisibility(
      (user as { lastSeenVisibility?: string }).lastSeenVisibility,
    )
    if (!canSeeLastSeen({ visibility, isSelf: false, isContact })) {
      lastSeen = null
      online = false
    }
  }

  return NextResponse.json({
    profile: {
      ...user,
      name: displayName,
      originalName: user.name,
      lastSeen,
      online,
      contact,
      isPremium: isPremiumActive(user),
      isSelf,
      emojiStatus: isPremiumActive(user) ? user.emojiStatus : null,
      privateChatId,
      isMuted,
      isBlocked,
      friendship,
      sharedChats,
      mediaCounts,
    },
  })
})
