import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { getPlatformFlags } from '@/lib/platform-settings'
import { areUsersBlocked } from '@/lib/user-blocks'
import { createFeedSharePost } from '@/lib/feed-share-server'

// GET /api/streams — currently live streams, for the discovery grid.
// ?gameId=<id> narrows to one Twitch-style category (see /api/streams/games).
export const GET = withJsonApi(async function GET(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const gameId = new URL(req.url).searchParams.get('gameId')

  const streams = await db.liveStream.findMany({
    where: { status: 'live', ...(gameId ? { gameId } : {}) },
    orderBy: { startedAt: 'desc' },
    take: 80,
    include: {
      host: { select: { id: true, name: true, username: true, avatarColor: true, avatarUrl: true } },
      game: { select: { id: true, slug: true, title: true, titleEn: true, color: true } },
    },
  })

  const visible: Array<{
    id: string
    title: string
    roomId: string
    viewerCount: number
    startedAt: Date | null
    host: (typeof streams)[number]['host']
    game: (typeof streams)[number]['game']
  }> = []
  for (const s of streams) {
    if (s.hostId !== me.id && (await areUsersBlocked(me.id, s.hostId))) continue
    visible.push({
      id: s.id,
      title: s.title,
      roomId: s.roomId,
      viewerCount: s.viewerCount,
      startedAt: s.startedAt,
      host: s.host,
      game: s.game,
    })
    if (visible.length >= 50) break
  }

  return NextResponse.json({ streams: visible })
})

// POST /api/streams { title } — go live. roomId is handed to the WebRTC
// signaling layer (reuses the group-call `group:*` Socket.IO events in
// mini-services/call-service — mesh topology, host connects to each viewer
// directly). See src/hooks/use-live-stream.ts.
export const POST = withJsonApi(async function POST(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const flags = await getPlatformFlags()
  if (!flags.streamsEnabled) {
    return NextResponse.json({ error: 'Стримы временно отключены администратором' }, { status: 403 })
  }

  const existing = await db.liveStream.findFirst({ where: { hostId: me.id, status: 'live' } })
  if (existing) {
    return NextResponse.json({ error: 'У вас уже есть активный стрим' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: 'Введите название стрима' }, { status: 400 })

  const gameId = typeof body?.gameId === 'string' && body.gameId ? body.gameId : null
  if (gameId) {
    const game = await db.streamGame.findUnique({ where: { id: gameId }, select: { active: true } })
    if (!game || !game.active) {
      return NextResponse.json({ error: 'Категория не найдена' }, { status: 400 })
    }
  }

  const stream = await db.liveStream.create({
    data: {
      hostId: me.id,
      title: title.slice(0, 100),
      roomId: `stream-${randomUUID()}`,
      gameId,
    },
    include: {
      host: { select: { id: true, name: true, username: true, avatarColor: true, avatarUrl: true } },
      game: { select: { id: true, slug: true, title: true, titleEn: true, color: true } },
    },
  })

  let sharedToFeed = false
  if (body?.shareToFeed === true) {
    const created = await createFeedSharePost({
      userId: me.id,
      kind: 'stream',
      targetId: stream.id,
      title: stream.title,
      content: stream.game ? `${stream.title} · ${stream.game.title}` : stream.title,
      coverUrl: me.avatarUrl,
    })
    sharedToFeed = !!created
  }

  return NextResponse.json({
    stream: {
      id: stream.id,
      title: stream.title,
      roomId: stream.roomId,
      viewerCount: stream.viewerCount,
      startedAt: stream.startedAt,
      host: stream.host,
      game: stream.game,
    },
    sharedToFeed,
  })
})
