import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { isPremiumActive } from '@/lib/coins'
import { withJsonApi } from '@/lib/with-json-api'
import { areUsersBlocked } from '@/lib/user-blocks'

// Premium-exclusive "who viewed your profile" — only the profile owner can
// ever see this, and only while their Premium is active. Most messengers
// deliberately don't offer this (privacy stance); Aurora makes it an opt-in
// Premium perk instead.
export const GET = withJsonApi(async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  if (id !== me.id) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
  }
  if (!isPremiumActive(me)) {
    return NextResponse.json({ error: 'Доступно только с Premium', requiresPremium: true }, { status: 403 })
  }

  const visits = await db.profileVisit.findMany({
    where: { profileId: me.id },
    orderBy: { visitedAt: 'desc' },
    take: 80,
    include: {
      visitor: { select: { id: true, name: true, username: true, avatarColor: true, avatarUrl: true } },
    },
  })

  const visitors: Array<{
    user: { id: string; name: string; username: string; avatarColor: string; avatarUrl: string | null }
    visitedAt: Date
  }> = []
  for (const v of visits) {
    if (await areUsersBlocked(me.id, v.visitor.id)) continue
    visitors.push({ user: v.visitor, visitedAt: v.visitedAt })
    if (visitors.length >= 50) break
  }

  return NextResponse.json({ visitors })
})
