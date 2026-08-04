import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import {
  assertCanAccessWallPost,
  serializeWallPosts,
  wallAuthorSelect,
  type WallPostRow,
} from '@/lib/wall-feed'

/** Edit own feed/wall post text and/or open/close comments. */
export const PATCH = withJsonApi(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { postId } = await params
  const gate = await assertCanAccessWallPost(me.id, postId)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const post = gate.post

  const body = await req.json().catch(() => ({}))
  const hasContent = typeof body?.content === 'string'
  const hasClosed = typeof body?.commentsClosed === 'boolean'

  if (!hasContent && !hasClosed) {
    return NextResponse.json({ error: 'Нечего обновлять' }, { status: 400 })
  }

  const data: { content?: string | null; editedAt?: Date; commentsClosed?: boolean } = {}

  if (hasContent) {
    if (post.authorId !== me.id) {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
    }
    const content = (body.content as string).trim()
    if (content.length > 10000) {
      return NextResponse.json({ error: 'Запись слишком длинная' }, { status: 400 })
    }
    if (!content && !post.attachmentUrl) {
      return NextResponse.json({ error: 'Пустая запись' }, { status: 400 })
    }
    data.content = content || null
    data.editedAt = new Date()
  }

  if (hasClosed) {
    if (post.authorId !== me.id && post.profileId !== me.id) {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
    }
    data.commentsClosed = body.commentsClosed as boolean
  }

  const updated = await db.wallPost.update({
    where: { id: postId },
    data,
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
  const gate = await assertCanAccessWallPost(me.id, postId)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const post = gate.post
  if (post.authorId !== me.id && post.profileId !== me.id) {
    return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
  }

  await db.wallPost.delete({ where: { id: postId } })
  return NextResponse.json({ ok: true })
})
