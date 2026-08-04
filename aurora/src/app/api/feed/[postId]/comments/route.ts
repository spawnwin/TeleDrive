import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { assertCanAccessWallPost, wallAuthorSelect } from '@/lib/wall-feed'

/** List comments on a feed/wall post. */
export const GET = withJsonApi(async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { postId } = await params
  const gate = await assertCanAccessWallPost(me.id, postId)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const url = new URL(req.url)
  const take = Math.min(100, Math.max(1, Number(url.searchParams.get('take') || 50)))

  const comments = await db.wallPostComment.findMany({
    where: { postId },
    orderBy: { createdAt: 'asc' },
    take,
    include: { user: { select: wallAuthorSelect } },
  })

  const canModerate =
    gate.post.authorId === me.id || gate.post.profileId === me.id

  return NextResponse.json({
    comments: comments.map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt,
      user: c.user,
      mine: c.userId === me.id,
      canDelete: c.userId === me.id || canModerate || !!me.isAdmin,
    })),
    commentsClosed: gate.post.commentsClosed,
    commentsCount: gate.post.comments,
    canModerate,
  })
})

/** Add a comment. */
export const POST = withJsonApi(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { postId } = await params
  const gate = await assertCanAccessWallPost(me.id, postId)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  if (gate.post.commentsClosed) {
    return NextResponse.json({ error: 'Комментарии закрыты' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const content = (typeof body?.content === 'string' ? body.content : '').trim()
  if (!content) {
    return NextResponse.json({ error: 'Пустой комментарий' }, { status: 400 })
  }
  if (content.length > 2000) {
    return NextResponse.json({ error: 'Комментарий слишком длинный' }, { status: 400 })
  }

  const [comment, updated] = await db.$transaction([
    db.wallPostComment.create({
      data: { postId, userId: me.id, content },
      include: { user: { select: wallAuthorSelect } },
    }),
    db.wallPost.update({
      where: { id: postId },
      data: { comments: { increment: 1 } },
      select: { comments: true },
    }),
  ])

  // Notify post author (and wall owner if different) — fire-and-forget.
  const notifyIds = new Set<string>()
  if (gate.post.authorId !== me.id) notifyIds.add(gate.post.authorId)
  if (gate.post.profileId !== me.id && gate.post.profileId !== gate.post.authorId) {
    notifyIds.add(gate.post.profileId)
  }
  if (notifyIds.size > 0) {
    const { sendPushToUser } = await import('@/lib/push-server')
    const preview = content.length > 120 ? content.slice(0, 120) + '…' : content
    for (const uid of notifyIds) {
      sendPushToUser(uid, {
        title: `${me.name} прокомментировал(а) запись`,
        body: preview,
        profileUserId: gate.post.profileId,
      }).catch(() => {})
    }
  }

  const canModerate =
    gate.post.authorId === me.id || gate.post.profileId === me.id

  return NextResponse.json({
    comment: {
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      user: comment.user,
      mine: true,
      canDelete: true,
    },
    commentsCount: updated.comments,
    canModerate,
  })
})

/** Delete a comment (author, post author, wall owner, or admin). */
export const DELETE = withJsonApi(async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { postId } = await params
  const gate = await assertCanAccessWallPost(me.id, postId)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const url = new URL(req.url)
  const commentId = url.searchParams.get('commentId')
  if (!commentId) {
    return NextResponse.json({ error: 'Укажите commentId' }, { status: 400 })
  }

  const comment = await db.wallPostComment.findUnique({ where: { id: commentId } })
  if (!comment || comment.postId !== postId) {
    return NextResponse.json({ error: 'Комментарий не найден' }, { status: 404 })
  }

  const canModerate =
    gate.post.authorId === me.id || gate.post.profileId === me.id || !!me.isAdmin
  if (comment.userId !== me.id && !canModerate) {
    return NextResponse.json({ error: 'Нельзя удалить чужой комментарий' }, { status: 403 })
  }

  let commentsCount = Math.max(0, gate.post.comments - 1)
  try {
    const [, updated] = await db.$transaction([
      db.wallPostComment.delete({ where: { id: commentId } }),
      db.wallPost.update({
        where: { id: postId },
        data: { comments: { decrement: 1 } },
        select: { comments: true },
      }),
    ])
    commentsCount = Math.max(0, updated.comments)
  } catch (e: unknown) {
    if ((e as { code?: string })?.code !== 'P2025') throw e
  }

  return NextResponse.json({
    ok: true,
    commentsCount,
  })
})
