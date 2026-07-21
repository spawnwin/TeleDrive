import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { normalizeChannelSlug } from '@/lib/channels'

const USER_LIMIT = 20
const CHAT_LIMIT = 15

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

  const [userCandidates, publicChats] = await Promise.all([
    db.user.findMany({
      where: { id: { not: me.id } },
      select: {
        id: true,
        name: true,
        username: true,
        avatarColor: true,
        avatarUrl: true,
        online: true,
        lastSeen: true,
      },
      take: 500,
    }),
    db.chat.findMany({
      where: {
        slug: { not: null },
        type: { in: ['channel', 'group'] },
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
      take: 500,
    }),
  ])

  const users = userCandidates
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
