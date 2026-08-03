import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { parseVisibility, VISIBILITY_VALUES } from '@/lib/privacy'
import { withJsonApi } from '@/lib/with-json-api'

export const GET = withJsonApi(async function GET() {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const row = await db.user.findUnique({
    where: { id: me.id },
    select: {
      lastSeenVisibility: true,
      whoCanMessage: true,
      whoCanCall: true,
    },
  })

  return NextResponse.json({
    lastSeenVisibility: parseVisibility(row?.lastSeenVisibility),
    whoCanMessage: parseVisibility(row?.whoCanMessage),
    whoCanCall: parseVisibility(row?.whoCanCall),
    options: VISIBILITY_VALUES,
  })
})

export const PATCH = withJsonApi(async function PATCH(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const data: Record<string, string> = {}

  for (const key of ['lastSeenVisibility', 'whoCanMessage', 'whoCanCall'] as const) {
    if (key in body) {
      const v = parseVisibility(body[key], 'everyone')
      if (!VISIBILITY_VALUES.includes(v)) {
        return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 })
      }
      data[key] = v
    }
  }

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const updated = await db.user.update({
    where: { id: me.id },
    data,
    select: {
      lastSeenVisibility: true,
      whoCanMessage: true,
      whoCanCall: true,
    },
  })

  return NextResponse.json({
    lastSeenVisibility: parseVisibility(updated.lastSeenVisibility),
    whoCanMessage: parseVisibility(updated.whoCanMessage),
    whoCanCall: parseVisibility(updated.whoCanCall),
  })
})
