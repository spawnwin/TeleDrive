import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { activeStoryFilter, serializeStory } from '@/lib/story-api'
import { filterVisibleStoryIds } from '@/lib/story-visibility'
import { resolveUserByIdOrUsername } from '@/lib/resolve-user'
import { withJsonApi } from '@/lib/with-json-api'

export const GET = withJsonApi(async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { userId: userRef } = await params
  const user = await resolveUserByIdOrUsername(userRef, {
    id: true,
    name: true,
    username: true,
    avatarColor: true,
    avatarUrl: true,
  })
  if (!user) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })

  const userId = user.id

  const stories = await db.story.findMany({
    where: { userId, ...activeStoryFilter() },
    orderBy: { createdAt: 'asc' },
    include: {
      storyViews: {
        where: { userId: me.id },
        select: { id: true },
        take: 1,
      },
    },
  })

  const visibleIds = await filterVisibleStoryIds(
    stories.map((s) => ({
      id: s.id,
      userId: s.userId,
      visibility: s.visibility,
      audienceIds: s.audienceIds,
    })),
    me.id,
  )
  const items = stories.filter((s) => visibleIds.has(s.id)).map((s) => serializeStory({ ...s, storyLikes: (s as any).storyLikes || [] }))
  const hasUnviewed = userId !== me.id && items.some((s) => !s.viewed)

  return NextResponse.json({
    user: {
      ...user,
      isSelf: userId === me.id,
      hasUnviewed,
      stories: items,
    },
  })
})
