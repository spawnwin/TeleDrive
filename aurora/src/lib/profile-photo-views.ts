import { db } from '@/lib/db'

/**
 * Resolve a photo URL that belongs to the owner's profile album
 * (current avatar or a gallery photo). Defaults to current avatar.
 */
export async function resolveAllowedProfilePhotoUrl(
  ownerId: string,
  photoUrl?: string | null,
): Promise<string | null> {
  const owner = await db.user.findUnique({
    where: { id: ownerId },
    select: { avatarUrl: true },
  })
  if (!owner) return null

  const requested = (photoUrl || '').trim()
  if (!requested) return owner.avatarUrl || null

  if (owner.avatarUrl && requested === owner.avatarUrl) return owner.avatarUrl

  const galleryHit = await db.profileGalleryItem.findFirst({
    where: {
      userId: ownerId,
      mediaUrl: requested,
      type: 'photo',
    },
    select: { mediaUrl: true },
  })
  return galleryHit?.mediaUrl ?? null
}

/** Record that `viewerId` opened `ownerId`'s profile photo (`avatarUrl` key = media URL). */
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

export async function listProfilePhotoViewers(ownerId: string, avatarUrl: string, take = 200) {
  if (!avatarUrl) return { total: 0, viewers: [] as Array<{
    id: string
    name: string
    username: string
    avatarColor: string
    avatarUrl: string | null
    viewedAt: Date
  }> }

  const [total, views] = await Promise.all([
    countProfilePhotoViews(ownerId, avatarUrl),
    db.profilePhotoView.findMany({
      where: { ownerId, avatarUrl },
      orderBy: { viewedAt: 'desc' },
      take,
      include: {
        viewer: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarColor: true,
            avatarUrl: true,
          },
        },
      },
    }),
  ])

  return {
    total,
    viewers: views.map((row) => ({
      id: row.viewer.id,
      name: row.viewer.name,
      username: row.viewer.username,
      avatarColor: row.viewer.avatarColor,
      avatarUrl: row.viewer.avatarUrl,
      viewedAt: row.viewedAt,
    })),
  }
}

export async function countProfilePhotoLikes(ownerId: string, avatarUrl: string): Promise<number> {
  if (!avatarUrl) return 0
  return db.profilePhotoLike.count({ where: { ownerId, avatarUrl } })
}

export async function getProfilePhotoLikeState(
  ownerId: string,
  avatarUrl: string,
  likerId: string | null,
): Promise<{ likes: number; isLiked: boolean }> {
  if (!avatarUrl) return { likes: 0, isLiked: false }
  const [likes, existing] = await Promise.all([
    countProfilePhotoLikes(ownerId, avatarUrl),
    likerId && likerId !== ownerId
      ? db.profilePhotoLike.findUnique({
          where: {
            ownerId_likerId_avatarUrl: { ownerId, likerId, avatarUrl },
          },
          select: { id: true },
        })
      : Promise.resolve(null),
  ])
  return { likes, isLiked: !!existing }
}

/** Toggle like on a profile photo. Owner cannot like own photo. */
export async function toggleProfilePhotoLike(
  ownerId: string,
  likerId: string,
  avatarUrl: string,
): Promise<{ likes: number; isLiked: boolean }> {
  if (!avatarUrl) return { likes: 0, isLiked: false }
  if (ownerId === likerId) {
    const likes = await countProfilePhotoLikes(ownerId, avatarUrl)
    return { likes, isLiked: false }
  }

  const existing = await db.profilePhotoLike.findUnique({
    where: {
      ownerId_likerId_avatarUrl: { ownerId, likerId, avatarUrl },
    },
  })

  if (existing) {
    try {
      await db.profilePhotoLike.delete({ where: { id: existing.id } })
    } catch (e: unknown) {
      if ((e as { code?: string })?.code !== 'P2025') throw e
    }
    const likes = await countProfilePhotoLikes(ownerId, avatarUrl)
    return { likes, isLiked: false }
  }

  try {
    await db.$transaction([
      db.profilePhotoLike.create({
        data: { ownerId, likerId, avatarUrl },
      }),
      // Liking implies a view (Telegram-style).
      db.profilePhotoView.upsert({
        where: {
          ownerId_viewerId_avatarUrl: { ownerId, viewerId: likerId, avatarUrl },
        },
        create: { ownerId, viewerId: likerId, avatarUrl },
        update: { viewedAt: new Date() },
      }),
    ])
  } catch (e: unknown) {
    if ((e as { code?: string })?.code !== 'P2002') throw e
  }

  const likes = await countProfilePhotoLikes(ownerId, avatarUrl)
  return { likes, isLiked: true }
}

export async function listProfilePhotoLikers(ownerId: string, avatarUrl: string, take = 200) {
  if (!avatarUrl) {
    return {
      total: 0,
      likers: [] as Array<{
        id: string
        name: string
        username: string
        avatarColor: string
        avatarUrl: string | null
        likedAt: Date
      }>,
    }
  }

  const [total, rows] = await Promise.all([
    countProfilePhotoLikes(ownerId, avatarUrl),
    db.profilePhotoLike.findMany({
      where: { ownerId, avatarUrl },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        liker: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarColor: true,
            avatarUrl: true,
          },
        },
      },
    }),
  ])

  return {
    total,
    likers: rows.map((row) => ({
      id: row.liker.id,
      name: row.liker.name,
      username: row.liker.username,
      avatarColor: row.liker.avatarColor,
      avatarUrl: row.liker.avatarUrl,
      likedAt: row.createdAt,
    })),
  }
}
