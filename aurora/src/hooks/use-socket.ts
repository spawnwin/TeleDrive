'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { fetchWsToken } from '@/lib/ws-token-client'

export interface MessageReaction {
  id: string
  emoji: string
  userId: string
  userName: string
}

export interface ChatMessage {
  id: string
  chatId: string
  senderId: string
  sender: {
    id: string
    name: string
    username: string
    avatarColor: string
    avatarUrl?: string | null
  }
  content: string
  type: string
  replyToId: string | null
  replyTo: {
    id: string
    content: string
    senderName: string
  } | null
  forwardedFromId: string | null
  forwardedFrom: {
    id: string
    senderName: string
    content: string
  } | null
  attachmentUrl: string | null
  attachmentName: string | null
  attachmentMime: string | null
  attachmentSize: number | null
  durationSec: number | null
  editedAt: string | null
  createdAt: string
  metadata?: string | null
  isFavorite?: boolean
  albumId?: string | null
  topicId?: string | null
  reactions: MessageReaction[]
  commentCount?: number
}

export interface EditedMessagePayload {
  id: string
  chatId: string
  content: string
  editedAt: string
}

export interface PinnedMessagePayload {
  chatId: string
  messageId: string | null
  pinnedMessage: { id: string; content: string; type: string; senderName: string } | null
}

export interface ReactionPayload {
  messageId: string
  chatId: string
  emoji: string
  userId: string
  userName: string
  action: 'added' | 'removed'
}

export interface CommentPayload {
  id: string
  chatId: string
  senderId: string
  sender: { id: string; name: string; username?: string; avatarColor: string; avatarUrl?: string | null }
  content: string
  type: string
  replyToId: string | null
  replyTo: { id: string; content: string; senderName: string } | null
  createdAt: string
  reactions: { id: string; emoji: string; userId: string; userName: string }[]
  [k: string]: unknown
}

export interface CommentNewEvent {
  postId: string
  comment: CommentPayload
}
export interface CommentDeleteEvent {
  postId: string
  commentId: string
}
export interface CommentReactionEvent {
  postId: string
  commentId: string
  reactions: { id: string; emoji: string; userId: string; userName: string }[]
}

interface UseSocketOptions {
  userId: string | null
  username: string | null
  name: string | null
  avatarColor: string | null
  onMessage: (msg: ChatMessage) => void
  onPresenceUpdate?: (data: { userId: string; online: boolean }) => void
  onPresenceSync?: (data: { userIds: string[] }) => void
  onTypingStart?: (data: { chatId: string; userId: string; name: string }) => void
  onTypingStop?: (data: { chatId: string; userId: string }) => void
  onMessageDeleted?: (data: { chatId: string; messageId: string }) => void
  onMessageRead?: (data: { chatId: string; userId: string; lastReadAt?: string }) => void
  onMessageEdited?: (data: EditedMessagePayload) => void
  onMessagePinned?: (data: PinnedMessagePayload) => void
  onReaction?: (data: ReactionPayload) => void
  onCommentNew?: (data: CommentNewEvent) => void
  onCommentDelete?: (data: CommentDeleteEvent) => void
  onCommentReaction?: (data: CommentReactionEvent) => void
}

