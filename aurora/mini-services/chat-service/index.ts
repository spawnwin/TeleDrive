import { createServer } from 'http'
import { Server, Socket } from 'socket.io'
import { getMessageInfo, getMessageReactions, isChatMember, setUserPresence, verifySessionToken } from '../shared/ws-auth'

const allowedOrigins = (
  process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000'
).split(',')

const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: {
    // Quick-tunnel URL меняется при каждом перезапуске cloudflared — regex
    // позволяет не обновлять CORS_ORIGINS и не перезапускать сервис.
    origin: [...allowedOrigins, /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/],
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// Map of socketId -> { userId, username, name, avatarColor }
const onlineUsers = new Map<
  string,
  { userId: string; username: string; name: string; avatarColor: string }
>()

// Map of userId -> Set of socketIds (one user may have multiple tabs)
const userSockets = new Map<string, Set<string>>()

// Periodically refresh `lastSeen` for every user with an active socket so the
// DB row stays "recent" while they're online. Without this, a long-connected
// but idle user has lastSeen frozen at connect time; if their socket later
// dies silently the UI falls back to a stale "был вчера" instead of "только
// что". 45s < pingTimeout (60s), so a live user is always fresh.
const PRESENCE_HEARTBEAT_MS = 45 * 1000
const presenceHeartbeat = setInterval(() => {
  for (const userId of userSockets.keys()) {
    void setUserPresence(userId, true)
  }
}, PRESENCE_HEARTBEAT_MS)
// Don't keep the Node process alive solely for the heartbeat timer.
void presenceHeartbeat.unref?.()

interface OutgoingMessage {
  id: string
  chatId: string
  senderId: string
  senderName: string
  senderUsername: string
  senderAvatarColor: string
  content: string
  type: string
  replyToId: string | null
  topicId?: string | null
  createdAt: string
}

interface EditedMessage {
  id: string
  chatId: string
  content: string
  editedAt: string
}

interface ReactionEvent {
  messageId: string
  chatId: string
  emoji: string
  userId: string
  action: 'added' | 'removed'
}

function getAuthUserId(socket: Socket): string | null {
  return (socket.data.userId as string | undefined) ?? null
}

/**
 * Membership gate for relay events: the socket must have joined the chat room
 * via chat:join, where membership is verified against the DB. Prevents
 * broadcasting into chats the sender doesn't belong to.
 */
function inChat(socket: Socket, chatId: string): boolean {
  return !!chatId && socket.rooms.has(`chat:${chatId}`)
}

io.on('connection', (socket) => {
  console.log(`[chat-service] Socket connected: ${socket.id}`)

  // User joins the global presence channel (requires valid session token)
  socket.on(
    'user:online',
    async (data: {
      token: string
      userId?: string
      username?: string
      name?: string
      avatarColor?: string
    }) => {
      const verified = await verifySessionToken(data.token)
      if (!verified) {
        socket.emit('user:online-ack', { ok: false, error: 'invalid token' })
        return
      }

      if (data.userId && data.userId !== verified.userId) {
        socket.emit('user:online-ack', { ok: false, error: 'userId mismatch' })
        return
      }

      const { userId, username, name, avatarColor } = verified
      socket.data.userId = userId
      onlineUsers.set(socket.id, { userId, username, name, avatarColor })

      if (!userSockets.has(userId)) userSockets.set(userId, new Set())
      const sockets = userSockets.get(userId)!
      const wasOffline = sockets.size === 0
      sockets.add(socket.id)

      if (wasOffline) {
        void setUserPresence(userId, true)
        io.emit('presence:update', { userId, online: true })
      }

      socket.emit('user:online-ack', { ok: true })
      socket.emit('presence:sync', { userIds: Array.from(userSockets.keys()) })
    },
  )

  // Join a chat room (must be authenticated and a member)
  socket.on('chat:join', async (chatId: string) => {
    const userId = getAuthUserId(socket)
    if (!userId) {
      socket.emit('chat:join-error', { chatId, error: 'not authenticated' })
      return
    }

    const member = await isChatMember(userId, chatId)
    if (!member) {
      socket.emit('chat:join-error', { chatId, error: 'not a member' })
      return
    }

    socket.join(`chat:${chatId}`)
    console.log(`[chat-service] socket ${socket.id} joined chat:${chatId}`)
  })

  socket.on('chat:leave', (chatId: string) => {
    socket.leave(`chat:${chatId}`)
  })

  socket.on(
    'typing:start',
    (data: { chatId: string; userId: string; name: string }) => {
      const userId = getAuthUserId(socket)
      if (!userId || data.userId !== userId) return
      if (!inChat(socket, data.chatId)) return
      socket.to(`chat:${data.chatId}`).emit('typing:start', {
        chatId: data.chatId,
        userId: data.userId,
        name: data.name,
      })
    },
  )

  socket.on('typing:stop', (data: { chatId: string; userId: string }) => {
    const userId = getAuthUserId(socket)
    if (!userId || data.userId !== userId) return
    if (!inChat(socket, data.chatId)) return
    socket.to(`chat:${data.chatId}`).emit('typing:stop', {
      chatId: data.chatId,
      userId: data.userId,
    })
  })

  // Relay a persisted message. The message must exist in the DB, belong to the
  // sender and to the claimed chat — content/type are re-read from the DB so a
  // client can't broadcast a payload that differs from what was persisted.
  // No room-presence check: forwarding targets chats the sender hasn't joined
  // in this session; the DB row itself proves the API accepted the message.
  const relayNewMessage = async (msg: OutgoingMessage) => {
    const userId = getAuthUserId(socket)
    if (!userId || msg.senderId !== userId) return

    const info = await getMessageInfo(msg.id)
    if (!info?.exists || info.senderId !== userId || info.chatId !== msg.chatId) return

    socket.to(`chat:${msg.chatId}`).emit('message:new', {
      ...msg,
      content: info.content ?? msg.content,
      type: info.type ?? msg.type,
    })
  }

  socket.on('message:send', relayNewMessage)
  socket.on('message:forwarded', relayNewMessage)

  socket.on('message:edited', async (data: EditedMessage) => {
    const userId = getAuthUserId(socket)
    if (!userId) return

    const info = await getMessageInfo(data.id)
    if (!info?.exists || info.senderId !== userId || info.chatId !== data.chatId) return

    socket.to(`chat:${data.chatId}`).emit('message:edited', {
      ...data,
      content: info.content ?? data.content,
      editedAt: info.editedAt ?? data.editedAt,
    })
  })

  socket.on('message:reaction', async (data: ReactionEvent) => {
    const userId = getAuthUserId(socket)
    if (!userId || data.userId !== userId) return
    if (!inChat(socket, data.chatId)) return
    // Ensure the message actually lives in this chat (prevents injecting
    // reaction events for arbitrary messageIds into a room the attacker is in).
    const info = await getMessageInfo(data.messageId)
    if (!info || info.chatId !== data.chatId) return
    socket.to(`chat:${data.chatId}`).emit('message:reaction', {
      messageId: data.messageId,
      chatId: data.chatId,
      emoji: data.emoji,
      userId,
      action: data.action === 'removed' ? 'removed' : 'added',
    })
  })

  // --- Comments (Telegram-style replies under channel/group posts) ---
  // Comments are persisted by the REST API (`POST /api/chats/:id/messages/:messageId/comments`)
  // and live in a discussion chat (channel) or the same chat (group). The client
  // emits these events after a successful REST call so other members see the
  // post's comment-count badge and (if the sheet is open) the new comment in
  // real time. The comment message itself is also relayed as `message:new` to
  // the discussion chat room so anyone viewing that group sees it appear.

  interface CommentPayload {
    id: string
    chatId: string // discussion chat where the comment message lives
    senderId: string
    [k: string]: unknown
  }

  socket.on(
    'comment:send',
    async (data: { sourceChatId: string; postId: string; comment: CommentPayload }) => {
      const userId = getAuthUserId(socket)
      if (!userId || data.comment.senderId !== userId) return
      if (!inChat(socket, data.sourceChatId) && !(await isChatMember(userId, data.sourceChatId))) {
        return
      }
      const info = await getMessageInfo(data.comment.id)
      if (!info?.exists || info.senderId !== userId || info.chatId !== data.comment.chatId) return

      // If the comment is a reply, verify the target is a comment in the same
      // thread (same discussion chat and same root post). The REST API already
      // enforced this when persisting; this is a defensive check against a
      // malicious client broadcasting a fabricated payload.
      const replyToId = (data.comment.replyToId as string | null | undefined) ?? null
      if (replyToId) {
        if (replyToId === info.threadRootId) return
        const target = await getMessageInfo(replyToId)
        if (
          !target?.exists ||
          target.chatId !== info.chatId ||
          target.threadRootId !== info.threadRootId
        ) {
          return
        }
      }

      socket.to(`chat:${data.sourceChatId}`).emit('comment:new', {
        postId: data.postId,
        comment: data.comment,
      })
      // Surface the comment as a regular message in its discussion chat too.
      socket.to(`chat:${data.comment.chatId}`).emit('message:new', data.comment)
    },
  )

  socket.on(
    'comment:delete',
    async (data: {
      sourceChatId: string
      postId: string
      commentId: string
      discussionChatId: string
    }) => {
      const userId = getAuthUserId(socket)
      if (!userId) return
      if (
        !inChat(socket, data.sourceChatId) &&
        !(await isChatMember(userId, data.sourceChatId))
      ) {
        return
      }
      // Like message:delete — the REST API deletes the comment (with auth)
      // before the client emits this. If the row still exists, only its author
      // may broadcast the deletion, so a member can't make others' comments
      // vanish for everyone.
      const info = await getMessageInfo(data.commentId)
      if (info?.exists && info.senderId !== userId) return

      socket.to(`chat:${data.sourceChatId}`).emit('comment:delete', {
        postId: data.postId,
        commentId: data.commentId,
      })
      socket.to(`chat:${data.discussionChatId}`).emit('message:deleted', {
        chatId: data.discussionChatId,
        messageId: data.commentId,
      })
    },
  )

  socket.on(
    'comment:reaction',
    async (data: {
      sourceChatId: string
      postId: string
      commentId: string
      reactions: { id: string; emoji: string; userId: string; userName: string }[]
    }) => {
      const userId = getAuthUserId(socket)
      if (!userId) return
      if (!inChat(socket, data.sourceChatId)) return
      // The client-supplied `reactions` array used to be relayed verbatim —
      // anyone with a valid session token could forge a reactions list
      // claiming any other userId reacted. Re-read the real state instead.
      const reactions = await getMessageReactions(data.commentId)
      if (reactions === null) return
      socket.to(`chat:${data.sourceChatId}`).emit('comment:reaction', {
        postId: data.postId,
        commentId: data.commentId,
        reactions,
      })
    },
  )

  socket.on(
    'message:favorite',
    (data: { messageId: string; chatId: string; userId: string; isFavorite: boolean }) => {
      const userId = getAuthUserId(socket)
      if (!userId || data.userId !== userId) return
      if (!inChat(socket, data.chatId)) return
      socket.to(`chat:${data.chatId}`).emit('message:favorite', data)
    },
  )

  socket.on('message:read', (data: { chatId: string; userId: string; lastReadAt?: string }) => {
    const userId = getAuthUserId(socket)
    if (!userId || data.userId !== userId) return
    if (!inChat(socket, data.chatId)) return
    const lastReadAt = data.lastReadAt || new Date().toISOString()
    socket.to(`chat:${data.chatId}`).emit('message:read', {
      chatId: data.chatId,
      userId: data.userId,
      lastReadAt,
    })
  })

  // The REST API deletes the message before the client emits this event, so a
  // legitimate delete means the message no longer exists in the DB. If it still
  // exists, only its author may broadcast the (stale) deletion event.
  socket.on('message:delete', async (data: { chatId: string; messageId: string }) => {
    const userId = getAuthUserId(socket)
    if (!userId) return
    // Deletion happens from the open chat; fall back to a DB membership check
    // for sockets that haven't joined the room (e.g. after reconnect).
    if (!inChat(socket, data.chatId) && !(await isChatMember(userId, data.chatId))) return

    const info = await getMessageInfo(data.messageId)
    if (info?.exists && info.senderId !== userId) return
    if (info?.exists && info.chatId !== data.chatId) return

    socket.to(`chat:${data.chatId}`).emit('message:deleted', {
      chatId: data.chatId,
      messageId: data.messageId,
    })
  })

  // Pin/unpin a message in group/channel — broadcast to all members in the chat room
  socket.on(
    'message:pinned',
    async (data: { chatId: string; messageId: string | null; pinnedMessage?: { id: string; content: string; type: string; senderName: string } | null }) => {
      const userId = getAuthUserId(socket)
      if (!userId) return
      if (!inChat(socket, data.chatId) && !(await isChatMember(userId, data.chatId))) return

      socket.to(`chat:${data.chatId}`).emit('message:pinned', {
        chatId: data.chatId,
        messageId: data.messageId,
        pinnedMessage: data.pinnedMessage ?? null,
      })
    },
  )

  socket.on('disconnect', () => {
    const user = onlineUsers.get(socket.id)
    if (user) {
      onlineUsers.delete(socket.id)
      const sockets = userSockets.get(user.userId)
      if (sockets) {
        sockets.delete(socket.id)
        if (sockets.size === 0) {
          userSockets.delete(user.userId)
          void setUserPresence(user.userId, false)
          io.emit('presence:update', { userId: user.userId, online: false })
        }
      }
    }
    console.log(`[chat-service] Socket disconnected: ${socket.id}`)
  })

  socket.on('error', (err) => {
    console.error(`[chat-service] socket error (${socket.id}):`, err)
  })
})

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`[chat-service] WebSocket server running on port ${PORT}`)
})

process.on('SIGTERM', () => {
  console.log('[chat-service] SIGTERM received, shutting down...')
  httpServer.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  console.log('[chat-service] SIGINT received, shutting down...')
  httpServer.close(() => process.exit(0))
})
