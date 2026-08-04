import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { withJsonApi } from '@/lib/with-json-api'

export const DELETE = withJsonApi(async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const story = await db.story.findUnique({ where: { id } })
  if (!story) return NextResponse.json({ error: 'Статус не найден' }, { status: 404 })
  if (story.userId !== me.id) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
  }

  await db.story.delete({ where: { id } })
  return NextResponse.json({ ok: true })
})
