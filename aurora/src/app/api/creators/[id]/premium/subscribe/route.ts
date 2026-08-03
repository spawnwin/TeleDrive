import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { getEconomySettings } from '@/lib/economy-settings'
import { areUsersBlocked } from '@/lib/user-blocks'

const PREMIUM_SUB_DURATION_DAYS = 30

// POST /api/creators/[id]/premium/subscribe — body { tierId }
export const POST = withJsonApi(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id: creatorId } = await params
  if (creatorId === me.id) {
    return NextResponse.json({ error: 'Нельзя подписаться на себя' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const tierId = typeof body.tierId === 'string' ? body.tierId : null

  const creator = await db.user.findUnique({
    where: { id: creatorId },
    select: { id: true, isBanned: true },
  })
  if (!creator) {
    return NextResponse.json({ error: 'Автор не найден' }, { status: 404 })
  }
  if (creator.isBanned) {
    return NextResponse.json({ error: 'Автор заблокирован' }, { status: 403 })
  }
  if (await areUsersBlocked(me.id, creatorId)) {
    return NextResponse.json({ error: 'Автор недоступен' }, { status: 403 })
  }

  // Resolve tier (optional — without a tierId we fall back to a basic tier
  // priced at the schema default of 100 coins, useful for quick "support"
  // buttons that don't require the creator to set up tiers).
  let priceCoins = 100
  let tierName = 'basic'
  if (tierId) {
    const tier = await db.creatorPremiumTier.findUnique({ where: { id: tierId } })
    if (!tier || tier.creatorId !== creatorId) {
      return NextResponse.json({ error: 'Тариф не найден' }, { status: 404 })
    }
    priceCoins = tier.priceCoins
    tierName = tier.name
  } else {
    // Use the cheapest tier if any exist
    const cheapest = await db.creatorPremiumTier.findFirst({
      where: { creatorId },
      orderBy: [{ priceCoins: 'asc' }],
    })
    if (cheapest) {
      priceCoins = cheapest.priceCoins
      tierName = cheapest.name
    }
  }

  if (priceCoins <= 0) {
    return NextResponse.json({ error: 'Неверная цена тарифа' }, { status: 400 })
  }

  const existing = await db.creatorPremium.findUnique({
    where: { creatorId_subscriberId: { creatorId, subscriberId: me.id } },
  })
  const now = new Date()
  const baseDate = existing && existing.expiresAt > now ? existing.expiresAt : now
  const expiresAt = new Date(baseDate.getTime() + PREMIUM_SUB_DURATION_DAYS * 24 * 60 * 60 * 1000)

  // Same coins-are-RUB-pegged rail as stream donations: the subscriber's
  // `coins` are debited and the creator's withdrawable `balance` (minus the
  // platform cut) plus a CreatorEarning row are credited atomically, so a
  // premium subscription actually pays out through /api/shorts/withdraw
  // like every other creator-earnings source.
  const { donationFeePercent } = await getEconomySettings()
  const netRub = Math.round(priceCoins * (1 - donationFeePercent / 100) * 100) / 100

  const result = await db.$transaction(async (tx) => {
    const debited = await tx.user.updateMany({
      where: { id: me.id, coins: { gte: priceCoins } },
      data: { coins: { decrement: priceCoins } },
    })
    if (debited.count === 0) {
      return { error: 'Недостаточно средств на балансе' as const }
    }

    await tx.user.update({
      where: { id: creatorId },
      data: { balance: { increment: netRub } },
    })

    await tx.coinTransaction.create({
      data: {
        userId: me.id,
        amount: -priceCoins,
        reason: 'premium_purchase',
        metadata: JSON.stringify({ creatorId, tierId: tierId ?? null, tier: tierName }),
      },
    })
    await tx.creatorEarning.create({
      data: { userId: creatorId, amount: netRub, reason: 'premium_subscription' },
    })

    const sub = await tx.creatorPremium.upsert({
      where: { creatorId_subscriberId: { creatorId, subscriberId: me.id } },
      create: {
        creatorId,
        subscriberId: me.id,
        tier: tierName,
        priceCoins,
        expiresAt,
      },
      update: {
        tier: tierName,
        priceCoins,
        expiresAt,
      },
    })

    const subscriber = await tx.user.findUnique({ where: { id: me.id }, select: { coins: true } })
    return { ok: true as const, sub, coins: subscriber!.coins }
  })

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({
    subscription: {
      tier: result.sub.tier,
      priceCoins: result.sub.priceCoins,
      createdAt: result.sub.createdAt,
      expiresAt: result.sub.expiresAt,
    },
    balance: result.coins,
  })
})
