import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  formatContactDisplayName,
  normalizeContactNameInput,
  upsertContactName,
} from '@/lib/contacts'
import { withJsonApi } from '@/lib/with-json-api'

export const GET = withJsonApi(async function GET() {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const rows = await db.contact.findMany({
    where: { ownerId: me.id },
    include: {
      peer: {
        select: {
          id: true,
          username: true,
          name: true,
          avatarColor: true,
          avatarUrl: true,
          online: true,
          lastSeen: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({
    contacts: rows.map((c) => ({
      id: c.id,
      peerId: c.peerId,
      firstName: c.firstName,
      lastName: c.lastName,
      displayName: formatContactDisplayName(c),
      peer: c.peer,
    })),
  })
})

export const POST = withJsonApi(async function POST(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const peerId = typeof body.peerId === 'string' ? body.peerId : ''
  if (!peerId) {
    return NextResponse.json({ error: 'Укажите пользователя' }, { status: 400 })
  }
  if (peerId === me.id) {
    return NextResponse.json({ error: 'Нельзя добавить себя в контакты' }, { status: 400 })
  }

  const normalized = normalizeContactNameInput(body)
  if ('error' in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 })
  }

  const peer = await db.user.findUnique({
    where: { id: peerId },
    select: { id: true, name: true, username: true },
  })
  if (!peer) {
    return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
  }

  const contact = await upsertContactName(
    me.id,
    peerId,
    normalized.firstName,
    normalized.lastName,
  )

  return NextResponse.json({
    contact: {
      ...contact,
      displayName: formatContactDisplayName(contact),
    },
  })
})
