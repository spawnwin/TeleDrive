import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import {
  avatarToMediaItem,
  getProfileGalleryItems,
} from '@/lib/profile-gallery'
import {
  extractUrlsFromText,
  getPrivateChatId,
  gifMessageWhere,
  isGifMessage,
  linkTitleFromUrl,
  mediaMessageWhere,
  type ProfileMediaType,
} from '@/lib/profile-shared'
import { resolveUserByIdOrUsername } from '@/lib/resolve-user'
import { withJsonApi } from '@/lib/with-json-api'
import { areUsersBlocked } from '@/lib/user-blocks'

const VALID_TYPES = new Set<ProfileMediaType>([
  'profilePhotos',
  'media',
  'files',
  'links',
  'voice',
  'gif',
])
const DEFAULT_TAKE = 24
const MAX_TAKE = 50

function mapMessageItem(m: {
  id: string
  chatId: string
  type: string
  content: string
  attachmentUrl: string | null
  attachmentName: string | null
  attachmentMime: string | null
  attachmentSize: number | null
  durationSec: number | null
  createdAt: Date
}) {
  return {
    id: m.id,
    chatId: m.chatId,
    type: m.type,
    content: m.content,
    attachmentUrl: m.attachmentUrl,
    attachmentName: m.attachmentName,
    attachmentMime: m.attachmentMime,
    attachmentSize: m.attachmentSize,
    durationSec: m.durationSec,
    createdAt: m.createdAt.toISOString(),
    source: 'chat' as const,
  }
}

export const GET = withJsonApi(async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params

  const target = await resolveUserByIdOrUsername(id, { id: true, avatarUrl: true })
  if (!target) {
    return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
  }

  const targetUserId = target.id
  const isSelf = targetUserId === me.id
  if (!isSelf && (await areUsersBlocked(me.id, targetUserId))) {
    return NextResponse.json({ error: 'Пользователь недоступен' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') as ProfileMediaType | null
  if (!type || !VALID_TYPES.has(type)) {
    return NextResponse.json({ error: 'Неверный type' }, { status: 400 })
  }

  const cursor = searchParams.get('cursor')
  const take = Math.min(
    Math.max(parseInt(searchParams.get('take') || String(DEFAULT_TAKE), 10) || DEFAULT_TAKE, 1),
    MAX_TAKE,
  )

  if (type === 'profilePhotos') {
    const gallery = await getProfileGalleryItems(targetUserId, { cursor, take })
    if (!cursor && target.avatarUrl) {
      const avatarItem = avatarToMediaItem(target.avatarUrl)
      const merged = [avatarItem, ...gallery.items].slice(0, take)
      const hasMore = gallery.items.length >= take || gallery.nextCursor !== null
      return NextResponse.json({
        items: merged,
        nextCursor: hasMore ? gallery.nextCursor : null,
      })
    }
    return NextResponse.json(gallery)
  }

  if (isSelf) {
    return NextResponse.json({ items: [], nextCursor: null })
  }

  const privateChatId = await getPrivateChatId(me.id, targetUserId)
  if (!privateChatId) {
    return NextResponse.json({ items: [], nextCursor: null })
  }

  const baseWhere = { chatId: privateChatId }

  if (type === 'links') {
    const messages = await db.message.findMany({
      where: {
        ...baseWhere,
        type: 'text',
        content: { contains: 'http' },
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: take * 2,
      select: {
        id: true,
        chatId: true,
        type: true,
        content: true,
        attachmentUrl: true,
        attachmentName: true,
        attachmentMime: true,
        attachmentSize: true,
        durationSec: true,
        createdAt: true,
      },
    })

    const linkItems: Array<{
      id: string
      messageId: string
      url: string
      title: string
      createdAt: string
      chatId: string
    }> = []

    for (const m of messages) {
      const urls = extractUrlsFromText(m.content)
      for (const url of urls) {
        linkItems.push({
          id: `${m.id}:${url}`,
          messageId: m.id,
          url,
          title: linkTitleFromUrl(url),
          createdAt: m.createdAt.toISOString(),
          chatId: m.chatId,
        })
        if (linkItems.length >= take) break
      }
      if (linkItems.length >= take) break
    }

    const nextCursor =
      linkItems.length >= take
        ? linkItems[linkItems.length - 1]?.createdAt ?? null
        : messages.length > 0
          ? messages[messages.length - 1]?.createdAt.toISOString() ?? null
          : null

    return NextResponse.json({
      items: linkItems,
      nextCursor: linkItems.length >= take ? nextCursor : null,
    })
  }

  let typeWhere = {}
  if (type === 'media') typeWhere = mediaMessageWhere
  else if (type === 'files') typeWhere = { type: 'file' }
  else if (type === 'voice') typeWhere = { type: 'voice' }
  else if (type === 'gif') typeWhere = gifMessageWhere

  const messages = await db.message.findMany({
    where: {
      ...baseWhere,
      ...typeWhere,
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: type === 'gif' ? take * 2 : take + 1,
    select: {
      id: true,
      chatId: true,
      type: true,
      content: true,
      attachmentUrl: true,
      attachmentName: true,
      attachmentMime: true,
      attachmentSize: true,
      durationSec: true,
      createdAt: true,
    },
  })

  let filtered = messages
  if (type === 'gif') {
    filtered = messages.filter((m) => isGifMessage(m)).slice(0, take + 1)
  } else if (type === 'media') {
    filtered = messages.filter((m) => !isGifMessage(m)).slice(0, take + 1)
  }

  const hasMore = filtered.length > take
  const chatPage = hasMore ? filtered.slice(0, take) : filtered
  const chatItems = chatPage.map(mapMessageItem)

  const nextCursor = hasMore ? chatPage[chatPage.length - 1]?.createdAt.toISOString() ?? null : null

  return NextResponse.json({
    items: chatItems,
    nextCursor,
  })
})
