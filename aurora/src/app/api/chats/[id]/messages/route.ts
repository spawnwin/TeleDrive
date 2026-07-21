import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { areUsersBlocked } from '@/lib/user-blocks'
import { withJsonApi } from '@/lib/with-json-api'
import { isVideoFile, isVoiceFile, resolveVideoMime, resolveVoiceMime } from '@/lib/media-type'
import { serializeReplyTo } from '@/lib/message-reply'
import { getCommentCounts } from '@/lib/comments'

export const GET = withJsonApi(async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const membership = await db.chatMember.findUnique({
    where: { userId_chatId: { userId: me.id, chatId: id } },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Чат не найден' }, { status: 404 })
  }

  const url = new URL(req.url)
  const cursor = url.searchParams.get('cursor')
  const take = Number(url.searchParams.get('take') ?? 50)
  const search = url.searchParams.get('q')?.trim()
  const favoritesOnly = url.searchParams.get('favorites') === '1'
  const topicId = url.searchParams.get('topicId') || null

  const chat = membership
    ? await db.chat.findUnique({
        where: { id },
        select: { type: true, discussionChatId: true, commentsEnabled: true, pinnedMessageId: true, isForum: true },
      })
    : null

  const messages = await db.message.findMany({
    where: {
      chatId: id,
      threadRootId: null,
      ...(topicId ? { topicId } : { topicId: null }),
      ...(search ? { content: { contains: search } } : {}),
      ...(favoritesOnly
        ? { favorites: { some: { userId: me.id } } }
        : {}),
      // "Delete for me" — hide from this user's history only
      hiddenFor: { none: { userId: me.id } },
    },
    orderBy: { createdAt: 'desc' },
    take,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: {
      sender: {
        select: { id: true, name: true, username: true, avatarColor: true, avatarUrl: true, publicKey: true },
      },
      replyTo: {
        include: { sender: { select: { id: true, name: true } } },
      },
      forwardedFrom: {
        include: { sender: { select: { id: true, name: true } } },
      },
      reactions: {
        include: { user: { select: { id: true, name: true } } },
      },
      favorites: {
        where: { userId: me.id },
        select: { id: true },
      },
    },
  })

  const messageIds = messages.map((m) => m.id)
  let commentCountMap: Record<string, number> = {}
  if (chat?.commentsEnabled && messageIds.length) {
    commentCountMap = await getCommentCounts(id, messageIds)
  }

  let pinnedMessage: {
    id: string
    content: string
    type: string
    senderName: string
  } | null = null
  if (chat?.pinnedMessageId) {
    const pinned = await db.message.findUnique({
      where: { id: chat.pinnedMessageId },
      include: { sender: { select: { id: true, name: true } } },
    })
    if (pinned && pinned.chatId === id) {
      pinnedMessage = {
        id: pinned.id,
        content: pinned.content,
        type: pinned.type,
        senderName: pinned.sender.name,
      }
    }
  }

  let peerLastReadAt: string | null = null
  if (chat?.type === 'private') {
    const peer = await db.chatMember.findFirst({
      where: { chatId: id, userId: { not: me.id } },
      select: { lastReadAt: true },
    })
    peerLastReadAt = peer?.lastReadAt?.toISOString() ?? null
  }

  return NextResponse.json({
    commentsEnabled: chat?.commentsEnabled ?? false,
    isForum: chat?.isForum ?? false,
    pinnedMessage,
    peerLastReadAt,
    messages: messages.reverse().map((m) => ({
      id: m.id,
      chatId: m.chatId,
      senderId: m.senderId,
      sender: m.sender,
      content: m.content,
      type: m.type,
      replyToId: m.replyToId,
      replyTo: serializeReplyTo(m.replyTo),
      forwardedFromId: m.forwardedFromId,
      forwardedFrom: m.forwardedFrom
        ? {
            id: m.forwardedFrom.id,
            senderName: m.forwardedFrom.sender.name,
            content: m.forwardedFrom.content.slice(0, 80),
          }
        : null,
      attachmentUrl: m.attachmentUrl,
      attachmentName: m.attachmentName,
      attachmentMime: m.attachmentMime,
      attachmentSize: m.attachmentSize,
      durationSec: m.durationSec,
      metadata: m.metadata,
      editedAt: m.editedAt,
      createdAt: m.createdAt,
      isFavorite: m.favorites.length > 0,
      albumId: m.albumId,
      topicId: m.topicId,
      reactions: m.reactions.map((r) => ({
        id: r.id,
        emoji: r.emoji,
        userId: r.userId,
        userName: r.user.name,
      })),
      commentCount: commentCountMap[m.id] ?? 0,
    })),
  })
})

