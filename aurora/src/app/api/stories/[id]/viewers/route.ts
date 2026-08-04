import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { withJsonApi } from '@/lib/with-json-api'

export const GET = withJsonApi(async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const story = await db.story.findUnique({
    where: { id },
    select: { userId: true, expiresAt: true, likes: true, views: true },
  })
  if (!story) return NextResponse.json({ error: 'Статус не найден' }, { status: 404 })
  if (story.userId !== me.id) {
    return NextResponse.json({ error: 'Доступно только автору статуса' }, { status: 403 })
  }

  const userSelect = {
    id: true,
    name: true,
    username: true,
    avatarColor: true,
    avatarUrl: true,
  } as const

  const [views, likes] = await Promise.all([
    db.storyView.findMany({
      where: { storyId: id },
      orderBy: { viewedAt: 'desc' },
      include: { user: { select: userSelect } },
    }),
    db.storyLike.findMany({
      where: { storyId: id },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: userSelect } },
    }),
  ])

  const likedIds = new Set(likes.map((row) => row.userId))

  return NextResponse.json({
    viewers: views.map((row) => ({
      id: row.user.id,
      name: row.user.name,
      username: row.user.username,
      avatarColor: row.user.avatarColor,
      avatarUrl: row.user.avatarUrl,
      viewedAt: row.viewedAt.toISOString(),
      liked: likedIds.has(row.user.id),
    })),
    likers: likes.map((row) => ({
      id: row.user.id,
      name: row.user.name,
      username: row.user.username,
      avatarColor: row.user.avatarColor,
      avatarUrl: row.user.avatarUrl,
      likedAt: row.createdAt.toISOString(),
    })),
    total: views.length,
    likesTotal: likes.length,
    views: story.views,
    likes: story.likes,
  })
})
