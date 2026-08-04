import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { areUsersBlocked } from '@/lib/user-blocks'

/** Toggle like on a feed/wall post. */
export const POST = withJsonApi(async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { postId } = await params
  const post = await db.wallPost.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, profileId: true, likes: true },
  })
  if (!post) return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 })

  if (
    post.authorId !== me.id &&
    (await areUsersBlocked(me.id, post.authorId))
  ) {
    return NextResponse.json({ error: 'Недоступно' }, { status: 403 })
  }
  if (
    post.profileId !== me.id &&
    post.profileId !== post.authorId &&
    (await areUsersBlocked(me.id, post.profileId))
  ) {
    return NextResponse.json({ error: 'Недоступно' }, { status: 403 })
  }

  const existing = await db.wallPostLike.findUnique({
    where: { postId_userId: { postId, userId: me.id } },
  })

  if (existing) {
    try {
      await db.$transaction([
        db.wallPostLike.delete({ where: { id: existing.id } }),
        db.wallPost.update({ where: { id: postId }, data: { likes: { decrement: 1 } } }),
      ])
    } catch (e: unknown) {
      if ((e as { code?: string })?.code !== 'P2025') throw e
    }
    const updated = await db.wallPost.findUnique({ where: { id: postId }, select: { likes: true } })
    return NextResponse.json({
      ok: true,
      likedByMe: false,
      likes: Math.max(0, updated?.likes ?? 0),
    })
  }

  try {
    await db.$transaction([
      db.wallPostLike.create({ data: { postId, userId: me.id } }),
      db.wallPost.update({ where: { id: postId }, data: { likes: { increment: 1 } } }),
    ])
  } catch (e: unknown) {
    if ((e as { code?: string })?.code !== 'P2002') throw e
  }

  const updated = await db.wallPost.findUnique({ where: { id: postId }, select: { likes: true } })
  return NextResponse.json({ ok: true, likedByMe: true, likes: updated?.likes ?? 0 })
})
