import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { assertCanMessage } from '@/lib/privacy-server'

// Forward a message to another chat.
// Body: { messageId, targetChatId }
// Returns the new (forwarded) message.
export const POST = withJsonApi(async function POST(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json()
  const { messageId, targetChatId } = body ?? {}
  if (!messageId || !targetChatId) {
    return NextResponse.json({ error: 'Укажите messageId и targetChatId' }, { status: 400 })
  }

  const original = await db.message.findUnique({ where: { id: messageId } })
  if (!original) {
    return NextResponse.json({ error: 'Оригинал не найден' }, { status: 404 })
  }

  // Verify membership in the SOURCE chat — otherwise anyone could read the
  // content of an arbitrary message (by id) from a chat they don't belong to.
  const sourceMembership = await db.chatMember.findUnique({
    where: { userId_chatId: { userId: me.id, chatId: original.chatId } },
    select: { userId: true },
  })
  if (!sourceMembership) {
    return NextResponse.json({ error: 'Оригинал не найден' }, { status: 404 })
  }

  // Verify membership in target chat
  const membership = await db.chatMember.findUnique({
    where: { userId_chatId: { userId: me.id, chatId: targetChatId } },
    include: { chat: { select: { title: true, type: true, slowModeSeconds: true } } },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Чат не найден' }, { status: 404 })
  }

  // Private chats: same privacy gate as posting a new message
  if (membership.chat.type === 'private') {
    const peer = await db.chatMember.findFirst({
      where: { chatId: targetChatId, userId: { not: me.id } },
      select: { userId: true },
    })
    if (peer) {
      const gate = await assertCanMessage(me.id, peer.userId)
      if (!gate.ok) {
        return NextResponse.json({ error: gate.error }, { status: gate.status })
      }
    }
  }

  // Check slow mode and ban status
  const { isUserBanned, checkSlowMode } = await import('@/lib/channels')
  if (await isUserBanned(targetChatId, me.id)) {
    return NextResponse.json({ error: 'Вы заблокированы в этом чате' }, { status: 403 })
  }
  const slowCheck = await checkSlowMode(membership.chat.slowModeSeconds, membership)
  if (!slowCheck.ok) {
    return NextResponse.json(
      { error: `Slow mode: подождите ${slowCheck.waitSeconds} сек.` },
      { status: 429 },
    )
  }

  const forwarded = await db.message.create({
    data: {
      chatId: targetChatId,
      senderId: me.id,
      content: original.content,
      type: original.type,
      forwardedFromId: original.id,
      attachmentUrl: original.attachmentUrl,
      attachmentName: original.attachmentName,
      attachmentMime: original.attachmentMime,
      attachmentSize: original.attachmentSize,
      durationSec: original.durationSec,
      metadata: original.metadata,
    },
    include: {
      sender: {
        select: { id: true, name: true, username: true, avatarColor: true },
      },
      forwardedFrom: {
        include: { sender: { select: { id: true, name: true } } },
      },
      reactions: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
  })

  // Bump chat updatedAt
  await db.chat.update({ where: { id: targetChatId }, data: { updatedAt: new Date() } })

  const { sendPushToOfflineChatMembers } = await import('@/lib/push-server')
  const { pushBodyForContent } = await import('@/lib/e2ee-payload')
  sendPushToOfflineChatMembers(targetChatId, me.id, {
    title: membership.chat.title || me.name,
    body: pushBodyForContent(forwarded.content || 'Пересланное сообщение'),
  }).catch(() => {})

  return NextResponse.json({
    message: {
      id: forwarded.id,
      chatId: forwarded.chatId,
      senderId: forwarded.senderId,
      sender: forwarded.sender,
      content: forwarded.content,
      type: forwarded.type,
      replyToId: null,
      replyTo: null,
      forwardedFromId: forwarded.forwardedFromId,
      forwardedFrom: forwarded.forwardedFrom
        ? {
            id: forwarded.forwardedFrom.id,
            senderName: forwarded.forwardedFrom.sender.name,
            content: forwarded.forwardedFrom.content.slice(0, 80),
          }
        : null,
      attachmentUrl: forwarded.attachmentUrl,
      attachmentName: forwarded.attachmentName,
      attachmentMime: forwarded.attachmentMime,
      attachmentSize: forwarded.attachmentSize,
      durationSec: forwarded.durationSec,
      metadata: forwarded.metadata,
      editedAt: null,
      createdAt: forwarded.createdAt,
      isFavorite: false,
      reactions: [],
    },
  })
})
