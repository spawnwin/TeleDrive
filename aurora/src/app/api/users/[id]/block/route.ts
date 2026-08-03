import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { areUsersBlocked } from '@/lib/user-blocks'
import { withJsonApi } from '@/lib/with-json-api'

/** Block / unblock a user. */
export const POST = withJsonApi(async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  if (!id || id === me.id) {
    return NextResponse.json({ error: 'Нельзя заблокировать себя' }, { status: 400 })
  }

  const target = await db.user.findUnique({ where: { id }, select: { id: true } })
  if (!target) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })

  await db.userBlock.upsert({
    where: { blockerId_blockedId: { blockerId: me.id, blockedId: id } },
    create: { blockerId: me.id, blockedId: id },
    update: {},
  })

  return NextResponse.json({ ok: true, blocked: true })
})

export const DELETE = withJsonApi(async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  await db.userBlock.deleteMany({
    where: { blockerId: me.id, blockedId: id },
  })

  return NextResponse.json({ ok: true, blocked: false })
})

export const GET = withJsonApi(async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const { id } = await params
  const blocked = await areUsersBlocked(me.id, id)
  return NextResponse.json({ blocked })
})
