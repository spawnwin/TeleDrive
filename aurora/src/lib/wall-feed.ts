import { db } from '@/lib/db'
import { areUsersBlocked } from '@/lib/user-blocks'

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
  comments: number
  commentsClosed: boolean
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
    comments: p.comments ?? 0,
    commentsClosed: !!p.commentsClosed,
    editedAt: p.editedAt,
    createdAt: p.createdAt,
    author: p.author,
    mine: p.authorId === meId,
    onMyWall: p.profileId === meId,
    canModerate: p.authorId === meId || p.profileId === meId,
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

/** Load a wall post and ensure the viewer is not blocked from interacting. */
export async function assertCanAccessWallPost(meId: string, postId: string) {
  const post = await db.wallPost.findUnique({
    where: { id: postId },
    select: {
      id: true,
      authorId: true,
      profileId: true,
      likes: true,
      comments: true,
      commentsClosed: true,
      content: true,
      attachmentUrl: true,
    },
  })
  if (!post) return { ok: false as const, status: 404 as const, error: 'Запись не найдена' }

  if (post.authorId !== meId && (await areUsersBlocked(meId, post.authorId))) {
    return { ok: false as const, status: 403 as const, error: 'Недоступно' }
  }
  if (
    post.profileId !== meId &&
    post.profileId !== post.authorId &&
    (await areUsersBlocked(meId, post.profileId))
  ) {
    return { ok: false as const, status: 403 as const, error: 'Недоступно' }
  }

  return { ok: true as const, post }
}
