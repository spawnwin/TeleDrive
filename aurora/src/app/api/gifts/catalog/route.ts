import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { isPremiumActive } from '@/lib/coins'
import { DEFAULT_LIMITED_SUPPLY } from '@/lib/gifts'

export const GET = withJsonApi(async function GET() {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const gifts = await db.giftCatalogItem.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })

  return NextResponse.json({
    gifts: gifts.map((g) => {
      const supply = g.isLimited ? g.totalSupply ?? DEFAULT_LIMITED_SUPPLY : null
      const remaining = supply != null ? Math.max(0, supply - g.issuedCount) : null
      return {
        id: g.id,
        slug: g.slug,
        title: g.title,
        titleEn: g.titleEn,
        starPrice: g.starPrice,
        convertStars: g.convertStars,
        thumbnailUrl: g.thumbnailUrl,
        stickerUrl: g.stickerUrl,
        animationUrl: g.animationUrl,
        isLimited: g.isLimited,
        isPremium: g.isPremium,
        totalSupply: supply,
        issuedCount: g.issuedCount,
        remaining,
        soldOut: remaining === 0,
      }
    }),
    balance: me.coins,
    isPremium: isPremiumActive(me),
  })
})
