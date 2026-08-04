import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'

export const POST = withJsonApi(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
  if (!reason) return NextResponse.json({ error: 'Укажите причину' }, { status: 400 })

  const listing = await db.marketplaceListing.findUnique({ where: { id }, select: { id: true } })
  if (!listing) return NextResponse.json({ error: 'Объявление не найдено' }, { status: 404 })

  const existingReport = await db.marketplaceListingReport.findFirst({
    where: { listingId: id, reporterId: me.id, status: 'pending' },
    select: { id: true },
  })
  if (existingReport) {
    return NextResponse.json({ error: 'Вы уже жаловались на это объявление' }, { status: 409 })
  }

  const report = await db.marketplaceListingReport.create({
    data: { listingId: id, reporterId: me.id, reason: reason.slice(0, 500) },
  })

  return NextResponse.json({ ok: true, reportId: report.id })
})
