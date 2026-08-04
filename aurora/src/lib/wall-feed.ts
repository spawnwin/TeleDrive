import { db } from '@/lib/db'
import { areUsersBlocked } from '@/lib/user-blocks'
import { parseFeedShareRef } from '@/lib/feed-share'
import { canViewerSeeStory } from '@/lib/story-visibility'
import { activeStoryFilter } from '@/lib/story-api'

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

/**
 * Hide feed/wall share cards whose targets are not visible to the viewer
 * (pending/rejected shorts, expired/private stories, missing listings).
 */
export async function filterShareTargetsForViewer<
  T extends {
    type: string
    attachmentUrl: string | null
    attachmentMime: string | null
    author: { id: string }
  },
>(meId: string, posts: T[]): Promise<T[]> {
  const refs = posts
    .map((p) => ({ post: p, ref: parseFeedShareRef(p.attachmentUrl, p.attachmentMime) }))
    .filter((x): x is { post: T; ref: NonNullable<typeof x.ref> } => !!x.ref)

  if (refs.length === 0) return posts

  const shortIds = [...new Set(refs.filter((r) => r.ref.kind === 'short').map((r) => r.ref.id))]
  const storyIds = [...new Set(refs.filter((r) => r.ref.kind === 'story').map((r) => r.ref.id))]
  const listingIds = [...new Set(refs.filter((r) => r.ref.kind === 'listing').map((r) => r.ref.id))]

  type ShortShareRow = {
    id: string
    creatorId: string
    isHidden: boolean
    reviewStatus: string
  }
  type StoryShareRow = {
    id: string
    userId: string
    visibility: string
    audienceIds: string | null
  }
  type ListingShareRow = {
    id: string
    sellerId: string
    status: string
  }

  const shorts: ShortShareRow[] = shortIds.length
    ? await db.short.findMany({
        where: { id: { in: shortIds } },
        select: { id: true, creatorId: true, isHidden: true, reviewStatus: true },
      })
    : []
  const stories: StoryShareRow[] = storyIds.length
    ? await db.story.findMany({
        where: { id: { in: storyIds }, ...activeStoryFilter() },
        select: { id: true, userId: true, visibility: true, audienceIds: true },
      })
    : []
  const listings: ListingShareRow[] = listingIds.length
    ? await db.marketplaceListing.findMany({
        where: { id: { in: listingIds } },
        select: { id: true, sellerId: true, status: true },
      })
    : []

  const shortById = new Map<string, ShortShareRow>(shorts.map((s) => [s.id, s]))
  const storyById = new Map<string, StoryShareRow>(stories.map((s) => [s.id, s]))
  const listingById = new Map<string, ListingShareRow>(listings.map((l) => [l.id, l]))

  const hide = new Set<T>()
  for (const { post, ref } of refs) {
    if (ref.kind === 'short') {
      const s = shortById.get(ref.id)
      if (!s || s.isHidden || s.reviewStatus === 'rejected') {
        hide.add(post)
        continue
      }
      if (s.reviewStatus !== 'approved' && s.creatorId !== meId) {
        hide.add(post)
      }
      continue
    }
    if (ref.kind === 'story') {
      const s = storyById.get(ref.id)
      if (!s) {
        hide.add(post)
        continue
      }
      // Author always sees their own share card.
      if (s.userId !== meId && !(await canViewerSeeStory(meId, s))) {
        hide.add(post)
      }
      continue
    }
    if (ref.kind === 'listing') {
      const l = listingById.get(ref.id)
      if (!l || (l.status !== 'active' && l.sellerId !== meId)) {
        hide.add(post)
      }
    }
    // Streams: keep the card even after the stream ends (client shows a toast).
  }

  if (hide.size === 0) return posts
  return posts.filter((p) => !hide.has(p))
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
