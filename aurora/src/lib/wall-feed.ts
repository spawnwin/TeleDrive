import { db } from '@/lib/db'

export const wallAuthorSelect = {
  id: true,
  name: true,
  username: true,
  avatarColor: true,
  avatarUrl: true,
} as const

export type WallAuthorRow = {
  id: string
  name: string
  username: string
  avatarColor: string
  avatarUrl: string | null
}

export type WallPostRow = {
  id: string
  profileId: string
  authorId: string
  type: string
  content: string | null
  attachmentUrl: string | null
  attachmentName: string | null
  attachmentMime: string | null
  attachmentDuration: number | null
  attachmentCoverUrl: string | null
  likes: number
  editedAt: Date | null
  createdAt: Date
  author: WallAuthorRow
}

export async function serializeWallPosts(meId: string, posts: WallPostRow[]) {
  const ids = posts.map((p) => p.id)
  const myLikes =
    ids.length > 0
      ? await db.wallPostLike.findMany({
          where: { postId: { in: ids }, userId: meId },
          select: { postId: true },
        })
      : []
  const liked = new Set(myLikes.map((l) => l.postId))

  return posts.map((p) => ({
    id: p.id,
    profileId: p.profileId,
    type: p.type,
    content: p.content,
    attachmentUrl: p.attachmentUrl,
    attachmentName: p.attachmentName,
    attachmentMime: p.attachmentMime,
    attachmentDuration: p.attachmentDuration,
    attachmentCoverUrl: p.attachmentCoverUrl,
    likes: p.likes ?? 0,
    likedByMe: liked.has(p.id),
    editedAt: p.editedAt,
    createdAt: p.createdAt,
    author: p.author,
    mine: p.authorId === meId,
    onMyWall: p.profileId === meId,
  }))
}

/** Accepted friends of `userId` (peer ids only). */
export async function getAcceptedFriendIds(userId: string): Promise<string[]> {
  const rows = await db.friendship.findMany({
    where: {
      status: 'accepted',
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: { requesterId: true, addresseeId: true },
  })
  return rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId))
}
