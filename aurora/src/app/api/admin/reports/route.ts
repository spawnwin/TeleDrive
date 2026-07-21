import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { adminGuard } from '@/lib/admin-api'
import { withJsonApi } from '@/lib/with-json-api'

export const GET = withJsonApi(async function GET() {
  const guard = await adminGuard()
  if ('error' in guard) return guard.error

  const [userReports, messageReports] = await Promise.all([
    db.userReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { reporter: { select: { username: true, name: true } } },
    }),
    db.messageReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { reporter: { select: { username: true, name: true } } },
    }),
  ])

  const messageIds = messageReports.map((r) => r.messageId)
  const messages = messageIds.length
    ? await db.message.findMany({
        where: { id: { in: messageIds } },
        select: {
          id: true,
          content: true,
          chatId: true,
          senderId: true,
          sender: { select: { id: true, username: true, name: true } },
        },
      })
    : []
  const messageMap = new Map(messages.map((m) => [m.id, m]))

  const targetUserIds = [...new Set(userReports.map((r) => r.targetUserId))]
  const targetUsers = targetUserIds.length
    ? await db.user.findMany({
        where: { id: { in: targetUserIds } },
        select: { id: true, username: true, name: true },
      })
    : []
  const targetMap = new Map(targetUsers.map((u) => [u.id, u]))

  return NextResponse.json({
    userReports: userReports.map((r) => ({
      ...r,
      targetUser: targetMap.get(r.targetUserId) ?? null,
    })),
    messageReports: messageReports.map((r) => ({
      ...r,
      message: messageMap.get(r.messageId) ?? null,
    })),
  })
})

export const PATCH = withJsonApi(async function PATCH(req: NextRequest) {
  const guard = await adminGuard()
  if ('error' in guard) return guard.error

  const body = await req.json()
  const { type, id, status } = body ?? {}

  if (!type || !id || !['reviewed', 'dismissed'].includes(status)) {
    return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 })
  }

  if (type === 'user') {
    await db.userReport.update({ where: { id }, data: { status } })
  } else if (type === 'message') {
    await db.messageReport.update({ where: { id }, data: { status } })
  } else {
    return NextResponse.json({ error: 'Неизвестный тип' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
})
