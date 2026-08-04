import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createUserSession, hash, verifyPassword } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const POST = withJsonApi(async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { username, password } = body ?? {}

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Введите имя пользователя и пароль' },
        { status: 400 },
      )
    }

    if (!rateLimit(`login:${clientIp(req)}:${username}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Слишком много попыток входа. Попробуйте позже.' },
        { status: 429 },
      )
    }

    const user = await db.user.findUnique({ where: { username } })
    if (!user || !verifyPassword(password, user.password)) {
      return NextResponse.json(
        { error: 'Неверное имя пользователя или пароль' },
        { status: 401 },
      )
    }

    if (user.isBanned) {
      return NextResponse.json(
        { error: 'Аккаунт заблокирован' },
        { status: 403 },
      )
    }

    if (user.twoFactorEnabled) {
      return NextResponse.json({
        requires2FA: true,
        username: user.username,
      })
    }

    // Mark user as online; upgrade legacy SHA-256 password hashes on login
    await db.user.update({
      where: { id: user.id },
      data: {
        online: true,
        lastSeen: new Date(),
        ...(!user.password.startsWith('scrypt:') ? { password: hash(password) } : {}),
      },
    })

    await createUserSession(user.id, {
      userAgent: req.headers.get('user-agent'),
      ip: clientIp(req),
    })

    return NextResponse.json({
      id: user.id,
      username: user.username,
      name: user.name,
      avatarColor: user.avatarColor,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      language: user.language,
      balance: user.balance,
      coins: user.coins,
      isPremium: user.isPremium,
      isAdmin: user.isAdmin,
      premiumUntil: user.premiumUntil,
      premiumTheme: user.premiumTheme,
      chatWallpaper: user.chatWallpaper,
      publicKey: user.publicKey,
    })
  } catch (err) {
    console.error('[login] error', err)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
})
