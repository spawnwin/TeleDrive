import { NextRequest, NextResponse } from 'next/server'
import { requireInternalSecret } from '@/lib/internal-api'
import { assertCanCall } from '@/lib/privacy-server'

/** Internal: can fromUserId call toUserId? Used by call-service. */
export async function POST(req: NextRequest) {
  const unauthorized = requireInternalSecret(req)
  if (unauthorized) return unauthorized

  let fromUserId: string | undefined
  let toUserId: string | undefined
  try {
    const body = await req.json()
    fromUserId = typeof body?.fromUserId === 'string' ? body.fromUserId : undefined
    toUserId = typeof body?.toUserId === 'string' ? body.toUserId : undefined
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!fromUserId || !toUserId) {
    return NextResponse.json({ error: 'fromUserId and toUserId required' }, { status: 400 })
  }

  const gate = await assertCanCall(fromUserId, toUserId)
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, canCall: false, error: gate.error },
      { status: 200 },
    )
  }
  return NextResponse.json({ ok: true, canCall: true })
}
