import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { withJsonApi } from '@/lib/with-json-api'
import {
  listProfilePhotoLikers,
  resolveAllowedProfilePhotoUrl,
} from '@/lib/profile-photo-views'

export const GET = withJsonApi(async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id: ownerId } = await params
  if (ownerId !== me.id) {
    return NextResponse.json({ error: 'Доступно только владельцу фото' }, { status: 403 })
  }

  const owner = await db.user.findUnique({
    where: { id: ownerId },
    select: { id: true },
  })
  if (!owner) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })

  const requestedUrl = req.nextUrl.searchParams.get('url')
  const photoUrl = await resolveAllowedProfilePhotoUrl(owner.id, requestedUrl)
  if (!photoUrl) {
    return NextResponse.json({ likers: [], total: 0 })
  }

  const { total, likers } = await listProfilePhotoLikers(owner.id, photoUrl)

  return NextResponse.json({
    total,
    likers: likers.map((v) => ({
      id: v.id,
      name: v.name,
      username: v.username,
      avatarColor: v.avatarColor,
      avatarUrl: v.avatarUrl,
      likedAt: v.likedAt.toISOString(),
    })),
  })
})
