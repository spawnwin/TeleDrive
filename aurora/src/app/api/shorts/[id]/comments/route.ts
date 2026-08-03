import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { areUsersBlocked } from '@/lib/user-blocks'

async function assertCanInteractWithShort(meId: string, shortId: string) {
  const short = await db.short.findUnique({
    where: { id: shortId },
    select: { id: true, creatorId: true },
  })
  if (!short) return { ok: false as const, status: 404 as const, error: 'Шортс не найден' }
  if (short.creatorId !== meId && (await areUsersBlocked(meId, short.creatorId))) {
    return { ok: false as const, status: 403 as const, error: 'Недоступно' }
  }
  return { ok: true as const, short }
}

// List comments for a short
export const GET = withJsonApi(async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const gate = await assertCanInteractWithShort(me.id, id)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const comments = await db.shortComment.findMany({
    where: { shortId: id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      user: {
        select: { id: true, name: true, username: true, avatarColor: true },
      },
    },
  })

  return NextResponse.json({
    comments: comments.map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt,
      user: c.user,
      mine: c.userId === me.id,
    })),
  })
})

// Add a comment
export const POST = withJsonApi(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const content = (body?.content || '').trim()
  if (!content) {
    return NextResponse.json({ error: 'Пустой комментарий' }, { status: 400 })
  }

  const gate = await assertCanInteractWithShort(me.id, id)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const comment = await db.shortComment.create({
    data: {
      shortId: id,
      userId: me.id,
      content,
    },
    include: {
      user: {
        select: { id: true, name: true, username: true, avatarColor: true },
      },
    },
  })

  // Increment comment counter
  await db.short.update({
    where: { id },
    data: { comments: { increment: 1 } },
  })

  return NextResponse.json({
    comment: {
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      user: comment.user,
      mine: true,
    },
  })
})

// Delete a comment
export const DELETE = withJsonApi(async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const url = new URL(req.url)
  const commentId = url.searchParams.get('commentId')
  if (!commentId) {
    return NextResponse.json({ error: 'Укажите commentId' }, { status: 400 })
  }

  const comment = await db.shortComment.findUnique({ where: { id: commentId } })
  if (!comment || comment.shortId !== id) {
    return NextResponse.json({ error: 'Комментарий не найден' }, { status: 404 })
  }
  if (comment.userId !== me.id && !me.isAdmin) {
    return NextResponse.json({ error: 'Нельзя удалить чужой комментарий' }, { status: 403 })
  }

  await db.shortComment.delete({ where: { id: commentId } })
  await db.short.update({
    where: { id },
    data: { comments: { decrement: 1 } },
  }).catch(() => {})

  return NextResponse.json({ ok: true })
})
