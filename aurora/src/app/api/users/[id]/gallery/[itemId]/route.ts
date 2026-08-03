import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import {
  deleteProfileGalleryItem,
  getProfileGalleryItemOwner,
  updateProfileGalleryItem,
} from '@/lib/profile-gallery'
import { withJsonApi } from '@/lib/with-json-api'

export const PATCH = withJsonApi(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id, itemId } = await params
  if (id !== me.id) {
    return NextResponse.json({ error: 'Доступно только для своего профиля' }, { status: 403 })
  }

  const ownerId = await getProfileGalleryItemOwner(itemId)
  if (!ownerId || ownerId !== me.id) {
    return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const data: { caption?: string | null; isPinned?: boolean } = {}
  if ('caption' in (body ?? {})) {
    data.caption =
      typeof body.caption === 'string' ? body.caption.trim().slice(0, 500) || null : null
  }
  if (typeof body?.isPinned === 'boolean') {
    data.isPinned = body.isPinned
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Нечего обновлять' }, { status: 400 })
  }

  const updated = await updateProfileGalleryItem(itemId, data)
  return NextResponse.json({
    item: { id: updated.id, caption: updated.caption, isPinned: updated.isPinned },
  })
})

export const DELETE = withJsonApi(async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id, itemId } = await params
  if (id !== me.id) {
    return NextResponse.json({ error: 'Доступно только для своего профиля' }, { status: 403 })
  }

  const ownerId = await getProfileGalleryItemOwner(itemId)
  if (!ownerId || ownerId !== me.id) {
    return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
  }

  await deleteProfileGalleryItem(itemId)
  return NextResponse.json({ ok: true })
})
