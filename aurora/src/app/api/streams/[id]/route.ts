import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { areUsersBlocked } from '@/lib/user-blocks'

export const GET = withJsonApi(async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const stream = await db.liveStream.findUnique({
    where: { id },
    include: {
      host: { select: { id: true, name: true, username: true, avatarColor: true, avatarUrl: true } },
      game: { select: { id: true, slug: true, title: true, titleEn: true, color: true } },
    },
  })
  if (!stream) return NextResponse.json({ error: 'Стрим не найден' }, { status: 404 })
  if (stream.hostId !== me.id && (await areUsersBlocked(me.id, stream.hostId))) {
    return NextResponse.json({ error: 'Стрим недоступен' }, { status: 403 })
  }

  return NextResponse.json({
    stream: {
      id: stream.id,
      title: stream.title,
      roomId: stream.roomId,
      status: stream.status,
      viewerCount: stream.viewerCount,
      totalDonationsCoins: stream.totalDonationsCoins,
      showTopDonors: stream.showTopDonors,
      startedAt: stream.startedAt,
      host: stream.host,
      game: stream.game,
    },
  })
})

// PATCH { showTopDonors?, title?, hidden?, gameId? } — host-only edits: toggle
// the top-donors leaderboard, rename the stream, hide/unhide it from own
// history (soft-delete — it stays visible to the host and to admins), or
// change its Twitch-style category. gameId: null clears the category.
export const PATCH = withJsonApi(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const stream = await db.liveStream.findUnique({ where: { id }, select: { hostId: true } })
  if (!stream) return NextResponse.json({ error: 'Стрим не найден' }, { status: 404 })
  if (stream.hostId !== me.id) return NextResponse.json({ error: 'Не ваш стрим' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const data: { showTopDonors?: boolean; title?: string; hidden?: boolean; gameId?: string | null } = {}

  if (typeof body?.showTopDonors === 'boolean') data.showTopDonors = body.showTopDonors
  if (typeof body?.hidden === 'boolean') data.hidden = body.hidden
  if (typeof body?.title === 'string') {
    const title = body.title.trim()
    if (!title) return NextResponse.json({ error: 'Введите название стрима' }, { status: 400 })
    data.title = title.slice(0, 100)
  }
  if ('gameId' in (body ?? {})) {
    if (body.gameId === null) {
      data.gameId = null
    } else if (typeof body.gameId === 'string') {
      const game = await db.streamGame.findUnique({ where: { id: body.gameId }, select: { active: true } })
      if (!game || !game.active) {
        return NextResponse.json({ error: 'Категория не найдена' }, { status: 400 })
      }
      data.gameId = body.gameId
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 })
  }

  await db.liveStream.update({ where: { id }, data })
  return NextResponse.json({ ok: true })
})
