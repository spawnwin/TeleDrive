import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'

export const POST = withJsonApi(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  await db.chatMember.update({
    where: { userId_chatId: { userId: me.id, chatId: id } },
    data: { lastReadAt: new Date(), markedUnread: false },
  })

  return NextResponse.json({ ok: true })
})
