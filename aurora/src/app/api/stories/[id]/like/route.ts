import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'

export const POST = withJsonApi(async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const story = await db.story.findUnique({
    where: { id },
    select: { id: true, userId: true, expiresAt: true, likes: true },
  })
  if (!story) return NextResponse.json({ error: 'Статус не найден' }, { status: 404 })
  if (story.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Статус истёк' }, { status: 410 })
  }
  if (story.userId === me.id) {
    return NextResponse.json({ error: 'Нельзя лайкнуть свой статус' }, { status: 400 })
  }

  const existing = await db.storyLike.findUnique({
    where: { storyId_userId: { storyId: id, userId: me.id } },
  })

  if (existing) {
    try {
      await db.$transaction([
        db.storyLike.delete({ where: { id: existing.id } }),
        db.story.update({ where: { id }, data: { likes: { decrement: 1 } } }),
      ])
    } catch (e: unknown) {
      if ((e as { code?: string })?.code !== 'P2025') throw e
    }
    const updated = await db.story.findUnique({ where: { id }, select: { likes: true } })
    return NextResponse.json({ ok: true, isLiked: false, likes: Math.max(0, updated?.likes ?? 0) })
  }

  try {
    await db.$transaction([
      db.storyLike.create({ data: { storyId: id, userId: me.id } }),
      db.story.update({ where: { id }, data: { likes: { increment: 1 } } }),
      // Ensure a view exists when liking (Telegram-style)
      db.storyView.upsert({
        where: { storyId_userId: { storyId: id, userId: me.id } },
        create: { storyId: id, userId: me.id },
        update: {},
      }),
    ])
  } catch (e: unknown) {
    if ((e as { code?: string })?.code !== 'P2002') throw e
  }

  const updated = await db.story.findUnique({ where: { id }, select: { likes: true } })
  return NextResponse.json({ ok: true, isLiked: true, likes: updated?.likes ?? 0 })
})
