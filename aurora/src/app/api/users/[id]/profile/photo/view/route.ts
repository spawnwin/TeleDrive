import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { withJsonApi } from '@/lib/with-json-api'
import { areUsersBlocked } from '@/lib/user-blocks'
import { recordProfilePhotoView } from '@/lib/profile-photo-views'

export const POST = withJsonApi(async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id: ownerId } = await params
  const owner = await db.user.findUnique({
    where: { id: ownerId },
    select: { id: true, avatarUrl: true },
  })
  if (!owner) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
  if (!owner.avatarUrl) {
    return NextResponse.json({ error: 'Нет фото профиля' }, { status: 404 })
  }

  if (owner.id !== me.id && (await areUsersBlocked(me.id, owner.id))) {
    return NextResponse.json({ error: 'Недоступно' }, { status: 403 })
  }

  const result = await recordProfilePhotoView(owner.id, me.id, owner.avatarUrl)
  return NextResponse.json({
    total: result.total,
    recorded: result.recorded,
  })
})
