import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { withJsonApi } from '@/lib/with-json-api'

export const GET = withJsonApi(async function GET() {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const blocks = await db.userBlock.findMany({
    where: { blockerId: me.id },
    orderBy: { createdAt: 'desc' },
    include: {
      blocked: {
        select: {
          id: true,
          username: true,
          name: true,
          avatarColor: true,
          avatarUrl: true,
        },
      },
    },
  })

  return NextResponse.json({
    users: blocks.map((b: { blocked: unknown; createdAt: Date; blockedId: string }) => ({
      ...(b.blocked as object),
      blockedAt: b.createdAt,
      id: b.blockedId,
    })),
  })
})
