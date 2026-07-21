import { db } from '@/lib/db'

/** Record that `viewerId` opened `ownerId`'s profile photo (`avatarUrl`). */
export async function recordProfilePhotoView(
  ownerId: string,
  viewerId: string,
  avatarUrl: string,
): Promise<{ total: number; recorded: boolean }> {
  if (!avatarUrl || ownerId === viewerId) {
    const total = await db.profilePhotoView.count({
      where: { ownerId, avatarUrl },
    })
    return { total, recorded: false }
  }

  try {
    await db.profilePhotoView.upsert({
      where: {
        ownerId_viewerId_avatarUrl: { ownerId, viewerId, avatarUrl },
      },
      create: { ownerId, viewerId, avatarUrl },
      update: { viewedAt: new Date() },
    })
  } catch (e: unknown) {
    if ((e as { code?: string })?.code !== 'P2002') throw e
  }

  const total = await db.profilePhotoView.count({
    where: { ownerId, avatarUrl },
  })
  return { total, recorded: true }
}

export async function countProfilePhotoViews(ownerId: string, avatarUrl: string): Promise<number> {
  if (!avatarUrl) return 0
  return db.profilePhotoView.count({ where: { ownerId, avatarUrl } })
}
