import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'

/** Validates the shared secret for service-to-service internal API calls. */
export function requireInternalSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.INTERNAL_API_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Internal API not configured' }, { status: 503 })
  }
  const provided = req.headers.get('x-internal-secret')
  if (!provided) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const secretBuf = Buffer.from(secret, 'utf-8')
  const providedBuf = Buffer.from(provided, 'utf-8')
  if (secretBuf.length !== providedBuf.length || !timingSafeEqual(secretBuf, providedBuf)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}
