import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { adminGuard } from '@/lib/admin-api'
import { withJsonApi } from '@/lib/with-json-api'

export const GET = withJsonApi(async function GET(req: NextRequest) {
  const guard = await adminGuard()
  if ('error' in guard) return guard.error

  const url = new URL(req.url)
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50)))
  const q = (url.searchParams.get('q') || '').trim()

  const where = q
    ? {
        OR: [
          { username: { contains: q } },
          { name: { contains: q } },
          { id: q },
        ],
      }
    : undefined

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        name: true,
        isPremium: true,
        isBot: true,
        isAdmin: true,
        isBanned: true,
        coins: true,
        online: true,
        createdAt: true,
      },
    }),
    db.user.count({ where }),
  ])

  return NextResponse.json({
    users,
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
  })
})
