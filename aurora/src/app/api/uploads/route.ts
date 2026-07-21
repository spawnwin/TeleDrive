import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { randomUUID } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { withJsonApi } from '@/lib/with-json-api'
import { UPLOADS_DIR } from '@/lib/uploads-path'
import { checkStorageQuota, trackFileUpload } from '@/lib/storage'
import {
  isVideoFile,
  isVoiceFile,
  isImageFile,
  resolveAttachmentMime,
  VIDEO_MIME_TYPES,
} from '@/lib/media-type'
import { getUploadLimitMb, isPremiumActive } from '@/lib/coins'
import { needsVoiceTranscode, transcodeVoiceToM4a } from '@/lib/voice-transcode'

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif']
const VOICE_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mp3',
  'audio/wav',
  'audio/m4a',
  'audio/mp4',
  'audio/aac',
  'audio/x-m4a',
  'audio/x-caf',
]
const FILE_TYPES = [
  ...IMAGE_TYPES,
  ...VOICE_TYPES,
  ...VIDEO_MIME_TYPES,
  'application/pdf',
  'application/zip',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]
const MAX_SIZE_VIDEO = 200 * 1024 * 1024 // 200MB for phone camera roll clips

export const POST = withJsonApi(async function POST(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Файл не передан' }, { status: 400 })
  }

  const isVoice = isVoiceFile({ type: file.type, name: file.name })
  const isVideo = !isVoice && isVideoFile({ type: file.type, name: file.name })
  let resolvedMime = resolveAttachmentMime({ type: file.type, name: file.name })
  const premium = isPremiumActive(me)
  const maxSize = isVideo
    ? MAX_SIZE_VIDEO
    : getUploadLimitMb(premium) * 1024 * 1024
  if (file.size > maxSize) {
    const limitMb = Math.round(maxSize / (1024 * 1024))
    return NextResponse.json({ error: `Файл слишком большой (макс. ${limitMb} МБ)` }, { status: 400 })
  }

  const quotaCheck = await checkStorageQuota(me.id, file.size)
  if (!quotaCheck.ok) {
    return NextResponse.json(
      { error: quotaCheck.error, used: quotaCheck.used, quota: quotaCheck.quota },
      { status: 413 },
    )
  }

  const isImage = IMAGE_TYPES.includes(file.type) || file.type.startsWith('image/') || isImageFile({ type: file.type, name: file.name })
  const isVoiceUpload =
    isVoice ||
    VOICE_TYPES.includes(resolvedMime) ||
    resolvedMime.startsWith('audio/')
  const isKnownType =
    FILE_TYPES.includes(file.type) || isImage || isVoiceUpload || isVideo

  // file.name is fully attacker-controlled (multipart filename), so the raw
  // extension must never reach path.join(): a name with no "." makes
  // split('.').pop() return the whole string, letting "../../etc/x" style
  // payloads through as an "extension" and write outside uploadDir. Force it
  // down to a short alnum token before it can touch the filesystem path.
  const rawExt = file.name.split('.').pop()?.toLowerCase() || 'bin'
  let ext = /^[a-z0-9]{1,15}$/.test(rawExt) ? rawExt : 'bin'
  // Block dangerous extensions that could be executed or render active content
  const DANGEROUS_EXTS = new Set(['exe', 'bat', 'cmd', 'com', 'sh', 'ps1', 'msi', 'dll', 'html', 'htm', 'svg', 'js', 'mjs', 'php', 'py', 'rb', 'jsp', 'cgi', 'htaccess'])
  if (DANGEROUS_EXTS.has(ext)) {
    return NextResponse.json({ error: 'Недопустимое расширение файла' }, { status: 400 })
  }

  const id = `${Date.now()}-${randomUUID().slice(0, 8)}`
  let filename = `${id}.${ext}`
  const subdir = isImage ? 'images' : isVoiceUpload ? 'voice' : isVideo ? 'videos' : 'files'
  const uploadDir = path.join(UPLOADS_DIR, subdir)
  await mkdir(uploadDir, { recursive: true })
  let filepath = path.join(uploadDir, filename)
  const bytes = Buffer.from(await file.arrayBuffer())
  await writeFile(filepath, bytes)
  let size = file.size

  // Safari/iOS cannot play Opus in WebM/Ogg — transcode voice notes to AAC/M4A.
  if (isVoiceUpload && needsVoiceTranscode(resolvedMime, filename)) {
    const converted = await transcodeVoiceToM4a(filepath)
    if (converted) {
      filepath = converted.outputPath
      filename = converted.filename
      resolvedMime = converted.mimeType
      size = converted.size
      ext = 'm4a'
    }
  }

  const fileUrl = `/uploads/${subdir}/${filename}`
  await trackFileUpload(me.id, {
    filename: file.name,
    url: fileUrl,
    mimeType: resolvedMime,
    size,
  })

  return NextResponse.json({
    url: fileUrl,
    name: isVoiceUpload && ext === 'm4a' ? filename : file.name,
    type: resolvedMime,
    size,
    isImage,
    isVoice: isVoiceUpload,
    isVideo,
    isKnownType,
  })
})
