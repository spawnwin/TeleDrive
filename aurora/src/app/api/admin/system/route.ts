import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { adminGuard } from '@/lib/admin-api'
import { withJsonApi } from '@/lib/with-json-api'
import { cleanupExpiredSessions } from '@/lib/auth'

export const GET = withJsonApi(async function GET() {
  const guard = await adminGuard()
  if ('error' in guard) return guard.error

  const now = new Date()

  const [
    users,
    messages,
    chats,
    shorts,
    stories,
    sessions,
    storedFiles,
    expiredStories,
    expiredSessions,
    pushSubs,
  ] = await Promise.all([
    db.user.count(),
    db.message.count(),
    db.chat.count(),
    db.short.count(),
    db.story.count(),
    db.session.count(),
    db.storedFile.aggregate({ _sum: { size: true }, _count: true }),
    db.story.count({ where: { expiresAt: { lt: now } } }),
    db.session.count({ where: { expiresAt: { lt: now } } }),
    db.pushSubscription.count(),
  ])

  const fileCount =
    typeof storedFiles._count === 'number'
      ? storedFiles._count
      : (storedFiles._count as { _all?: number } | undefined)?._all ?? 0

  const vapidConfigured = Boolean(
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  )
  const apnsConfigured = Boolean(
    process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_KEY_PATH,
  )

  return NextResponse.json({
    db: { users, messages, chats, shorts, stories, sessions },
    storage: {
      files: fileCount,
      bytes: storedFiles._sum.size ?? 0,
    },
    cleanup: { expiredStories, expiredSessions },
    push: {
      vapidConfigured,
      apnsConfigured,
      subscriptions: pushSubs,
    },
  })
})

export const POST = withJsonApi(async function POST(req: NextRequest) {
  const guard = await adminGuard()
  if ('error' in guard) return guard.error

  const body = await req.json()
  const { action } = body ?? {}
  const now = new Date()

  switch (action) {
    case 'clear_expired_stories': {
      const deleted = await db.story.deleteMany({ where: { expiresAt: { lt: now } } })
      return NextResponse.json({ ok: true, deleted: deleted.count })
    }
    case 'cleanup_sessions': {
      await cleanupExpiredSessions()
      const deleted = await db.session.deleteMany({ where: { expiresAt: { lt: now } } })
      return NextResponse.json({ ok: true, deleted: deleted.count })
    }
    case 'cleanup_nearby': {
      const deleted = await db.nearbyPresence.deleteMany({
        where: { expiresAt: { lt: now } },
      })
      return NextResponse.json({ ok: true, deleted: deleted.count })
    }
    default:
      return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
  }
})
