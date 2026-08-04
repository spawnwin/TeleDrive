import { db } from '@/lib/db'
import { isVideoFile, resolveImageMimeFromUrl, resolveVideoMimeFromUrl } from '@/lib/media-type'

export type GalleryItemType = 'photo' | 'video'

export function avatarToMediaItem(avatarUrl: string) {
  return {
    id: 'avatar:current',
    chatId: 'profile',
    type: 'image' as const,
    content: '',
    attachmentUrl: avatarUrl,
    attachmentName: avatarUrl.split('/').pop() || null,
    attachmentMime: resolveImageMimeFromUrl(avatarUrl) || 'image/jpeg',
    attachmentSize: null,
    durationSec: null,
    createdAt: new Date().toISOString(),
    isPinned: true,
    source: 'avatar' as const,
  }
}
export function galleryItemToMediaItem(item: {
  id: string
  type: string
  mediaUrl: string
  caption: string | null
  isPinned: boolean
  createdAt: Date
}) {
  const isVideo = item.type === 'video'
  return {
    id: `gallery:${item.id}`,
    chatId: 'gallery',
    type: isVideo ? 'video' : 'image',
    content: item.caption || '',
    attachmentUrl: item.mediaUrl,
    attachmentName: item.mediaUrl.split('/').pop() || null,
    attachmentMime: isVideo
      ? resolveVideoMimeFromUrl(item.mediaUrl) || 'video/mp4'
      : resolveImageMimeFromUrl(item.mediaUrl) || 'image/jpeg',
    attachmentSize: null,
    durationSec: null,
    createdAt: item.createdAt.toISOString(),
    isPinned: item.isPinned,
    source: 'gallery' as const,
  }
}

export async function getProfileGalleryItems(
  userId: string,
  opts?: { cursor?: string | null; take?: number },
) {
  const take = opts?.take ?? 24
  const items = await db.profileGalleryItem.findMany({
    where: {
      userId,
      ...(opts?.cursor ? { createdAt: { lt: new Date(opts.cursor) } } : {}),
    },
    orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    take: take + 1,
  })

  const hasMore = items.length > take
  const page = hasMore ? items.slice(0, take) : items
  const nextCursor = hasMore ? page[page.length - 1]?.createdAt.toISOString() ?? null : null

  return {
    items: page.map(galleryItemToMediaItem),
    nextCursor,
  }
}

export async function getProfileGalleryCount(userId: string): Promise<number> {
  return db.profileGalleryItem.count({ where: { userId } })
}

export async function createProfileGalleryItem(
  userId: string,
  data: {
    mediaUrl: string
    type: GalleryItemType
    caption?: string | null
    storyId?: string | null
    isPinned?: boolean
  },
) {
  return db.profileGalleryItem.create({
    data: {
      userId,
      type: data.type,
      mediaUrl: data.mediaUrl,
      caption: data.caption ?? null,
      storyId: data.storyId ?? null,
      isPinned: data.isPinned ?? false,
    },
  })
}

export function detectGalleryType(file: { type?: string; name: string }, isVideo?: boolean): GalleryItemType {
  if (isVideo || isVideoFile(file)) return 'video'
  return 'photo'
}

export async function getProfileGalleryItemOwner(itemId: string): Promise<string | null> {
  const item = await db.profileGalleryItem.findUnique({
    where: { id: itemId },
    select: { userId: true },
  })
  return item?.userId ?? null
}

export async function updateProfileGalleryItem(
  itemId: string,
  data: { caption?: string | null; isPinned?: boolean },
) {
  return db.profileGalleryItem.update({ where: { id: itemId }, data })
}

export async function deleteProfileGalleryItem(itemId: string): Promise<void> {
  await db.profileGalleryItem.delete({ where: { id: itemId } })
}
