import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { getEconomySettings } from '@/lib/economy-settings'
import { areUsersBlocked } from '@/lib/user-blocks'

const MIN_DONATION_RUB = 1
const MAX_DONATION_RUB = 100_000

// Donation: the balance is denominated 1:1 in rubles, so a donation of X
// simply moves X (minus the platform's donationFeePercent cut) straight into
// the host's withdrawable `balance` — no exchange rate. Same balance/payout
// pipeline already built for Shorts creator earnings (src/app/api/shorts/withdraw).
export const POST = withJsonApi(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const stream = await db.liveStream.findUnique({ where: { id } })
  if (!stream) return NextResponse.json({ error: 'Стрим не найден' }, { status: 404 })
  if (stream.status !== 'live') return NextResponse.json({ error: 'Стрим завершён' }, { status: 400 })
  if (stream.hostId === me.id) {
    return NextResponse.json({ error: 'Нельзя задонатить самому себе' }, { status: 400 })
  }
  if (await areUsersBlocked(me.id, stream.hostId)) {
    return NextResponse.json({ error: 'Стрим недоступен' }, { status: 403 })
  }

  const donor = await db.user.findUnique({ where: { id: me.id }, select: { id: true, isBanned: true } })
  if (donor?.isBanned) {
    return NextResponse.json({ error: 'Вы заблокированы' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const amountRub = Math.round(Number(body?.amountCoins))
  const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 200) : null
  if (!Number.isFinite(amountRub) || amountRub < MIN_DONATION_RUB || amountRub > MAX_DONATION_RUB) {
    return NextResponse.json({ error: 'Укажите корректную сумму' }, { status: 400 })
  }

  const { donationFeePercent } = await getEconomySettings()
  // Rounded to kopecks — donationFeePercent can be a non-round value (e.g.
  // 5.5%), and letting raw IEEE-754 floats (94.49999999999999-style) drift
  // into balance/CreatorEarning accumulates over many donations.
  const netRub = Math.round(amountRub * (1 - donationFeePercent / 100) * 100) / 100

  const result = await db.$transaction(async (tx) => {
    const debited = await tx.user.updateMany({
      where: { id: me.id, coins: { gte: amountRub } },
      data: { coins: { decrement: amountRub } },
    })
    if (debited.count === 0) {
      return { error: 'Недостаточно средств на балансе' as const }
    }

    await tx.user.update({
      where: { id: stream.hostId },
      data: { balance: { increment: netRub } },
    })

    await tx.coinTransaction.createMany({
      data: [
        {
          userId: me.id,
          amount: -amountRub,
          reason: 'donation_sent',
          metadata: JSON.stringify({ streamId: id, feePercent: donationFeePercent, netRub }),
        },
      ],
    })
    await tx.creatorEarning.create({
      data: { userId: stream.hostId, amount: netRub, reason: 'donation' },
    })
    await tx.liveStreamDonation.create({
      data: { streamId: id, donorId: me.id, amountCoins: amountRub, message },
    })
    await tx.liveStream.update({
      where: { id },
      data: { totalDonationsCoins: { increment: amountRub } },
    })

    const donor = await tx.user.findUnique({ where: { id: me.id }, select: { coins: true } })
    return { ok: true as const, coins: donor!.coins }
  })

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ ok: true, coins: result.coins })
})
