import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { assertCanMessage } from '@/lib/privacy-server'

const MIN_TRANSFER_RUB = 1
const MAX_TRANSFER_RUB = 1_000_000

export const GET = withJsonApi(async function GET() {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const transfers = await db.coinTransfer.findMany({
    where: { OR: [{ fromUserId: me.id }, { toUserId: me.id }] },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      fromUser: { select: { id: true, name: true, username: true, avatarColor: true, avatarUrl: true } },
      toUser: { select: { id: true, name: true, username: true, avatarColor: true, avatarUrl: true } },
    },
  })

  return NextResponse.json({
    transfers: transfers.map((t) => ({
      id: t.id,
      amount: t.amount,
      message: t.message,
      createdAt: t.createdAt,
      direction: t.fromUserId === me.id ? 'sent' : 'received',
      counterparty: t.fromUserId === me.id ? t.toUser : t.fromUser,
    })),
  })
})

// Instant P2P transfer between two users' spendable `coins` balance —
// distinct from donations/creator earnings, which go through the
// withdrawal pipeline (CreatorEarning/Payout). No exchange rate: Aurora
// Coins are 1:1 rubles everywhere.
export const POST = withJsonApi(async function POST(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const toUserId = typeof body?.toUserId === 'string' ? body.toUserId : ''
  const amount = Math.round(Number(body?.amount))
  const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 200) || null : null

  if (!toUserId) return NextResponse.json({ error: 'Укажите получателя' }, { status: 400 })
  if (toUserId === me.id) return NextResponse.json({ error: 'Нельзя перевести самому себе' }, { status: 400 })
  if (!Number.isFinite(amount) || amount < MIN_TRANSFER_RUB || amount > MAX_TRANSFER_RUB) {
    return NextResponse.json({ error: 'Укажите корректную сумму' }, { status: 400 })
  }

  const sender = await db.user.findUnique({ where: { id: me.id }, select: { id: true, isBanned: true } })
  if (sender?.isBanned) return NextResponse.json({ error: 'Вы заблокированы' }, { status: 403 })

  const recipient = await db.user.findUnique({ where: { id: toUserId }, select: { id: true, isBanned: true } })
  if (!recipient) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
  if (recipient.isBanned) return NextResponse.json({ error: 'Пользователь заблокирован' }, { status: 400 })

  const gate = await assertCanMessage(me.id, toUserId)
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const result = await db.$transaction(async (tx) => {
    const debited = await tx.user.updateMany({
      where: { id: me.id, coins: { gte: amount } },
      data: { coins: { decrement: amount } },
    })
    if (debited.count === 0) {
      return { error: 'Недостаточно средств на балансе' as const }
    }

    await tx.user.update({ where: { id: toUserId }, data: { coins: { increment: amount } } })

    await tx.coinTransaction.createMany({
      data: [
        {
          userId: me.id,
          amount: -amount,
          reason: 'transfer_sent',
          metadata: JSON.stringify({ toUserId, message }),
        },
        {
          userId: toUserId,
          amount,
          reason: 'transfer_received',
          metadata: JSON.stringify({ fromUserId: me.id, message }),
        },
      ],
    })

    await tx.coinTransfer.create({
      data: { fromUserId: me.id, toUserId, amount, message },
    })

    const sender = await tx.user.findUnique({ where: { id: me.id }, select: { coins: true } })
    return { ok: true as const, coins: sender!.coins }
  })

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  // Push notification to recipient
  const { sendPushToUser } = await import('@/lib/push-server')
  sendPushToUser(toUserId, {
    title: 'Aurora Coins',
    body: `${me.name} отправил(а) вам ${amount} Coins${message ? `: ${message}` : ''}`,
  }).catch(() => {})

  return NextResponse.json({ ok: true, coins: result.coins })
})
