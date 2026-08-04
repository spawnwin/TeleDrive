import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { adminGuard } from '@/lib/admin-api'
import { withJsonApi } from '@/lib/with-json-api'

export const GET = withJsonApi(async function GET() {
  const guard = await adminGuard()
  if ('error' in guard) return guard.error

  const [flaggedMessages, pendingShorts] = await Promise.all([
    db.messageReport.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { reporter: { select: { username: true, name: true } } },
    }),
    db.short.findMany({
      where: { reviewStatus: 'pending' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { creator: { select: { username: true, name: true } } },
    }),
  ])

  const messageIds = flaggedMessages.map((r) => r.messageId)
  const messages = messageIds.length
    ? await db.message.findMany({
        where: { id: { in: messageIds } },
        select: {
          id: true,
          content: true,
          type: true,
          createdAt: true,
          senderId: true,
          sender: { select: { id: true, username: true, name: true } },
        },
      })
    : []
  const messageMap = new Map(messages.map((m) => [m.id, m]))

  return NextResponse.json({
    flaggedMessages: flaggedMessages.map((r) => ({
      ...r,
      message: messageMap.get(r.messageId) ?? null,
    })),
    pendingShorts,
  })
})

export const PATCH = withJsonApi(async function PATCH(req: Request) {
  const guard = await adminGuard()
  if ('error' in guard) return guard.error

  const body = await req.json()
  const { shortId, reviewStatus, reportId, reportStatus } = body ?? {}

  // Shorts review
  if (shortId && reviewStatus) {
    if (!['approved', 'rejected'].includes(reviewStatus)) {
      return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 })
    }
    const short = await db.short.findUnique({ where: { id: shortId }, select: { id: true } })
    if (!short) return NextResponse.json({ error: 'Short не найден' }, { status: 404 })
    await db.short.update({ where: { id: shortId }, data: { reviewStatus } })
    // Rejected shorts must not keep a friends-feed card with title/thumbnail.
    if (reviewStatus === 'rejected') {
      await db.wallPost
        .deleteMany({
          where: {
            type: 'share',
            attachmentUrl: `short:${shortId}`,
            attachmentMime: 'application/x-aurora-short',
          },
        })
        .catch(() => {})
    }
    return NextResponse.json({ ok: true })
  }

  // Message report resolve / dismiss
  if (reportId && reportStatus) {
    if (!['reviewed', 'dismissed'].includes(reportStatus)) {
      return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 })
    }
    const report = await db.messageReport.findUnique({ where: { id: reportId } })
    if (!report) return NextResponse.json({ error: 'Жалоба не найдена' }, { status: 404 })
    await db.messageReport.update({ where: { id: reportId }, data: { status: reportStatus } })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 })
})
