import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { areUsersBlocked } from '@/lib/user-blocks'

function serializeShort(
  short: {
    id: string
    title: string
    description: string | null
    videoUrl: string
    thumbnailUrl: string | null
    source: string
    externalId: string | null
    duration: number | null
    views: number
    likes: number
    comments: number
    earnings: number
    tags: string | null
    createdAt: Date
    creator: { id: string; name: string; username: string; avatarColor: string }
    shortLikes: { id: string }[]
  },
) {
  return {
    id: short.id,
    title: short.title,
    description: short.description,
    videoUrl: short.videoUrl,
    thumbnailUrl: short.thumbnailUrl,
    source: short.source,
    externalId: short.externalId,
    duration: short.duration,
    views: short.views,
    likes: short.likes,
    comments: short.comments,
    earnings: short.earnings,
    tags: short.tags ? short.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    createdAt: short.createdAt,
    creator: short.creator,
    isLiked: short.shortLikes.length > 0,
  }
}

export const GET = withJsonApi(async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params

  const short = await db.short.findUnique({
    where: { id },
    include: {
      creator: {
        select: { id: true, name: true, username: true, avatarColor: true },
      },
      shortLikes: {
        where: { userId: me.id },
        select: { id: true },
        take: 1,
      },
    },
  })

  if (!short || short.isHidden || short.reviewStatus === 'rejected') {
    return NextResponse.json({ error: 'Видео не найдено' }, { status: 404 })
  }
  // Pending shorts are visible only to their creator (and admins).
  if (short.reviewStatus !== 'approved' && short.creatorId !== me.id && !me.isAdmin) {
    return NextResponse.json({ error: 'Видео не найдено' }, { status: 404 })
  }
  if (short.creatorId !== me.id && (await areUsersBlocked(me.id, short.creatorId))) {
    return NextResponse.json({ error: 'Видео недоступно' }, { status: 403 })
  }

  return NextResponse.json({ short: serializeShort(short) })
})

function normalizeTags(input: unknown): string[] | null {
  if (Array.isArray(input)) {
    const out = input
      .map((t) => (typeof t === 'string' ? t.trim() : ''))
      .filter(Boolean)
    return out
  }
  if (typeof input === 'string') {
    return input
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
  }
  return null
}

export const PATCH = withJsonApi(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const short = await db.short.findUnique({
    where: { id },
    select: { id: true, creatorId: true },
  })
  if (!short) {
    return NextResponse.json({ error: 'Шортс не найден' }, { status: 404 })
  }
  if (short.creatorId !== me.id && !me.isAdmin) {
    return NextResponse.json({ error: 'Нет прав для редактирования' }, { status: 403 })
  }

  const data: Record<string, string | null> = {}
  if (typeof body.title === 'string') {
    const title = body.title.trim()
    if (!title) {
      return NextResponse.json({ error: 'Введите заголовок' }, { status: 400 })
    }
    data.title = title.slice(0, 100)
  }
  if (typeof body.description === 'string') {
    data.description = body.description.trim().slice(0, 500) || null
  }
  const tags = normalizeTags(body.tags)
  if (tags !== null) {
    data.tags = tags.slice(0, 20).join(',') || null
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Нет полей для обновления' }, { status: 400 })
  }

  const updated = await db.short.update({
    where: { id },
    data,
    include: {
      creator: {
        select: { id: true, name: true, username: true, avatarColor: true },
      },
      shortLikes: {
        where: { userId: me.id },
        select: { id: true },
        take: 1,
      },
    },
  })

  return NextResponse.json({ short: serializeShort(updated) })
})

export const DELETE = withJsonApi(async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params

  const short = await db.short.findUnique({
    where: { id },
    select: { id: true, creatorId: true },
  })
  if (!short) {
    return NextResponse.json({ error: 'Шортс не найден' }, { status: 404 })
  }
  if (short.creatorId !== me.id && !me.isAdmin) {
    return NextResponse.json({ error: 'Нет прав для удаления' }, { status: 403 })
  }

  await db.short.delete({ where: { id } })
  // Remove feed share cards that pointed at this short.
  await db.wallPost
    .deleteMany({
      where: {
        type: 'share',
        attachmentUrl: `short:${id}`,
        attachmentMime: 'application/x-aurora-short',
      },
    })
    .catch(() => {})

  return NextResponse.json({ ok: true, id })
})
