import { findFriendshipBetween, isBlockedEitherWay } from '@/lib/friends'
import { getContactUserIds } from '@/lib/story-api'

export type StoryVisibility = 'everyone' | 'contacts' | 'friends' | 'selected' | 'exclude'

export const STORY_VISIBILITY_VALUES = new Set<StoryVisibility>([
  'everyone',
  'contacts',
  'friends',
  'selected',
  'exclude',
])

export function parseAudienceIds(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
  } catch {
    return []
  }
}

export function serializeAudienceIds(ids: string[]): string | null {
  const unique = [...new Set(ids.filter(Boolean))]
  return unique.length > 0 ? JSON.stringify(unique) : null
}

type StoryAudience = {
  id: string
  userId: string
  visibility: string
  audienceIds: string | null
}

export async function canViewerSeeStory(
  viewerId: string,
  story: StoryAudience,
): Promise<boolean> {
  if (viewerId === story.userId) return true

  if (await isBlockedEitherWay(viewerId, story.userId)) return false

  const visibility = (story.visibility || 'contacts') as StoryVisibility
  const audience = parseAudienceIds(story.audienceIds)

  switch (visibility) {
    case 'everyone':
      return true
    case 'contacts': {
      const contacts = await getContactUserIds(story.userId)
      return contacts.includes(viewerId)
    }
    case 'friends': {
      const friendship = await findFriendshipBetween(viewerId, story.userId)
      return friendship?.status === 'accepted'
    }
    case 'selected':
      return audience.includes(viewerId)
    case 'exclude': {
      const contacts = await getContactUserIds(story.userId)
      if (!contacts.includes(viewerId)) return false
      return !audience.includes(viewerId)
    }
    default:
      return true
  }
}

/** Batch-filter story ids visible to viewer (avoids per-story DB round-trips where possible). */
export async function filterVisibleStoryIds(
  stories: StoryAudience[],
  viewerId: string,
): Promise<Set<string>> {
  const visible = new Set<string>()
  if (stories.length === 0) return visible

  const authorIds = [...new Set(stories.map((s) => s.userId))]
  const blockChecks = await Promise.all(
    authorIds.map(async (authorId) => ({
      authorId,
      blocked: authorId !== viewerId && (await isBlockedEitherWay(viewerId, authorId)),
    })),
  )
  const blockedAuthors = new Set(
    blockChecks.filter((b) => b.blocked).map((b) => b.authorId),
  )

  const contactCache = new Map<string, string[]>()
  const friendCache = new Map<string, boolean>()

  async function isContact(authorId: string, targetId: string): Promise<boolean> {
    if (!contactCache.has(authorId)) {
      contactCache.set(authorId, await getContactUserIds(authorId))
    }
    return contactCache.get(authorId)!.includes(targetId)
  }

  async function isFriend(authorId: string, targetId: string): Promise<boolean> {
    const key = [authorId, targetId].sort().join(':')
    if (!friendCache.has(key)) {
      const friendship = await findFriendshipBetween(authorId, targetId)
      friendCache.set(key, friendship?.status === 'accepted')
    }
    return friendCache.get(key)!
  }

  for (const story of stories) {
    if (story.userId === viewerId) {
      visible.add(story.id)
      continue
    }
    if (blockedAuthors.has(story.userId)) continue

    const visibility = (story.visibility || 'contacts') as StoryVisibility
    const audience = parseAudienceIds(story.audienceIds)
    let ok = false

    switch (visibility) {
      case 'everyone':
        ok = true
        break
      case 'contacts':
        ok = await isContact(story.userId, viewerId)
        break
      case 'friends':
        ok = await isFriend(story.userId, viewerId)
        break
      case 'selected':
        ok = audience.includes(viewerId)
        break
      case 'exclude':
        ok = (await isContact(story.userId, viewerId)) && !audience.includes(viewerId)
        break
      default:
        ok = true
    }

    if (ok) visible.add(story.id)
  }

  return visible
}
