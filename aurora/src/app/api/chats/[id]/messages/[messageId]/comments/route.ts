import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { serializeReplyTo } from '@/lib/message-reply'
import { isUserBanned } from '@/lib/channels'
import { getCommentContext } from '@/lib/comments'

export const GET = withJsonApi(async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id, messageId } = await params
  const ctx = await getCommentContext(id)
  if (!ctx) {
    return NextResponse.json({ error: 'Комментарии недоступны' }, { status: 404 })
  }

  const membership = await db.chatMember.findUnique({
    where: { userId_chatId: { userId: me.id, chatId: id } },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Чат не найден' }, { status: 404 })
  }

  const post = await db.message.findUnique({ where: { id: messageId } })
  if (!post || post.chatId !== id || post.threadRootId) {
    return NextResponse.json({ error: 'Сообщение не найдено' }, { status: 404 })
  }

  const url = new URL(req.url)
  const cursor = url.searchParams.get('cursor')
  const takeRaw = Number(url.searchParams.get('take') || 50)
  const take = Math.min(100, Math.max(1, Number.isFinite(takeRaw) ? takeRaw : 50))

  const comments = await db.message.findMany({
    where: {
      chatId: ctx.commentChatId,
      threadRootId: messageId,
    },
    orderBy: { createdAt: 'asc' },
    take,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: {
      sender: {
        select: { id: true, name: true, username: true, avatarColor: true, avatarUrl: true },
      },
      replyTo: {
        include: { sender: { select: { id: true, name: true } } },
      },
      reactions: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
  })

  const total = await db.message.count({
    where: { chatId: ctx.commentChatId, threadRootId: messageId },
  })

  // Mentionable users: members of the chat where comments live. Used by the
  // composer for @ autocomplete and by the renderer to resolve @username
  // tokens to clickable profile links. Limited to 200 to keep the payload
  // small for large channels; the composer filters client-side by query.
  const mentionMembers = await db.chatMember.findMany({
    where: { chatId: ctx.commentChatId },
    take: 200,
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
    },
  })
  const mentionableUsers = mentionMembers.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    username: m.user.username,
    avatarColor: m.user.avatarColor,
    avatarUrl: m.user.avatarUrl,
  }))

  return NextResponse.json({
    comments: comments.map((m) => ({
      id: m.id,
      chatId: m.chatId,
      senderId: m.senderId,
      sender: m.sender,
      content: m.content,
      type: m.type,
      replyToId: m.replyToId,
      replyTo: serializeReplyTo(m.replyTo),
      attachmentUrl: m.attachmentUrl,
      attachmentName: m.attachmentName,
      editedAt: m.editedAt,
      createdAt: m.createdAt,
      reactions: m.reactions.map((r) => ({
        id: r.id,
        emoji: r.emoji,
        userId: r.userId,
        userName: r.user.name,
      })),
    })),
    total,
    discussionChatId: ctx.discussionChatId,
    mentionableUsers,
    nextCursor: comments.length === take ? comments[comments.length - 1]?.id : null,
  })
})

