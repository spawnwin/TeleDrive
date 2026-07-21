export type StoryType = 'photo' | 'video' | 'text'

export const STORY_DURATION_MS = 24 * 60 * 60 * 1000
export const STORY_SLIDE_MS = 5000

export const STORY_TEXT_BACKGROUNDS = [
  '#7c3aed',
  '#06b6d4',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#ef4444',
  '#8b5cf6',
] as const

export interface StoryItem {
  id: string
  type: StoryType
  content?: string | null
  mediaUrl?: string | null
  backgroundColor?: string | null
  views: number
  likes?: number
  liked?: boolean
  createdAt: string
  expiresAt: string
  viewed: boolean
}

export interface StoryFeedUser {
  id: string
  name: string
  username: string
  avatarColor: string
  avatarUrl?: string | null
  hasUnviewed: boolean
  isSelf?: boolean
  stories: StoryItem[]
}

export function storyExpiresAt(from = new Date()): Date {
  return new Date(from.getTime() + STORY_DURATION_MS)
}
