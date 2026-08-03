import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { parseVideoUrl } from '@/lib/video-url'
import { withJsonApi } from '@/lib/with-json-api'
import { createFeedSharePost } from '@/lib/feed-share'

function serializeShort(s: any, isLiked = false) {
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    videoUrl: s.videoUrl,
    thumbnailUrl: s.thumbnailUrl,
    source: s.source,
    externalId: s.externalId,
    duration: s.duration,
    views: s.views,
    likes: s.likes,
    comments: s.comments,
    earnings: s.earnings,
    tags: s.tags ? s.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
    createdAt: s.createdAt,
    creator: s.creator,
    isLiked,
    parentShortId: s.parentShortId ?? null,
    duetMode: s.duetMode ?? null,
    challengeTitle: s.challengeTitle ?? null,
    parentShort: s.parentShort
      ? {
          id: s.parentShort.id,
          title: s.parentShort.title,
          thumbnailUrl: s.parentShort.thumbnailUrl,
          videoUrl: s.parentShort.videoUrl,
          creator: s.parentShort.creator,
        }
      : null,
  }
}

export const GET = withJsonApi(async function GET() {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const shorts = await db.short.findMany({
    where: {
      isHidden: false,
      OR: [
        { reviewStatus: 'approved' },
        { creatorId: me.id, reviewStatus: 'pending' },
      ],
    },
    orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
    take: 20,
    include: {
      creator: {
        select: {
          id: true,
          name: true,
          username: true,
          avatarColor: true,
        },
      },
      parentShort: {
        select: {
          id: true,
          title: true,
          thumbnailUrl: true,
          videoUrl: true,
          creator: { select: { id: true, name: true, username: true, avatarColor: true } },
        },
      },
      shortLikes: {
        where: { userId: me.id },
        select: { id: true },
        take: 1,
      },
    },
  })

  return NextResponse.json({
    shorts: shorts.map((s) => serializeShort(s, s.shortLikes.length > 0)),
  })
})

export const POST = withJsonApi(async function POST(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json()
  const {
    title,
    description,
    source,
    videoUrl,
    externalUrl,
    tags,
    thumbnailUrl,
    duration,
    parentShortId,
    duetMode,
    challengeTitle,
    shareToFeed,
  } = body ?? {}

  if (!title || !title.trim()) {
    return NextResponse.json({ error: 'Введите заголовок' }, { status: 400 })
  }

  let finalSource = 'upload'
  let finalVideoUrl: string | null = videoUrl || null
  let finalExternalId: string | null = null
  let finalThumbnail: string | null = thumbnailUrl || null
  let finalDuration: number | null = null

  if (typeof duration === 'number' && isFinite(duration) && duration > 0) {
    finalDuration = Math.round(duration)
  }

  if (source === 'external' && externalUrl) {
    const parsed = parseVideoUrl(externalUrl)
    if (!parsed) {
      return NextResponse.json(
        { error: 'Не удалось распознать ссылку YouTube/TikTok' },
        { status: 400 },
      )
    }
    finalSource = parsed.source
    finalExternalId = parsed.externalId
    finalThumbnail = parsed.thumbnailUrl || null
    finalVideoUrl = parsed.embedUrl
  } else if (source === 'upload') {
    if (!finalVideoUrl) {
      return NextResponse.json({ error: 'Загрузите видео' }, { status: 400 })
    }
    finalSource = 'upload'
  } else {
    return NextResponse.json({ error: 'Неверный источник' }, { status: 400 })
  }

  let parentId: string | null = null
  let mode: string | null = null
  let challenge: string | null = null
  if (typeof parentShortId === 'string' && parentShortId.trim()) {
    const parent = await db.short.findUnique({
      where: { id: parentShortId.trim() },
      select: { id: true, title: true },
    })
    if (!parent) {
      return NextResponse.json({ error: 'Родительский шортс не найден' }, { status: 404 })
    }
    parentId = parent.id
    mode = duetMode === 'duet' || duetMode === 'challenge' || duetMode === 'reply' ? duetMode : 'reply'
    challenge =
      typeof challengeTitle === 'string' && challengeTitle.trim()
        ? challengeTitle.trim().slice(0, 80)
        : mode === 'challenge'
          ? parent.title.slice(0, 80)
          : null
  }

  const short = await db.short.create({
    data: {
      creatorId: me.id,
      title: title.trim(),
      description: description?.trim() || null,
      source: finalSource,
      videoUrl: finalVideoUrl,
      externalId: finalExternalId,
      thumbnailUrl: finalThumbnail,
      duration: finalDuration,
      tags: Array.isArray(tags) ? tags.join(',') : (tags || null),
      reviewStatus: 'pending',
      parentShortId: parentId,
      duetMode: mode,
      challengeTitle: challenge,
    },
    include: {
      creator: {
        select: { id: true, name: true, username: true, avatarColor: true },
      },
      parentShort: {
        select: {
          id: true,
          title: true,
          thumbnailUrl: true,
          videoUrl: true,
          creator: { select: { id: true, name: true, username: true, avatarColor: true } },
        },
      },
    },
  })

  if (shareToFeed === true) {
    await createFeedSharePost({
      userId: me.id,
      kind: 'short',
      targetId: short.id,
      title: short.title,
      content: short.description || short.title,
      coverUrl: short.thumbnailUrl,
    })
  }

  return NextResponse.json({
    short: serializeShort(short, false),
  })
})
