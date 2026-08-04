import { NextRequest, NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-api'
import { withJsonApi } from '@/lib/with-json-api'
import { getApnsStatus, saveApnsConfig } from '@/lib/apns-config'
import { isApnsConfigured, clearApnsJwtCache } from '@/lib/push-server'

export const GET = withJsonApi(async function GET() {
  const guard = await adminGuard()
  if ('error' in guard) return guard.error

  return NextResponse.json({
    ...getApnsStatus(),
    configured: isApnsConfigured(),
  })
})

export const POST = withJsonApi(async function POST(req: NextRequest) {
  const guard = await adminGuard()
  if ('error' in guard) return guard.error

  const body = await req.json().catch(() => ({}))
  const keyId = typeof body?.keyId === 'string' ? body.keyId : ''
  const teamId = typeof body?.teamId === 'string' ? body.teamId : ''
  const bundleId = typeof body?.bundleId === 'string' ? body.bundleId : 'com.aurora.messenger'
  const production = body?.production !== false
  const keyPem = typeof body?.keyPem === 'string' ? body.keyPem : ''

  if (!keyId || !teamId || !keyPem) {
    return NextResponse.json(
      { error: 'Нужны keyId, teamId и содержимое .p8 (keyPem)' },
      { status: 400 },
    )
  }

  try {
    const saved = saveApnsConfig({ keyId, teamId, bundleId, production, keyPem })
    clearApnsJwtCache()
    return NextResponse.json({
      ok: true,
      configured: true,
      keyId: saved.keyId,
      teamId: saved.teamId,
      bundleId: saved.bundleId,
      production: saved.production,
      keyPath: saved.keyPath,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Не удалось сохранить APNs' },
      { status: 400 },
    )
  }
})
