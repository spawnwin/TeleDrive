import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { withJsonApi } from '@/lib/with-json-api'
import { countProfilePhotoViews } from '@/lib/profile-photo-views'

export const GET = withJsonApi(async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id: ownerId } = await params
  if (ownerId !== me.id) {
    return NextResponse.json({ error: 'Доступно только владельцу фото' }, { status: 403 })
  }

  const owner = await db.user.findUnique({
    where: { id: ownerId },
    select: { id: true, avatarUrl: true },
  })
  if (!owner) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
  if (!owner.avatarUrl) {
    return NextResponse.json({ viewers: [], total: 0 })
  }

  const views = await db.profilePhotoView.findMany({
    where: { ownerId: owner.id, avatarUrl: owner.avatarUrl },
    orderBy: { viewedAt: 'desc' },
    take: 200,
    include: {
      viewer: {
        select: {
          id: true,
          name: true,
          username: true,
          avatarColor: true,
          avatarUrl: true,
        },
      },
    },
  })

  const total = await countProfilePhotoViews(owner.id, owner.avatarUrl)

  return NextResponse.json({
    total,
    viewers: views.map((row) => ({
      id: row.viewer.id,
      name: row.viewer.name,
      username: row.viewer.username,
      avatarColor: row.viewer.avatarColor,
      avatarUrl: row.viewer.avatarUrl,
      viewedAt: row.viewedAt.toISOString(),
    })),
  })
})
