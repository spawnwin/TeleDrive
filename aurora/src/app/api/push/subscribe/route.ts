import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { withJsonApi } from '@/lib/with-json-api'

export const POST = withJsonApi(async function POST(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json()
  const { endpoint, keys } = body ?? {}
  if (!endpoint) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }
  // Native push (Capacitor) sends empty p256dh/auth — that's OK
  const p256dh = keys?.p256dh || ''
  const auth = keys?.auth || ''

  // One physical device / browser push endpoint must belong to exactly one
  // account. Otherwise switching users on the same iPhone leaves the endpoint
  // registered to both, and the sender receives pushes for their own outbound
  // messages (the recipient row still targets this phone).
  await db.pushSubscription.deleteMany({
    where: { endpoint, userId: { not: me.id } },
  })

  await db.pushSubscription.upsert({
    where: { userId_endpoint: { userId: me.id, endpoint } },
    create: {
      userId: me.id,
      endpoint,
      p256dh,
      auth,
    },
    update: {
      p256dh,
      auth,
    },
  })

  const total = await db.pushSubscription.count({ where: { userId: me.id } })
  console.log('[push] subscription saved', {
    userId: me.id,
    username: me.username,
    endpoint: String(endpoint).slice(0, 64),
    total,
  })

  return NextResponse.json({ ok: true, count: total })
})

export const DELETE = withJsonApi(async function DELETE(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (body?.endpoint) {
    await db.pushSubscription.deleteMany({
      where: { userId: me.id, endpoint: body.endpoint },
    })
  } else {
    await db.pushSubscription.deleteMany({ where: { userId: me.id } })
  }

  return NextResponse.json({ ok: true })
})
