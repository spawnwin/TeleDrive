import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { serializeReplyTo } from '@/lib/message-reply'
import { assertCanCall } from '@/lib/privacy-server'

// Records a call marker as a system-style message in a private chat.
// The initiator POSTs here when the call ends; the client broadcasts via chat socket.
export const POST = withJsonApi(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const members = await db.chatMember.findMany({
    where: { chatId: id },
    include: { chat: true },
  })
  const membership = members.find((m) => m.userId === me.id)
  if (!membership) {
    return NextResponse.json({ error: 'Чат не найден' }, { status: 404 })
  }
  if (membership.chat.type !== 'private') {
    return NextResponse.json({ error: 'Звонки только в личных чатах' }, { status: 400 })
  }
  const otherMemberId = members.find((m) => m.userId !== me.id)?.userId
  if (!otherMemberId) {
    return NextResponse.json({ error: 'Собеседник не найден' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const callId = String(body?.callId || '').slice(0, 64)
  const callType: 'audio' | 'video' = body?.callType === 'video' ? 'video' : 'audio'
  const status: 'answered' | 'missed' | 'declined' | 'cancelled' =
    body?.status === 'missed' || body?.status === 'declined' || body?.status === 'cancelled'
      ? body.status
      : 'answered'
  const durationSec = Math.max(0, Math.min(86400, Number(body?.durationSec) || 0))
  const peerId = String(body?.peerId || '').slice(0, 64)

  if (!callId || !peerId || peerId !== otherMemberId) {
    return NextResponse.json({ error: 'callId и peerId обязательны' }, { status: 400 })
  }

  // Who started the call (never trust a client-supplied peer as message sender).
  const isInitiator = body?.isInitiator !== false
  const initiatorId = isInitiator ? me.id : otherMemberId

  // Enforce call privacy / blocks when the initiator records an outgoing call.
  if (isInitiator) {
    const gate = await assertCanCall(me.id, otherMemberId)
    if (!gate.ok && status !== 'declined') {
      // Still allow recording declined/missed from callee side; initiator
      // should have been blocked by can-call preflight. Soft-deny only new answered.
      if (status === 'answered' || status === 'cancelled') {
        return NextResponse.json({ error: gate.error }, { status: gate.status })
      }
    }
  }

  const existing = await db.message.findFirst({
    where: { chatId: id, type: 'call', metadata: { contains: callId } },
    select: { id: true },
  })
  if (existing) {
    return NextResponse.json({ message: { id: existing.id, duplicate: true } })
  }

  // Always attribute the row to the authenticated recorder — spoofing the peer
  // as senderId previously let clients forge messages from the other user.
  const metadata = JSON.stringify({
    callId,
    callType,
    status,
    durationSec,
    peerId,
    initiatorId,
  })

  const message = await db.message.create({
    data: {
      chatId: id,
      senderId: me.id,
      content: '',
      type: 'call',
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
      replyTo: { include: { sender: { select: { id: true, name: true } } } },
      forwardedFrom: { include: { sender: { select: { id: true, name: true } } } },
      reactions: { include: { user: { select: { id: true, name: true } } } },
    },
  })

  await db.chat.update({ where: { id }, data: { updatedAt: new Date() } })
  await db.chatMember.update({
    where: { userId_chatId: { userId: me.id, chatId: id } },
    data: { lastMessageAt: new Date() },
  })
  await db.chatMember.updateMany({
    where: { chatId: id, isHidden: true },
    data: { isHidden: false },
  })

  const statusLabel =
    status === 'missed'
      ? 'Пропущенный звонок'
      : status === 'declined'
        ? 'Отклонённый звонок'
        : 'Звонок'
  const { sendPushToOfflineChatMembers } = await import('@/lib/push-server')
  sendPushToOfflineChatMembers(id, me.id, {
    title: me.name,
    body: statusLabel,
  }).catch(() => {})

  return NextResponse.json({
    message: {
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      sender: message.sender,
      content: message.content,
      type: message.type,
      metadata: message.metadata,
      attachmentUrl: message.attachmentUrl,
      attachmentName: message.attachmentName,
      attachmentMime: message.attachmentMime,
      attachmentSize: message.attachmentSize,
      durationSec: message.durationSec,
      replyToId: message.replyToId,
      replyTo: serializeReplyTo(message.replyTo),
      forwardedFromId: message.forwardedFromId,
      forwardedFrom: message.forwardedFrom,
      reactions: (message.reactions || []).map((r: { id: string; emoji: string; userId: string; user: { id: string; name: string } }) => ({
        id: r.id,
        emoji: r.emoji,
        userId: r.userId,
        userName: r.user.name,
      })),
      createdAt: message.createdAt,
    },
  })
})
