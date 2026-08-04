import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { isPremiumActive, PREMIUM_THEMES } from '@/lib/coins'
import { isValidEmojiStatusCode } from '@/lib/emoji-status-catalog'
import { parseChatWallpaper } from '@/lib/chat-wallpaper'
import { withJsonApi } from '@/lib/with-json-api'

export const PATCH = withJsonApi(async function PATCH(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json()
  const { name, bio, avatarColor, avatarUrl, language, publicKey } = body ?? {}

  const data: any = {}
  if (typeof name === 'string' && name.trim()) data.name = name.trim()
  if (typeof bio === 'string') data.bio = bio.trim().slice(0, 200) || null
  if (typeof avatarColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(avatarColor)) {
    data.avatarColor = avatarColor
  }
  if (typeof avatarUrl === 'string') data.avatarUrl = avatarUrl || null
  if (avatarUrl === null) data.avatarUrl = null
  if (language === 'ru' || language === 'en') data.language = language
  if ('publicKey' in (body ?? {})) {
    data.publicKey = typeof publicKey === 'string' && publicKey.trim() ? publicKey.trim() : null
  }
  const { premiumTheme } = body ?? {}
  if (
    typeof premiumTheme === 'string' &&
    (PREMIUM_THEMES as readonly string[]).includes(premiumTheme)
  ) {
    data.premiumTheme = premiumTheme
  }
  if ('chatWallpaper' in (body ?? {})) {
    if (body.chatWallpaper === null) {
      data.chatWallpaper = null
    } else {
      const parsed = parseChatWallpaper(body.chatWallpaper)
      if (!parsed) {
        return NextResponse.json({ error: 'Недопустимые обои' }, { status: 400 })
      }
      data.chatWallpaper = JSON.stringify(parsed)
    }
  }
  if ('emojiStatus' in (body ?? {})) {
    if (!isPremiumActive(me)) {
      return NextResponse.json({ error: 'Требуется Aurora Premium' }, { status: 403 })
    }
    const { emojiStatus } = body ?? {}
    if (emojiStatus === null || emojiStatus === '') {
      data.emojiStatus = null
    } else if (typeof emojiStatus === 'string' && (await isValidEmojiStatusCode(emojiStatus))) {
      data.emojiStatus = emojiStatus
    } else {
      return NextResponse.json({ error: 'Недопустимый эмодзи-статус' }, { status: 400 })
    }
  }

  const updated = await db.user.update({
    where: { id: me.id },
    data,
    select: {
      id: true,
      username: true,
      name: true,
      avatarColor: true,
      avatarUrl: true,
      bio: true,
      online: true,
      lastSeen: true,
      language: true,
      balance: true,
      coins: true,
      isPremium: true,
      premiumUntil: true,
      premiumTheme: true,
      chatWallpaper: true,
      emojiStatus: true,
      publicKey: true,
    },
  })

  return NextResponse.json({
    user: {
      ...updated,
      chatWallpaper: parseChatWallpaper(updated.chatWallpaper),
    },
  })
})
