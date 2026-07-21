import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { withJsonApi } from '@/lib/with-json-api'
import { canViewerSeeStory } from '@/lib/story-visibility'

export const POST = withJsonApi(async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const story = await db.story.findUnique({ where: { id } })
  if (!story) return NextResponse.json({ error: 'Статус не найден' }, { status: 404 })
  if (story.expiresAt <= new Date()) {
    return NextResponse.json({ error: 'Статус истёк' }, { status: 410 })
  }
  if (!(await canViewerSeeStory(me.id, story))) {
    return NextResponse.json({ error: 'Статус недоступен' }, { status: 403 })
  }

  const existing = await db.storyView.findUnique({
    where: { storyId_userId: { storyId: id, userId: me.id } },
  })

  if (!existing && story.userId !== me.id) {
    try {
      await db.$transaction([
        db.storyView.create({ data: { storyId: id, userId: me.id } }),
        db.story.update({ where: { id }, data: { views: { increment: 1 } } }),
      ])
    } catch (e: unknown) {
      if ((e as { code?: string })?.code !== 'P2002') throw e
    }
  }

  const updated = await db.story.findUnique({
    where: { id },
    select: { views: true },
  })

  return NextResponse.json({ views: updated?.views ?? story.views })
})
