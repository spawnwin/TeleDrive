import { db } from '@/lib/db'
import { getPlatformFlags } from '@/lib/platform-settings'
import { FEED_SHARE_MIME, type FeedShareKind } from '@/lib/feed-share'

/** Create an own-wall post that appears in the friends feed. Best-effort. */
export async function createFeedSharePost(opts: {
  userId: string
  kind: FeedShareKind
  targetId: string
  title: string
  content?: string | null
  coverUrl?: string | null
}): Promise<{ id: string } | null> {
  try {
    const flags = await getPlatformFlags()
    if (!flags.wallEnabled) return null

    const title = opts.title.trim().slice(0, 200)
    const content = (opts.content || '').trim().slice(0, 2000)
    const body = content || title
    if (!body && !opts.coverUrl) return null

    const post = await db.wallPost.create({
      data: {
        profileId: opts.userId,
        authorId: opts.userId,
        type: 'share',
        content: body || null,
        attachmentUrl: `${opts.kind}:${opts.targetId}`,
        attachmentName: title || opts.kind,
        attachmentMime: FEED_SHARE_MIME[opts.kind],
        attachmentCoverUrl: opts.coverUrl || null,
      },
      select: { id: true },
    })
    return post
  } catch {
    return null
  }
}
