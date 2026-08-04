import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createUserSession, hash } from '@/lib/auth'
import { COIN_REWARDS } from '@/lib/coins'
import { getOrCreateSavedChat } from '@/lib/saved-chat'
import { withJsonApi } from '@/lib/with-json-api'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const POST = withJsonApi(async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { username, name, password, language } = body ?? {}

    if (!username || !name || !password) {
      return NextResponse.json(
        { error: 'Заполните все поля' },
        { status: 400 },
      )
    }
    if (typeof username !== 'string' || username.trim().length < 2 || username.length > 32) {
      return NextResponse.json(
        { error: 'Имя пользователя: от 2 до 32 символов' },
        { status: 400 },
      )
    }
    if (!/^[a-zA-Z0-9_.]+$/.test(username)) {
      return NextResponse.json(
        { error: 'Имя пользователя: только латиница, цифры, _ и .' },
        { status: 400 },
      )
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Пароль должен быть не менее 8 символов' },
        { status: 400 },
      )
    }

    if (!rateLimit(`register:${clientIp(req)}`, 20, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Слишком много регистраций. Попробуйте позже.' },
        { status: 429 },
      )
    }

    const existing = await db.user.findUnique({ where: { username } })
    if (existing) {
      return NextResponse.json(
        { error: 'Имя пользователя уже занято' },
        { status: 409 },
      )
    }

    const colors = ['#7c3aed', '#06b6d4', '#ec4899', '#f97316', '#10b981', '#eab308', '#8b5cf6', '#ef4444']
    const avatarColor = colors[Math.floor(Math.random() * colors.length)]

    const user = await db.user.create({
      data: {
        username,
        name,
        password: hash(password),
        avatarColor,
        language: language === 'en' ? 'en' : 'ru',
        coins: COIN_REWARDS.WELCOME,
        coinTransactions: {
          create: {
            amount: COIN_REWARDS.WELCOME,
            reason: 'welcome',
          },
        },
      },
    })

    await getOrCreateSavedChat(user.id)
    await createUserSession(user.id, {
      userAgent: req.headers.get('user-agent'),
      ip: clientIp(req),
    })

    return NextResponse.json({
      id: user.id,
      username: user.username,
      name: user.name,
      avatarColor: user.avatarColor,
      language: user.language,
      coins: user.coins,
    })
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === 'P2002') {
      return NextResponse.json(
        { error: 'Имя пользователя уже занято' },
        { status: 409 },
      )
    }
    console.error('[register] error', err)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
})
