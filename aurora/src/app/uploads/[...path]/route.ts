import { NextRequest, NextResponse } from 'next/server'
import { open, readFile, stat } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { resolveUploadFilePath } from '@/lib/uploads-path'

const EXT_MIME: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.avif': 'image/avif',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.ogg': 'video/ogg',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.3gp': 'video/3gpp',
  '.hevc': 'video/hevc',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.caf': 'audio/x-caf',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.zip': 'application/zip',
}

/** Voice notes are audio-only even when the container is .webm/.ogg. */
const VOICE_EXT_MIME: Record<string, string> = {
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.aac': 'audio/aac',
  '.caf': 'audio/x-caf',
}

function resolveContentType(filePath: string, segments: string[]): string {
  const ext = path.extname(filePath).toLowerCase()
  if (segments[0] === 'voice' && VOICE_EXT_MIME[ext]) {
    return VOICE_EXT_MIME[ext]
  }
  return EXT_MIME[ext] || 'application/octet-stream'
}

function parseRangeHeader(
  range: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!range || !range.startsWith('bytes=')) return null
  const [startStr, endStr] = range.replace(/bytes=/, '').split('-')
  const start = startStr ? parseInt(startStr, 10) : NaN
  const end = endStr ? parseInt(endStr, 10) : size - 1
  if (Number.isNaN(start) || start < 0 || start >= size) return null
  const safeEnd = Number.isNaN(end) ? size - 1 : Math.min(end, size - 1)
  if (safeEnd < start) return null
  return { start, end: safeEnd }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params
  const filePath = resolveUploadFilePath(segments)
  if (!filePath || !existsSync(filePath)) {
    return new NextResponse('Not found', { status: 404 })
  }

  const fileStat = await stat(filePath)
  const contentType = resolveContentType(filePath, segments)
  const total = fileStat.size

  const range = parseRangeHeader(req.headers.get('range'), total)
  // Long edge-cache for videos/images (also used by Cloudflare Tunnel's edge
  // cache when nginx isn't fronting the app, e.g. local dev). Other files
  // keep a 1-day cache so voice messages / docs refresh reasonably fast.
  const isCacheableMedia =
    contentType.startsWith('video/') || contentType.startsWith('image/')
  const commonHeaders: Record<string, string> = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': isCacheableMedia
      ? 'public, max-age=2592000, immutable'
      : 'public, max-age=86400',
  }
  if (contentType === 'image/svg+xml') {
    // SVG can embed scripts; when the file is opened directly this CSP stops
    // them from running in the app's origin. <img> rendering is unaffected.
    commonHeaders['Content-Security-Policy'] =
      "default-src 'none'; style-src 'unsafe-inline'"
  }

  if (range) {
    const { start, end } = range
    const chunkSize = end - start + 1
    const fh = await open(filePath, 'r')
    let buf: Buffer
    try {
      const res = await fh.read(Buffer.alloc(chunkSize), 0, chunkSize, start)
      buf = res.buffer.subarray(0, res.bytesRead)
    } finally {
      await fh.close()
    }
    return new NextResponse(new Uint8Array(buf), {
      status: 206,
      headers: {
        ...commonHeaders,
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Content-Length': String(chunkSize),
      },
    })
  }

  const buf = await readFile(filePath)
  return new NextResponse(buf, {
    headers: {
      ...commonHeaders,
      'Content-Length': String(total),
    },
  })
}
