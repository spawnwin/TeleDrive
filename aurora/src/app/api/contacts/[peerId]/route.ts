import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  formatContactDisplayName,
  normalizeContactNameInput,
  upsertContactName,
} from '@/lib/contacts'
import { withJsonApi } from '@/lib/with-json-api'

export const PATCH = withJsonApi(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ peerId: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { peerId } = await params
  if (!peerId || peerId === me.id) {
    return NextResponse.json({ error: 'Некорректный пользователь' }, { status: 400 })
  }

  const peer = await db.user.findUnique({ where: { id: peerId }, select: { id: true } })
  if (!peer) {
    return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const normalized = normalizeContactNameInput(body)
  if ('error' in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 })
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

export const DELETE = withJsonApi(async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ peerId: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { peerId } = await params
  await db.contact.deleteMany({ where: { ownerId: me.id, peerId } })
  return NextResponse.json({ ok: true })
})
