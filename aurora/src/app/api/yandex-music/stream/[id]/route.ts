import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getYandexTrackStreamUrl } from '@/lib/yandex-music'
import { clientIp, rateLimit } from '@/lib/rate-limit'

/**
 * Proxy a Yandex Music track as audio/mpeg without saving it to disk.
 * Supports Range so the in-chat player can seek.
 * Uses the listener's linked Yandex token when available (full track);
 * otherwise anonymous preview (~30s).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return new NextResponse('Unauthorized', { status: 401 })

  if (!rateLimit(`ym-stream:${me.id}`, 90, 60 * 1000)) {
    return NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 })
  }
  if (!rateLimit(`ym-stream-ip:${clientIp(req)}`, 180, 60 * 1000)) {
    return NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 })
  }

  const { id } = await params
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid track id' }, { status: 400 })
  }

  const stream = await getYandexTrackStreamUrl(id, me.id)
  if (!stream?.url) {
    return NextResponse.json(
      { error: 'Не удалось получить ссылку на трек' },
      { status: 502 },
    )
  }

  const range = req.headers.get('range')
  const upstreamHeaders: HeadersInit = {
    'User-Agent': 'AuroraMessenger/1.0',
    Accept: '*/*',
  }
  if (range) upstreamHeaders.Range = range

  let upstream: Response
  try {
    upstream = await fetch(stream.url, { headers: upstreamHeaders })
  } catch (e) {
    console.error('[yandex-music/stream] fetch failed', e)
    return NextResponse.json({ error: 'Stream fetch failed' }, { status: 502 })
  }

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { error: `Upstream HTTP ${upstream.status}` },
      { status: 502 },
    )
  }

  const headers = new Headers()
  headers.set('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg')
  headers.set('Accept-Ranges', 'bytes')
  headers.set('Cache-Control', 'private, max-age=300')
  headers.set('X-Content-Type-Options', 'nosniff')
  if (stream.preview) headers.set('X-Aurora-Preview', '1')
  const len = upstream.headers.get('content-length')
  if (len) headers.set('Content-Length', len)
  const cr = upstream.headers.get('content-range')
  if (cr) headers.set('Content-Range', cr)

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  })
}
