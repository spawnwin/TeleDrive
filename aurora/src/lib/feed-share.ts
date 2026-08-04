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

/** Client-only: open the original content from a feed share card. */
export function openFeedShareTarget(kind: FeedShareKind, id: string) {
  if (typeof window === 'undefined') return
  switch (kind) {
    case 'short': {
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
