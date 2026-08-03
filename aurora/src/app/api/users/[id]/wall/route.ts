import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { getPlatformFlags } from '@/lib/platform-settings'
import { areUsersBlocked } from '@/lib/user-blocks'
import { assertCanMessage } from '@/lib/privacy-server'
import { serializeWallPosts, wallAuthorSelect, type WallPostRow } from '@/lib/wall-feed'

// List wall posts for a user profile (newest first).
export const GET = withJsonApi(async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const profile = await db.user.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!profile) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
  if (me.id !== id && (await areUsersBlocked(me.id, id))) {
    return NextResponse.json({ error: 'Пользователь заблокирован' }, { status: 403 })
  }

  const url = new URL(req.url)
  const take = Math.min(50, Math.max(1, Number(url.searchParams.get('take') || 50)))
  const cursor = url.searchParams.get('cursor')

  const posts = (await db.wallPost.findMany({
    where: { profileId: id },
    orderBy: { createdAt: 'desc' },
    take,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: { author: { select: wallAuthorSelect } },
  })) as WallPostRow[]

  return NextResponse.json({
    posts: await serializeWallPosts(me.id, posts),
    nextCursor: posts.length === take ? posts[posts.length - 1]?.id : null,
  })
})

// Create a wall post. Any authenticated user can post on any public profile's
// wall (VK-style). The profile owner can later delete any post on their wall;
// authors can delete their own posts.
export const POST = withJsonApi(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const flags = await getPlatformFlags()
  if (!flags.wallEnabled) {
    return NextResponse.json({ error: 'Стена профиля временно отключена администратором' }, { status: 403 })
  }

  const { id } = await params
  const profile = await db.user.findUnique({
    where: { id },
    select: { id: true, isBanned: true },
  })
  if (!profile) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
  if (profile.isBanned) return NextResponse.json({ error: 'Пользователь заблокирован' }, { status: 403 })
  if (me.id !== id) {
    if (await areUsersBlocked(me.id, id)) {
      return NextResponse.json({ error: 'Пользователь заблокирован' }, { status: 403 })
    }
    // Wall posts are a form of private outreach — respect whoCanMessage
    const canMsg = await assertCanMessage(me.id, id)
    if (!canMsg.ok) {
      return NextResponse.json({ error: canMsg.error }, { status: canMsg.status })
    }
  }

  const body = await req.json().catch(() => ({}))
  const content = (typeof body?.content === 'string' ? body.content : '').trim()
  const type = ['text', 'image', 'voice', 'drawing', 'music', 'share'].includes(body?.type)
    ? body.type
    : 'text'
  const attachmentUrl = typeof body?.attachmentUrl === 'string' ? body.attachmentUrl : null
  const attachmentName = typeof body?.attachmentName === 'string' ? body.attachmentName : null
  const attachmentMime = typeof body?.attachmentMime === 'string' ? body.attachmentMime : null
  const attachmentDuration =
    typeof body?.attachmentDuration === 'number' ? body.attachmentDuration : null
  const attachmentCoverUrl =
    typeof body?.attachmentCoverUrl === 'string' ? body.attachmentCoverUrl : null

  if (!content && !attachmentUrl) {
    return NextResponse.json({ error: 'Пустая запись' }, { status: 400 })
  }
  if (content.length > 10000) {
    return NextResponse.json({ error: 'Запись слишком длинная (макс. 10000 символов)' }, { status: 400 })
  }
  // Media posts must carry an attachment URL.
  if (type !== 'text' && !attachmentUrl) {
    return NextResponse.json({ error: 'Нет вложения' }, { status: 400 })
  }

  const post = await db.wallPost.create({
    data: {
      profileId: id,
      authorId: me.id,
      content: content || null,
      type,
      attachmentUrl,
      attachmentName,
      attachmentMime,
      attachmentDuration,
      attachmentCoverUrl,
    },
    include: { author: { select: wallAuthorSelect } },
  })

  // Notify the profile owner — posting on someone's wall previously left no
  // trace they'd ever see unless they happened to open that exact profile.
  if (id !== me.id) {
    const { sendPushToUser } = await import('@/lib/push-server')
    const preview = content
      ? content.length > 120 ? content.slice(0, 120) + '…' : content
      : type === 'image' ? '📷 Фото' : type === 'voice' ? '🎙️ Голосовое' : type === 'music' ? '🎵 Трек' : '✏️ Запись'
    sendPushToUser(id, {
      title: `${me.name} написал(а) на вашей стене`,
      body: preview,
      profileUserId: id,
    }).catch(() => {})
  }

  const [serialized] = await serializeWallPosts(me.id, [post as WallPostRow])
  return NextResponse.json({ post: serialized })
})
