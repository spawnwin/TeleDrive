import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { DEFAULT_LIMITED_SUPPLY, formatGiftSerial } from '@/lib/gifts'

export const GET = withJsonApi(async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id: userId } = await params

  const gifts = await db.giftSent.findMany({
    where: {
      recipientId: userId,
      isPrivate: false,
    },
    orderBy: { createdAt: 'desc' },
    take: 120,
    include: {
      gift: true,
      sender: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } },
    },
  })

  const grouped: Record<
    string,
    {
      gift: (typeof gifts)[0]['gift'] & {
        totalSupply?: number | null
        issuedCount?: number
      }
      count: number
      latestAt: string
      serials: number[]
      senders: { id: string; name: string; avatarColor: string; avatarUrl: string | null }[]
    }
  > = {}

  const collectibles: Array<{
    id: string
    serialNumber: number
    serialLabel: string
    createdAt: string
    gift: (typeof gifts)[0]['gift']
    sender: (typeof gifts)[0]['sender']
  }> = []

  for (const row of gifts) {
    const key = row.giftId
    if (!grouped[key]) {
      grouped[key] = {
        gift: row.gift,
        count: 0,
        latestAt: row.createdAt.toISOString(),
        serials: [],
        senders: [],
      }
    }
    grouped[key].count++
    if (row.serialNumber != null && grouped[key].serials.length < 12) {
      grouped[key].serials.push(row.serialNumber)
    }
    if (
      grouped[key].senders.length < 5 &&
      !grouped[key].senders.some((s) => s.id === row.sender.id)
    ) {
      grouped[key].senders.push(row.sender)
    }

    if (row.gift.isLimited && row.serialNumber != null) {
      collectibles.push({
        id: row.id,
        serialNumber: row.serialNumber,
        serialLabel: formatGiftSerial(row.serialNumber) || `#${row.serialNumber}`,
        createdAt: row.createdAt.toISOString(),
        gift: row.gift,
        sender: row.sender,
      })
    }
  }

  const rank = (g: (typeof grouped)[string]) =>
    (g.gift.isLimited ? 2 : 0) + (g.gift.isPremium ? 1 : 0)
  const sorted = Object.values(grouped).sort((a, b) => {
    const rankDiff = rank(b) - rank(a)
    if (rankDiff !== 0) return rankDiff
    const priceDiff = (b.gift.starPrice || 0) - (a.gift.starPrice || 0)
    if (priceDiff !== 0) return priceDiff
    return new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime()
  })

  return NextResponse.json({
    gifts: sorted.map((g) => ({
      ...g,
      gift: {
        ...g.gift,
        totalSupply: g.gift.isLimited ? g.gift.totalSupply ?? DEFAULT_LIMITED_SUPPLY : null,
      },
      serialLabels: g.serials.map((n) => formatGiftSerial(n)).filter(Boolean),
    })),
    collectibles: collectibles.sort((a, b) => a.serialNumber - b.serialNumber).slice(0, 24),
    total: gifts.length,
    canViewAll: me.id === userId,
  })
})
