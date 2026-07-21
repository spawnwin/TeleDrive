import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { withJsonApi } from '@/lib/with-json-api'
import { areUsersBlocked } from '@/lib/user-blocks'
import {
  getProfilePhotoLikeState,
  resolveAllowedProfilePhotoUrl,
  toggleProfilePhotoLike,
} from '@/lib/profile-photo-views'

export const GET = withJsonApi(async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id: ownerId } = await params
  const owner = await db.user.findUnique({
    where: { id: ownerId },
    select: { id: true },
  })
  if (!owner) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })

  if (owner.id !== me.id && (await areUsersBlocked(me.id, owner.id))) {
    return NextResponse.json({ error: 'Недоступно' }, { status: 403 })
  }

  const requestedUrl = req.nextUrl.searchParams.get('url')
  const photoUrl = await resolveAllowedProfilePhotoUrl(owner.id, requestedUrl)
  if (!photoUrl) {
    return NextResponse.json({ likes: 0, isLiked: false })
  }

  const state = await getProfilePhotoLikeState(owner.id, photoUrl, me.id)
  return NextResponse.json(state)
})

export const POST = withJsonApi(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id: ownerId } = await params
  const owner = await db.user.findUnique({
    where: { id: ownerId },
    select: { id: true },
  })
  if (!owner) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })

  if (owner.id === me.id) {
    return NextResponse.json({ error: 'Нельзя лайкнуть своё фото' }, { status: 400 })
  }

  if (await areUsersBlocked(me.id, owner.id)) {
    return NextResponse.json({ error: 'Недоступно' }, { status: 403 })
  }

  let requestedUrl: string | null = null
  try {
    const body = (await req.json().catch(() => null)) as { url?: string } | null
    if (body && typeof body.url === 'string' && body.url.trim()) {
      requestedUrl = body.url.trim()
    }
  } catch {
    requestedUrl = null
  }

  const photoUrl = await resolveAllowedProfilePhotoUrl(owner.id, requestedUrl)
  if (!photoUrl) {
    return NextResponse.json({ error: 'Нет фото профиля' }, { status: 404 })
  }

  const result = await toggleProfilePhotoLike(owner.id, me.id, photoUrl)
  return NextResponse.json({ ok: true, ...result })
})
