import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { UPLOADS_DIR } from '@/lib/uploads-path'
import { fetchInstagramVideoInfo, isInstagramUrl } from '@/lib/instagram-video'
import { getInstagramSessionCookie } from '@/lib/scraper-settings'
import { createFeedSharePost } from '@/lib/feed-share-server'

const MAX_SIZE = 200 * 1024 * 1024 // 200MB, matches the regular video upload limit

// Downloads a public Instagram Reel/Post video and re-hosts it on our own
// storage, then creates a Short from it — the app never links back to
// Instagram; the published video is a plain file we serve ourselves.
export const POST = withJsonApi(async function POST(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const url = typeof body?.url === 'string' ? body.url.trim() : ''
  if (!url || !isInstagramUrl(url)) {
    return NextResponse.json({ error: 'Укажите ссылку на Instagram Reel или пост' }, { status: 400 })
  }
  const titleOverride = typeof body?.title === 'string' ? body.title.trim() : ''
  const description = typeof body?.description === 'string' ? body.description.trim() : null
  const tags = Array.isArray(body?.tags) ? body.tags.filter((t: unknown) => typeof t === 'string') : []
  const shareToFeed = body?.shareToFeed === true

  const sessionCookie = await getInstagramSessionCookie()
  let fetchException: string | null = null
  const result = await fetchInstagramVideoInfo(url, { sessionCookie }).catch((err) => {
    fetchException = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    return null
  })
  if (!result) {
    return NextResponse.json(
      {
        error: 'Не удалось найти видео по этой ссылке. Пост может быть приватным или удалён.',
        debug: me.isAdmin ? { fetchException } : undefined,
      },
      { status: 400 },
    )
  }
  if ('blocked' in result) {
    return NextResponse.json(
      {
        error: result.blocked
          ? 'Instagram заблокировал автоматический доступ к этой ссылке. Попробуйте позже или обратитесь к администратору — нужен активный cookie сессии Instagram.'
          : 'Не удалось найти видео по этой ссылке. Пост может быть приватным или удалён.',
        // Only shown to admins, and never includes any cookie/user data —
        // just enough to triage without server log access.
        debug: me.isAdmin ? result.debug : undefined,
      },
      { status: 502 },
    )
  }
  const info = result

  const videoRes = await fetch(info.videoUrl).catch(() => null)
  if (!videoRes?.ok) {
    return NextResponse.json({ error: 'Не удалось скачать видео' }, { status: 502 })
  }
  const contentType = videoRes.headers.get('content-type') || ''
  if (contentType && !contentType.startsWith('video/')) {
    return NextResponse.json({ error: 'Ссылка не ведёт на видео' }, { status: 400 })
  }
  const bytes = Buffer.from(await videoRes.arrayBuffer())
  if (bytes.length === 0) {
    return NextResponse.json({ error: 'Видео пустое' }, { status: 502 })
  }
  if (bytes.length > MAX_SIZE) {
    return NextResponse.json({ error: 'Видео слишком большое (макс. 200 МБ)' }, { status: 413 })
  }

  const { checkStorageQuota, trackFileUpload } = await import('@/lib/storage')
  const quotaCheck = await checkStorageQuota(me.id, bytes.length)
  if (!quotaCheck.ok) {
    return NextResponse.json({ error: quotaCheck.error }, { status: 413 })
  }

  const filename = `short-ig-${Date.now()}-${randomUUID().slice(0, 8)}.mp4`
  const uploadDir = path.join(UPLOADS_DIR, 'videos')
  await mkdir(uploadDir, { recursive: true })
  await writeFile(path.join(uploadDir, filename), bytes)
  const videoUrl = `/uploads/videos/${filename}`

  await trackFileUpload(me.id, {
    filename,
    url: videoUrl,
    mimeType: 'video/mp4',
    size: bytes.length,
  })

  const short = await db.short.create({
    data: {
      creatorId: me.id,
      title: (titleOverride || info.title || 'Reel').slice(0, 100),
      description: description || null,
      tags: tags.length ? tags.join(',') : null,
      source: 'instagram',
      externalId: info.shortcode,
      videoUrl,
      thumbnailUrl: info.thumbnailUrl,
      reviewStatus: 'approved',
    },
    include: {
      creator: { select: { id: true, name: true, username: true, avatarColor: true } },
    },
  })

  let sharedToFeed = false
  if (shareToFeed) {
    const created = await createFeedSharePost({
      userId: me.id,
      kind: 'short',
      targetId: short.id,
      title: short.title,
      content: short.description || short.title,
      coverUrl: short.thumbnailUrl,
    })
    sharedToFeed = !!created
  }

  return NextResponse.json({
    short: {
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
      isLiked: false,
    },
    sharedToFeed,
  })
})
