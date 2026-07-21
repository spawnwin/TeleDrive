import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { adminGuard } from '@/lib/admin-api'
import { withJsonApi } from '@/lib/with-json-api'
import { getEconomySettings } from '@/lib/economy-settings'

export const PATCH = withJsonApi(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await adminGuard()
  if ('error' in guard) return guard.error

  const { id } = await params
  const body = await req.json()
  const { action, amount } = body ?? {}

  const target = await db.user.findUnique({ where: { id } })
  if (!target) {
    return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
  }

  if (id === guard.admin.id && ['ban', 'demote', 'delete'].includes(action)) {
    return NextResponse.json({ error: 'Нельзя применить к себе' }, { status: 400 })
  }

  switch (action) {
    case 'ban':
      await db.user.update({ where: { id }, data: { isBanned: true, online: false } })
      await db.session.deleteMany({ where: { userId: id } })
      break
    case 'unban':
      await db.user.update({ where: { id }, data: { isBanned: false } })
      break
    case 'promote':
      await db.user.update({ where: { id }, data: { isAdmin: true } })
      break
    case 'demote':
      await db.user.update({ where: { id }, data: { isAdmin: false } })
      break
    case 'grant_premium': {
      const economy = await getEconomySettings()
      const days = Math.max(1, Math.round(economy.premiumDurationDays || 30))
      const premiumUntil = new Date()
      premiumUntil.setDate(premiumUntil.getDate() + days)
      await db.user.update({
        where: { id },
        data: {
          isPremium: true,
          premiumUntil,
        },
      })
      break
    }
    case 'revoke_premium':
      await db.user.update({
        where: { id },
        data: { isPremium: false, premiumUntil: null },
      })
      break
    case 'add_coins': {
      const coins = Number(amount)
      if (!Number.isFinite(coins) || coins <= 0) {
        return NextResponse.json({ error: 'Укажите корректную сумму, ₽' }, { status: 400 })
      }
      const value = Math.floor(coins)
      await db.user.update({ where: { id }, data: { coins: { increment: value } } })
      await db.coinTransaction.create({
        data: { userId: id, amount: value, reason: 'admin_grant' },
      })
      break
    }
    case 'subtract_coins': {
      const coins = Number(amount)
      if (!Number.isFinite(coins) || coins <= 0) {
        return NextResponse.json({ error: 'Укажите корректную сумму, ₽' }, { status: 400 })
      }
      const value = Math.floor(coins)
      if (target.coins < value) {
        return NextResponse.json(
          { error: `Недостаточно средств (сейчас ${target.coins} ₽)` },
          { status: 400 },
        )
      }
      await db.user.update({ where: { id }, data: { coins: { decrement: value } } })
      await db.coinTransaction.create({
        data: { userId: id, amount: -value, reason: 'admin_adjust' },
      })
      break
    }
    default:
      return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 })
  }

  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      name: true,
      isPremium: true,
      isBot: true,
      isAdmin: true,
      isBanned: true,
      coins: true,
      online: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ ok: true, user })
})

export const DELETE = withJsonApi(async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await adminGuard()
  if ('error' in guard) return guard.error

  const { id } = await params
  if (id === guard.admin.id) {
    return NextResponse.json({ error: 'Нельзя удалить себя' }, { status: 400 })
  }

  const target = await db.user.findUnique({ where: { id } })
  if (!target) {
    return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
  }

  await db.user.delete({ where: { id } })
  return NextResponse.json({ ok: true })
})
