import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { hashPassword, validatePasswordStrength, verifyPassword } from '@/lib/password'
import { withJsonApi } from '@/lib/with-json-api'

export const POST = withJsonApi(async function POST(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

  const strength = validatePasswordStrength(newPassword)
  if (strength) return NextResponse.json({ error: strength }, { status: 400 })
  if (!currentPassword) {
    return NextResponse.json({ error: 'Введите текущий пароль' }, { status: 400 })
  }

  const user = await db.user.findUnique({
    where: { id: me.id },
    select: { password: true },
  })
  if (!user?.password) {
    return NextResponse.json({ error: 'Аккаунт без пароля' }, { status: 400 })
  }

  const ok = await verifyPassword(currentPassword, user.password)
  if (!ok) return NextResponse.json({ error: 'Неверный текущий пароль' }, { status: 400 })

  const hashed = await hashPassword(newPassword)
  await db.user.update({
    where: { id: me.id },
    data: { password: hashed },
  })

  // Drop other sessions after password change.
  try {
    const { cookies } = await import('next/headers')
    const jar = await cookies()
    const currentToken =
      jar.get('messenger_session')?.value ||
      jar.get('aurora_session')?.value ||
      jar.get('session')?.value ||
      jar.get('token')?.value ||
      null
    if (currentToken) {
      await db.session.deleteMany({
        where: { userId: me.id, token: { not: currentToken } },
      })
    }
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true })
})
