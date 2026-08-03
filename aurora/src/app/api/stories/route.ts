import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { storyExpiresAt } from '@/lib/stories'
import { serializeStory } from '@/lib/story-api'
import {
  createProfileGalleryItem,
  detectGalleryType,
} from '@/lib/profile-gallery'
import {
  STORY_VISIBILITY_VALUES,
  serializeAudienceIds,
  type StoryVisibility,
} from '@/lib/story-visibility'
import { withJsonApi } from '@/lib/with-json-api'
import { createFeedSharePost } from '@/lib/feed-share-server'

const STORY_TYPES = new Set(['photo', 'video', 'text'])

export const POST = withJsonApi(async function POST(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const {
    type,
    content,
    mediaUrl,
    backgroundColor,
    visibility,
    audienceIds,
    addToProfile,
    saveToGallery,
    shareToFeed,
  } = body ?? {}

  if (typeof type !== 'string' || !STORY_TYPES.has(type)) {
    return NextResponse.json({ error: 'Некорректный тип статуса' }, { status: 400 })
  }

  if (type === 'text') {
    const text = typeof content === 'string' ? content.trim() : ''
    if (!text) {
      return NextResponse.json({ error: 'Введите текст статуса' }, { status: 400 })
    }
  } else if (!mediaUrl || typeof mediaUrl !== 'string') {
    return NextResponse.json({ error: 'Загрузите медиафайл' }, { status: 400 })
  }

  const vis: StoryVisibility =
    typeof visibility === 'string' && STORY_VISIBILITY_VALUES.has(visibility as StoryVisibility)
      ? (visibility as StoryVisibility)
      : 'contacts'

  const audienceList = Array.isArray(audienceIds)
    ? audienceIds.filter((id: unknown): id is string => typeof id === 'string')
    : []

  if ((vis === 'selected' || vis === 'exclude') && audienceList.length === 0) {
    return NextResponse.json({ error: 'Выберите пользователей для аудитории' }, { status: 400 })
  }

  const shouldAddToProfile =
    type !== 'text' &&
    (saveToGallery === true || (addToProfile !== false && saveToGallery !== false))

  const story = await db.story.create({
    data: {
      userId: me.id,
      type,
      content: typeof content === 'string' ? content.trim() || null : null,
      mediaUrl: typeof mediaUrl === 'string' ? mediaUrl : null,
      backgroundColor: typeof backgroundColor === 'string' ? backgroundColor : null,
      visibility: vis,
      audienceIds: serializeAudienceIds(audienceList),
      addToProfile: shouldAddToProfile,
      expiresAt: storyExpiresAt(),
    },
    include: {
      storyViews: {
        where: { userId: me.id },
        select: { id: true },
        take: 1,
      },
      storyLikes: {
        where: { userId: me.id },
        select: { id: true },
        take: 1,
      },
    },
  })

  if (shouldAddToProfile && story.mediaUrl) {
    await createProfileGalleryItem(me.id, {
      mediaUrl: story.mediaUrl,
      type: detectGalleryType({ name: story.mediaUrl }, story.type === 'video'),
      caption: story.content,
      storyId: story.id,
    })
  }

  if (shareToFeed === true) {
    const caption = story.content || (type === 'text' ? 'Статус' : 'Новый статус')
    await createFeedSharePost({
      userId: me.id,
      kind: 'story',
      targetId: story.id,
      title: type === 'text' ? caption.slice(0, 80) : 'Статус',
      content: caption,
      coverUrl: type === 'photo' || type === 'video' ? story.mediaUrl : null,
    })
  }

  return NextResponse.json({ story: serializeStory(story as any) })
})
