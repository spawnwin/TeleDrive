import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createUserSession, verifyPassword } from '@/lib/auth'
import { verifyTotpToken, verifyBackupCode } from '@/lib/totp'
import { withJsonApi } from '@/lib/with-json-api'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const POST = withJsonApi(async function POST(req: NextRequest) {
  const body = await req.json()
  const { username, password, code, backupCode } = body ?? {}

  if (!username || !password) {
    return NextResponse.json({ error: 'Введите имя пользователя и пароль' }, { status: 400 })
  }

  if (!rateLimit(`2fa:${clientIp(req)}:${username}`, 10, 15 * 60 * 1000)) {
    return NextResponse.json(
      { error: 'Слишком много попыток. Попробуйте позже.' },
      { status: 429 },
    )
  }

  const user = await db.user.findUnique({ where: { username } })
  if (!user || !verifyPassword(password, user.password)) {
    return NextResponse.json({ error: 'Неверное имя пользователя или пароль' }, { status: 401 })
  }

  if (user.isBanned) {
    return NextResponse.json({ error: 'Аккаунт заблокирован' }, { status: 403 })
  }

  if (!user.twoFactorEnabled || !user.twoFactorSecret) {
    return NextResponse.json({ error: '2FA не включена' }, { status: 400 })
  }

  let valid = false
  let newBackupCodes: string[] | null = null
  let matchedStep: number | null = null

  if (backupCode) {
    newBackupCodes = verifyBackupCode(user.twoFactorBackupCodes, backupCode)
    valid = newBackupCodes !== null
  } else if (code) {
    matchedStep = verifyTotpToken(user.twoFactorSecret, code, { afterStep: user.twoFactorLastStep })
    valid = matchedStep !== null
  }

  if (!valid) {
    return NextResponse.json({ error: 'Неверный код 2FA' }, { status: 401 })
  }

  if (newBackupCodes) {
    await db.user.update({
      where: { id: user.id },
      data: { twoFactorBackupCodes: JSON.stringify(newBackupCodes) },
    })
  }
  if (matchedStep !== null) {
    await db.user.update({ where: { id: user.id }, data: { twoFactorLastStep: matchedStep } })
  }

  await db.user.update({
    where: { id: user.id },
    data: { online: true, lastSeen: new Date() },
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
    publicKey: user.publicKey,
  })
})
