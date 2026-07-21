import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { UPLOADS_DIR } from '@/lib/uploads-path'
import { getYandexTrackStreamUrl, coverUrl } from '@/lib/yandex-music'

// Fetch a Yandex Music track, save the mp3 + cover locally, and return the
// local URLs + metadata so the client can create a wall `music` post.
export const GET = withJsonApi(async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params

  // Resolve a direct mp3 URL (full track when token is configured, else preview).
  const directUrl = await getYandexTrackStreamUrl(id)
  if (!directUrl) {
    return NextResponse.json(
      { error: 'Не удалось получить ссылку на трек (возможно, нужен токен Яндекс Музыки)' },
      { status: 502 },
    )
  }

  // Download the mp3.
  const audioRes = await fetch(directUrl)
  if (!audioRes.ok) {
    return NextResponse.json(
      { error: `Не удалось скачать трек (HTTP ${audioRes.status})` },
      { status: 502 },
    )
  }
  const audioBuf = Buffer.from(await audioRes.arrayBuffer())

  // Storage quota check.
  const { checkStorageQuota } = await import('@/lib/storage')
  const quota = await checkStorageQuota(me.id, audioBuf.length)
  if (!quota.ok) {
    return NextResponse.json({ error: quota.error }, { status: 413 })
  }

  const musicDir = path.join(UPLOADS_DIR, 'music')
  await mkdir(musicDir, { recursive: true })
  const fileBase = `${Date.now()}-${randomUUID().slice(0, 8)}`
  const audioFilename = `${fileBase}.mp3`
  await writeFile(path.join(musicDir, audioFilename), audioBuf)
  const audioUrl = `/uploads/music/${audioFilename}`

  // Fetch cover art (optional, non-fatal).
  let coverUrlLocal: string | null = null
  const coverSrc = req.nextUrl.searchParams.get('cover') || undefined
  const remoteCover = coverUrl(coverSrc || undefined, '300x300')
  if (remoteCover) {
    try {
      const coverRes = await fetch(remoteCover)
      if (coverRes.ok) {
        const coverBuf = Buffer.from(await coverRes.arrayBuffer())
        const coverDir = path.join(UPLOADS_DIR, 'images')
        await mkdir(coverDir, { recursive: true })
        const coverFilename = `${fileBase}.jpg`
        await writeFile(path.join(coverDir, coverFilename), coverBuf)
        coverUrlLocal = `/uploads/images/${coverFilename}`
      }
    } catch (e) {
      console.warn('[yandex-music] cover download failed', String(e))
    }
  }

  // Track storage usage.
  const { trackFileUpload } = await import('@/lib/storage')
  await trackFileUpload(me.id, {
    filename: req.nextUrl.searchParams.get('title') || audioFilename,
    url: audioUrl,
    mimeType: 'audio/mpeg',
    size: audioBuf.length,
  })

  const durationSec = Number(req.nextUrl.searchParams.get('duration')) || 0
  const title = req.nextUrl.searchParams.get('title') || 'track'
  const artist = req.nextUrl.searchParams.get('artist') || ''

  return NextResponse.json({
    url: audioUrl,
    coverUrl: coverUrlLocal,
    name: artist ? `${artist} — ${title}.mp3` : `${title}.mp3`,
    title,
    artist,
    mime: 'audio/mpeg',
    duration: durationSec,
    size: audioBuf.length,
  })
})
