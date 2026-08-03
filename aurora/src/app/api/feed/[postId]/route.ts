import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { serializeWallPosts, wallAuthorSelect, type WallPostRow } from '@/lib/wall-feed'

/** Edit own feed/wall post text. */
export const PATCH = withJsonApi(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { postId } = await params
  const post = await db.wallPost.findUnique({ where: { id: postId } })
  if (!post) return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 })
  if (post.authorId !== me.id) {
    return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const content = typeof body?.content === 'string' ? body.content.trim() : null
  if (content === null) {
    return NextResponse.json({ error: 'Укажите текст' }, { status: 400 })
  }
  if (content.length > 10000) {
    return NextResponse.json({ error: 'Запись слишком длинная' }, { status: 400 })
  }
  if (!content && !post.attachmentUrl) {
    return NextResponse.json({ error: 'Пустая запись' }, { status: 400 })
  }

  const updated = await db.wallPost.update({
    where: { id: postId },
    data: { content: content || null, editedAt: new Date() },
    include: { author: { select: wallAuthorSelect } },
  })

  const [serialized] = await serializeWallPosts(me.id, [updated as WallPostRow])
  return NextResponse.json({ post: serialized })
})

/** Delete own post (or any post on my wall). */
export const DELETE = withJsonApi(async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { postId } = await params
  const post = await db.wallPost.findUnique({ where: { id: postId } })
  if (!post) return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 })
  if (post.authorId !== me.id && post.profileId !== me.id) {
    return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
  }

  await db.wallPost.delete({ where: { id: postId } })
  return NextResponse.json({ ok: true })
})
