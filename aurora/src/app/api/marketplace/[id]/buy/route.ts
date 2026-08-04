import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { getEconomySettings } from '@/lib/economy-settings'
import { areUsersBlocked } from '@/lib/user-blocks'

// Atomically transfers `priceCoins` from buyer to seller (minus the
// admin-configured platform fee) and marks the listing sold. Guarded the
// same way as every other coin-spend in this app (conditional updateMany on
// the buyer's balance) so a double-click can't pay twice, and the listing's
// `status: 'active'` condition on its own update prevents two buyers from
// both winning the same one-off item.
export const POST = withJsonApi(async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const listing = await db.marketplaceListing.findUnique({ where: { id } })
  if (!listing) return NextResponse.json({ error: 'Объявление не найдено' }, { status: 404 })
  if (listing.status !== 'active') {
    return NextResponse.json({ error: 'Товар уже продан' }, { status: 400 })
  }
  if (listing.sellerId === me.id) {
    return NextResponse.json({ error: 'Нельзя купить свой товар' }, { status: 400 })
  }
  if (await areUsersBlocked(me.id, listing.sellerId)) {
    return NextResponse.json({ error: 'Продавец недоступен' }, { status: 403 })
  }

  const { marketplaceFeePercent } = await getEconomySettings()
  const feeCoins = Math.round((listing.priceCoins * marketplaceFeePercent) / 100)
  const sellerProceeds = listing.priceCoins - feeCoins

  const result = await db.$transaction(async (tx) => {
    const buyer = await tx.user.findUnique({ where: { id: me.id }, select: { coins: true } })
    if (!buyer || buyer.coins < listing.priceCoins) {
      return { error: 'Недостаточно средств на балансе' as const, status: 400 as const }
    }

    // Also pin the price we read above into the claim condition — otherwise
    // a seller editing priceCoins in the window between our initial read and
    // this transaction would let the buyer pay a stale (possibly lower)
    // price than what the listing actually settles at.
    const claimed = await tx.marketplaceListing.updateMany({
      where: { id, status: 'active', priceCoins: listing.priceCoins },
      data: { status: 'sold' },
    })
    if (claimed.count === 0) {
      return { error: 'Цена или статус объявления изменились, попробуйте снова' as const, status: 409 as const }
    }

    const debited = await tx.user.updateMany({
      where: { id: me.id, coins: { gte: listing.priceCoins } },
      data: { coins: { decrement: listing.priceCoins } },
    })
    if (debited.count === 0) {
      // Roll back the sold-status claim — the buyer's balance changed underneath us.
      await tx.marketplaceListing.update({ where: { id }, data: { status: 'active' } })
      return { error: 'Недостаточно средств на балансе' as const, status: 400 as const }
    }

    await tx.user.update({
      where: { id: listing.sellerId },
      data: { coins: { increment: sellerProceeds } },
    })

    await tx.coinTransaction.createMany({
      data: [
        {
          userId: me.id,
          amount: -listing.priceCoins,
          reason: 'marketplace_purchase',
          metadata: JSON.stringify({ listingId: id }),
        },
        {
          userId: listing.sellerId,
          amount: sellerProceeds,
          reason: 'marketplace_sale',
          metadata: JSON.stringify({ listingId: id, feeCoins, feePercent: marketplaceFeePercent }),
        },
      ],
    })

    const order = await tx.marketplaceOrder.create({
      data: {
        listingId: id,
        buyerId: me.id,
        sellerId: listing.sellerId,
        priceCoins: listing.priceCoins,
      },
    })

    const updatedBuyer = await tx.user.findUnique({ where: { id: me.id }, select: { coins: true } })
    return { ok: true as const, order, coins: updatedBuyer!.coins }
  })

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  // Push notification to seller
  const { sendPushToUser } = await import('@/lib/push-server')
  sendPushToUser(listing.sellerId, {
    title: 'Aurora Marketplace',
    body: `Ваш товар "${listing.title}" куплен за ${listing.priceCoins} Coins!`,
  }).catch(() => {})

  return NextResponse.json({ ok: true, orderId: result.order.id, coins: result.coins })
})
