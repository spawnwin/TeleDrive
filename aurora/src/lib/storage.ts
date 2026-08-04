import { db } from '@/lib/db'

const DEFAULT_QUOTA = 1 * 1024 * 1024 * 1024 // 1GB
const PREMIUM_QUOTA = 10 * 1024 * 1024 * 1024 // 10GB

export function getQuotaForUser(isPremium: boolean): number {
  return isPremium ? PREMIUM_QUOTA : DEFAULT_QUOTA
}

/** Effective quota: premium tier is 10GB and cannot be stored in SQLite INT. */
export function getEffectiveStorageQuota(user: {
  isPremium: boolean
  storageQuota?: number | null
}): number {
  if (user.isPremium) return getQuotaForUser(true)
  return user.storageQuota ?? getQuotaForUser(false)
}

export async function checkStorageQuota(userId: string, additionalBytes: number) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { storageUsed: true, storageQuota: true, isPremium: true },
  })
  if (!user) return { ok: false, error: 'Пользователь не найден' }

  const quota = getEffectiveStorageQuota(user)
  if (user.storageUsed + additionalBytes > quota) {
    return {
      ok: false,
      error: 'Превышена квота облачного хранилища',
      used: user.storageUsed,
      quota,
    }
  }
  return { ok: true, used: user.storageUsed, quota }
}

export async function trackFileUpload(
  userId: string,
  file: { filename: string; url: string; mimeType?: string; size: number },
) {
  await db.$transaction([
    db.storedFile.create({
      data: {
        userId,
        filename: file.filename,
        url: file.url,
        mimeType: file.mimeType,
        size: file.size,
      },
    }),
    db.user.update({
      where: { id: userId },
      data: { storageUsed: { increment: file.size } },
    }),
  ])
}

/** Map a stored `/uploads/...` URL to segments under `public/uploads`. */
function uploadUrlToSegments(url: string): string[] | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  // Absolute CDN / same-origin URLs → keep pathname only
  let pathname = trimmed
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      pathname = new URL(trimmed).pathname
    }
  } catch {
    return null
  }
  const withoutQuery = pathname.split('?')[0].split('#')[0]
  const relative = withoutQuery.replace(/^\/uploads\//, '').replace(/^\//, '')
  if (!relative || relative.includes('..')) return null
  const segments = relative.split('/').filter(Boolean)
  return segments.length ? segments : null
}

export async function deleteStoredFile(userId: string, fileId: string) {
  const file = await db.storedFile.findFirst({
    where: { id: fileId, userId },
  })
  if (!file) return null

  await db.$transaction([
    db.storedFile.delete({ where: { id: fileId } }),
    db.user.update({
      where: { id: userId },
      data: { storageUsed: { decrement: file.size } },
    }),
  ])

  // Delete the actual file from disk
  try {
    const { resolveUploadFilePath } = await import('@/lib/uploads-path')
    const { unlink } = await import('fs/promises')
    const segments = uploadUrlToSegments(file.url)
    const filePath = segments ? resolveUploadFilePath(segments) : null
    if (filePath) await unlink(filePath).catch(() => {})
  } catch {}

  return file
}
