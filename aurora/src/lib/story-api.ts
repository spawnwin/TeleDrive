import { db } from '@/lib/db'
import type { StoryFeedUser, StoryItem } from '@/lib/stories'
import { filterVisibleStoryIds } from '@/lib/story-visibility'

export function activeStoryFilter(now = new Date()) {
  return { expiresAt: { gt: now } }
}

export async function getContactUserIds(userId: string): Promise<string[]> {
  const memberships = await db.chatMember.findMany({
    where: { userId, chat: { type: 'private' } },
    select: {
      chat: {
        select: {
          members: { select: { userId: true } },
        },
      },
    },
  })

  const ids = new Set<string>([userId])
  for (const m of memberships) {
    for (const member of m.chat.members) {
      if (member.userId !== userId) ids.add(member.userId)
    }
  }
  return Array.from(ids)
}

type StoryWithViews = {
  id: string
  type: string
  content: string | null
  mediaUrl: string | null
  backgroundColor: string | null
  views: number
  likes?: number
  visibility: string
  audienceIds: string | null
  addToProfile: boolean
  createdAt: Date
  expiresAt: Date
  storyViews: { id: string }[]
  storyLikes?: { id: string }[]
}

export function serializeStory(story: StoryWithViews): StoryItem {
  return {
    id: story.id,
    type: story.type as StoryItem['type'],
    content: story.content,
    mediaUrl: story.mediaUrl,
    backgroundColor: story.backgroundColor,
    views: story.views,
    likes: story.likes ?? 0,
    liked: (story.storyLikes?.length ?? 0) > 0,
    createdAt: story.createdAt.toISOString(),
    expiresAt: story.expiresAt.toISOString(),
    viewed: story.storyViews.length > 0,
  }
}

export async function buildStoryFeedForUsers(
  userIds: string[],
  viewerId: string,
): Promise<StoryFeedUser[]> {
  if (userIds.length === 0) return []

  const now = new Date()
  const stories = await db.story.findMany({
    where: {
      userId: { in: userIds },
      ...activeStoryFilter(now),
    },
    orderBy: [{ userId: 'asc' }, { createdAt: 'asc' }],
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          avatarColor: true,
          avatarUrl: true,
        },
      },
      storyViews: {
        where: { userId: viewerId },
        select: { id: true },
        take: 1,
      },
      storyLikes: {
        where: { userId: viewerId },
        select: { id: true },
        take: 1,
      },
    },
  })

  const visibleIds = await filterVisibleStoryIds(
    stories.map((s) => ({
      id: s.id,
      userId: s.userId,
      visibility: s.visibility,
      audienceIds: s.audienceIds,
    })),
    viewerId,
  )
  const filteredStories = stories.filter((s) => visibleIds.has(s.id))

  const byUser = new Map<string, StoryFeedUser>()
  for (const story of filteredStories) {
    const existing = byUser.get(story.userId)
    const item = serializeStory(story as StoryWithViews)
    if (existing) {
      existing.stories.push(item)
      if (!item.viewed) existing.hasUnviewed = true
    } else {
      byUser.set(story.userId, {
        ...story.user,
        isSelf: story.userId === viewerId,
        hasUnviewed: !item.viewed,
        stories: [item],
      })
    }
  }

  const feed = Array.from(byUser.values())
  feed.sort((a, b) => {
    if (a.isSelf && !b.isSelf) return -1
    if (!a.isSelf && b.isSelf) return 1
    if (a.hasUnviewed && !b.hasUnviewed) return -1
    if (!a.hasUnviewed && b.hasUnviewed) return 1
    return a.name.localeCompare(b.name, 'ru')
  })
  return feed
}
