import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { getPlatformFlags } from '@/lib/platform-settings'
import {
  getAcceptedFriendIds,
  serializeWallPosts,
  wallAuthorSelect,
  type WallPostRow,
} from '@/lib/wall-feed'

/**
 * Friends news feed: own-wall posts (profileId === authorId) from me + accepted friends.
 * Guest posts left on someone else's wall stay on that profile only.
 */
export const GET = withJsonApi(async function GET(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const url = new URL(req.url)
  const take = Math.min(40, Math.max(1, Number(url.searchParams.get('take') || 20)))
  const cursor = url.searchParams.get('cursor')

  const friendIds = await getAcceptedFriendIds(me.id)

  const blocks =
    friendIds.length > 0
      ? await db.userBlock.findMany({
          where: {
            OR: [
              { blockerId: me.id, blockedId: { in: friendIds } },
              { blockerId: { in: friendIds }, blockedId: me.id },
            ],
          },
          select: { blockerId: true, blockedId: true },
        })
      : []
  const blocked = new Set<string>()
  for (const b of blocks) {
    blocked.add(b.blockerId === me.id ? b.blockedId : b.blockerId)
  }
  const visibleAuthors = [me.id, ...friendIds.filter((id) => !blocked.has(id))]

  const posts = (await db.wallPost.findMany({
    where: {
      OR: visibleAuthors.map((id) => ({ authorId: id, profileId: id })),
    },
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

/** Publish a post to my wall (appears in friends' feed). */
export const POST = withJsonApi(async function POST(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const flags = await getPlatformFlags()
  if (!flags.wallEnabled) {
    return NextResponse.json(
      { error: 'Лента временно отключена администратором' },
      { status: 403 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const content = (typeof body?.content === 'string' ? body.content : '').trim()
  const type = ['text', 'image', 'voice', 'drawing', 'music'].includes(body?.type)
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
  if (type !== 'text' && !attachmentUrl) {
    return NextResponse.json({ error: 'Нет вложения' }, { status: 400 })
  }

  const post = await db.wallPost.create({
    data: {
      profileId: me.id,
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

  const [serialized] = await serializeWallPosts(me.id, [post as WallPostRow])
  return NextResponse.json({ post: serialized })
})
