import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { getPlatformFlags } from '@/lib/platform-settings'
import { areUsersBlocked } from '@/lib/user-blocks'
import {
  MARKETPLACE_CATEGORIES,
  MAX_LISTING_IMAGES,
  MIN_LISTING_PRICE_COINS,
  MAX_LISTING_PRICE_COINS,
  serializeListingImages,
} from '@/lib/marketplace'

function serialize(listing: {
  id: string
  title: string
  description: string | null
  priceCoins: number
  category: string
  images: string | null
  isDigital: boolean
  status: string
  views: number
  createdAt: Date
  seller: { id: string; name: string; username: string; avatarColor: string; avatarUrl: string | null }
}) {
  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    priceCoins: listing.priceCoins,
    category: listing.category,
    images: serializeListingImages(listing.images),
    isDigital: listing.isDigital,
    status: listing.status,
    views: listing.views,
    createdAt: listing.createdAt,
    seller: listing.seller,
  }
}

// GET /api/marketplace?q=&category=&cursor=&take=
export const GET = withJsonApi(async function GET(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim()
  const category = url.searchParams.get('category')?.trim()
  const cursor = url.searchParams.get('cursor')
  const take = Math.min(50, Math.max(1, Number(url.searchParams.get('take') ?? 24) || 24))
  const mine = url.searchParams.get('mine') === '1'

  const listings = await db.marketplaceListing.findMany({
    where: {
      status: mine ? undefined : 'active',
      sellerId: mine ? me.id : undefined,
      category: category && MARKETPLACE_CATEGORIES.includes(category as never) ? category : undefined,
      ...(q ? { title: { contains: q } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: mine ? take : Math.min(80, take * 2),
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: {
      seller: { select: { id: true, name: true, username: true, avatarColor: true, avatarUrl: true } },
    },
  })

  let visible = listings
  if (!mine) {
    const sellerIds = [...new Set(listings.map((l) => l.sellerId))]
    const blocked: string[] = []
    for (const sid of sellerIds) {
      if (await areUsersBlocked(me.id, sid)) blocked.push(sid)
    }
    const blockedSet = new Set(blocked)
    visible = listings.filter((l) => !blockedSet.has(l.sellerId)).slice(0, take)
  }

  return NextResponse.json({ listings: visible.map(serialize) })
})

export const POST = withJsonApi(async function POST(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const flags = await getPlatformFlags()
  if (!flags.marketplaceEnabled) {
    return NextResponse.json({ error: 'Маркетплейс временно отключён администратором' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  const priceCoins = Math.round(Number(body?.priceCoins))
  const category = typeof body?.category === 'string' ? body.category : ''
  const images = Array.isArray(body?.images)
    ? body.images.filter((u: unknown) => typeof u === 'string').slice(0, MAX_LISTING_IMAGES)
    : []
  const isDigital = !!body?.isDigital

  if (!title) return NextResponse.json({ error: 'Введите название' }, { status: 400 })
  if (!MARKETPLACE_CATEGORIES.includes(category as never)) {
    return NextResponse.json({ error: 'Выберите категорию' }, { status: 400 })
  }
  if (
    !Number.isFinite(priceCoins) ||
    priceCoins < MIN_LISTING_PRICE_COINS ||
    priceCoins > MAX_LISTING_PRICE_COINS
  ) {
    return NextResponse.json({ error: 'Укажите корректную цену' }, { status: 400 })
  }

  const listing = await db.marketplaceListing.create({
    data: {
      sellerId: me.id,
      title: title.slice(0, 100),
      description: description.slice(0, 2000) || null,
      priceCoins,
      category,
      images: images.length ? images.join(',') : null,
      isDigital,
    },
    include: {
      seller: { select: { id: true, name: true, username: true, avatarColor: true, avatarUrl: true } },
    },
  })

  return NextResponse.json({ listing: serialize(listing) })
})
