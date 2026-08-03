import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { serializeShareMetadata, type SharePayload } from '@/lib/share-payload'
import { assertCanMessage } from '@/lib/privacy-server'

export const POST = withJsonApi(async function POST(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json()
  const chatIds: string[] = Array.isArray(body?.chatIds) ? body.chatIds : []
  const payload = body?.payload as SharePayload | undefined
  const caption = (body?.caption || '').trim()

  if (chatIds.length === 0) {
    return NextResponse.json({ error: 'Выберите чат' }, { status: 400 })
  }
  if (!payload?.kind || !payload?.title || !payload?.url) {
    return NextResponse.json({ error: 'Некорректные данные для шаринга' }, { status: 400 })
  }

  const metadata = serializeShareMetadata(payload)
  const content = caption || payload.title
  const created: Array<{
    id: string
    chatId: string
    senderId: string
    sender: {
      id: string
      name: string
      username: string
      avatarColor: string
      avatarUrl: string | null
      publicKey: string | null
    }
    content: string
    type: string
    metadata: string | null
    replyToId: null
    replyTo: null
    forwardedFromId: null
    forwardedFrom: null
    attachmentUrl: null
    attachmentName: null
    attachmentMime: null
    attachmentSize: null
    durationSec: null
    editedAt: null
    createdAt: Date
    isFavorite: boolean
    reactions: []
  }> = []

  for (const chatId of chatIds) {
    const membership = await db.chatMember.findUnique({
      where: { userId_chatId: { userId: me.id, chatId } },
      include: { chat: true },
    })
    if (!membership) continue

    if (membership.chat.type === 'private') {
      const otherMember = await db.chatMember.findFirst({
        where: { chatId, userId: { not: me.id } },
        select: { userId: true },
      })
      if (otherMember) {
        const gate = await assertCanMessage(me.id, otherMember.userId)
        if (!gate.ok) continue
      }
    }

    const { canPostInChat, isUserBanned, checkSlowMode } = await import('@/lib/channels')
    if (await isUserBanned(chatId, me.id)) continue
    if (!canPostInChat(membership.chat.type, membership.role)) continue
    const slowCheck = await checkSlowMode(membership.chat.slowModeSeconds, membership)
    if (!slowCheck.ok) continue

    const message = await db.message.create({
      data: {
        chatId,
        senderId: me.id,
        content,
        type: 'share',
        metadata,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarColor: true,
            avatarUrl: true,
            publicKey: true,
          },
        },
        reactions: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    })

    await db.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } })
    await db.chatMember.update({
      where: { userId_chatId: { userId: me.id, chatId } },
      data: { lastMessageAt: new Date() },
    })
    await db.chatMember.updateMany({
      where: { chatId, isHidden: true },
      data: { isHidden: false },
    })

    created.push({
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      sender: message.sender,
      content: message.content,
      type: message.type,
      metadata: message.metadata,
      replyToId: null,
      replyTo: null,
      forwardedFromId: null,
      forwardedFrom: null,
      attachmentUrl: null,
      attachmentName: null,
      attachmentMime: null,
      attachmentSize: null,
      durationSec: null,
      editedAt: null,
      createdAt: message.createdAt,
      isFavorite: false,
      reactions: [],
    })

    const { sendPushToOfflineChatMembers } = await import('@/lib/push-server')
    const { pushBodyForContent } = await import('@/lib/e2ee-payload')
    sendPushToOfflineChatMembers(chatId, me.id, {
      title: membership.chat.title || me.name,
      body: pushBodyForContent(content),
    }).catch(() => {})
  }

  if (created.length === 0) {
    return NextResponse.json({ error: 'Не удалось отправить ни в один чат' }, { status: 400 })
  }

  return NextResponse.json({ messages: created })
})
