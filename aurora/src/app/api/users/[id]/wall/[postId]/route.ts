import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'

// Delete a wall post. Allowed for the post author OR the profile owner
// (VK-style: wall owner moderates their own wall).
export const DELETE = withJsonApi(async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; postId: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id, postId } = await params
  const post = await db.wallPost.findUnique({ where: { id: postId } })
  if (!post || post.profileId !== id) {
    return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 })
  }

  if (post.authorId !== me.id && post.profileId !== me.id) {
    return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
  }

  await db.wallPost.delete({ where: { id: postId } })
  return NextResponse.json({ ok: true })
})
