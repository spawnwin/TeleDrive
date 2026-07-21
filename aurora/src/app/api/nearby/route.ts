import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'

const EARTH_KM = 6371
const DEFAULT_RADIUS_KM = 2.5
const MAX_RADIUS_KM = 15
const PRESENCE_TTL_MS = 30 * 60 * 1000

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

function clampCoord(n: unknown, min: number, max: number): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  if (n < min || n > max) return null
  return n
}

/** Publish or refresh anonymous nearby presence. */
export const POST = withJsonApi(async function POST(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const lat = clampCoord(body?.lat, -90, 90)
  const lng = clampCoord(body?.lng, -180, 180)
  if (lat == null || lng == null) {
    return NextResponse.json({ error: 'Укажите координаты' }, { status: 400 })
  }

  const anonymous = body?.anonymous !== false
  const label =
    typeof body?.label === 'string' ? body.label.trim().slice(0, 48) || null : null
  const expiresAt = new Date(Date.now() + PRESENCE_TTL_MS)

  await db.nearbyPresence.upsert({
    where: { userId: me.id },
    create: {
      userId: me.id,
      lat,
      lng,
      anonymous,
      label,
      expiresAt,
    },
    update: { lat, lng, anonymous, label, expiresAt },
  })

  return NextResponse.json({ ok: true, expiresAt: expiresAt.toISOString() })
})

/** List people nearby (anonymous by default). */
export const GET = withJsonApi(async function GET(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const url = new URL(req.url)
  const lat = clampCoord(Number(url.searchParams.get('lat')), -90, 90)
  const lng = clampCoord(Number(url.searchParams.get('lng')), -180, 180)
  if (lat == null || lng == null) {
    return NextResponse.json({ error: 'Укажите координаты' }, { status: 400 })
  }

  let radiusKm = Number(url.searchParams.get('radiusKm') || DEFAULT_RADIUS_KM)
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) radiusKm = DEFAULT_RADIUS_KM
  radiusKm = Math.min(MAX_RADIUS_KM, Math.max(0.3, radiusKm))

  // Rough bounding box to cut candidates before precise haversine.
  const latDelta = radiusKm / 111
  const lngDelta = radiusKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)))
  const now = new Date()

  const rows = await db.nearbyPresence.findMany({
    where: {
      expiresAt: { gt: now },
      userId: { not: me.id },
      lat: { gte: lat - latDelta, lte: lat + latDelta },
      lng: { gte: lng - lngDelta, lte: lng + lngDelta },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          avatarColor: true,
          avatarUrl: true,
        },
      },
    },
    take: 80,
  })

  const people = rows
    .map((row) => {
      const distanceKm = haversineKm(lat, lng, row.lat, row.lng)
      if (distanceKm > radiusKm) return null
      return {
        id: row.anonymous ? `anon-${row.id.slice(-8)}` : row.user.id,
        distanceKm: Math.round(distanceKm * 100) / 100,
        anonymous: row.anonymous,
        label: row.label,
        updatedAt: row.updatedAt.toISOString(),
        user: row.anonymous
          ? null
          : {
              id: row.user.id,
              name: row.user.name,
              username: row.user.username,
              avatarColor: row.user.avatarColor,
              avatarUrl: row.user.avatarUrl,
            },
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a!.distanceKm as number) - (b!.distanceKm as number))
    .slice(0, 40)

  return NextResponse.json({
    people,
    radiusKm,
    count: people.length,
  })
})

export const DELETE = withJsonApi(async function DELETE() {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  await db.nearbyPresence.deleteMany({ where: { userId: me.id } })
  return NextResponse.json({ ok: true })
})
