import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { normalizeChannelSlug } from '@/lib/channels'
import { getFriendshipView } from '@/lib/friends'
import { getContactDisplayNameMap } from '@/lib/contacts'
import { applyLastSeenPrivacy } from '@/lib/privacy-server'

const USER_LIMIT = 20
const CHAT_LIMIT = 15
/** DB prefilter batch — SQLite `contains` is case-sensitive for Cyrillic. */
const CANDIDATE_TAKE = 120

type PublicChatHit = {
  id: string
  type: 'channel' | 'group'
  title: string
  slug: string
  description: string | null
  avatarColor: string
  avatarUrl: string | null
  memberCount: number
  isMember: boolean
}

function rankText(haystack: string, q: string): number {
  const h = haystack.toLowerCase()
  if (h === q) return 0
  if (h.startsWith(q)) return 1
  if (h.includes(q)) return 2
  return 99
}

/** Case/title variants so SQLite LIKE can still hit Cyrillic names. */
function searchVariants(raw: string, normalized: string): string[] {
  const variants = new Set<string>()
  for (const s of [raw, normalized, raw.replace(/^@/, '')]) {
    const t = s.trim()
    if (!t) continue
    variants.add(t)
    variants.add(t.toLowerCase())
    variants.add(t.toUpperCase())
    variants.add(t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
  }
  return [...variants]
}

export const GET = withJsonApi(async function GET(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const url = new URL(req.url)
  const raw = (url.searchParams.get('q') || '').trim()
  const q = raw.toLowerCase().replace(/^@/, '')
  if (!q) {
    return NextResponse.json({ users: [], channels: [], groups: [] })
  }

  const slugQ = normalizeChannelSlug(raw)
  const textVariants = searchVariants(raw, q)

  const blocks = await db.userBlock.findMany({
    where: {
      OR: [{ blockerId: me.id }, { blockedId: me.id }],
    },
    select: { blockerId: true, blockedId: true },
  })
  const blockedIds = new Set<string>()
  for (const b of blocks) {
    blockedIds.add(b.blockerId === me.id ? b.blockedId : b.blockerId)
  }

  const myMemberships = await db.chatMember.findMany({
    where: { userId: me.id },
    select: { chatId: true },
  })
  const myChatIds = new Set(myMemberships.map((m) => m.chatId))

  const userOr = textVariants.flatMap((v) => [
    { username: { contains: v } },
    { name: { contains: v } },
  ])

  const chatOr = [
    ...textVariants.flatMap((v) => [
      { slug: { contains: v } },
      { title: { contains: v } },
      { description: { contains: v } },
    ]),
    ...(slugQ && !textVariants.includes(slugQ)
      ? [{ slug: { contains: slugQ } }, { title: { contains: slugQ } }]
      : []),
  ]

  const [userCandidates, publicChats] = await Promise.all([
    db.user.findMany({
      where: {
        id: { not: me.id },
        OR: userOr,
      },
      select: {
        id: true,
        name: true,
        username: true,
        avatarColor: true,
        avatarUrl: true,
        online: true,
        lastSeen: true,
      },
      take: CANDIDATE_TAKE,
    }),
    db.chat.findMany({
      where: {
        slug: { not: null },
        type: { in: ['channel', 'group'] },
        OR: chatOr,
      },
      select: {
        id: true,
        type: true,
        title: true,
        slug: true,
        description: true,
        avatarColor: true,
        avatarUrl: true,
        _count: { select: { members: true } },
      },
      take: CANDIDATE_TAKE,
    }),
  ])

  const matchedUsers = userCandidates
    .filter(
      (u) =>
        !blockedIds.has(u.id) &&
        (u.username.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)),
    )
    .sort((a, b) => {
      const ra = Math.min(rankText(a.username, q), rankText(a.name, q))
      const rb = Math.min(rankText(b.username, q), rankText(b.name, q))
      return ra - rb || a.name.localeCompare(b.name, 'ru')
    })
    .slice(0, USER_LIMIT)

  const userIds = matchedUsers.map((u) => u.id)
  const friendships =
    userIds.length > 0
      ? await db.friendship.findMany({
          where: {
            OR: [
              { requesterId: me.id, addresseeId: { in: userIds } },
              { addresseeId: me.id, requesterId: { in: userIds } },
            ],
          },
        })
      : []

  const friendshipByUser = new Map<string, ReturnType<typeof getFriendshipView>>()
  for (const f of friendships) {
    const otherId = f.requesterId === me.id ? f.addresseeId : f.requesterId
    friendshipByUser.set(otherId, getFriendshipView(f, me.id))
  }

  const contactNames = await getContactDisplayNameMap(me.id, userIds)
  const redactedUsers = await applyLastSeenPrivacy(me.id, matchedUsers)

  const users = redactedUsers.map((u) => ({
    ...u,
    originalName: u.name,
    name: contactNames.get(u.id) || u.name,
    friendship: friendshipByUser.get(u.id) ?? { id: null, status: 'none' as const },
  }))

  const matchedPublic = publicChats
    .filter((c) => {
      if (!c.slug) return false
      const title = (c.title || '').toLowerCase()
      const slug = c.slug.toLowerCase()
      const desc = (c.description || '').toLowerCase()
      return (
        slug.includes(q) ||
        title.includes(q) ||
        desc.includes(q) ||
        (slugQ.length > 0 && slug.includes(slugQ))
      )
    })
    .sort((a, b) => {
      const ra = Math.min(
        rankText(a.slug || '', q),
        rankText(a.title || '', q),
        slugQ ? rankText(a.slug || '', slugQ) : 99,
      )
      const rb = Math.min(
        rankText(b.slug || '', q),
        rankText(b.title || '', q),
        slugQ ? rankText(b.slug || '', slugQ) : 99,
      )
      return ra - rb || (a.title || '').localeCompare(b.title || '', 'ru')
    })

  const toHit = (c: (typeof publicChats)[number]): PublicChatHit => ({
    id: c.id,
    type: c.type as 'channel' | 'group',
    title: c.title || (c.type === 'channel' ? 'Канал' : 'Группа'),
    slug: c.slug!,
    description: c.description,
    avatarColor: c.avatarColor,
    avatarUrl: c.avatarUrl,
    memberCount: c._count.members,
    isMember: myChatIds.has(c.id),
  })

  const channels = matchedPublic
    .filter((c) => c.type === 'channel')
    .slice(0, CHAT_LIMIT)
    .map(toHit)

  const groups = matchedPublic
    .filter((c) => c.type === 'group')
    .slice(0, CHAT_LIMIT)
    .map(toHit)

  return NextResponse.json({ users, channels, groups })
})