export const POST = withJsonApi(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id, messageId } = await params
  const ctx = await getCommentContext(id)
  if (!ctx) {
    return NextResponse.json({ error: 'Комментарии недоступны' }, { status: 404 })
  }

  const membership = await db.chatMember.findUnique({
    where: { userId_chatId: { userId: me.id, chatId: id } },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Чат не найден' }, { status: 404 })
  }
  if (await isUserBanned(id, me.id)) {
    return NextResponse.json({ error: 'Вы заблокированы' }, { status: 403 })
  }
  if (ctx.discussionChatId && (await isUserBanned(ctx.discussionChatId, me.id))) {
    return NextResponse.json({ error: 'Вы заблокированы в обсуждении' }, { status: 403 })
  }

  const post = await db.message.findUnique({ where: { id: messageId } })
  if (!post || post.chatId !== id || post.threadRootId) {
    return NextResponse.json({ error: 'Сообщение не найдено' }, { status: 404 })
  }

  const body = await req.json()
  const content = (body?.content || '').trim()
  const replyToId = body?.replyToId || null
  if (!content) {
    return NextResponse.json({ error: 'Пустое сообщение' }, { status: 400 })
  }

  // Validate reply target: must be a comment in the same thread (same root
  // post, lives in the discussion chat). Prevents setting replyToId to an
  // unrelated message.
  if (replyToId) {
    const replyTarget = await db.message.findUnique({
      where: { id: replyToId },
      select: { id: true, chatId: true, threadRootId: true },
    })
    if (
      !replyTarget ||
      replyTarget.chatId !== ctx.commentChatId ||
      replyTarget.threadRootId !== messageId
    ) {
      return NextResponse.json(
        { error: 'Недействительная цель ответа' },
        { status: 400 },
      )
    }
  }

  const discussionChatId = ctx.commentChatId

  let discussionMembership = await db.chatMember.findUnique({
    where: { userId_chatId: { userId: me.id, chatId: discussionChatId } },
  })
  if (!discussionMembership && ctx.chatType === 'channel') {
    // Best-effort auto-join. A race or a concurrently-deleted discussion
    // chat can make this throw P2003; never let it fail the request —
    // the actual comment write below will surface a meaningful error if
    // the discussion chat truly is gone.
    try {
      await db.chatMember.create({
        data: { userId: me.id, chatId: discussionChatId, role: 'member' },
      })
    } catch (e) {
      console.warn('[comments] auto-join discussion chat failed', {
        chatId: discussionChatId,
        userId: me.id,
        err: String(e),
      })
    }
  }

  const message = await db.message.create({
    data: {
      chatId: discussionChatId,
      senderId: me.id,
      content,
      type: 'text',
      threadRootId: messageId,
      replyToId: replyToId || null,
    },
    include: {
      sender: {
        select: { id: true, name: true, username: true, avatarColor: true, avatarUrl: true },
      },
      replyTo: {
        include: { sender: { select: { id: true, name: true } } },
      },
      reactions: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
  })

  await db.chat.update({
    where: { id: discussionChatId },
    data: { updatedAt: new Date() },
  })

  // Mention notifications: parse @username tokens in the comment text and
  // send a push to each resolved member of the discussion chat (excluding
  // the sender). Fire-and-forget so the response isn't delayed; wrapped in
  // try/catch so a push failure never breaks the actual comment creation.
  try {
    const mentionMatches: string[] = content.match(/@([a-zA-Z0-9_]{3,32})/g) || []
    const mentionUsernames: string[] = Array.from(
      new Set(mentionMatches.map((m) => m.slice(1).toLowerCase())),
    )
    if (mentionUsernames.length) {
      const mentioned = await db.user.findMany({
        where: {
          username: { in: mentionUsernames },
          id: { not: me.id },
        },
        select: { id: true, username: true },
      })
      if (mentioned.length) {
        const memberRows = await db.chatMember.findMany({
          where: {
            chatId: ctx.commentChatId,
            userId: { in: mentioned.map((u) => u.id) },
          },
          select: { userId: true },
        })
        const memberSet = new Set(memberRows.map((m) => m.userId))
        const { areUsersBlocked } = await import('@/lib/user-blocks')
        const { sendPushToUser } = await import('@/lib/push-server')
        for (const u of mentioned) {
          if (!memberSet.has(u.id)) continue
          if (await areUsersBlocked(me.id, u.id)) continue
          Promise.resolve(
            sendPushToUser(u.id, {
              title: me.name,
              body: `упомянул(а) вас: ${content.length > 120 ? content.slice(0, 120) + '…' : content}`,
              chatId: id,
            }),
          ).catch(() => {})
        }
      }
    }
  } catch (e) {
    console.warn('[comments] mention push failed', { err: String(e) })
  }

  return NextResponse.json({
    comment: {
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      sender: message.sender,
      content: message.content,
      type: message.type,
      replyToId: message.replyToId,
      replyTo: serializeReplyTo(message.replyTo),
      attachmentUrl: message.attachmentUrl,
      attachmentName: message.attachmentName,
      editedAt: message.editedAt,
      createdAt: message.createdAt,
      reactions: [],
    },
    postId: messageId,
    sourceChatId: id,
  })
})
