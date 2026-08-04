import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import {
  MARKETPLACE_CATEGORIES,
  MAX_LISTING_IMAGES,
  MIN_LISTING_PRICE_COINS,
  MAX_LISTING_PRICE_COINS,
  serializeListingImages,
} from '@/lib/marketplace'
import { areUsersBlocked } from '@/lib/user-blocks'

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

export const GET = withJsonApi(async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const existing = await db.marketplaceListing.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Объявление не найдено' }, { status: 404 })
  if (
    existing.sellerId !== me.id &&
    (await areUsersBlocked(me.id, existing.sellerId))
  ) {
    return NextResponse.json({ error: 'Объявление недоступно' }, { status: 403 })
  }

  // Views only count for other users, not the seller browsing their own listing.
  const listing =
    existing.sellerId === me.id
      ? existing
      : await db.marketplaceListing.update({
          where: { id },
          data: { views: { increment: 1 } },
        })

  const withSeller = await db.marketplaceListing.findUnique({
    where: { id },
    include: {
      seller: { select: { id: true, name: true, username: true, avatarColor: true, avatarUrl: true } },
    },
  })

  // The order (who bought it, when) is only exposed to the two parties
  // involved — a stranger browsing a sold listing shouldn't see the buyer.
  let order: { buyer: { name: string; username: string }; seller: { name: string; username: string }; createdAt: Date } | null =
    null
  if (listing.status === 'sold') {
    const orderRow = await db.marketplaceOrder.findFirst({
      where: { listingId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        buyer: { select: { name: true, username: true } },
        seller: { select: { name: true, username: true } },
      },
    })
    if (orderRow && (orderRow.buyerId === me.id || orderRow.sellerId === me.id)) {
      order = { buyer: orderRow.buyer, seller: orderRow.seller, createdAt: orderRow.createdAt }
    }
  }

  return NextResponse.json({ listing: serialize(withSeller!), order })
})

export const PATCH = withJsonApi(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const existing = await db.marketplaceListing.findUnique({ where: { id } })
  if (!existing || existing.sellerId !== me.id) {
    return NextResponse.json({ error: 'Объявление не найдено' }, { status: 404 })
  }
  if (existing.status !== 'active') {
    return NextResponse.json({ error: 'Нельзя изменить проданное или снятое объявление' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const data: {
    title?: string
    description?: string | null
    priceCoins?: number
    category?: string
    images?: string | null
    isDigital?: boolean
    status?: string
  } = {}

  if (typeof body?.title === 'string' && body.title.trim()) data.title = body.title.trim().slice(0, 100)
  if (typeof body?.description === 'string') data.description = body.description.trim().slice(0, 2000) || null
  if (body?.priceCoins !== undefined) {
    const price = Math.round(Number(body.priceCoins))
    if (!Number.isFinite(price) || price < MIN_LISTING_PRICE_COINS || price > MAX_LISTING_PRICE_COINS) {
      return NextResponse.json({ error: 'Укажите корректную цену' }, { status: 400 })
    }
    data.priceCoins = price
  }
  if (typeof body?.category === 'string') {
    if (!MARKETPLACE_CATEGORIES.includes(body.category as never)) {
      return NextResponse.json({ error: 'Неверная категория' }, { status: 400 })
    }
    data.category = body.category
  }
  if (Array.isArray(body?.images)) {
    const images = body.images.filter((u: unknown) => typeof u === 'string').slice(0, MAX_LISTING_IMAGES)
    data.images = images.length ? images.join(',') : null
  }
  if (typeof body?.isDigital === 'boolean') data.isDigital = body.isDigital
  if (body?.status === 'removed') data.status = 'removed'

  const updated = await db.marketplaceListing.update({
    where: { id },
    data,
    include: {
      seller: { select: { id: true, name: true, username: true, avatarColor: true, avatarUrl: true } },
    },
  })

  return NextResponse.json({ listing: serialize(updated) })
})

export const DELETE = withJsonApi(async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const existing = await db.marketplaceListing.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Объявление не найдено' }, { status: 404 })
  if (existing.sellerId !== me.id && !me.isAdmin) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
  }

  await db.marketplaceListing.update({ where: { id }, data: { status: 'removed' } })
  return NextResponse.json({ ok: true })
})
