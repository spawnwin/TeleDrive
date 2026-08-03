import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'

export const GET = withJsonApi(async function GET() {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const [purchases, sales] = await Promise.all([
    db.marketplaceOrder.findMany({
      where: { buyerId: me.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        listing: { select: { id: true, title: true, images: true } },
        seller: { select: { id: true, name: true, username: true } },
      },
    }),
    db.marketplaceOrder.findMany({
      where: { sellerId: me.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        listing: { select: { id: true, title: true, images: true } },
        buyer: { select: { id: true, name: true, username: true } },
      },
    }),
  ])

  return NextResponse.json({
    purchases: purchases.map((o) => ({
      id: o.id,
      priceCoins: o.priceCoins,
      createdAt: o.createdAt,
      listing: o.listing,
      seller: o.seller,
    })),
    sales: sales.map((o) => ({
      id: o.id,
      priceCoins: o.priceCoins,
      createdAt: o.createdAt,
      listing: o.listing,
      buyer: o.buyer,
    })),
  })
})
