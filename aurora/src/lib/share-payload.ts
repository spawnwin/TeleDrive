import type { ChatMessage } from '@/hooks/use-socket'
import type { ShortData } from '@/components/shorts/short-card'
import type { StoryItem } from '@/lib/stories'

export type ShareKind = 'short' | 'story' | 'profile' | 'link' | 'media' | 'message'

export interface SharePayload {
  kind: ShareKind
  title: string
  subtitle?: string
  body?: string
  siteName?: string
  url: string
  thumbnailUrl?: string
  imageUrl?: string
  videoUrl?: string
  shortId?: string
  storyId?: string
  userId?: string
  messageId?: string
  durationSec?: number
  creatorName?: string
  creatorUsername?: string
}

export function serializeShareMetadata(payload: SharePayload): string {
  return JSON.stringify(payload)
}

export function parseShareMetadata(raw: string | null | undefined): SharePayload | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as SharePayload
    if (!data?.kind || !data?.title || !data?.url) return null
    return data
  } catch {
    return null
  }
}

export function sharePreviewLabel(payload: SharePayload, t: (k: string) => string): string {
  switch (payload.kind) {
    case 'short':
      return `🎬 ${payload.title}`
    case 'story':
      return `📖 ${t('share.previewStory')}`
    case 'profile':
      return `👤 ${payload.title}`
    case 'link':
      return `🔗 ${payload.title}`
    case 'media':
      return `📷 ${payload.title}`
    case 'message':
      return payload.title
    default:
      return payload.title
  }
}

export function buildShortSharePayload(short: ShortData, origin?: string): SharePayload {
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '')
  return {
    kind: 'short',
    title: short.title,
    subtitle: short.description || `@${short.creator.username}`,
    url: `${base}/?short=${short.id}`,
    thumbnailUrl: short.thumbnailUrl || undefined,
    videoUrl: short.videoUrl || undefined,
    shortId: short.id,
    durationSec: short.duration || undefined,
    creatorName: short.creator.name,
    creatorUsername: short.creator.username,
  }
}

export function buildStorySharePayload(
  story: StoryItem,
  user: { id: string; name: string; username: string },
  origin?: string,
): SharePayload {
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '')
  return {
    kind: 'story',
    title: user.name,
    subtitle: story.content || undefined,
    url: `${base}/?story=${story.id}`,
    thumbnailUrl: story.type !== 'text' ? story.mediaUrl || undefined : undefined,
    imageUrl: story.type === 'photo' ? story.mediaUrl || undefined : undefined,
    videoUrl: story.type === 'video' ? story.mediaUrl || undefined : undefined,
    storyId: story.id,
    userId: user.id,
    creatorName: user.name,
    creatorUsername: user.username,
  }
}

export function buildProfileSharePayload(
  profile: { id: string; name: string; username: string; avatarUrl?: string | null },
  origin?: string,
): SharePayload {
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '')
  return {
    kind: 'profile',
    title: profile.name,
    subtitle: `@${profile.username}`,
    url: `${base}/?profile=${encodeURIComponent(profile.username)}`,
    thumbnailUrl: profile.avatarUrl || undefined,
    userId: profile.id,
    creatorName: profile.name,
    creatorUsername: profile.username,
  }
}

export function buildLinkSharePayload(
  url: string,
  options?: { title?: string; subtitle?: string; thumbnailUrl?: string },
): SharePayload {
  let hostname = url
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    // keep raw url
  }
  const subtitle = options?.subtitle
  return {
    kind: 'link',
    title: options?.title || hostname,
    subtitle: subtitle && subtitle.length <= 120 ? subtitle : undefined,
    body: subtitle && subtitle.length > 120 ? subtitle : undefined,
    siteName: hostname,
    url,
    thumbnailUrl: options?.thumbnailUrl,
  }
}

export function buildMessageSharePayload(msg: ChatMessage, origin?: string): SharePayload {
  if (msg.type === 'share' && msg.metadata) {
    const existing = parseShareMetadata(msg.metadata)
    if (existing) return existing
  }

  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '')
  const preview =
    msg.content ||
    (msg.type === 'image'
      ? 'Фото'
      : msg.type === 'voice'
        ? 'Голосовое'
        : msg.type === 'video'
          ? 'Видео'
          : msg.type === 'file'
            ? msg.attachmentName || 'Файл'
            : 'Сообщение')

  return {
    kind: 'message',
    title: preview.slice(0, 120),
    subtitle: msg.sender.name,
    body: msg.content && msg.content.length > 120 ? msg.content : undefined,
    url: `${base}/?chat=${msg.chatId}&msg=${msg.id}`,
    thumbnailUrl: msg.type === 'image' ? msg.attachmentUrl || undefined : undefined,
    imageUrl: msg.type === 'image' ? msg.attachmentUrl || undefined : undefined,
    videoUrl: msg.type === 'video' ? msg.attachmentUrl || undefined : undefined,
    messageId: msg.id,
    durationSec: msg.durationSec || undefined,
    creatorName: msg.sender.name,
    creatorUsername: msg.sender.username,
  }
}

export function buildMediaSharePayload(item: {
  attachmentUrl?: string | null
  attachmentName?: string | null
  type?: string
  content?: string
}): SharePayload {
  const url =
    item.attachmentUrl || item.content?.match(/https?:\/\/\S+/)?.[0] || ''
  const isVideo = item.type === 'video'
  return {
    kind: 'media',
    title: item.attachmentName || (isVideo ? 'Видео' : 'Медиа'),
    url,
    thumbnailUrl: !isVideo ? url : undefined,
    imageUrl: !isVideo ? url : undefined,
    videoUrl: isVideo ? url : undefined,
  }
}
