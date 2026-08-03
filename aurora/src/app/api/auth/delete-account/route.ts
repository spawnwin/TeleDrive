import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { verifyPassword } from '@/lib/password'
import { withJsonApi } from '@/lib/with-json-api'

export const POST = withJsonApi(async function POST(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const password = typeof body.password === 'string' ? body.password : ''
  const confirm = typeof body.confirm === 'string' ? body.confirm : ''

  if (confirm !== 'DELETE' && confirm !== 'УДАЛИТЬ') {
    return NextResponse.json(
      { error: 'Введите УДАЛИТЬ для подтверждения' },
      { status: 400 },
    )
  }
  if (!password) {
    return NextResponse.json({ error: 'Введите пароль' }, { status: 400 })
  }

  const user = await db.user.findUnique({
    where: { id: me.id },
    select: { password: true, isAdmin: true },
  })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (user.isAdmin) {
    return NextResponse.json(
      { error: 'Админ-аккаунт нельзя удалить из приложения' },
      { status: 403 },
    )
  }

  const ok = await verifyPassword(password, user.password)
  if (!ok) return NextResponse.json({ error: 'Неверный пароль' }, { status: 400 })

  await db.user.delete({ where: { id: me.id } })

  const jar = await cookies()
  for (const name of ['messenger_session', 'aurora_session', 'session', 'token']) {
    try {
      jar.delete(name)
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({ ok: true })
})
