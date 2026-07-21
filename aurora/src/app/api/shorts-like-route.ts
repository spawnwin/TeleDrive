import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'

// Toggle like on a short
export const POST = withJsonApi(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const short = await db.short.findUnique({ where: { id } })
  if (!short) return NextResponse.json({ error: 'Шортс не найден' }, { status: 404 })

  const existing = await db.shortLike.findUnique({
    where: { shortId_userId: { shortId: id, userId: me.id } },
  })

  if (existing) {
    try {
      await db.$transaction([
        db.shortLike.delete({ where: { id: existing.id } }),
        db.short.update({ where: { id }, data: { likes: { decrement: 1 } } }),
      ])
    } catch (e: unknown) {
      if ((e as { code?: string })?.code !== 'P2025') throw e
    }
    const updated = await db.short.findUnique({ where: { id }, select: { likes: true } })
    return NextResponse.json({ ok: true, isLiked: false, likes: updated?.likes ?? 0 })
  }

  try {
    await db.$transaction([
      db.shortLike.create({ data: { shortId: id, userId: me.id } }),
      db.short.update({ where: { id }, data: { likes: { increment: 1 } } }),
    ])
  } catch (e: unknown) {
    if ((e as { code?: string })?.code !== 'P2002') throw e
  }
  const updated = await db.short.findUnique({ where: { id }, select: { likes: true } })
  return NextResponse.json({ ok: true, isLiked: true, likes: updated?.likes ?? 0 })
})
