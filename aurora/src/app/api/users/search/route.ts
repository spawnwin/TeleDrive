import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'

const CANDIDATE_TAKE = 120

function searchVariants(q: string): string[] {
  const variants = new Set<string>()
  const t = q.trim()
  if (!t) return []
  variants.add(t)
  variants.add(t.toLowerCase())
  variants.add(t.toUpperCase())
  variants.add(t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
  return [...variants]
}

export const GET = withJsonApi(async function GET(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const url = new URL(req.url)
  // Users naturally type a leading "@" (Telegram convention) even though
  // usernames are stored without it — strip it so "@stickers" still matches.
  const q = (url.searchParams.get('q') || '').trim().toLowerCase().replace(/^@/, '')
  if (!q) return NextResponse.json({ users: [] })

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

  const variants = searchVariants(q)
  const or = variants.flatMap((v) => [
    { username: { contains: v } },
    { name: { contains: v } },
  ])

  // SQLite's `contains` is case-sensitive for Cyrillic — prefilter in DB with
  // case variants, then confirm case-insensitive match in JS.
  const candidates = await db.user.findMany({
    where: {
      id: { not: me.id },
      OR: or,
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
  })

  const users = candidates.filter(
    (u) =>
      !blockedIds.has(u.id) &&
      (u.username.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)),
  )

  const { applyLastSeenPrivacy } = await import('@/lib/privacy-server')
  const redacted = await applyLastSeenPrivacy(me.id, users)

  return NextResponse.json({ users: redacted })
})
