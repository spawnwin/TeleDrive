import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'

/** Public-ish feed of recently received limited collectibles. */
export const GET = withJsonApi(async function GET() {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const rows = await db.giftSent.findMany({
    where: {
      isPrivate: false,
      serialNumber: { not: null },
      gift: { isLimited: true },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: {
      gift: {
        select: {
          id: true,
          title: true,
          thumbnailUrl: true,
          stickerUrl: true,
          isLimited: true,
          totalSupply: true,
          issuedCount: true,
        },
      },
      recipient: {
        select: { id: true, name: true, username: true, avatarColor: true, avatarUrl: true },
      },
      sender: {
        select: { id: true, name: true, username: true, avatarColor: true, avatarUrl: true },
      },
    },
  })

  return NextResponse.json({
    items: rows.map((row) => ({
      id: row.id,
      serialNumber: row.serialNumber,
      serialLabel:
        row.serialNumber != null
          ? `#${String(row.serialNumber).padStart(3, '0')}`
          : null,
      createdAt: row.createdAt.toISOString(),
      gift: row.gift,
      recipient: row.recipient,
      sender: row.sender,
    })),
  })
})