export function useSocket(opts: UseSocketOptions) {
  const {
    userId,
    username,
    name,
    avatarColor,
    onMessage,
    onPresenceUpdate,
    onPresenceSync,
    onTypingStart,
    onTypingStop,
    onMessageDeleted,
    onMessageRead,
    onMessageEdited,
    onMessagePinned,
    onReaction,
    onCommentNew,
    onCommentDelete,
    onCommentReaction,
  } = opts

  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  // Keep display identity in a ref so profile renames don't tear down the socket.
  const identityRef = useRef({ name, avatarColor })
  useEffect(() => {
    identityRef.current = { name, avatarColor }
  }, [name, avatarColor])
  const callbacksRef = useRef({
    onMessage,
    onPresenceUpdate,
    onPresenceSync,
    onTypingStart,
    onTypingStop,
    onMessageDeleted,
    onMessageRead,
    onMessageEdited,
    onMessagePinned,
    onReaction,
    onCommentNew,
    onCommentDelete,
    onCommentReaction,
  })
  // Keep callbacks up to date without re-running the connection effect
  useEffect(() => {
    callbacksRef.current = {
      onMessage,
      onPresenceUpdate,
      onPresenceSync,
      onTypingStart,
      onTypingStop,
      onMessageDeleted,
      onMessageRead,
      onMessageEdited,
      onMessagePinned,
      onReaction,
      onCommentNew,
      onCommentDelete,
      onCommentReaction,
    }
  })

  useEffect(() => {
    if (!userId || !username) return

    const socket = io(process.env.NEXT_PUBLIC_CHAT_WS_URL || '/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 15000,
    })
    socketRef.current = socket

    socket.on('connect', async () => {
      const token = await fetchWsToken()
      if (!token) {
        // Don't permanently disconnect — retry after a short delay so a
        // transient auth blip doesn't kill the chat socket for the session.
        setTimeout(() => {
          if (socketRef.current === socket && !socket.connected) socket.connect()
        }, 2000)
        socket.disconnect()
        return
      }
      const id = identityRef.current
      socket.emit('user:online', {
        token,
        userId,
        username,
        name: id.name || username,
        avatarColor: id.avatarColor || '#7c3aed',
      })
    })

    socket.on('user:online-ack', (data: { ok?: boolean }) => {
      if (data?.ok) {
        setIsConnected(true)
      } else {
        setIsConnected(false)
        socket.disconnect()
      }
    })

    const joinRetryCount = new Map<string, number>()
    socket.on('chat:join-error', (data: { chatId?: string }) => {
      if (!data?.chatId) return
      const retries = (joinRetryCount.get(data.chatId) ?? 0) + 1
      joinRetryCount.set(data.chatId, retries)
      if (retries > 3) return
      setTimeout(() => {
        if (socket.connected) socket.emit('chat:join', data.chatId)
      }, 600 * retries)
    })

    socket.on('disconnect', () => setIsConnected(false))

    socket.on('message:new', (msg: ChatMessage) => {
      callbacksRef.current.onMessage(msg)
    })
    socket.on('presence:update', (data) => {
      callbacksRef.current.onPresenceUpdate?.(data)
    })
    socket.on('presence:sync', (data: { userIds: string[] }) => {
      callbacksRef.current.onPresenceSync?.(data)
    })
    socket.on('typing:start', (data) => {
      callbacksRef.current.onTypingStart?.(data)
    })
    socket.on('typing:stop', (data) => {
      callbacksRef.current.onTypingStop?.(data)
    })
    socket.on('message:deleted', (data) => {
      callbacksRef.current.onMessageDeleted?.(data)
    })
    socket.on('message:read', (data) => {
      callbacksRef.current.onMessageRead?.(data)
    })
    socket.on('message:edited', (data: EditedMessagePayload) => {
      callbacksRef.current.onMessageEdited?.(data)
    })
    socket.on('message:pinned', (data: PinnedMessagePayload) => {
      callbacksRef.current.onMessagePinned?.(data)
    })
    socket.on('message:reaction', (data: ReactionPayload) => {
      callbacksRef.current.onReaction?.(data)
    })
    socket.on('comment:new', (data: CommentNewEvent) => {
      callbacksRef.current.onCommentNew?.(data)
    })
    socket.on('comment:delete', (data: CommentDeleteEvent) => {
      callbacksRef.current.onCommentDelete?.(data)
    })
    socket.on('comment:reaction', (data: CommentReactionEvent) => {
      callbacksRef.current.onCommentReaction?.(data)
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [userId, username])

  const joinChat = useCallback((chatId: string) => {
    socketRef.current?.emit('chat:join', chatId)
  }, [])

  const leaveChat = useCallback((chatId: string) => {
    socketRef.current?.emit('chat:leave', chatId)
  }, [])

  const broadcastMessage = useCallback((msg: ChatMessage) => {
    socketRef.current?.emit('message:send', msg)
  }, [])

  const broadcastEdit = useCallback((data: EditedMessagePayload) => {
    socketRef.current?.emit('message:edited', data)
  }, [])

  const broadcastPin = useCallback((data: PinnedMessagePayload) => {
    socketRef.current?.emit('message:pinned', data)
  }, [])

  const broadcastReaction = useCallback((data: ReactionPayload) => {
    socketRef.current?.emit('message:reaction', data)
  }, [])

  const broadcastForward = useCallback((msg: ChatMessage) => {
    socketRef.current?.emit('message:forwarded', msg)
  }, [])

  const startTyping = useCallback(
    (chatId: string, uid: string, n: string) => {
      socketRef.current?.emit('typing:start', { chatId, userId: uid, name: n })
    },
    [],
  )

  const stopTyping = useCallback((chatId: string, uid: string) => {
    socketRef.current?.emit('typing:stop', { chatId, userId: uid })
  }, [])

  const markRead = useCallback((chatId: string, uid: string) => {
    socketRef.current?.emit('message:read', {
      chatId,
      userId: uid,
      lastReadAt: new Date().toISOString(),
    })
  }, [])

  const deleteMessage = useCallback((chatId: string, messageId: string) => {
    socketRef.current?.emit('message:delete', { chatId, messageId })
  }, [])

  const broadcastComment = useCallback(
    (data: { sourceChatId: string; postId: string; comment: CommentPayload }) => {
      socketRef.current?.emit('comment:send', data)
    },
    [],
  )

  const broadcastCommentDelete = useCallback(
    (data: {
      sourceChatId: string
      postId: string
      commentId: string
      discussionChatId: string
    }) => {
      socketRef.current?.emit('comment:delete', data)
    },
    [],
  )

  const broadcastCommentReaction = useCallback(
    (data: {
      sourceChatId: string
      postId: string
      commentId: string
      reactions: { id: string; emoji: string; userId: string; userName: string }[]
    }) => {
      socketRef.current?.emit('comment:reaction', data)
    },
    [],
  )

  return {
    isConnected,
    joinChat,
    leaveChat,
    broadcastMessage,
    broadcastEdit,
    broadcastPin,
    broadcastReaction,
    broadcastForward,
    startTyping,
    stopTyping,
    markRead,
    deleteMessage,
    broadcastComment,
    broadcastCommentDelete,
    broadcastCommentReaction,
  }
}
