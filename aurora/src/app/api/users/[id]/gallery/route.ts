import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import {
  createProfileGalleryItem,
  detectGalleryType,
  getProfileGalleryItems,
} from '@/lib/profile-gallery'
import { withJsonApi } from '@/lib/with-json-api'

export const GET = withJsonApi(async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  if (id !== me.id) {
    return NextResponse.json({ error: 'Доступно только для своего профиля' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const cursor = searchParams.get('cursor')
  const take = Math.min(Math.max(parseInt(searchParams.get('take') || '24', 10) || 24, 1), 50)

  const result = await getProfileGalleryItems(me.id, { cursor, take })
  return NextResponse.json(result)
})

export const POST = withJsonApi(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  if (id !== me.id) {
    return NextResponse.json({ error: 'Доступно только для своего профиля' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { mediaUrl, type, caption } = body ?? {}

  if (!mediaUrl || typeof mediaUrl !== 'string') {
    return NextResponse.json({ error: 'Укажите mediaUrl' }, { status: 400 })
  }

  const galleryType =
    type === 'video' || type === 'photo'
      ? type
      : detectGalleryType({ name: mediaUrl, type: typeof type === 'string' ? type : undefined })

  const item = await createProfileGalleryItem(me.id, {
    mediaUrl,
    type: galleryType,
    caption: typeof caption === 'string' ? caption.trim() || null : null,
  })

  return NextResponse.json({
    item: {
      id: item.id,
      type: item.type,
      mediaUrl: item.mediaUrl,
      caption: item.caption,
      isPinned: item.isPinned,
      createdAt: item.createdAt.toISOString(),
    },
  })
})