export const POST = withJsonApi(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const membership = await db.chatMember.findUnique({
    where: { userId_chatId: { userId: me.id, chatId: id } },
    include: { chat: true },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Чат не найден' }, { status: 404 })
  }

  if (membership.chat.type === 'private') {
    const otherMember = await db.chatMember.findFirst({
      where: { chatId: id, userId: { not: me.id } },
      select: { userId: true },
    })
    if (otherMember && (await areUsersBlocked(me.id, otherMember.userId))) {
      return NextResponse.json({ error: 'Невозможно отправить сообщение' }, { status: 403 })
    }
  }

  const { canPostInChat, isUserBanned, checkSlowMode } = await import('@/lib/channels')
  if (await isUserBanned(id, me.id)) {
    return NextResponse.json({ error: 'Вы заблокированы в этом чате' }, { status: 403 })
  }
  if (!canPostInChat(membership.chat.type, membership.role)) {
    return NextResponse.json({ error: 'Только администраторы могут публиковать в канале' }, { status: 403 })
  }
  const slowCheck = await checkSlowMode(membership.chat.slowModeSeconds, membership)
  if (!slowCheck.ok) {
    return NextResponse.json(
      { error: `Slow mode: подождите ${slowCheck.waitSeconds} сек.` },
      { status: 429 },
    )
  }

  const body = await req.json()
  const content = (body?.content || '').trim()
  const replyToId = body?.replyToId || null
  const forwardedFromId = body?.forwardedFromId || null
  const shareMetadata = body?.metadata || null
  const attachmentUrl = body?.attachmentUrl || null
  const attachmentName = body?.attachmentName || null
  let attachmentMime = body?.attachmentMime || null
  const attachmentSize = body?.attachmentSize || null
  const durationSec = body?.durationSec || null
  const albumId = body?.albumId || null
  const topicId = body?.topicId || null

  if (attachmentUrl && (attachmentName || attachmentUrl)) {
    const fileMeta = {
      type: attachmentMime || '',
      name: attachmentName || attachmentUrl || '',
    }
    const voiceMime = resolveVoiceMime(fileMeta)
    if (voiceMime) {
      attachmentMime = voiceMime
    } else if (
      !attachmentMime ||
      attachmentMime === 'application/octet-stream'
    ) {
      const resolved = resolveVideoMime(fileMeta)
      if (resolved) attachmentMime = resolved
    }
  }

  const isVoiceMessage =
    !!body?.forceVoiceMessage ||
    isVoiceFile({
      type: attachmentMime || '',
      name: attachmentName || attachmentUrl || '',
    }) ||
    (!!durationSec && !body?.forceVideoMessage && !body?.forceVideoAttachment)

  const isVideoAttachment =
    !!attachmentUrl &&
    !isVoiceMessage &&
    (attachmentMime?.startsWith('video/') ||
      body?.forceVideoMessage ||
      body?.forceVideoAttachment ||
      isVideoFile({
        type: attachmentMime || '',
        name: attachmentName || attachmentUrl || '',
      }))

  // Determine message type
  let type = 'text'
  if (body?.type === 'music' && shareMetadata) {
    type = 'music'
  } else if (body?.forceSticker && attachmentUrl) type = 'sticker'
  else if (attachmentMime?.startsWith('image/') || body?.forceImage) type = 'image'
  else if (isVoiceMessage) type = 'voice'
  else if (isVideoAttachment) type = 'video'
  else if (attachmentUrl) type = 'file'
  else if (body?.type === 'share' && shareMetadata) type = 'share'

  if (type === 'voice' && attachmentMime?.startsWith('video/')) {
    attachmentMime = attachmentMime.includes('webm')
      ? 'audio/webm'
      : attachmentMime.includes('mp4')
        ? 'audio/mp4'
        : 'audio/webm'
  }

  if (!content && !attachmentUrl && !forwardedFromId && type !== 'share' && type !== 'music') {
    return NextResponse.json({ error: 'Пустое сообщение' }, { status: 400 })
  }

  if (type === 'music') {
    try {
      const meta = typeof shareMetadata === 'string' ? JSON.parse(shareMetadata) : shareMetadata
      if (!meta || meta.kind !== 'music' || meta.source !== 'yandex' || !meta.trackId) {
        return NextResponse.json({ error: 'Некорректные данные трека' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: 'Некорректные данные трека' }, { status: 400 })
    }
  }

  // For forwarded messages, copy original content if no content given
  let finalContent = content
  let finalAttachmentUrl = attachmentUrl
  let finalAttachmentName = attachmentName
  let finalAttachmentMime = attachmentMime
  let finalAttachmentSize = attachmentSize
  let finalDurationSec = durationSec

  if (forwardedFromId) {
    const original = await db.message.findUnique({
      where: { id: forwardedFromId },
    })
    if (!original) {
      return NextResponse.json({ error: 'Оригинал не найден' }, { status: 404 })
    }
    // Verify membership in the SOURCE chat — otherwise the copy below would
    // leak the content of an arbitrary message (by id) from a chat the sender
    // doesn't belong to.
    const sourceMembership = await db.chatMember.findUnique({
      where: { userId_chatId: { userId: me.id, chatId: original.chatId } },
      select: { userId: true },
    })
    if (!sourceMembership) {
      return NextResponse.json({ error: 'Оригинал не найден' }, { status: 404 })
    }
    if (!finalContent) finalContent = original.content
    if (!finalAttachmentUrl) {
      finalAttachmentUrl = original.attachmentUrl
      finalAttachmentName = original.attachmentName
      finalAttachmentMime = original.attachmentMime
      finalAttachmentSize = original.attachmentSize
      finalDurationSec = original.durationSec
      type = original.type
    }
  }

  const message = await db.message.create({
    data: {
      chatId: id,
      senderId: me.id,
      content: finalContent,
      replyToId: replyToId || null,
      forwardedFromId: forwardedFromId || null,
      attachmentUrl: finalAttachmentUrl,
      attachmentName: finalAttachmentName,
      attachmentMime: finalAttachmentMime,
      attachmentSize: finalAttachmentSize ? Number(finalAttachmentSize) : null,
      durationSec: finalDurationSec ? Number(finalDurationSec) : null,
      type,
      metadata: type === 'share' || type === 'music' ? (typeof shareMetadata === 'string' ? shareMetadata : JSON.stringify(shareMetadata)) : null,
      albumId,
      topicId,
    },
    include: {
      sender: {
        select: { id: true, name: true, username: true, avatarColor: true, avatarUrl: true, publicKey: true },
      },
      replyTo: {
        include: { sender: { select: { id: true, name: true } } },
      },
      forwardedFrom: {
        include: { sender: { select: { id: true, name: true } } },
      },
      reactions: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
  })

  // Bump topic messageCount and lastMessageAt
  if (topicId) {
    await db.topic.update({
      where: { id: topicId },
      data: { messageCount: { increment: 1 }, lastMessageAt: new Date() },
    }).catch(() => {})
  }

  // Bump chat updatedAt
  await db.chat.update({ where: { id }, data: { updatedAt: new Date() } })

  await db.chatMember.update({
    where: { userId_chatId: { userId: me.id, chatId: id } },
    data: { lastMessageAt: new Date() },
  })

  // Restore chat in list for members who hid it
  await db.chatMember.updateMany({
    where: { chatId: id, isHidden: true },
    data: { isHidden: false },
  })

  // Bot command handling & push notifications
  if (membership.chat.type === 'private') {
    const otherMember = await db.chatMember.findFirst({
      where: { chatId: id, userId: { not: me.id } },
      include: { user: true },
    })
    if (otherMember?.user.isBot) {
      const { isStickerBotUsername } = await import('@/lib/stickers')
      if (isStickerBotUsername(otherMember.user.username)) {
        // The Sticker Bot is a fully first-party, synchronous bot — it needs
        // to see every message (images, bare emoji replies), not just `/`
        // commands, so it's handled entirely differently from the generic
        // long-poll bot API below.
        // The user's own message is already persisted above — a bug in the
        // bot's reply logic must never turn that into a 500 for the sender.
        const { handleStickerBotMessage } = await import('@/lib/sticker-bot')
        try {
          await handleStickerBotMessage(otherMember.userId, id, me.id, {
            content: finalContent,
            attachmentUrl: message.attachmentUrl,
            attachmentMime: message.attachmentMime,
          })
        } catch (err) {
          console.error('[sticker-bot] handleStickerBotMessage failed', err)
        }
      } else if (content.startsWith('/')) {
        const { handleBotCommand, queueBotUpdate } = await import('@/lib/bots')
        const cmd = content.split(/\s/)[0].toLowerCase()
        if (cmd === '/start' || cmd === '/help') {
          await handleBotCommand(otherMember.userId, id, cmd, me.id)
        } else {
          await queueBotUpdate(otherMember.userId, 'message', {
            update_id: message.id,
            type: 'message',
            message: { chatId: id, from: { id: me.id, name: me.name }, text: content, messageId: message.id },
          })
        }
      }
    }
  }

  const { sendPushToOfflineChatMembers } = await import('@/lib/push-server')
  const { pushBodyForContent } = await import('@/lib/e2ee-payload')
  const chatTitle = membership.chat.title || me.name
  sendPushToOfflineChatMembers(id, me.id, {
    title: chatTitle,
    body: pushBodyForContent(finalContent || ''),
  }).catch(() => {})

  return NextResponse.json({
    message: {
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      sender: message.sender,
      content: message.content,
      type: message.type,
      replyToId: message.replyToId,
      replyTo: serializeReplyTo(message.replyTo),
      forwardedFromId: message.forwardedFromId,
      forwardedFrom: message.forwardedFrom
        ? {
            id: message.forwardedFrom.id,
            senderName: message.forwardedFrom.sender.name,
            content: message.forwardedFrom.content.slice(0, 80),
          }
        : null,
      attachmentUrl: message.attachmentUrl,
      attachmentName: message.attachmentName,
      attachmentMime: message.attachmentMime,
      attachmentSize: message.attachmentSize,
      durationSec: message.durationSec,
      metadata: message.metadata,
      editedAt: message.editedAt,
      createdAt: message.createdAt,
      isFavorite: false,
      reactions: [],
      albumId: message.albumId,
      topicId: message.topicId,
    },
  })
})

export const DELETE = withJsonApi(async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const url = new URL(req.url)
  const messageId = url.searchParams.get('messageId')
  const scope = url.searchParams.get('scope') === 'me' ? 'me' : 'everyone'
  if (!messageId) {
    return NextResponse.json({ error: 'Укажите messageId' }, { status: 400 })
  }
  const msg = await db.message.findUnique({ where: { id: messageId } })
  if (!msg) return NextResponse.json({ error: 'Сообщение не найдено' }, { status: 404 })
  if (msg.chatId !== id) {
    return NextResponse.json({ error: 'Чат не соответствует' }, { status: 400 })
  }

  const membership = await db.chatMember.findUnique({
    where: { userId_chatId: { userId: me.id, chatId: id } },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Чат не найден' }, { status: 404 })
  }

  // Soft-hide for current user only ("delete for me")
  if (scope === 'me') {
    await db.messageHide.upsert({
      where: { messageId_userId: { messageId, userId: me.id } },
      create: { messageId, userId: me.id },
      update: {},
    })
    return NextResponse.json({ ok: true, hidden: true })
  }

  if (msg.senderId !== me.id) {
    const { canDeleteMessagesInChat } = await import('@/lib/chat-permissions')
    if (!canDeleteMessagesInChat(membership)) {
      return NextResponse.json({ error: 'Нельзя удалить чужое сообщение' }, { status: 403 })
    }
  }

  const chat = await db.chat.findUnique({ where: { id } })
  if (chat?.pinnedMessageId === messageId) {
    await db.chat.update({ where: { id }, data: { pinnedMessageId: null } })
  }

  // Decrement topic messageCount and recalculate lastMessageAt
  if (msg.topicId) {
    await db.message.delete({ where: { id: messageId } })
    const lastMsg = await db.message.findFirst({
      where: { topicId: msg.topicId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    await db.topic.update({
      where: { id: msg.topicId },
      data: {
        messageCount: { decrement: 1 },
        lastMessageAt: lastMsg?.createdAt ?? null,
      },
    }).catch(() => {})
  } else {
    await db.message.delete({ where: { id: messageId } })
  }
  return NextResponse.json({ ok: true })
})
