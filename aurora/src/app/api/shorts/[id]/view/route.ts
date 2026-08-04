import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { getEconomySettings } from '@/lib/economy-settings'

// Track a unique qualified view — credits creator balance and viewer coins once per user.
export const POST = withJsonApi(async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const short = await db.short.findUnique({
    where: { id },
    select: { id: true, creatorId: true, views: true, earnings: true },
  })
  if (!short) {
    return NextResponse.json({ error: 'Шортс не найден' }, { status: 404 })
  }

  const viewerCoins = me.coins

  // Authors don't monetize their own shorts.
  if (me.id === short.creatorId) {
    return NextResponse.json({
      ok: true,
      skipped: 'self_view',
      views: short.views,
      earnings: short.earnings,
      coinsEarned: 0,
      coins: viewerCoins,
    })
  }

  const existing = await db.shortView.findUnique({
    where: { shortId_userId: { shortId: id, userId: me.id } },
    select: { id: true },
  })
  if (existing) {
    return NextResponse.json({
      ok: true,
      alreadyViewed: true,
      views: short.views,
      earnings: short.earnings,
      coinsEarned: 0,
      coins: viewerCoins,
    })
  }

  const { viewRateRub, coinsPerView } = await getEconomySettings()

  try {
    const [updatedShort, , , , updatedViewer] = await db.$transaction([
      db.short.update({
        where: { id },
        data: {
          views: { increment: 1 },
          earnings: { increment: viewRateRub },
        },
      }),
      db.shortView.create({
        data: { shortId: id, userId: me.id },
      }),
      db.user.update({
        where: { id: short.creatorId },
        data: { balance: { increment: viewRateRub } },
      }),
      db.creatorEarning.create({
        data: {
          userId: short.creatorId,
          amount: viewRateRub,
          reason: 'view',
          shortId: id,
        },
      }),
      db.user.update({
        where: { id: me.id },
        data: { coins: { increment: coinsPerView } },
      }),
      db.coinTransaction.create({
        data: {
          userId: me.id,
          amount: coinsPerView,
          reason: 'short_view',
          metadata: JSON.stringify({ shortId: id }),
        },
      }),
    ])

    return NextResponse.json({
      ok: true,
      unique: true,
      views: updatedShort.views,
      earnings: updatedShort.earnings,
      coinsEarned: coinsPerView,
      coins: updatedViewer.coins,
    })
  } catch (err: unknown) {
    // Race: another request registered this view first.
    const code = (err as { code?: string })?.code
    if (code === 'P2002') {
      const fresh = await db.short.findUnique({
        where: { id },
        select: { views: true, earnings: true },
      })
      return NextResponse.json({
        ok: true,
        alreadyViewed: true,
        views: fresh?.views ?? short.views,
        earnings: fresh?.earnings ?? short.earnings,
        coinsEarned: 0,
        coins: viewerCoins,
      })
    }
    throw err
  }
})
