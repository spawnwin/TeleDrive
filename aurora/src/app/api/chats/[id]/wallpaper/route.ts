import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { parseChatWallpaper, serializeChatWallpaper } from '@/lib/chat-wallpaper'

export const POST = withJsonApi(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const membership = await db.chatMember.findUnique({
    where: { userId_chatId: { userId: me.id, chatId: id } },
  })
  if (!membership) return NextResponse.json({ error: 'Чат не найден' }, { status: 404 })

  let wallpaperJson: string | null = null
  if ('wallpaper' in body) {
    if (body.wallpaper === null) {
      wallpaperJson = null
    } else {
      const parsed = parseChatWallpaper(body.wallpaper)
      if (!parsed) {
        return NextResponse.json({ error: 'Недопустимые обои' }, { status: 400 })
      }
      wallpaperJson = serializeChatWallpaper(parsed)
    }
  } else {
    return NextResponse.json({ error: 'Укажите wallpaper' }, { status: 400 })
  }

  await db.chatMember.update({
    where: { userId_chatId: { userId: me.id, chatId: id } },
    data: { wallpaper: wallpaperJson },
  })

  return NextResponse.json({ ok: true, wallpaper: wallpaperJson ? JSON.parse(wallpaperJson) : null })
})
