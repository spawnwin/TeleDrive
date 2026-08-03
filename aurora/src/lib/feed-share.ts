import { db } from '@/lib/db'
import { getPlatformFlags } from '@/lib/platform-settings'

export type FeedShareKind = 'story' | 'short' | 'stream' | 'listing'

export const FEED_SHARE_MIME: Record<FeedShareKind, string> = {
  story: 'application/x-aurora-story',
  short: 'application/x-aurora-short',
  stream: 'application/x-aurora-stream',
  listing: 'application/x-aurora-listing',
}

export function parseFeedShareRef(
  attachmentUrl: string | null | undefined,
  attachmentMime: string | null | undefined,
): { kind: FeedShareKind; id: string } | null {
  if (!attachmentUrl || !attachmentMime) return null
  for (const kind of Object.keys(FEED_SHARE_MIME) as FeedShareKind[]) {
    if (attachmentMime !== FEED_SHARE_MIME[kind]) continue
    const prefix = `${kind}:`
    if (attachmentUrl.startsWith(prefix)) {
      const id = attachmentUrl.slice(prefix.length).trim()
      if (id) return { kind, id }
    }
  }
  return null
}

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

export function openFeedShareTarget(kind: FeedShareKind, id: string) {
  if (typeof window === 'undefined') return
  switch (kind) {
    case 'short': {
      // Lazy import store to avoid SSR cycles in API contexts
      void import('@/lib/store').then(({ useAppStore }) => {
        const s = useAppStore.getState()
        s.setPendingShortId(id)
        s.setView('shorts')
      })
      break
    }
    case 'story':
      window.dispatchEvent(new CustomEvent('aurora:open-story', { detail: { storyId: id } }))
      break
    case 'stream':
      window.dispatchEvent(new CustomEvent('aurora:open-streams', { detail: { streamId: id } }))
      break
    case 'listing':
      window.dispatchEvent(
        new CustomEvent('aurora:open-marketplace', { detail: { listingId: id } }),
      )
      break
  }
}
