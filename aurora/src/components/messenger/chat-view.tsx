'use client'

import { useEffect, useRef, useState, useCallback, useMemo, type PointerEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send,
  Smile,
  ArrowLeft,
  Phone,
  Video,
  MoreVertical,
  Trash2,
  Reply,
  X,
  Info,
  Paperclip,
  Pin,
  PinOff,
  BellOff,
  Bell,
  Search,
  Edit3,
  Copy,
  Check,
  CheckCheck,
  Star,
  Sticker as StickerIcon,
  StarOff,
  Forward,
  Share2,
  Mic,
  Archive,
  ArchiveRestore,
  Bookmark,
  Loader2,
  FileIcon,
  Lock,
  ShieldCheck,
  Video as VideoIcon,
  BarChart3,
  Maximize,
  MessageCircle,
  Gift,
  Palette,
  MapPin,
  Music,
  ImagePlus,
  ChevronDown,
  Hash,
  Camera,
} from 'lucide-react'
import { Avatar } from './avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet'
import { useAppStore } from '@/lib/store'
import type {
  ChatMessage,
  MessageReaction,
  ReactionPayload,
  EditedMessagePayload,
  CommentPayload,
} from '@/hooks/use-socket'
import { useSocket } from '@/hooks/use-socket'
import { usePush } from '@/hooks/use-push'
import { useI18n } from '@/hooks/use-i18n'
import { useE2EE } from '@/hooks/use-e2ee'
import { unlockNotificationAudio } from '@/lib/notification-sound'
import { CallMessageRow } from './call-message-row'
import { InAppNotifications } from './in-app-notifications'
import { VideoMessageRecorder } from './video-message-recorder'
import { VideoMessage } from './video-message'
import { ChatAnalytics } from './chat-analytics'
import {
  ChannelCommentsSheet,
  ChannelCommentsSheetHandle,
} from './channel-comments-sheet'
import { GiftPickerDialog } from './gift-picker-dialog'
import { GiftMessageBubble } from './gift-message-bubble'
import { StickerMessageBubble } from './sticker-message-bubble'
import { StickerPickerDialog } from './sticker-picker-dialog'
import { VoicePlayer } from './voice-player'
import { TypingDots } from './typing-dots'
import { FileAttachment } from './file-attachment'
import { ForwardDialog } from './forward-dialog'
import { ShareMessageCard } from './share-message-card'
import { ReadMoreText } from './read-more-text'
import { TopicList } from './topic-list'
import { CreateTopicDialog } from './create-topic-dialog'
import { buildLinkSharePayload, buildMessageSharePayload, parseShareMetadata, sharePreviewLabel } from '@/lib/share-payload'
import { openShareTarget } from '@/lib/open-share-target'
import { MediaLightbox } from './media-lightbox'
import { isImageUrl, isVideoUrl, resolveMediaUrl } from '@/lib/media-url'
import { callPreviewLabel, parseCallMetadata } from '@/lib/call-message'
import { isVideoFile, CHAT_ATTACHMENT_ACCEPT } from '@/lib/media-type'
import {
  canRecordVoiceInBrowser,
  createVoiceMediaRecorder,
  getAudioDurationSec,
  getGetUserMedia,
  WavVoiceRecorder,
} from '@/lib/voice-recorder'
import { formatMessageTime, formatDayDivider, formatLastSeen } from '@/lib/format'
import { isUserOnline } from '@/lib/friends-client'
import { getChatAvatarImageUrl } from '@/lib/chat-avatar'
import { canDeleteMessagesInChat, canEditMessagesInChat, canPinMessagesInChat, isChatAdmin } from '@/lib/chat-permissions'
import { EmojiStatusBadge } from './emoji-status-badge'
import { ChatWallpaperBackground } from './chat-wallpaper-bg'
import { ChatWallpaperDialog } from './chat-wallpaper-dialog'
import { DeleteConfirmDialog } from './delete-confirm-dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const EMOJI_SETS: Record<string, string[]> = {
  'Часто': ['😀', '😂', '🥰', '😍', '😎', '🤔', '🙃', '😴', '🥳', '😭', '😡', '👍', '👎', '👏', '🙏', '💪', '🔥', '✨', '🎉', '💜', '❤️', '🧡', '💛', '💚', '💙', '🤍', '🖤', '💯', '👀', '🤝'],
  'Жесты': ['👋', '🤚', '✋', '🖐️', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '👈', '👉', '👆', '👇', '☝️', '🫵', '🫱', '🫲', '🫳', '🫴', '✍️', '💪', '🦾', '🙌', '🫶'],
  'Животные': ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🦄', '🐝', '🦋', '🐢', '🐙', '🦕', '🐳', '🦈'],
  'Еда': ['🍕', '🍔', '🍟', '🌭', '🥪', '🌮', '🌯', '🥗', '🍝', '🍜', '🍣', '🍱', '🍛', '🥟', '🍩', '🍪', '🎂', '🍰', '🧁', '🍫', '🍬', '🍭', '🍯', '☕', '🍵', '🍺', '🍷', '🥂'],
  'Активности': ['⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🎱', '🏓', '🏸', '🥊', '🎯', '🎮', '🎲', '🎨', '🎭', '🎤', '🎧', '🎹', '🥁', '🎸', '🎻', '🏆', '🥇', '🥈', '🥉'],
  'Путешествия': ['🚗', '🚕', '🚙', '🏎️', '🚓', '🚑', '🚒', '✈️', '🚀', '🛸', '🚁', '⛵', '🚤', '🚲', '🛵', '🏍️', '🏰', '🌉', '⛰️', '🌋', '🏝️', '🏖️', '🌆', '🌃', '🌅'],
}

const QUICK_REACTIONS = ['👍', '❤️', '🔥', '😂', '🎉', '👏', '🙏', '😮']

interface ChatViewProps {
  onBack: () => void
  onShowInfo: () => void
}

export function ChatView({ onBack, onShowInfo }: ChatViewProps) {
  const { t, lang } = useI18n()
  const {
    activeChatId,
    chats,
    currentUser,
    onlineUserIds,
    presenceSynced,
    setActiveChat,
    markChatRead,
    updateLastMessage,
    setPresence,
    syncPresence,
    setChatPinned,
    setChatMuted,
    setChatArchived,
    pushEnabled,
    openVideoPlayer,
    setProfileUserId,
    openShareToChat,
    setMessageBroadcastFn,
    setAppendMessageFn,
    pendingMessageJump,
    clearPendingMessageJump,
    setPendingMessageJump,
    setPendingShortId,
    setView,
    setChats,
    webrtcStartCall,
    setTyping,
    clearTyping,
    clearChatTyping,
    setDraft,
    clearDraft,
    incrementUnread,
  } = useAppStore()

  const activeChat = chats.find((c) => c.id === activeChatId) || null

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [input, setInput] = useState('')
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null)
  const [typingUsers, setTypingUsers] = useState<Record<string, { name: string; ts: number }>>({})
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [activeEmojiSet, setActiveEmojiSet] = useState('Часто')
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null)
  const [forwardMessage, setForwardMessage] = useState<ChatMessage | null>(null)
  const [showFavorites, setShowFavorites] = useState(false)
  const [showVideoRecorder, setShowVideoRecorder] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [showStickerPicker, setShowStickerPicker] = useState(false)
  const [swipeBackOffset, setSwipeBackOffset] = useState(0)
  const [swipeBackAnimating, setSwipeBackAnimating] = useState(false)
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [showWallpaper, setShowWallpaper] = useState(false)
  const [commentsEnabled, setCommentsEnabled] = useState(false)
  const [isForum, setIsForum] = useState(false)
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null)
  const [showTopicList, setShowTopicList] = useState(false)
  const [showCreateTopic, setShowCreateTopic] = useState(false)
  const [pinnedMessage, setPinnedMessage] = useState<{
    id: string
    content: string
    type: string
    senderName: string
  } | null>(null)
  const [commentsFor, setCommentsFor] = useState<string | null>(null)
  const commentsSheetRef = useRef<ChannelCommentsSheetHandle>(null)
  const [showGiftPicker, setShowGiftPicker] = useState(false)
  const [myAdminMembership, setMyAdminMembership] = useState<{
    role: string
    canDeleteMessages?: boolean
    canPinMessages?: boolean
    canEditMessages?: boolean
  } | null>(null)

  // Delete confirmation dialog state
  const [deleteConfirmMsg, setDeleteConfirmMsg] = useState<ChatMessage | null>(null)
  const inputAreaRef = useRef<HTMLTextAreaElement>(null)

  // Right-click context menu state (mobile long-press + desktop right-click)
  const [contextMenu, setContextMenu] = useState<{
    msg: ChatMessage
    x: number
    y: number
  } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const wavRecorderRef = useRef<WavVoiceRecorder | null>(null)
  const recordingModeRef = useRef<'media' | 'wav' | null>(null)
  const recordMimeRef = useRef({ mimeType: 'audio/webm', ext: 'webm' })
  const voiceCanceledRef = useRef(false)
  const recordedChunksRef = useRef<Blob[]>([])
  const recordStreamRef = useRef<MediaStream | null>(null)
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordStartRef = useRef<number>(0)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const skipAutoScrollRef = useRef(false)
  const messagesRef = useRef<ChatMessage[]>([])
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  // Cleanup highlight timeout on unmount
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
    }
  }, [])
  const [showScrollFab, setShowScrollFab] = useState(false)
  const [belowViewportUnread, setBelowViewportUnread] = useState(0)
  const isAtBottomRef = useRef(true)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTypingSentRef = useRef<number>(0)
  const notifyRef = useRef<(title: string, body: string, chatId: string) => void>(() => {})
  const markReadRef = useRef<(chatId: string) => void>(() => {})
  const e2eeRef = useRef(false)
  const decryptRef = useRef<(s: string) => Promise<string>>(async (s) => s)
  const isEncryptedRef = useRef<(s: string) => boolean>(() => false)
  const sendingStickerRef = useRef(false)

  const onMessage = useCallback(
    (msg: ChatMessage) => {
      void (async () => {
        let display = msg
        if (
          e2eeRef.current &&
          msg.type === 'text' &&
          isEncryptedRef.current(msg.content)
        ) {
          try {
            const plain = await decryptRef.current(msg.content)
            display = { ...msg, content: plain }
          } catch {
            // keep ciphertext in UI
          }
        }

        if (!useAppStore.getState().chats.some((c) => c.id === msg.chatId)) {
          fetch('/api/chats')
            .then((res) => res.json())
            .then((data) => {
              if (data?.chats) useAppStore.getState().setChats(data.chats)
            })
            .catch(() => {})
        }
        setMessages((prev) => {
          if (msg.chatId !== activeChatId) return prev
          if (prev.some((m) => m.id === msg.id)) return prev
          return [...prev, display]
        })
        if (msg.chatId === activeChatId && msg.senderId !== currentUser?.id && !isAtBottomRef.current) {
          setBelowViewportUnread((n) => n + 1)
        }
        const sidebarPreview =
          display.content ||
          (isEncryptedRef.current(msg.content) ? '🔒 Зашифрованное сообщение' : messagePreview(display, t))
        updateLastMessage(msg.chatId, {
          id: msg.id,
          content: sidebarPreview,
          createdAt: msg.createdAt,
          senderName: msg.sender.name,
          senderId: msg.sender.id,
          type: msg.type,
          attachmentUrl: msg.attachmentUrl,
          attachmentName: msg.attachmentName,
          durationSec: msg.durationSec,
        })
        if (msg.senderId !== currentUser?.id) {
          clearTyping(msg.chatId, msg.senderId)
          const notifyBody =
            display.content ||
            (isEncryptedRef.current(msg.content) ? '🔒 Зашифрованное сообщение' : messagePreview(display, t))
          notifyRef.current(msg.sender.name, notifyBody, msg.chatId)
        }
        if (msg.chatId === activeChatId && msg.senderId !== currentUser?.id) {
          markChatRead(msg.chatId)
          markReadRef.current(msg.chatId)
        } else if (msg.chatId !== activeChatId && msg.senderId !== currentUser?.id) {
          incrementUnread(msg.chatId)
        }
      })()
    },
    [activeChatId, currentUser?.id, markChatRead, updateLastMessage, clearTyping, incrementUnread, t],
  )

  const onMessageDeleted = useCallback(
    (data: { chatId: string; messageId: string }) => {
      if (data.chatId !== activeChatId) return
      setMessages((prev) => prev.filter((m) => m.id !== data.messageId))
    },
    [activeChatId],
  )

  const onMessageEdited = useCallback(
    (data: EditedMessagePayload) => {
      if (data.chatId !== activeChatId) return
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.id
            ? { ...m, content: data.content, editedAt: data.editedAt }
            : m,
        ),
      )
    },
    [activeChatId],
  )

  const onReaction = useCallback(
    (data: ReactionPayload) => {
      if (data.chatId !== activeChatId) return
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== data.messageId) return m
          let reactions = m.reactions || []
          if (data.action === 'added') {
            reactions = reactions.filter((r) => r.userId !== data.userId)
            reactions = [
              ...reactions,
              { id: `${data.messageId}-${data.userId}`, emoji: data.emoji, userId: data.userId, userName: data.userName },
            ]
          } else {
            reactions = reactions.filter(
              (r) => !(r.userId === data.userId && r.emoji === data.emoji),
            )
          }
          return { ...m, reactions }
        }),
      )
    },
    [activeChatId],
  )

  // Live comment updates: bump the post's comment-count badge and, if the
  // comments sheet is open for that post, push the change into the sheet.
  const onCommentNew = useCallback(
    (data: { postId: string; comment: CommentPayload }) => {
      const isMine = data.comment.senderId === currentUser?.id
      // The sender already bumped the count optimistically on POST success,
      // so only other members bump the badge here.
      if (!isMine && data.postId !== commentsFor) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.postId
              ? { ...m, commentCount: (m.commentCount ?? 0) + 1 }
              : m,
          ),
        )
      }
      if (data.postId === commentsFor) {
        commentsSheetRef.current?.appendComment(data.comment as never)
      }
    },
    [commentsFor, currentUser?.id],
  )

  const onCommentDelete = useCallback(
    (data: { postId: string; commentId: string }) => {
      if (data.postId !== commentsFor) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.postId
              ? { ...m, commentCount: Math.max(0, (m.commentCount ?? 0) - 1) }
              : m,
          ),
        )
      } else {
        commentsSheetRef.current?.removeComment(data.commentId)
      }
    },
    [commentsFor],
  )

  const onCommentReaction = useCallback(
    (data: {
      postId: string
      commentId: string
      reactions: { id: string; emoji: string; userId: string; userName: string }[]
    }) => {
      if (data.postId !== commentsFor) return
      commentsSheetRef.current?.setReactions(data.commentId, data.reactions)
    },
    [commentsFor],
  )

  const onTypingStart = useCallback(
    (data: { chatId: string; userId: string; name: string }) => {
      if (data.userId === currentUser?.id) return
      // Update global typing (for the chat list) for any chat…
      setTyping(data.chatId, data.userId, data.name)
      // …and the local header state when it's the active chat.
      if (data.chatId !== activeChatId) return
      setTypingUsers((prev) => ({
        ...prev,
        [data.userId]: { name: data.name, ts: Date.now() },
      }))
    },
    [activeChatId, currentUser?.id, setTyping],
  )

  const onTypingStop = useCallback(
    (data: { chatId: string; userId: string }) => {
      clearTyping(data.chatId, data.userId)
      setTypingUsers((prev) => {
        const copy = { ...prev }
        delete copy[data.userId]
        return copy
      })
    },
    [clearTyping],
  )

  const onPresenceUpdate = useCallback(
    (data: { userId: string; online: boolean }) => {
      setPresence(data.userId, data.online)
    },
    [setPresence],
  )

  const onPresenceSync = useCallback(
    (data: { userIds: string[] }) => {
      syncPresence(data.userIds)
    },
    [syncPresence],
  )

  const onMessagePinned = useCallback(
    (data: { chatId: string; messageId: string | null; pinnedMessage: { id: string; content: string; type: string; senderName: string } | null }) => {
      if (data.chatId !== activeChatId) return
      setPinnedMessage(data.pinnedMessage)
    },
    [activeChatId],
  )

  const socket = useSocket({
    userId: currentUser?.id ?? null,
    username: currentUser?.username ?? null,
    name: currentUser?.name ?? null,
    avatarColor: currentUser?.avatarColor ?? null,
    onMessage,
    onPresenceUpdate,
    onPresenceSync,
    onTypingStart,
    onTypingStop,
    onMessageDeleted,
    onMessageEdited,
    onMessagePinned,
    onReaction,
    onCommentNew,
    onCommentDelete,
    onCommentReaction,
  })

  useEffect(() => {
    setMessageBroadcastFn((msg) => socket.broadcastMessage(msg))
    return () => setMessageBroadcastFn(null)
  }, [socket.broadcastMessage, setMessageBroadcastFn])

  useEffect(() => {
    setAppendMessageFn((msg) => {
      if (msg.chatId === activeChatId) {
        setMessages((prev) =>
          prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
        )
      }
    })
    return () => setAppendMessageFn(null)
  }, [activeChatId, setAppendMessageFn])

  const { notify, inAppNotifications, dismissNotification, clickNotification } = usePush({
    userId: currentUser?.id ?? null,
    enabled: pushEnabled,
    onMessage: (_title, _body, chatId) => {
      setActiveChat(chatId)
    },
  })

  const { e2eeEnabled, encryptMessage, decryptMessage, isEncrypted } = useE2EE()

  useEffect(() => {
    e2eeRef.current = e2eeEnabled
    decryptRef.current = decryptMessage
    isEncryptedRef.current = isEncrypted
  }, [e2eeEnabled, decryptMessage, isEncrypted])

  const encryptPrivateContent = useCallback(
    async (plaintext: string): Promise<{ content: string; encrypted: boolean }> => {
      if (!e2eeEnabled || activeChat?.type !== 'private' || !currentUser?.publicKey || !activeChatId) {
        return { content: plaintext, encrypted: false }
      }
      const membersRes = await fetch(`/api/chats/${activeChatId}/members`)
      const membersData = await membersRes.json()
      const recipientWithKey = membersData.chat?.members?.find(
        (m: { id: string; publicKey?: string | null }) => m.id !== currentUser.id,
      )
      if (!recipientWithKey?.publicKey) {
        return { content: plaintext, encrypted: false }
      }
      const sendContent = await encryptMessage(
        plaintext,
        recipientWithKey.publicKey,
        recipientWithKey.id,
        currentUser.publicKey,
        currentUser.id,
      )
      return { content: sendContent, encrypted: true }
    },
    [e2eeEnabled, activeChat?.type, activeChatId, currentUser, encryptMessage],
  )

  const handleStartCall = (type: 'audio' | 'video') => {
    if (!activeChat || activeChat.type !== 'private') return
    const peer = activeChat.members.find((m) => m.id !== currentUser?.id)
    if (!peer) return
    unlockNotificationAudio()
    webrtcStartCall?.(peer.id, peer.name, peer.avatarColor, peer.avatarUrl || null, type)
  }

  // Swipe-right-to-go-back (mobile, Telegram-style). Keep transient movement
  // in a ref so pointermove does not depend on state timing.
  const swipeTrackingRef = useRef<{
    startX: number
    startY: number
    pointerId: number
    active: boolean
    decided: boolean
    lastDx: number
  } | null>(null)
  const SWIPE_BACK_EDGE = 96
  const SWIPE_BACK_THRESHOLD = 90

  const handleChatPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (swipeBackAnimating || typeof window === 'undefined' || window.innerWidth >= 1024) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (e.clientX > SWIPE_BACK_EDGE) return
    const target = e.target as HTMLElement
    if (target.closest('button,a,input,textarea,[role="button"]')) return

    swipeTrackingRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      active: false,
      decided: false,
      lastDx: 0,
    }
  }

  const handleChatPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const tracking = swipeTrackingRef.current
    if (!tracking || tracking.pointerId !== e.pointerId) return
    const dx = e.clientX - tracking.startX
    const dy = e.clientY - tracking.startY

    if (!tracking.decided) {
      // Wait for a deliberate move before committing — avoids hijacking taps
      // and vertical scrolling of the message list.
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      tracking.decided = true
      tracking.active = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.2
      if (!tracking.active) return
      e.currentTarget.setPointerCapture?.(e.pointerId)
    }
    if (!tracking.active) return

    e.preventDefault()
    const nextOffset = Math.max(0, Math.min(dx, window.innerWidth))
    tracking.lastDx = nextOffset
    setSwipeBackOffset(nextOffset)
  }

  const handleChatPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const tracking = swipeTrackingRef.current
    if (tracking && tracking.pointerId !== e.pointerId) return
    swipeTrackingRef.current = null
    if (!tracking?.active) {
      setSwipeBackOffset(0)
      return
    }
    e.currentTarget.releasePointerCapture?.(e.pointerId)

    const shouldGoBack = tracking.lastDx > SWIPE_BACK_THRESHOLD
    setSwipeBackAnimating(true)
    // Either finish the exit slide or spring back — both via CSS transition,
    // then reset for the next chat (or the one we just left, briefly hidden).
    setSwipeBackOffset(shouldGoBack ? window.innerWidth : 0)
    window.setTimeout(() => {
      if (shouldGoBack) onBack()
      setSwipeBackOffset(0)
      setSwipeBackAnimating(false)
    }, shouldGoBack ? 140 : 220)
  }

  useEffect(() => {
    swipeTrackingRef.current = null
    setSwipeBackOffset(0)
    setSwipeBackAnimating(false)
  }, [activeChatId])

  // Fetch peer's public key to determine if E2EE is active for this chat
  const [peerHasPublicKey, setPeerHasPublicKey] = useState(false)
  useEffect(() => {
    if (!activeChatId || !activeChat || activeChat.type !== 'private') {
      setPeerHasPublicKey(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/chats/${activeChatId}/members`)
        const data = await res.json()
        if (cancelled) return
        const peer = data.chat?.members?.find((m: any) => m.id !== currentUser?.id)
        setPeerHasPublicKey(!!peer?.publicKey)
      } catch {
        setPeerHasPublicKey(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeChatId, activeChat, currentUser?.id])

  const isChatEncrypted = e2eeEnabled && activeChat?.type === 'private' && peerHasPublicKey

  // Decrypt messages after any load path: initial load, search, favorites,
  // jump-to-message pagination, gifts, and forwarded messages all replace the
  // message array independently.
  // Track the last-decrypted message set to break the dependency cycle: without
  // this guard, setMessages creates a new array reference → messages changes →
  // effect re-runs → infinite loop when isEncrypted produces a false positive
  // on valid JSON content.
  const lastDecryptedIdsRef = useRef<string>('')
  useEffect(() => {
    if (!e2eeEnabled || messages.length === 0) return
    const hasEncryptedText = messages.some((m) => m.type === 'text' && isEncrypted(m.content))
    if (!hasEncryptedText) return
    const idsSig = messages.map((m) => m.id).join(',')
    if (idsSig === lastDecryptedIdsRef.current) return
    let cancelled = false
    ;(async () => {
      const decrypted = await Promise.all(
        messages.map(async (m) => {
          if (m.type !== 'text' || !isEncrypted(m.content)) return m
          try {
            const plaintext = await decryptMessage(m.content)
            return { ...m, content: plaintext }
          } catch {
            return { ...m, content: '🔒 Зашифрованное сообщение' }
          }
        }),
      )
      if (cancelled) return
      lastDecryptedIdsRef.current = idsSig
      setMessages(decrypted)
    })()
    return () => {
      cancelled = true
    }
  }, [e2eeEnabled, messages, decryptMessage, isEncrypted])

  // Join ALL chat rooms on connect so we receive typing indicators and live
  // last-message updates for every chat (Telegram-style chat list). We never
  // leave rooms on active-chat switch — membership is verified server-side.
  const chatIdsSig = useMemo(() => chats.map((c) => c.id).join('|'), [chats])
  useEffect(() => {
    if (!socket.isConnected || !chatIdsSig) return
    for (const id of chatIdsSig.split('|')) {
      if (id) socket.joinChat(id)
    }
  }, [chatIdsSig, socket.isConnected, socket.joinChat])

  // Load messages when chat changes
  useEffect(() => {
    if (!activeChatId) {
      setMessages([])
      return
    }
    let cancelled = false
    setLoadingMessages(true)
    setMessages([])
    setReplyTo(null)
    setEditingMessage(null)
    setTypingUsers({})
    setShowSearch(false)
    setSearchQuery('')
    setShowFavorites(false)
    setCommentsEnabled(false)
    setIsForum(false)
    setActiveTopicId(null)
    setShowTopicList(false)
    setPinnedMessage(null)
    setCommentsFor(null)
    setMyAdminMembership(null)
    // Restore any saved draft for this chat (Telegram-style) and stop showing
    // typing for the chat we just opened (the list no longer needs it).
    setInput(useAppStore.getState().drafts[activeChatId] ?? '')
    clearChatTyping(activeChatId)
    fetch(`/api/chats/${activeChatId}/messages?take=50`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        setMessages(data.messages || [])
        setCommentsEnabled(!!data.commentsEnabled)
        setIsForum(!!data.isForum)
        setPinnedMessage(data.pinnedMessage ?? null)
        markChatRead(activeChatId)
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false)
      })
    fetch(`/api/chats/${activeChatId}/members?take=1`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setMyAdminMembership(data.myMembership ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [activeChatId, markChatRead, clearChatTyping])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const scrollAndHighlightMessage = useCallback((messageId: string) => {
    skipAutoScrollRef.current = true
    setHighlightedMessageId(messageId)
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
    requestAnimationFrame(() => {
      document.getElementById(`message-${messageId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    })
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedMessageId(null)
      highlightTimeoutRef.current = null
    }, 2000)
  }, [])

  // Threshold in px: if the user is within this distance of the bottom we
  // consider them "at the bottom" (covers fractional rounding / sub-pixel gaps).
  const BOTTOM_THRESHOLD = 80

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
    isAtBottomRef.current = true
    setShowScrollFab(false)
    setBelowViewportUnread(0)
  }, [])

  const handleMessagesScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - BOTTOM_THRESHOLD
    isAtBottomRef.current = atBottom
    setShowScrollFab(!atBottom)
    if (atBottom) {
      setBelowViewportUnread(0)
    }
  }, [])

  const jumpToMessage = useCallback(
    async (messageId: string) => {
      if (!activeChatId) return

      let current = messagesRef.current
      if (current.some((m) => m.id === messageId)) {
        scrollAndHighlightMessage(messageId)
        return
      }

      skipAutoScrollRef.current = true
      let cursor = current[0]?.id
      if (!cursor) {
        toast.error(t('msg.notFound'))
        return
      }

      const MAX_PAGES = 20
      let pageCount = 0
      while (pageCount < MAX_PAGES) {
        pageCount++
        const res = await fetch(
          `/api/chats/${activeChatId}/messages?cursor=${cursor}&take=50`,
        )
        const data = await res.json()
        const older: ChatMessage[] = data.messages || []
        if (older.length === 0) break

        current = [...older, ...current]
        messagesRef.current = current

        if (current.some((m) => m.id === messageId)) {
          const container = scrollRef.current
          const prevScrollHeight = container?.scrollHeight ?? 0
          const prevScrollTop = container?.scrollTop ?? 0

          setMessages(current)
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (container) {
                container.scrollTop =
                  prevScrollTop + (container.scrollHeight - prevScrollHeight)
              }
              scrollAndHighlightMessage(messageId)
            })
          })
          return
        }

        if (older.length < 50) break
        cursor = older[0].id
      }

      toast.error(t('msg.notFound'))
    },
    [activeChatId, scrollAndHighlightMessage, t],
  )

  useEffect(() => {
    if (!pendingMessageJump || pendingMessageJump.chatId !== activeChatId) return
    if (loadingMessages) return
    const { messageId } = pendingMessageJump
    clearPendingMessageJump()
    void jumpToMessage(messageId)
  }, [pendingMessageJump, activeChatId, loadingMessages, jumpToMessage, clearPendingMessageJump])

  const handleLinkClick = useCallback(
    (url: string) => {
      openShareTarget(buildLinkSharePayload(url), {
        setView,
        setProfileUserId,
        setPendingShortId,
        setActiveChat,
        setPendingMessageJump,
        openVideoPlayer,
        setChats,
      })
    },
    [
      setView,
      setProfileUserId,
      setPendingShortId,
      setActiveChat,
      setPendingMessageJump,
      openVideoPlayer,
      setChats,
    ],
  )

  // Auto-scroll to bottom on new messages. Must wait for loadingMessages to
  // flip off: while it's true the container renders a spinner instead of the
  // messages, so scrolling then would leave the opened chat stuck at the top.
  useEffect(() => {
    if (!scrollRef.current || searchQuery || showFavorites || loadingMessages) return
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false
      return
    }
    // Don't yank the user back down if they've scrolled up to read history;
    // the floating scroll-to-bottom FAB will surface the new messages instead.
    if (!isAtBottomRef.current) return
    const el = scrollRef.current
    const toBottom = () => {
      el.scrollTop = el.scrollHeight
    }
    toBottom()
    // Re-anchor after async media (images, voice players) expands the content.
    requestAnimationFrame(toBottom)
    const timer = setTimeout(toBottom, 250)
    return () => clearTimeout(timer)
  }, [messages, activeChatId, searchQuery, showFavorites, loadingMessages])

  // Reset the scroll-position + FAB state when switching chats.
  useEffect(() => {
    isAtBottomRef.current = true
    setShowScrollFab(false)
    setBelowViewportUnread(0)
  }, [activeChatId])

  // Clear stale typing indicators
  useEffect(() => {
    const interval = setInterval(() => {
      setTypingUsers((prev) => {
        const now = Date.now()
        const copy: typeof prev = {}
        for (const [k, v] of Object.entries(prev)) {
          if (now - v.ts < 4000) copy[k] = v
        }
        return copy
      })
    }, 1500)
    return () => clearInterval(interval)
  }, [])

  const sendMessage = async (overrideContent?: string) => {
    const content = (overrideContent ?? input).trim()
    if (!content || !activeChatId || !currentUser) return

    // Editing existing message
    if (editingMessage) {
      try {
        const { content: sendContent, encrypted: wasEncrypted } = await encryptPrivateContent(content)
        const res = await fetch(
          `/api/chats/${activeChatId}/messages/${editingMessage.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: sendContent }),
          },
        )
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || t('misc.error'))
        const edited = data.message
        const displayContent = wasEncrypted ? content : edited.content
        setMessages((prev) =>
          prev.map((m) =>
            m.id === edited.id
              ? { ...m, content: displayContent, editedAt: edited.editedAt }
              : m,
          ),
        )
        socket.broadcastEdit({
          id: edited.id,
          chatId: activeChatId,
          content: edited.content,
          editedAt: edited.editedAt,
        })
        setEditingMessage(null)
        setInput('')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('msg.errorSave'))
      }
      return
    }

    setInput('')
    setReplyTo(null)
    clearDraft(activeChatId)
    try {
      const { content: sendContent, encrypted: wasEncrypted } = await encryptPrivateContent(content)

      const res = await fetch(`/api/chats/${activeChatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: sendContent, replyToId: replyTo?.id || null, topicId: activeTopicId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      const newMsg: ChatMessage = data.message
      // Show the plaintext in the UI even though we sent ciphertext
      const displayMsg = wasEncrypted ? { ...newMsg, content } : newMsg
      setMessages((prev) => [...prev, displayMsg])
      updateLastMessage(activeChatId, {
        id: newMsg.id,
        content: wasEncrypted ? content : newMsg.content,
        createdAt: newMsg.createdAt,
        senderName: newMsg.sender.name,
        senderId: newMsg.sender.id,
        type: newMsg.type,
      })
      socket.broadcastMessage(newMsg)
      socket.stopTyping(activeChatId, currentUser.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('msg.errorSend'))
      setInput(content)
    }
  }

  const handleInputChange = (v: string) => {
    setInput(v)
    // Telegram-style auto-grow
    requestAnimationFrame(() => {
      const el = inputAreaRef.current
      if (!el) return
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 128)}px`
    })
    if (editingMessage) return
    if (activeChatId) setDraft(activeChatId, v)
    if (!activeChatId || !currentUser) return
    const now = Date.now()
    if (now - lastTypingSentRef.current > 1500 && v.trim()) {
      socket.startTyping(activeChatId, currentUser.id, currentUser.name)
      lastTypingSentRef.current = now
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    // Capture the current chatId so the timeout fires for the correct chat,
    // even if the user switches chats before the 2-second timer elapses.
    const chatIdForTimer = activeChatId
    typingTimerRef.current = setTimeout(() => {
      socket.stopTyping(chatIdForTimer, currentUser.id)
      lastTypingSentRef.current = 0
    }, 2000)
  }

  const markRead = useCallback((chatId: string) => {
    if (!currentUser) return
    socket.markRead(chatId, currentUser.id)
  }, [currentUser, socket.markRead])

  useEffect(() => {
    notifyRef.current = notify
    markReadRef.current = markRead
  }, [notify, markRead])

  const deleteMessage = (msg: ChatMessage) => {
    setDeleteConfirmMsg(msg)
  }

  const confirmDelete = async (forEveryone: boolean) => {
    if (!activeChatId || !deleteConfirmMsg) return
    const msgId = deleteConfirmMsg.id
    try {
      const res = await fetch(`/api/chats/${activeChatId}/messages?messageId=${msgId}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || t('msg.errorDelete'))
        return
      }
      setMessages((prev) => prev.filter((m) => m.id !== msgId))
      if (pinnedMessage?.id === msgId) setPinnedMessage(null)
      if (forEveryone) {
        socket.deleteMessage(activeChatId, msgId)
      }
      toast.success(t('msg.deleted'))
    } catch {
      toast.error(t('msg.errorDelete'))
    }
    setDeleteConfirmMsg(null)
  }

  const pinMessage = async (msgId: string, pinned: boolean) => {
    if (!activeChatId) return
    try {
      const res = await fetch(`/api/chats/${activeChatId}/messages/${msgId}/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      let pinnedMsgData: { id: string; content: string; type: string; senderName: string } | null = null
      if (pinned) {
        const msg = messages.find((m) => m.id === msgId)
        if (msg) {
          pinnedMsgData = {
            id: msg.id,
            content: msg.content,
            type: msg.type,
            senderName: msg.sender.name,
          }
          setPinnedMessage(pinnedMsgData)
        }
      } else {
        setPinnedMessage(null)
      }
      socket.broadcastPin({
        chatId: activeChatId,
        messageId: pinned ? msgId : null,
        pinnedMessage: pinnedMsgData,
      })
      toast.success(pinned ? t('msg.pinned') : t('msg.unpinned'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    }
  }

  const bumpCommentCount = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, commentCount: (m.commentCount ?? 0) + 1 } : m,
      ),
    )
  }

  const copyMessage = (msg: ChatMessage) => {
    const text =
      msg.content ||
      resolveMediaUrl(msg.attachmentUrl) ||
      msg.attachmentUrl ||
      ''
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      toast.success(t('msg.copied'))
    })
  }

  const toggleReaction = async (msg: ChatMessage, emoji: string) => {
    if (!activeChatId || !currentUser) return
    try {
      const res = await fetch(
        `/api/chats/${activeChatId}/messages/${msg.id}/reactions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji }),
        },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      const action: 'added' | 'removed' = data.action
      socket.broadcastReaction({
        messageId: msg.id,
        chatId: activeChatId,
        emoji,
        userId: currentUser.id,
        userName: currentUser.name,
        action,
      })
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== msg.id) return m
          let reactions = m.reactions || []
          if (action === 'added') {
            reactions = reactions.filter((r) => r.userId !== currentUser.id)
            reactions = [
              ...reactions,
              { id: `${m.id}-${currentUser.id}`, emoji, userId: currentUser.id, userName: currentUser.name },
            ]
          } else {
            reactions = reactions.filter(
              (r) => !(r.userId === currentUser.id && r.emoji === emoji),
            )
          }
          return { ...m, reactions }
        }),
      )
    } catch {
      toast.error(t('msg.errorReaction'))
    }
  }

  const toggleFavorite = async (msg: ChatMessage) => {
    try {
      const res = await fetch(`/api/messages/${msg.id}/favorite`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      const isFav = data.isFavorite
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, isFavorite: isFav } : m,
        ),
      )
      if (isFav && data.savedChatId && data.savedMessage) {
        updateLastMessage(data.savedChatId, {
          id: data.savedMessage.id,
          content: data.savedMessage.content,
          createdAt: data.savedMessage.createdAt,
          senderName: currentUser?.name || t('msg.you'),
          senderId: data.savedMessage.senderId,
          type: data.savedMessage.type,
          attachmentUrl: data.savedMessage.attachmentUrl,
          attachmentName: data.savedMessage.attachmentName,
          durationSec: data.savedMessage.durationSec,
        })
      }
      toast.success(isFav ? t('msg.favorited') : t('msg.unfavorited'))
    } catch {
      toast.error(t('misc.error'))
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0 || !activeChatId || !currentUser) return
    // Snapshot into a plain array BEFORE resetting the input: the FileList
    // returned by input.files is a live object and setting value='' empties
    // the same reference, which would leave files[0] undefined / Array.from([]).
    const files = Array.from(fileList)
    e.target.value = ''
    if (files.length === 1) {
      // Stage single file for preview + caption
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl)
      setPendingFile(files[0])
      setPendingPreviewUrl(URL.createObjectURL(files[0]))
    } else {
      await uploadAndSendAlbum(files)
    }
  }

  const sendLocation = () => {
    setShowAttachMenu(false)
    if (!navigator.geolocation) {
      toast.error(t('composer.locationUnsupported'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        const link = `https://maps.google.com/?q=${latitude},${longitude}`
        void sendMessage(link)
      },
      () => toast.error(t('composer.locationDenied')),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const uploadAndSend = async (file: File) => {
    if (!activeChatId) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/uploads', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('composer.errorUploadFailed'))

      const isImage = data.isImage
      const isVoice = data.isVoice
      const isVideo = data.isVideo || isVideoFile({ type: file.type, name: file.name })
      const voiceDurationSec = isVoice ? await getAudioDurationSec(file) : null

      // Include caption text with the uploaded file
      const caption = input.trim()
      setInput('')
      setReplyTo(null)
      clearDraft(activeChatId)

      const msgRes = await fetch(`/api/chats/${activeChatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: caption,
          replyToId: replyTo?.id || null,
          attachmentUrl: data.url,
          attachmentName: data.name,
          attachmentMime: data.type,
          attachmentSize: data.size,
          forceImage: isImage,
          forceVideoAttachment: isVideo && !isVoice,
          durationSec: voiceDurationSec,
          topicId: activeTopicId,
        }),
      })
      const msgData = await msgRes.json()
      if (!msgRes.ok) throw new Error(msgData.error || t('composer.errorSendFailed'))
      const newMsg: ChatMessage = msgData.message
      setReplyTo(null)
      setMessages((prev) => [...prev, newMsg])
      updateLastMessage(activeChatId, {
        id: newMsg.id,
        content: messagePreview(newMsg, t),
        createdAt: newMsg.createdAt,
        senderName: newMsg.sender.name,
        senderId: newMsg.sender.id,
        type: newMsg.type,
        attachmentUrl: newMsg.attachmentUrl,
        attachmentName: newMsg.attachmentName,
        durationSec: newMsg.durationSec,
      })
      socket.broadcastMessage(newMsg)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('composer.errorUpload'))
    } finally {
      setUploading(false)
    }
  }

  const cancelPendingFile = () => {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl)
    setPendingFile(null)
    setPendingPreviewUrl(null)
  }

  const confirmSendPendingFile = async () => {
    if (!pendingFile || !activeChatId || !currentUser) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', pendingFile)
      const res = await fetch('/api/uploads', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('composer.errorUploadFailed'))

      const isImage = data.isImage
      const isVoice = data.isVoice
      const isVideo = data.isVideo || isVideoFile({ type: pendingFile.type, name: pendingFile.name })
      const voiceDurationSec = isVoice ? await getAudioDurationSec(pendingFile) : null
      const caption = input.trim()

      const msgRes = await fetch(`/api/chats/${activeChatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: caption,
          replyToId: replyTo?.id || null,
          attachmentUrl: data.url,
          attachmentName: data.name,
          attachmentMime: data.type,
          attachmentSize: data.size,
          forceImage: isImage,
          forceVideoAttachment: isVideo && !isVoice,
          durationSec: voiceDurationSec,
          topicId: activeTopicId,
        }),
      })
      const msgData = await msgRes.json()
      if (!msgRes.ok) throw new Error(msgData.error || t('composer.errorSendFailed'))
      const newMsg: ChatMessage = msgData.message
      setReplyTo(null)
      setInput('')
      setMessages((prev) => [...prev, newMsg])
      updateLastMessage(activeChatId, {
        id: newMsg.id,
        content: messagePreview(newMsg, t),
        createdAt: newMsg.createdAt,
        senderName: newMsg.sender.name,
        senderId: newMsg.sender.id,
        type: newMsg.type,
        attachmentUrl: newMsg.attachmentUrl,
        attachmentName: newMsg.attachmentName,
        durationSec: newMsg.durationSec,
      })
      socket.broadcastMessage(newMsg)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('composer.errorUpload'))
    } finally {
      setUploading(false)
      cancelPendingFile()
    }
  }

  const sendSticker = async (sticker: { imageUrl: string; emoji: string }) => {
    if (!activeChatId || sendingStickerRef.current) return
    sendingStickerRef.current = true
    const chatId = activeChatId
    setShowStickerPicker(false)
    try {
      const res = await fetch(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: '',
          replyToId: replyTo?.id || null,
          attachmentUrl: sticker.imageUrl,
          attachmentMime: 'image/png',
          forceSticker: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('composer.errorSendFailed'))
      const newMsg: ChatMessage = data.message
      setReplyTo(null)
      setMessages((prev) => [...prev, newMsg])
      updateLastMessage(chatId, {
        id: newMsg.id,
        content: messagePreview(newMsg, t),
        createdAt: newMsg.createdAt,
        senderName: newMsg.sender.name,
        senderId: newMsg.sender.id,
        type: newMsg.type,
        attachmentUrl: newMsg.attachmentUrl,
      })
      socket.broadcastMessage(newMsg)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('composer.errorSendFailed'))
    } finally {
      sendingStickerRef.current = false
    }
  }

  const uploadAndSendAlbum = async (files: File[]) => {
    if (!activeChatId || !currentUser || files.length === 0) return
    setUploading(true)
    try {
      const albumId = crypto.randomUUID()
      // Include caption text with the first file in the album
      const caption = input.trim()
      setInput('')
      setReplyTo(null)
      clearDraft(activeChatId)

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/uploads', { method: 'POST', body: formData })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || t('composer.errorUploadFailed'))

        const isImage = data.isImage
        const isVoice = data.isVoice
        const isVideo = data.isVideo || isVideoFile({ type: file.type, name: file.name })

        const msgRes = await fetch(`/api/chats/${activeChatId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: i === 0 ? caption : '',
            replyToId: i === 0 ? (replyTo?.id || null) : null,
            attachmentUrl: data.url,
            attachmentName: data.name,
            attachmentMime: data.type,
            attachmentSize: data.size,
            forceImage: isImage,
            forceVideoAttachment: isVideo && !isVoice,
            albumId,
          }),
        })
        const msgData = await msgRes.json()
        if (!msgRes.ok) throw new Error(msgData.error || t('composer.errorSendFailed'))
        const newMsg: ChatMessage = msgData.message
        setMessages((prev) => [...prev, newMsg])
        updateLastMessage(activeChatId, {
          id: newMsg.id,
          content: messagePreview(newMsg, t),
          createdAt: newMsg.createdAt,
          senderName: newMsg.sender.name,
          senderId: newMsg.sender.id,
          type: newMsg.type,
          attachmentUrl: newMsg.attachmentUrl,
          attachmentName: newMsg.attachmentName,
          durationSec: newMsg.durationSec,
        })
        socket.broadcastMessage(newMsg)
      }
      setReplyTo(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('composer.errorUpload'))
    } finally {
      setUploading(false)
    }
  }

  const clearRecordTimer = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current)
      recordTimerRef.current = null
    }
  }

  const finishVoiceBlob = async (blob: Blob, mimeType: string, ext: string) => {
    const duration = Math.max(
      1,
      Math.round((Date.now() - recordStartRef.current) / 1000),
    )
    clearRecordTimer()
    recordStreamRef.current = null
    setRecordSeconds(0)
    recordStartRef.current = 0
    recordingModeRef.current = null
    if (voiceCanceledRef.current || blob.size === 0 || duration < 1) {
      voiceCanceledRef.current = false
      return
    }
    const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mimeType })
    await uploadVoice(file, duration)
  }

  // ===== Voice recording =====
  const startRecording = async () => {
    const getUserMedia = getGetUserMedia()
    if (!getUserMedia) {
      toast.error(t('composer.errorVoiceUnsupported'))
      return
    }
    try {
      const stream = await getUserMedia({ audio: true })
      recordStreamRef.current = stream
      recordedChunksRef.current = []
      voiceCanceledRef.current = false
      recordStartRef.current = Date.now()
      setIsRecording(true)
      setRecordSeconds(0)
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds(Math.floor((Date.now() - recordStartRef.current) / 1000))
      }, 200)

      if (typeof MediaRecorder !== 'undefined') {
        const { recorder, mimeType, ext } = createVoiceMediaRecorder(stream)
        recordMimeRef.current = { mimeType, ext }
        recordingModeRef.current = 'media'
        mediaRecorderRef.current = recorder
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordedChunksRef.current.push(e.data)
        }
        recorder.onstop = async () => {
          const { mimeType: mt, ext: ex } = recordMimeRef.current
          const blob = new Blob(recordedChunksRef.current, { type: mt })
          recordedChunksRef.current = []
          mediaRecorderRef.current = null
          setIsRecording(false)
          stream.getTracks().forEach((t) => t.stop())
          await finishVoiceBlob(blob, mt, ex)
        }
        recorder.start(250)
        return
      }

      const wav = await WavVoiceRecorder.create(stream)
      wavRecorderRef.current = wav
      recordingModeRef.current = 'wav'
      wav.start()
    } catch {
      toast.error(t('composer.errorMicAccess'))
    }
  }

  const handleVoiceMicClick = () => {
    if (!canRecordVoiceInBrowser()) {
      toast.error(
        typeof window !== 'undefined' && !window.isSecureContext
          ? t('composer.errorMicSecureContext')
          : t('composer.errorVoiceUnsupported'),
      )
      return
    }
    void startRecording()
  }

  // Send a video message ("кружочек")
  const sendVideoMessage = async (blob: Blob, durationSec: number) => {
    if (!activeChatId || !currentUser) return
    setUploading(true)
    try {
      const formData = new FormData()
      const videoType = blob.type || 'video/webm'
      const videoExt = videoType.includes('mp4') ? 'mp4' : 'webm'
      const file = new File([blob], `video-msg-${Date.now()}.${videoExt}`, {
        type: videoType,
      })
      formData.append('file', file)
      const res = await fetch('/api/uploads', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('composer.errorUploadFailed'))

      // Send as a special "video" message type
      const msgRes = await fetch(`/api/chats/${activeChatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: '',
          replyToId: replyTo?.id || null,
          attachmentUrl: data.url,
          attachmentName: data.name,
          attachmentMime: data.type,
          attachmentSize: data.size,
          durationSec,
          forceVideoMessage: true,
        }),
      })
      const msgData = await msgRes.json()
      if (!msgRes.ok) throw new Error(msgData.error || t('composer.errorSendFailed'))
      const newMsg: ChatMessage = msgData.message
      setReplyTo(null)
      setMessages((prev) => [...prev, newMsg])
      updateLastMessage(activeChatId, {
        id: newMsg.id,
        content: '🎥 Видео',
        createdAt: newMsg.createdAt,
        senderName: newMsg.sender.name,
        senderId: newMsg.sender.id,
        type: 'video',
      })
      socket.broadcastMessage(newMsg)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('composer.errorUpload'))
    } finally {
      setUploading(false)
    }
  }

  const uploadVoice = async (file: File, duration: number) => {
    if (!activeChatId) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/uploads', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('composer.errorUploadFailed'))

      const msgRes = await fetch(`/api/chats/${activeChatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: '',
          replyToId: replyTo?.id || null,
          attachmentUrl: data.url,
          attachmentName: data.name,
          attachmentMime: data.type,
          attachmentSize: data.size,
          durationSec: duration,
          forceVoiceMessage: true,
        }),
      })
      const msgData = await msgRes.json()
      if (!msgRes.ok) throw new Error(msgData.error || t('composer.errorSendFailed'))
      const newMsg: ChatMessage = msgData.message
      setReplyTo(null)
      setMessages((prev) => [...prev, newMsg])
      updateLastMessage(activeChatId, {
        id: newMsg.id,
        content: messagePreview(newMsg, t),
        createdAt: newMsg.createdAt,
        senderName: newMsg.sender.name,
        senderId: newMsg.sender.id,
        type: newMsg.type,
        attachmentUrl: newMsg.attachmentUrl,
        durationSec: newMsg.durationSec,
      })
      socket.broadcastMessage(newMsg)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('composer.errorUpload'))
    } finally {
      setUploading(false)
    }
  }

  const stopRecording = async () => {
    if (!isRecording) return
    if (recordingModeRef.current === 'wav' && wavRecorderRef.current) {
      setIsRecording(false)
      const wav = wavRecorderRef.current
      wavRecorderRef.current = null
      try {
        const blob = await wav.stop()
        await finishVoiceBlob(blob, 'audio/wav', 'wav')
      } catch {
        toast.error(t('composer.errorUpload'))
      }
      return
    }
    if (mediaRecorderRef.current) {
      setIsRecording(false)
      mediaRecorderRef.current.stop()
    }
  }

  const cancelRecording = () => {
    if (!isRecording) return
    voiceCanceledRef.current = true
    clearRecordTimer()
    if (recordingModeRef.current === 'wav' && wavRecorderRef.current) {
      const wav = wavRecorderRef.current
      wavRecorderRef.current = null
      recordingModeRef.current = null
      void wav.discard()
      recordStreamRef.current = null
      setIsRecording(false)
      setRecordSeconds(0)
      recordStartRef.current = 0
      voiceCanceledRef.current = false
      return
    }
    if (mediaRecorderRef.current) {
      recordedChunksRef.current = []
      mediaRecorderRef.current.onstop = null
      mediaRecorderRef.current.stop()
      recordStreamRef.current?.getTracks().forEach((t) => t.stop())
      recordStreamRef.current = null
      mediaRecorderRef.current = null
      recordingModeRef.current = null
      setIsRecording(false)
      setRecordSeconds(0)
      recordStartRef.current = 0
      voiceCanceledRef.current = false
    }
  }

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
      if (mediaRecorderRef.current?.state !== 'inactive') {
        try { mediaRecorderRef.current?.stop() } catch {}
      }
      recordStreamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const togglePin = async () => {
    if (!activeChatId || activeChat?.type === 'saved') return
    const next = !activeChat?.isPinned
    setChatPinned(activeChatId, next)
    try {
      const res = await fetch(`/api/chats/${activeChatId}/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: next }),
      })
      const data = await res.json()
      if (!res.ok) {
        setChatPinned(activeChatId, !next)
        if (data.error === 'pin_limit') {
          toast.error(t('chat.pinLimit'))
        } else {
          toast.error(t('misc.error'))
        }
        return
      }
      toast.success(next ? t('chat.pinned') : t('chat.unpinned'))
    } catch {
      setChatPinned(activeChatId, !next)
      toast.error(t('misc.error'))
    }
  }

  const toggleMute = async () => {
    if (!activeChatId) return
    const next = !activeChat?.isMuted
    setChatMuted(activeChatId, next)
    try {
      await fetch(`/api/chats/${activeChatId}/mute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ muted: next }),
      })
      toast.success(next ? t('chat.muted') : t('chat.unmuted'))
    } catch {
      setChatMuted(activeChatId, !next)
      toast.error(t('misc.error'))
    }
  }

  const toggleArchive = async () => {
    if (!activeChatId) return
    const next = !activeChat?.isArchived
    setChatArchived(activeChatId, next)
    try {
      await fetch(`/api/chats/${activeChatId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: next }),
      })
      toast.success(next ? t('chat.archived') : t('chat.unarchived'))
    } catch {
      setChatArchived(activeChatId, !next)
      toast.error(t('misc.error'))
    }
  }

  const runSearch = async (q: string) => {
    setSearchQuery(q)
    if (!activeChatId) return
    if (!q.trim()) {
      const res = await fetch(`/api/chats/${activeChatId}/messages?take=50`)
      const data = await res.json()
      setMessages(data.messages || [])
      return
    }
    try {
      const res = await fetch(
        `/api/chats/${activeChatId}/messages?take=100&q=${encodeURIComponent(q)}`,
      )
      const data = await res.json()
      setMessages(data.messages || [])
    } catch {}
  }

  const loadFavorites = async () => {
    if (!activeChatId) return
    setShowFavorites(true)
    const res = await fetch(`/api/chats/${activeChatId}/messages?take=100&favorites=1`)
    const data = await res.json()
    setMessages(data.messages || [])
  }

  if (!activeChat) {
    return <EmptyChatState />
  }

  const isSavedChat = activeChat.type === 'saved'
  const chatTitle = isSavedChat ? t('sidebar.savedMessages') : activeChat.title

  const otherUser =
    activeChat.type === 'private'
      ? activeChat.members.find((m) => m.id !== currentUser?.id)
      : null
  const myMembership = activeChat.members.find((m) => m.id === currentUser?.id)
  const myRole = (myMembership as { role?: string })?.role || 'member'
  const canDeleteOthers = canDeleteMessagesInChat(myAdminMembership)
  const canEditOthers = canEditMessagesInChat(myAdminMembership)
  const canPinMessages = canPinMessagesInChat(myAdminMembership)
  const isChatAdminUser = isChatAdmin(myAdminMembership)
  const canViewAnalytics =
    activeChat.type === 'private' ||
    activeChat.type === 'saved' ||
    isChatAdminUser
  const canPost =
    activeChat.type !== 'channel' || myRole === 'owner' || myRole === 'admin'
  const supportsComments =
    commentsEnabled && (activeChat.type === 'channel' || activeChat.type === 'group')
  const isOnline = otherUser
    ? isUserOnline(otherUser.id, otherUser.online, onlineUserIds, presenceSynced, otherUser.lastSeen)
    : false
  const presence = isSavedChat
    ? t('sidebar.savedHint')
    : otherUser
      ? formatLastSeen(otherUser.lastSeen, isOnline, lang)
      : activeChat.type === 'channel'
        ? `${activeChat.subscriberCount ?? activeChat.members.length} ${t('channel.subscribers')}`
        : `${activeChat.members.length} ${t('chat.members')}`

  // Group messages by day
  const grouped: { day: string; items: ChatMessage[] }[] = []
  for (const m of messages) {
    const day = new Date(m.createdAt).toDateString()
    const last = grouped[grouped.length - 1]
    if (last && last.day === day) last.items.push(m)
    else grouped.push({ day, items: [m] })
  }

  const typingNames = Object.values(typingUsers).map((t) => t.name)

  const reloadRecentMessages = () => {
    if (!activeChatId) return
    fetch(`/api/chats/${activeChatId}/messages?take=50`)
      .then((r) => r.json())
      .then((d) => setMessages(d.messages || []))
  }

  const toggleMessageSearch = () => {
    if (showFavorites) {
      setShowFavorites(false)
      reloadRecentMessages()
    } else {
      setShowSearch((v) => !v)
    }
  }

  const toggleFavoritesView = () => {
    if (showSearch) {
      setShowSearch(false)
      setSearchQuery('')
      reloadRecentMessages()
    } else {
      loadFavorites()
    }
  }

  return (
    <div
      className="relative flex h-full touch-pan-y flex-col bg-background lg:!translate-x-0"
      style={{
        transform: swipeBackOffset ? `translateX(${swipeBackOffset}px)` : undefined,
        transition: swipeBackAnimating ? 'transform 0.22s ease-out' : undefined,
      }}
      onPointerDown={handleChatPointerDown}
      onPointerMove={handleChatPointerMove}
      onPointerUp={handleChatPointerEnd}
      onPointerCancel={handleChatPointerEnd}
    >
      {/* Header */}
      <div className="aurora-chat-safe-top flex items-center justify-between gap-2 border-b border-border/40 bg-background/90 px-2 pb-1.5 pt-1 backdrop-blur-md sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-full lg:hidden"
            onClick={onBack}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <button
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            onClick={() => {
              if (isSavedChat) {
                onShowInfo()
              } else if (activeChat.type === 'private' && otherUser) {
                setProfileUserId(otherUser.id)
              } else {
                onShowInfo()
              }
            }}
          >
            {isSavedChat ? (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#3390ec] shadow-sm">
                <Bookmark className="h-4 w-4 text-white" fill="currentColor" />
              </div>
            ) : (
            <Avatar
              name={activeChat.title}
              color={activeChat.avatarColor}
              imageUrl={getChatAvatarImageUrl(activeChat, currentUser?.id)}
              size="sm"
              showStatus={activeChat.type === 'private'}
              online={isOnline}
            />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-[15px] font-semibold leading-tight">
                  <span className="inline-flex max-w-full items-center gap-1">
                    <span className="truncate">{chatTitle}</span>
                    {otherUser?.emojiStatus && (
                      <EmojiStatusBadge emojiStatus={otherUser.emojiStatus} size="md" />
                    )}
                  </span>
                </p>
                {isChatEncrypted && (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                )}
                {activeChat.isMuted && (
                  <BellOff className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
                {activeChat.isArchived && (
                  <Archive className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
              </div>
              <p className="truncate text-[12px] text-muted-foreground">
                {typingNames.length > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-[#3390ec]" title={t('chat.typing')} aria-label={t('chat.typing')}>
                    <span className="truncate">{typingNames.join(', ')}</span>
                    <TypingDots className="text-[#3390ec]" size={4} gap={2} label={t('chat.typing')} />
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    {isChatEncrypted && (
                      <span className="text-emerald-500">🔒</span>
                    )}
                    {presence}
                  </span>
                )}
              </p>
            </div>
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isForum && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 rounded-full px-3 text-xs font-medium"
              onClick={() => setShowTopicList(true)}
            >
              <Hash className="h-3.5 w-3.5" />
              {activeTopicId ? 'Тема' : 'General'}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-9 w-9 sm:inline-flex"
            onClick={toggleMessageSearch}
            title={showFavorites ? t('misc.close') : t('chat.search')}
          >
            {showFavorites ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-9 w-9 sm:inline-flex"
            onClick={toggleFavoritesView}
            title={showSearch ? t('misc.close') : t('info.favorites')}
          >
            {showSearch ? <X className="h-4 w-4" /> : <Star className="h-4 w-4" />}
          </Button>
          {activeChat.type === 'private' && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => handleStartCall('audio')}
                title={t('chat.call')}
              >
                <Phone className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="hidden h-9 w-9 sm:inline-flex"
                onClick={() => handleStartCall('video')}
                title={t('chat.video')}
              >
                <Video className="h-5 w-5" />
              </Button>
            </>
          )}
          {activeChat.type === 'private' && otherUser && (
            <Button
              variant="ghost"
              size="icon"
              className="hidden h-9 w-9 sm:inline-flex"
              onClick={() => setShowGiftPicker(true)}
              title={t('gifts.sendGift')}
            >
              <Gift className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="hidden h-9 w-9 sm:inline-flex" onClick={onShowInfo} title={t('chat.info')}>
            <Info className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="sm:hidden" onClick={toggleMessageSearch}>
                <Search className="mr-2 h-4 w-4" /> {t('chat.search')}
              </DropdownMenuItem>
              <DropdownMenuItem className="sm:hidden" onClick={toggleFavoritesView}>
                <Star className="mr-2 h-4 w-4" /> {t('info.favorites')}
              </DropdownMenuItem>
              {activeChat.type === 'private' && (
                <DropdownMenuItem className="sm:hidden" onClick={() => handleStartCall('video')}>
                  <Video className="mr-2 h-4 w-4" /> {t('chat.video')}
                </DropdownMenuItem>
              )}
              {activeChat.type === 'private' && otherUser && (
                <DropdownMenuItem className="sm:hidden" onClick={() => setShowGiftPicker(true)}>
                  <Gift className="mr-2 h-4 w-4" /> {t('gifts.sendGift')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="sm:hidden" onClick={onShowInfo}>
                <Info className="mr-2 h-4 w-4" /> {t('chat.info')}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="sm:hidden" />
              {canViewAnalytics && (
                <DropdownMenuItem onClick={() => setShowAnalytics(true)}>
                  <BarChart3 className="mr-2 h-4 w-4" /> Аналитика чата
                </DropdownMenuItem>
              )}
              {canViewAnalytics && <DropdownMenuSeparator />}
              {isForum && (
                <DropdownMenuItem onClick={() => setShowTopicList(true)}>
                  <Hash className="mr-2 h-4 w-4" /> Темы
                </DropdownMenuItem>
              )}
              {isForum && <DropdownMenuSeparator />}
              {!isSavedChat && (
                <DropdownMenuItem onClick={togglePin}>
                  {activeChat.isPinned ? (
                    <><PinOff className="mr-2 h-4 w-4" /> {t('chat.unpin')}</>
                  ) : (
                    <><Pin className="mr-2 h-4 w-4" /> {t('chat.pin')}</>
                  )}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={toggleMute}>
                {activeChat.isMuted ? (
                  <><Bell className="mr-2 h-4 w-4" /> {t('chat.unmute')}</>
                ) : (
                  <><BellOff className="mr-2 h-4 w-4" /> {t('chat.mute')}</>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleArchive}>
                {activeChat.isArchived ? (
                  <><ArchiveRestore className="mr-2 h-4 w-4" /> {t('chat.unarchive')}</>
                ) : (
                  <><Archive className="mr-2 h-4 w-4" /> {t('chat.archive')}</>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onShowInfo}>
                <Info className="mr-2 h-4 w-4" /> {t('chat.about')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowWallpaper(true)}>
                <Palette className="mr-2 h-4 w-4" /> {t('wallpaper.title')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setActiveChat(null)}
              >
                <X className="mr-2 h-4 w-4" /> {t('chat.closeChat')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Search bar (collapsible) */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-border bg-muted/30"
          >
            <div className="px-3 py-2 sm:px-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => runSearch(e.target.value)}
                  placeholder={t('search.messages')}
                  className="h-9 rounded-lg border-none bg-background pl-10 pr-9 text-sm focus-visible:ring-1 focus-visible:ring-[#3390ec]"
                  autoFocus
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                    onClick={() => {
                      setSearchQuery('')
                      setShowSearch(false)
                      reloadRecentMessages()
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {searchQuery && (
                <p className="mt-1 px-1 text-xs text-muted-foreground">
                  {t('chat.found')}: {messages.length}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Favorites mode indicator */}
      <AnimatePresence>
        {showFavorites && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-border bg-amber-500/5"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-2">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  {t('info.favorites')}
                </span>
                <span className="text-xs text-muted-foreground">· {messages.length}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setShowFavorites(false)
                  reloadRecentMessages()
                }}
              >
                {t('misc.close')}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {pinnedMessage && (
        <button
          type="button"
          onClick={() => void jumpToMessage(pinnedMessage.id)}
          className="flex w-full items-center gap-2 border-b border-border bg-muted/30 px-4 py-2 text-left transition hover:bg-muted/60"
        >
          <Pin className="h-4 w-4 shrink-0 text-[#3390ec]" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[#3390ec]">{pinnedMessage.senderName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {pinnedMessage.content || (pinnedMessage.type === 'image' ? t('chat.image') : t('chat.file'))}
            </p>
          </div>
        </button>
      )}

      {/* Messages */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
        <ChatWallpaperBackground perChatWallpaper={activeChat.wallpaper} className="z-0" />
        <div
          ref={scrollRef}
          onScroll={handleMessagesScroll}
          className={cn(
            'relative z-[1] h-full touch-pan-y overflow-x-hidden overflow-y-auto overscroll-x-none px-3 py-4 sm:px-6',
          )}
        >
        <div className="relative min-h-full">
        {loadingMessages ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#3390ec] border-t-transparent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#3390ec]/15">
              <Avatar
                name={activeChat.title}
                color={activeChat.avatarColor}
                imageUrl={getChatAvatarImageUrl(activeChat, currentUser?.id)}
                size="lg"
              />
            </div>
            <div>
              <p className="text-sm font-medium">{activeChat.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {searchQuery
                  ? t('chat.emptySearchResult')
                  : showFavorites
                    ? t('info.noFavorites')
                    : t('app.welcomeNoChats')}
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-none min-w-0 flex-col gap-2">
            {grouped.map((group) => (
              <div key={group.day} className="flex flex-col gap-1.5">
                <div className="my-2 flex justify-center">
                  <span className="rounded-full bg-black/35 px-3 py-1 text-[12px] font-medium text-white shadow-sm backdrop-blur-sm dark:bg-black/45">
                    {formatDayDivider(group.items[0].createdAt, lang)}
                  </span>
                </div>
                {groupAlbums(group.items).map((entry, idx, arr) => {
                  const curMsg = entry.kind === 'album' ? entry.messages[0] : entry.msg
                  const mine = curMsg.senderId === currentUser?.id
                  const prevEntry = arr[idx - 1]
                  const prevMsg = prevEntry
                    ? prevEntry.kind === 'album'
                      ? prevEntry.messages[0]
                      : prevEntry.msg
                    : null
                  const grouped = !!prevMsg && prevMsg.senderId === curMsg.senderId
                  const nextEntry = arr[idx + 1]
                  const nextMsg = nextEntry
                    ? nextEntry.kind === 'album'
                      ? nextEntry.messages[0]
                      : nextEntry.msg
                    : null
                  const nextGrouped = !!nextMsg && nextMsg.senderId === curMsg.senderId
                  if (entry.kind === 'album') {
                    return (
                      <AlbumBubble
                        key={`album-${entry.messages[0].id}`}
                        messages={entry.messages}
                        mine={mine}
                        grouped={grouped}
                        nextGrouped={nextGrouped}
                        highlighted={highlightedMessageId === entry.messages[0].id}
                        showSenderProfile={
                          !mine && activeChat.type !== 'private'
                        }
                        canDeleteOthers={canDeleteOthers}
                        canPin={canPinMessages}
                        isPinned={pinnedMessage?.id === entry.messages[0].id}
                        onViewProfile={() => setProfileUserId(curMsg.sender.id)}
                        onReply={() => {
                          setEditingMessage(null)
                          setReplyTo(curMsg)
                        }}
                        onDelete={() => deleteMessage(curMsg)}
                        onPin={(pinned) => pinMessage(curMsg.id, pinned)}
                        onCopy={() => copyMessage(curMsg)}
                        onReact={(emoji) => toggleReaction(curMsg, emoji)}
                        onForward={() => setForwardMessage(curMsg)}
                        onShare={() => openShareToChat(buildMessageSharePayload(curMsg))}
                        onFavorite={() => toggleFavorite(curMsg)}
                        onContextMenu={(e, m) => {
                          const clientX = 'clientX' in e ? e.clientX : e.touches?.[0]?.clientX ?? 0
                          const clientY = 'clientY' in e ? e.clientY : e.touches?.[0]?.clientY ?? 0
                          setContextMenu({ msg: m, x: clientX, y: clientY })
                        }}
                        currentUserId={currentUser?.id || ''}
                        t={t}
                        lang={lang}
                      />
                    )
                  }
                  const msg = entry.msg
                  if (msg.type === 'call') {
                    return (
                      <CallMessageRow
                        key={msg.id}
                        msg={msg}
                        viewerId={currentUser?.id || ''}
                        t={t}
                      />
                    )
                  }
                  return (
                    <MessageBubble
                      key={msg.id}
                      msg={msg}
                      mine={mine}
                      grouped={grouped}
                      nextGrouped={nextGrouped}
                      highlighted={highlightedMessageId === msg.id}
                      showSenderProfile={
                        !mine && activeChat.type !== 'private'
                      }
                      supportsComments={supportsComments}
                      canDeleteOthers={canDeleteOthers}
                      canEditOthers={canEditOthers}
                      canPin={canPinMessages}
                      isPinned={pinnedMessage?.id === msg.id}
                      onViewProfile={() => setProfileUserId(msg.sender.id)}
                      onReply={() => {
                        setEditingMessage(null)
                        setReplyTo(msg)
                      }}
                      onEdit={() => {
                        setReplyTo(null)
                        setEditingMessage(msg)
                        setInput(msg.content)
                      }}
                      onDelete={() => deleteMessage(msg)}
                      onPin={(pinned) => pinMessage(msg.id, pinned)}
                      onCopy={() => copyMessage(msg)}
                      onReact={(emoji) => toggleReaction(msg, emoji)}
                      onForward={() => setForwardMessage(msg)}
                      onShare={() => openShareToChat(buildMessageSharePayload(msg))}
                      onFavorite={() => toggleFavorite(msg)}
                      onJumpToReply={jumpToMessage}
                      onOpenComments={() => setCommentsFor(msg.id)}
                      onLinkClick={handleLinkClick}
                      onContextMenu={(e, m) => {
                        const clientX = 'clientX' in e ? e.clientX : e.touches?.[0]?.clientX ?? 0
                        const clientY = 'clientY' in e ? e.clientY : e.touches?.[0]?.clientY ?? 0
                        setContextMenu({ msg: m, x: clientX, y: clientY })
                      }}
                      currentUserId={currentUser?.id || ''}
                      t={t}
                      lang={lang}
                    />
                  )
                })}
              </div>
            ))}
            <div className="h-2" />
          </div>
        )}
        </div>
        </div>

        {/* Floating scroll-to-bottom button with unread badge */}
        <AnimatePresence>
          {showScrollFab && (
            <motion.button
              type="button"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.15 }}
              onClick={() => scrollToBottom('smooth')}
              aria-label={t('aria.scrollBottom')}
              title={t('aria.scrollBottom')}
              className="absolute bottom-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-background text-muted-foreground shadow-lg ring-1 ring-border transition hover:bg-muted"
            >
              <ChevronDown className="h-5 w-5" />
              {belowViewportUnread > 0 && (
                <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-[#3390ec] px-1 text-[10px] font-semibold leading-[18px] text-white shadow">
                  {belowViewportUnread > 99 ? '99+' : belowViewportUnread}
                </span>
              )}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Reply preview */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 overflow-hidden border-t border-border bg-muted/50"
          >
            <div className="flex items-center gap-3 px-4 py-2.5">
              <Reply className="h-4 w-4 shrink-0 text-[#3390ec]" />
              <div className="min-w-0 flex-1 border-l-2 border-[#3390ec] pl-2">
                <p className="text-xs font-medium text-[#3390ec]">
                  {t('msg.replyTo')} {replyTo.sender.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {replyTo.content || messagePreview(replyTo, t)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setReplyTo(null)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Editing preview */}
      <AnimatePresence>
        {editingMessage && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 overflow-hidden border-t border-border bg-amber-500/5"
          >
            <div className="flex items-center gap-3 px-4 py-2.5">
              <Edit3 className="h-4 w-4 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1 border-l-2 border-amber-500 pl-2">
                <p className="text-xs font-medium text-amber-500">{t('msg.editing')}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {editingMessage.content}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => {
                  setEditingMessage(null)
                  setInput('')
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recording indicator */}
      <AnimatePresence>
        {isRecording && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 overflow-hidden border-t border-border bg-rose-500/10"
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex h-3 w-3 items-center justify-center">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
              </div>
              <span className="text-sm font-medium text-rose-600 dark:text-rose-400">
                {t('composer.recording')} {Math.floor(recordSeconds / 60)}:{(recordSeconds % 60).toString().padStart(2, '0')}
              </span>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={cancelRecording}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                {t('composer.cancelRecording')}
              </Button>
              <Button
                size="sm"
                className="h-8 bg-rose-500 text-white hover:bg-rose-600"
                onClick={stopRecording}
              >
                <Check className="mr-1 h-3.5 w-3.5" />
                {t('composer.stopRecording')}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer */}
      {!canPost ? (
        <div className="shrink-0 border-t border-border bg-muted/30 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-sm text-muted-foreground">
          {t('channel.readOnly')}
        </div>
      ) : (
      <div className="shrink-0 bg-background/90 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 sm:px-3">
        {/* Hidden file pickers used by attach sheet */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*,image/png,image/jpeg,image/jpg,image/webp,image/gif,image/heic,image/heif,video/mp4,video/webm,video/quicktime,.heic,.heif,.mov"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept={CHAT_ATTACHMENT_ACCEPT}
          onChange={handleFileSelect}
          className="hidden"
        />
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/m4a,audio/x-m4a,audio/aac,audio/flac,audio/x-flac,audio/mp4"
          onChange={handleFileSelect}
          className="hidden"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*,video/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
        />
        <div className="mx-auto flex w-full max-w-none flex-col gap-1.5">
          {/* Pending attachment — Telegram strip above the input row */}
          {pendingFile && pendingPreviewUrl && !isRecording && (
            <div className="flex items-center gap-2 rounded-2xl bg-muted/40 px-2 py-2">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                {pendingFile.type.startsWith('image/') ? (
                  <img src={pendingPreviewUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <FileIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                {pendingFile.type.startsWith('image/') ? (
                  <p className="text-xs text-muted-foreground">
                    {(pendingFile.size / 1024 / 1024).toFixed(1)} МБ
                  </p>
                ) : (
                  <>
                    <p className="truncate text-sm font-medium">{pendingFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(pendingFile.size / 1024 / 1024).toFixed(1)} МБ
                    </p>
                  </>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 rounded-full"
                onClick={cancelPendingFile}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          <div className="flex w-full items-end gap-1.5">
          {/* Telegram: rounded text field; circular send/mic sits outside to the right */}
          {isRecording ? (
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-rose-500/40 bg-rose-500/10 px-3 py-3 text-sm font-medium text-rose-600 dark:text-rose-400">
              <span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-rose-500" />
              {Math.floor(recordSeconds / 60)}:{(recordSeconds % 60).toString().padStart(2, '0')}
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-end gap-0.5 rounded-[22px] bg-muted/50 px-1 py-1 transition focus-within:bg-muted/70">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full text-muted-foreground"
                onClick={() => setShowAttachMenu(true)}
                disabled={uploading || isRecording}
                title={t('composer.attach')}
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Paperclip className="h-5 w-5" />
                )}
              </Button>

              {isChatEncrypted && !editingMessage && (
                <Lock className="mb-2 ml-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              )}

              <textarea
                ref={inputAreaRef}
                value={input}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    pendingFile ? confirmSendPendingFile() : sendMessage()
                  }
                  if (e.key === 'Escape' && editingMessage) {
                    setEditingMessage(null)
                    setInput('')
                  }
                  if (e.key === 'Escape' && pendingFile) {
                    cancelPendingFile()
                  }
                }}
                placeholder={
                  pendingFile
                    ? t('composer.captionPlaceholder') || 'Добавить подпись...'
                    : editingMessage
                      ? t('msg.editingHint')
                      : t('composer.placeholder')
                }
                rows={1}
                className="max-h-32 w-full min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-2 text-[15px] outline-none placeholder:text-muted-foreground"
                style={{ height: 'auto', minHeight: '24px' }}
              />

              <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full text-muted-foreground">
                    <Smile className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="top" align="end" className="w-80 p-0">
                  <div className="flex gap-1 border-b border-border p-2">
                    <button
                      type="button"
                      onClick={() => setActiveEmojiSet(Object.keys(EMOJI_SETS)[0])}
                      className={cn(
                        'rounded-md px-2 py-1 text-xs font-medium transition',
                        !Object.keys(EMOJI_SETS).includes(activeEmojiSet) || EMOJI_SETS[activeEmojiSet]
                          ? 'bg-[#3390ec]/15 text-[#3390ec]'
                          : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      Emoji
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEmojiOpen(false)
                        setShowStickerPicker(true)
                      }}
                      className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted"
                    >
                      {t('stickers.title')}
                    </button>
                  </div>
                  <div className="border-b border-border p-2">
                    <div className="flex flex-wrap gap-1">
                      {Object.keys(EMOJI_SETS).map((setName) => (
                        <button
                          key={setName}
                          onClick={() => setActiveEmojiSet(setName)}
                          className={cn(
                            'rounded-md px-2 py-1 text-xs font-medium transition',
                            activeEmojiSet === setName
                              ? 'bg-[#3390ec]/15 text-[#3390ec]'
                              : 'text-muted-foreground hover:bg-muted',
                          )}
                        >
                          {setName}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid max-h-64 grid-cols-7 gap-1 overflow-y-auto p-2">
                    {EMOJI_SETS[activeEmojiSet].map((emoji, i) => (
                      <button
                        key={`${emoji}-${i}`}
                        onClick={() => handleInputChange(input + emoji)}
                        className="flex h-9 w-9 items-center justify-center rounded-md text-xl transition hover:bg-muted"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {!isRecording && (
            input.trim() || editingMessage || pendingFile ? (
              <Button
                onClick={() => (pendingFile ? confirmSendPendingFile() : sendMessage())}
                disabled={uploading}
                className="mb-0.5 h-10 w-10 shrink-0 rounded-full bg-[#3390ec] p-0 text-white shadow-none transition hover:bg-[#2b82d9] disabled:opacity-40"
                title={t('composer.send')}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={editingMessage ? 'check' : 'send'}
                    initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
                    animate={{ rotate: 0, opacity: 1, scale: 1 }}
                    exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center justify-center"
                  >
                    {editingMessage ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                  </motion.span>
                </AnimatePresence>
              </Button>
            ) : (
              <Button
                onClick={handleVoiceMicClick}
                disabled={uploading}
                className="mb-0.5 h-10 w-10 shrink-0 rounded-full bg-[#3390ec] p-0 text-white shadow-none transition hover:bg-[#2b82d9] disabled:opacity-40"
                title={t('composer.recordVoice')}
              >
                <Mic className="h-4 w-4" />
              </Button>
            )
          )}

          {isRecording && (
            <Button
              onClick={stopRecording}
              className="h-10 w-10 shrink-0 rounded-full bg-rose-500 p-0 shadow-md hover:bg-rose-600"
              title={t('composer.stopRecording')}
            >
              <Check className="h-4 w-4" />
            </Button>
          )}
          </div>
        </div>
      </div>
      )}

      {/* Telegram-style bottom attach menu */}
      <Sheet open={showAttachMenu} onOpenChange={setShowAttachMenu}>
        <SheetContent
          side="bottom"
          className="mx-auto max-w-md rounded-t-2xl p-4 [&>button]:hidden"
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
          <div className="grid grid-cols-3 gap-3 pb-2">
            <AttachTile
              icon={<Camera className="h-6 w-6" />}
              color="from-sky-500 to-blue-500"
              label="Камера"
              onClick={() => {
                setShowAttachMenu(false)
                cameraInputRef.current?.click()
              }}
            />
            <AttachTile
              icon={<ImagePlus className="h-6 w-6" />}
              color="from-fuchsia-500 to-pink-500"
              label={t('composer.attachPhotoVideo')}
              onClick={() => {
                setShowAttachMenu(false)
                imageInputRef.current?.click()
              }}
            />
            <AttachTile
              icon={<FileIcon className="h-6 w-6" />}
              color="from-blue-500 to-cyan-500"
              label={t('composer.attachFile')}
              onClick={() => {
                setShowAttachMenu(false)
                fileInputRef.current?.click()
              }}
            />
            <AttachTile
              icon={<Music className="h-6 w-6" />}
              color="from-amber-500 to-orange-500"
              label={t('composer.attachAudio')}
              onClick={() => {
                setShowAttachMenu(false)
                audioInputRef.current?.click()
              }}
            />
            <AttachTile
              icon={<VideoIcon className="h-6 w-6" />}
              color="from-violet-500 to-fuchsia-500"
              label={t('composer.attachVideoMessage')}
              onClick={() => {
                setShowAttachMenu(false)
                setShowVideoRecorder(true)
              }}
            />
            <AttachTile
              icon={<MapPin className="h-6 w-6" />}
              color="from-emerald-500 to-green-500"
              label={t('composer.attachLocation')}
              onClick={sendLocation}
            />
            <AttachTile
              icon={<Gift className="h-6 w-6" />}
              color="from-rose-500 to-pink-500"
              label={t('gifts.sendGift')}
              onClick={() => {
                setShowAttachMenu(false)
                setShowGiftPicker(true)
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Forward dialog */}
      <ForwardDialog
        open={!!forwardMessage}
        onOpenChange={(v) => !v && setForwardMessage(null)}
        message={forwardMessage}
        onForwarded={(targetChatId, newMsg) => {
          // If user is currently viewing the target chat, append the forwarded message
          if (targetChatId === activeChatId) {
            setMessages((prev) => [...prev, newMsg])
            updateLastMessage(targetChatId, {
              id: newMsg.id,
              content: messagePreview(newMsg, t),
              createdAt: newMsg.createdAt,
              senderName: newMsg.sender.name,
              senderId: newMsg.sender.id,
              type: newMsg.type,
              attachmentUrl: newMsg.attachmentUrl,
              attachmentName: newMsg.attachmentName,
              durationSec: newMsg.durationSec,
            })
          } else {
            updateLastMessage(targetChatId, {
              id: newMsg.id,
              content: messagePreview(newMsg, t),
              createdAt: newMsg.createdAt,
              senderName: newMsg.sender.name,
              senderId: newMsg.sender.id,
              type: newMsg.type,
              attachmentUrl: newMsg.attachmentUrl,
              attachmentName: newMsg.attachmentName,
              durationSec: newMsg.durationSec,
            })
          }
          socket.broadcastForward(newMsg)
        }}
      />

      <StickerPickerDialog
        open={showStickerPicker}
        onOpenChange={setShowStickerPicker}
        onSend={sendSticker}
      />

      {/* In-app notifications (works on Safari/iOS where Notification API is unsupported) */}
      <InAppNotifications
        notifications={inAppNotifications}
        onDismiss={dismissNotification}
        onClick={clickNotification}
      />

      {/* Video message recorder ("кружочки" like in Telegram) */}
      <VideoMessageRecorder
        open={showVideoRecorder}
        onClose={() => setShowVideoRecorder(false)}
        onComplete={(blob, durationSec) => {
          setShowVideoRecorder(false)
          sendVideoMessage(blob, durationSec)
        }}
      />

      {/* Chat analytics — admins only in groups/channels */}
      {canViewAnalytics && (
        <ChatAnalytics
          open={showAnalytics}
          onOpenChange={setShowAnalytics}
          chatId={activeChatId}
        />
      )}

      <ChannelCommentsSheet
        ref={commentsSheetRef}
        open={!!commentsFor}
        onClose={() => setCommentsFor(null)}
        channelId={activeChatId || ''}
        postId={commentsFor}
        onCommentAdded={() => {
          if (commentsFor) bumpCommentCount(commentsFor)
        }}
        onBroadcastNew={(comment) => {
          if (!commentsFor) return
          socket.broadcastComment({
            sourceChatId: activeChatId || '',
            postId: commentsFor,
            comment: comment as unknown as CommentPayload,
          })
        }}
        onBroadcastDelete={(comment) => {
          if (!commentsFor) return
          socket.broadcastCommentDelete({
            sourceChatId: activeChatId || '',
            postId: commentsFor,
            commentId: comment.id,
            discussionChatId: comment.chatId,
          })
        }}
        onBroadcastReaction={(commentId, reactions) => {
          if (!commentsFor) return
          socket.broadcastCommentReaction({
            sourceChatId: activeChatId || '',
            postId: commentsFor,
            commentId,
            reactions,
          })
        }}
      />

      {activeChat.type === 'private' && otherUser && (
        <GiftPickerDialog
          open={showGiftPicker}
          onOpenChange={setShowGiftPicker}
          recipientId={otherUser.id}
          recipientName={otherUser.name}
          chatId={activeChatId}
          onSent={(chatId) => {
            if (chatId !== activeChatId) setActiveChat(chatId)
            fetch(`/api/chats/${chatId}/messages?take=50`)
              .then((r) => r.json())
              .then((d) => setMessages(d.messages || []))
          }}
        />
      )}

      <ChatWallpaperDialog
        open={showWallpaper}
        onOpenChange={setShowWallpaper}
        scope="chat"
        chatId={activeChatId}
        currentWallpaper={activeChat.wallpaper}
      />

      {/* Forum Topics Sheet — hide default sheet X; TopicList owns close/create
          with safe-area padding so nothing sits under the phone status bar. */}
      {activeChatId && (
      <Sheet open={showTopicList} onOpenChange={setShowTopicList}>
        <SheetContent
          side="right"
          className="w-full gap-0 p-0 sm:w-96 sm:max-w-96 [&>button]:hidden"
        >
          <TopicList
            chatId={activeChatId}
            currentUserId={currentUser?.id || ''}
            isAdmin={myAdminMembership?.role === 'owner' || myAdminMembership?.role === 'admin'}
            activeTopicId={activeTopicId}
            onClose={() => setShowTopicList(false)}
            onSelectTopic={(topicId) => {
              setActiveTopicId(topicId)
              setShowTopicList(false)
              // Reload messages for the selected topic
              const params = new URLSearchParams({ take: '50' })
              if (topicId) params.set('topicId', topicId)
              fetch(`/api/chats/${activeChatId}/messages?${params.toString()}`)
                .then((r) => r.json())
                .then((data) => {
                  setMessages(data.messages || [])
                })
            }}
            onCreateTopic={() => {
              setShowTopicList(false)
              setShowCreateTopic(true)
            }}
          />
        </SheetContent>
      </Sheet>
      )}

      <CreateTopicDialog
        open={showCreateTopic}
        onOpenChange={setShowCreateTopic}
        chatId={activeChatId ?? ''}
        onCreated={() => setShowTopicList(true)}
      />

      {/* Delete confirmation dialog */}
      <DeleteConfirmDialog
        open={!!deleteConfirmMsg}
        onOpenChange={(v) => !v && setDeleteConfirmMsg(null)}
        isOwnMessage={deleteConfirmMsg?.senderId === currentUser?.id}
        chatType={activeChat.type}
        onDelete={confirmDelete}
        t={t}
      />

      {/* Floating context menu (right-click / long-press) */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setContextMenu(null)}
            onTouchStart={() => setContextMenu(null)}
          />
          <div
            ref={contextMenuRef}
            className="fixed z-50 min-w-[180px] rounded-xl border border-border bg-background p-1.5 shadow-xl animate-in fade-in-0 zoom-in-95"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 200),
              top: Math.max(contextMenu.y - 10, 8),
            }}
          >
            <ContextMenuItem2 icon={<Reply className="h-4 w-4" />} label={t('msg.reply')} onClick={() => {
              setEditingMessage(null)
              setReplyTo(contextMenu.msg)
              setContextMenu(null)
            }} />
            {(contextMenu.msg.senderId === currentUser?.id || canEditOthers) && contextMenu.msg.type === 'text' && (
              <ContextMenuItem2 icon={<Edit3 className="h-4 w-4" />} label={t('msg.edit')} onClick={() => {
                setReplyTo(null)
                setEditingMessage(contextMenu.msg)
                setInput(contextMenu.msg.content)
                setContextMenu(null)
              }} />
            )}
            <ContextMenuItem2 icon={<Copy className="h-4 w-4" />} label={t('msg.copy')} onClick={() => {
              copyMessage(contextMenu.msg)
              setContextMenu(null)
            }} />
            <ContextMenuItem2 icon={<Forward className="h-4 w-4" />} label={t('msg.forward')} onClick={() => {
              setForwardMessage(contextMenu.msg)
              setContextMenu(null)
            }} />
            {canPinMessages && (
              <ContextMenuItem2
                icon={pinnedMessage?.id === contextMenu.msg.id ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                label={pinnedMessage?.id === contextMenu.msg.id ? t('msg.unpin') : t('msg.pin')}
                onClick={() => {
                  pinMessage(contextMenu.msg.id, pinnedMessage?.id !== contextMenu.msg.id)
                  setContextMenu(null)
                }}
              />
            )}
            <div className="my-1 h-px bg-border" />
            {(contextMenu.msg.senderId === currentUser?.id || canDeleteOthers) && (
              <ContextMenuItem2
                icon={<Trash2 className="h-4 w-4 text-destructive" />}
                label={t('msg.delete')}
                className="text-destructive"
                onClick={() => {
                  deleteMessage(contextMenu.msg)
                  setContextMenu(null)
                }}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** Lightweight context-menu item used by the floating right-click / long-press menu. */
function ContextMenuItem2({
  icon,
  label,
  onClick,
  className,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition hover:bg-muted',
        className,
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function messagePreview(msg: ChatMessage, t: (k: string) => string, viewerId?: string): string {
  if (msg.type === 'call') {
    const meta = parseCallMetadata(msg.metadata)
    if (meta && viewerId) {
      return callPreviewLabel(meta, viewerId, msg.senderId, t)
    }
    if (meta?.status === 'missed' || meta?.status === 'cancelled') {
      return `📞 ${t('call.missed')}`
    }
    if (meta?.status === 'declined') return `📞 ${t('call.declined')}`
    return t('chat.callPreview')
  }
  if (msg.type === 'share') {
    const payload = parseShareMetadata(msg.metadata)
    return payload ? sharePreviewLabel(payload, t) : t('chat.share')
  }
  if (msg.albumId) return t('chat.album')
  if (msg.type === 'image') return t('chat.image')
  if (msg.type === 'video') return '🎥 Видео'
  if (msg.type === 'voice') return t('chat.voice')
  if (msg.type === 'gift') return t('chat.gift')
  if (msg.type === 'sticker') return t('chat.sticker')
  if (msg.type === 'file') return `${t('chat.file')}: ${msg.attachmentName || ''}`
  return msg.content || ''
}

type AlbumRenderEntry =
  | { kind: 'single'; msg: ChatMessage }
  | { kind: 'album'; messages: ChatMessage[] }

function groupAlbums(items: ChatMessage[]): AlbumRenderEntry[] {
  const entries: AlbumRenderEntry[] = []
  let i = 0
  while (i < items.length) {
    const msg = items[i]
    if (msg.albumId) {
      const album: ChatMessage[] = [msg]
      let j = i + 1
      while (
        j < items.length &&
        items[j].albumId === msg.albumId &&
        items[j].senderId === msg.senderId
      ) {
        album.push(items[j])
        j++
      }
      if (album.length > 1) {
        entries.push({ kind: 'album', messages: album })
        i = j
        continue
      }
    }
    entries.push({ kind: 'single', msg })
    i++
  }
  return entries
}

function albumGridClass(count: number): string {
  if (count <= 1) return 'grid-cols-1'
  if (count === 2) return 'grid-cols-2'
  if (count <= 4) return 'grid-cols-2'
  return 'grid-cols-3'
}

interface MessageBubbleProps {
  msg: ChatMessage
  mine: boolean
  grouped: boolean
  nextGrouped?: boolean
  highlighted?: boolean
  showSenderProfile?: boolean
  supportsComments?: boolean
  canDeleteOthers?: boolean
  canEditOthers?: boolean
  canPin?: boolean
  isPinned?: boolean
  onViewProfile?: () => void
  onReply: () => void
  onEdit: () => void
  onDelete: () => void
  onPin?: (pinned: boolean) => void
  onCopy: () => void
  onReact: (emoji: string) => void
  onForward: () => void
  onShare: () => void
  onFavorite: () => void
  onJumpToReply?: (messageId: string) => void
  onOpenComments?: () => void
  onLinkClick?: (url: string) => void
  onContextMenu?: (e: React.MouseEvent | React.TouchEvent, msg: ChatMessage) => void
  currentUserId: string
  t: (k: string) => string
  lang: string
}

function MessageBubble({
  msg,
  mine,
  grouped,
  nextGrouped,
  highlighted,
  showSenderProfile,
  supportsComments,
  canDeleteOthers,
  canEditOthers,
  canPin,
  isPinned,
  onViewProfile,
  onReply,
  onEdit,
  onDelete,
  onPin,
  onCopy,
  onReact,
  onForward,
  onShare,
  onFavorite,
  onJumpToReply,
  onOpenComments,
  onLinkClick,
  onContextMenu,
  currentUserId,
  t,
  lang,
}: MessageBubbleProps) {
  const [showQuickReactions, setShowQuickReactions] = useState(false)
  const [imageOpen, setImageOpen] = useState(false)
  const { openVideoPlayer } = useAppStore()
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showAsImage =
    !!msg.attachmentUrl &&
    msg.type !== 'sticker' &&
    (msg.type === 'image' ||
      isImageUrl(msg.attachmentUrl, msg.attachmentMime, msg.attachmentName))
  const showAsCircleVideo =
    !!msg.attachmentUrl &&
    msg.type === 'video' &&
    msg.durationSec != null
  const showAsVideoAttachment =
    !!msg.attachmentUrl &&
    ((msg.type === 'video' && msg.durationSec == null) ||
      (msg.type === 'file' &&
        isVideoUrl(msg.attachmentUrl, msg.attachmentMime, msg.attachmentName)))
  const videoSrc = resolveMediaUrl(msg.attachmentUrl)
  const imageSrc = resolveMediaUrl(msg.attachmentUrl)

  // Group reactions by emoji
  const reactionGroups: Record<string, { count: number; userIds: string[]; names: string[] }> = {}
  for (const r of msg.reactions || []) {
    if (!reactionGroups[r.emoji]) {
      reactionGroups[r.emoji] = { count: 0, userIds: [], names: [] }
    }
    reactionGroups[r.emoji].count++
    reactionGroups[r.emoji].userIds.push(r.userId)
    reactionGroups[r.emoji].names.push(r.userName)
  }

  return (
    <motion.div
      id={`message-${msg.id}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={cn(
        'group relative flex min-w-0',
        showSenderProfile ? 'gap-2' : 'gap-0',
        mine ? 'flex-row-reverse' : 'flex-row',
        grouped ? 'mt-0.5' : 'mt-1.5',
      )}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu?.(e, msg)
      }}
      onTouchStart={(e) => {
        longPressTimerRef.current = setTimeout(() => {
          onContextMenu?.(e, msg)
        }, 500)
      }}
      onTouchEnd={() => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = null
        }
      }}
      onTouchMove={() => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = null
        }
      }}
    >
      {/* Avatars only in groups/channels — Telegram hides them in private chats */}
      {showSenderProfile ? (
        <div className="w-9 shrink-0">
          {!grouped && onViewProfile ? (
            <button
              type="button"
              onClick={onViewProfile}
              className="rounded-full transition hover:opacity-80"
              title={msg.sender.name}
            >
              <Avatar name={msg.sender.name} color={msg.sender.avatarColor} imageUrl={msg.sender.avatarUrl} size="sm" />
            </button>
          ) : !grouped ? (
            <Avatar name={msg.sender.name} color={msg.sender.avatarColor} imageUrl={msg.sender.avatarUrl} size="sm" />
          ) : null}
        </div>
      ) : null}
      <div className={cn('flex min-w-0 max-w-[85%] flex-col gap-0.5 sm:max-w-[65%]', mine ? 'items-end' : 'items-start')}>
        {/* Sender name only for others in groups — never "You" */}
        {!grouped && showSenderProfile && !mine && (
          <div className="flex items-baseline gap-2 px-1">
            <button
              type="button"
              onClick={onViewProfile}
              className="text-xs font-semibold text-[#3390ec] transition hover:underline"
            >
              {msg.sender.name}
            </button>
          </div>
        )}
        <div className="relative min-w-0 max-w-full">
          {/* Quick reaction bar */}
          <AnimatePresence>
            {showQuickReactions && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.95 }}
                className={cn(
                  'absolute -top-11 z-10 flex items-center gap-0.5 rounded-full border border-border bg-background px-1.5 py-1 shadow-lg',
                  mine ? 'right-0' : 'left-0',
                )}
              >
                {QUICK_REACTIONS.map((emoji) => {
                  const active = (msg.reactions || []).some(
                    (r) => r.emoji === emoji && r.userId === currentUserId,
                  )
                  return (
                    <button
                      key={emoji}
                      onClick={() => {
                        onReact(emoji)
                        setShowQuickReactions(false)
                      }}
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full text-lg transition hover:bg-muted',
                        active && 'bg-[#3390ec]/10',
                      )}
                    >
                      {emoji}
                    </button>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Forwarded indicator */}
          {msg.forwardedFrom && (
            <div
              className={cn(
                'mb-1 flex items-center gap-1 px-1 text-[10px]',
                mine ? 'text-white/60' : 'text-muted-foreground',
              )}
            >
              <Forward className="h-3 w-3" />
              {t('msg.forwarded')} · {msg.forwardedFrom.senderName}
            </div>
          )}

          <div
            className={cn(
              'relative min-w-0 max-w-full rounded-2xl px-3 py-1.5 text-[15px] leading-snug shadow-none transition-shadow',
              mine && msg.type !== 'gift' && msg.type !== 'sticker'
                ? 'bg-[var(--bubble-out)] text-white'
                : mine
                  ? ''
                  : msg.type !== 'gift' && msg.type !== 'sticker' && 'bg-[var(--bubble-in)] text-foreground shadow-none',
              mine && msg.type !== 'gift' && msg.type !== 'sticker' && (grouped ? 'rounded-tr-2xl' : 'rounded-tr-md'),
              !mine && msg.type !== 'gift' && msg.type !== 'sticker' && (grouped ? 'rounded-tl-2xl' : 'rounded-tl-md'),
              mine && msg.type !== 'gift' && msg.type !== 'sticker' && (nextGrouped ? 'rounded-br-2xl' : 'rounded-br-md'),
              !mine && msg.type !== 'gift' && msg.type !== 'sticker' && (nextGrouped ? 'rounded-bl-2xl' : 'rounded-bl-md'),
              msg.type === 'image' && !msg.content && 'p-1.5',
              showAsCircleVideo && !msg.content && 'p-1.5 bg-transparent shadow-none',
              showAsVideoAttachment && !msg.content && 'p-1.5',
              msg.type === 'voice' && 'min-w-[200px] sm:min-w-[240px]',
              msg.type === 'file' && !showAsVideoAttachment && 'min-w-[180px] sm:min-w-[220px]',
              msg.type === 'share' && 'min-w-[180px] sm:min-w-[220px]',
              msg.type === 'gift' && 'min-w-[200px] bg-transparent shadow-none',
              msg.type === 'sticker' && 'min-w-[140px] bg-transparent shadow-none p-1',
              highlighted && 'ring-2 ring-[#3390ec] ring-offset-2 ring-offset-background',
            )}
          >
            {msg.replyTo && (
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  if (msg.replyTo?.id) onJumpToReply?.(msg.replyTo.id)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    if (msg.replyTo?.id) onJumpToReply?.(msg.replyTo.id)
                  }
                }}
                className={cn(
                  'mb-1.5 cursor-pointer rounded-md border-l-[3px] px-2 py-1 text-xs',
                  mine
                    ? 'border-white/70 bg-white/10 text-white/90'
                    : 'border-[#3390ec] bg-[#3390ec]/10 text-muted-foreground',
                )}
              >
                <p className={cn('font-semibold', mine ? 'text-white' : 'text-[#3390ec]')}>
                  {msg.replyTo.senderName}
                </p>
                <p className="line-clamp-2 break-words opacity-90">{msg.replyTo.content}</p>
              </div>
            )}
            {showAsImage && imageSrc && (
              <button
                type="button"
                onClick={() => setImageOpen(true)}
                className="block overflow-hidden rounded-[10px]"
              >
                <img
                  src={imageSrc}
                  alt={msg.attachmentName || 'Изображение'}
                  className="max-h-[520px] max-w-full cursor-zoom-in object-cover transition hover:opacity-90"
                  loading="lazy"
                />
              </button>
            )}
            {showAsCircleVideo && msg.attachmentUrl && (
              <div className="relative">
                <VideoMessage
                  url={msg.attachmentUrl}
                  durationSec={msg.durationSec}
                  mine={mine}
                  avatarColor={msg.sender.avatarColor}
                  senderName={msg.sender.name}
                />
                <button
                  onClick={() => openVideoPlayer(msg.attachmentUrl!, msg.sender.name)}
                  className="absolute bottom-2 right-2 rounded-full bg-black/50 p-1.5 text-white backdrop-blur transition hover:bg-black/70"
                  title={t('video.openPlayer')}
                >
                  <Maximize className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {showAsVideoAttachment && videoSrc && (
              <div className="relative">
                <video
                  src={videoSrc}
                  controls
                  playsInline
                  preload="metadata"
                  className="max-h-80 max-w-full rounded-xl"
                />
                <button
                  type="button"
                  onClick={() => openVideoPlayer(msg.attachmentUrl!, msg.attachmentName || msg.sender.name)}
                  className="absolute bottom-2 right-2 rounded-full bg-black/50 p-1.5 text-white backdrop-blur transition hover:bg-black/70"
                  title={t('video.openPlayer')}
                >
                  <Maximize className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {msg.type === 'gift' && (
              <GiftMessageBubble metadata={msg.metadata} content={msg.content} mine={mine} />
            )}
            {msg.type === 'sticker' && (
              <StickerMessageBubble attachmentUrl={msg.attachmentUrl} />
            )}
            {msg.type === 'share' && msg.metadata && (
              <ShareMessageCard
                metadata={msg.metadata}
                mine={mine}
                caption={msg.content || undefined}
              />
            )}
            {msg.attachmentUrl && msg.type === 'voice' && (
              <VoicePlayer
                url={msg.attachmentUrl}
                durationSec={msg.durationSec}
                mine={mine}
                messageId={msg.id}
              />
            )}
            {msg.attachmentUrl && msg.type === 'file' && !showAsImage && !showAsVideoAttachment && (
              <FileAttachment
                url={msg.attachmentUrl}
                name={msg.attachmentName || 'Файл'}
                mime={msg.attachmentMime}
                size={msg.attachmentSize}
                mine={mine}
              />
            )}
            {msg.content && msg.type !== 'gift' && (
              <ReadMoreText
                text={msg.content}
                linkClassName={mine ? 'text-white/90' : 'text-[#3390ec]'}
                readMoreLabel={t('share.readMore')}
                readLessLabel={t('share.readLess')}
                onLinkClick={onLinkClick}
              />
            )}
            <div
              className={cn(
                'mt-0.5 flex items-center justify-end gap-1',
                (msg.type === 'image' || msg.type === 'file' || msg.type === 'voice' || msg.type === 'sticker') && !msg.content && 'px-1 pb-0.5',
              )}
            >
              {msg.isFavorite && (
                <Star className={cn('h-3 w-3', mine ? 'fill-amber-300 text-amber-300' : 'fill-amber-500 text-amber-500')} />
              )}
              {isPinned && (
                <Pin className={cn('h-3 w-3', mine ? 'text-white/70' : 'text-[#3390ec]')} />
              )}
              {msg.editedAt && (
                <span
                  className={cn(
                    'text-[10px] italic',
                    mine ? 'text-white/50' : 'text-muted-foreground',
                  )}
                >
                  {t('msg.edited')}
                </span>
              )}
              <span
                className={cn(
                  'text-[10px] tabular-nums',
                  mine ? 'text-white/70' : 'text-muted-foreground',
                )}
              >
                {formatMessageTime(msg.createdAt)}
              </span>
              {mine && (
                <CheckCheck className="h-3.5 w-3.5 shrink-0 text-white/55" strokeWidth={2.25} />
              )}
            </div>
          </div>

          {/* Reactions display */}
          {Object.keys(reactionGroups).length > 0 && (
            <div
              className={cn(
                'mt-1 flex flex-wrap gap-1',
                mine ? 'justify-end' : 'justify-start',
              )}
            >
              {Object.entries(reactionGroups).map(([emoji, info]) => {
                const mineReacted = info.userIds.includes(currentUserId)
                return (
                  <button
                    key={emoji}
                    onClick={() => onReact(emoji)}
                    title={info.names.join(', ')}
                    className={cn(
                      'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition',
                      mineReacted
                        ? 'border-[#3390ec] bg-[#3390ec]/15 text-[#3390ec]'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <span>{emoji}</span>
                    <span className="tabular-nums">{info.count}</span>
                  </button>
                )
              })}
            </div>
          )}

          {supportsComments && onOpenComments && (
            <button
              type="button"
              onClick={onOpenComments}
              className={cn(
                'mt-1 flex items-center gap-1.5 text-xs font-medium text-[#3390ec] transition hover:text-[#2b82d9]',
                mine ? 'justify-end' : 'justify-start',
              )}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              {(msg.commentCount ?? 0) > 0
                ? t('comments.count').replace('{n}', String(msg.commentCount))
                : t('comments.leave')}
            </button>
          )}

          {/* Hover actions */}
          <div
            className={cn(
              'absolute top-0 hidden gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 sm:flex',
              mine ? '-left-12' : '-right-12',
            )}
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full bg-background shadow-sm"
              onClick={() => setShowQuickReactions((v) => !v)}
              title={t('msg.reaction')}
            >
              <Smile className="h-3.5 w-3.5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full bg-background shadow-sm"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={mine ? 'end' : 'start'}>
                <DropdownMenuItem onClick={() => onReact('👍')}>
                  <Smile className="mr-2 h-3.5 w-3.5" /> {t('msg.reaction')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onReply}>
                  <Reply className="mr-2 h-3.5 w-3.5" /> {t('msg.reply')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onCopy}>
                  <Copy className="mr-2 h-3.5 w-3.5" /> {t('msg.copy')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onForward}>
                  <Forward className="mr-2 h-3.5 w-3.5" /> {t('msg.forward')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onShare}>
                  <Share2 className="mr-2 h-3.5 w-3.5" /> {t('msg.share')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onFavorite}>
                  {msg.isFavorite ? (
                    <><StarOff className="mr-2 h-3.5 w-3.5" /> {t('msg.unfavorite')}</>
                  ) : (
                    <><Star className="mr-2 h-3.5 w-3.5" /> {t('msg.favorite')}</>
                  )}
                </DropdownMenuItem>
                {canPin && onPin && (
                  <DropdownMenuItem onClick={() => onPin(!isPinned)}>
                    {isPinned ? (
                      <><PinOff className="mr-2 h-3.5 w-3.5" /> {t('msg.unpin')}</>
                    ) : (
                      <><Pin className="mr-2 h-3.5 w-3.5" /> {t('msg.pin')}</>
                    )}
                  </DropdownMenuItem>
                )}
                {(mine || canDeleteOthers || canEditOthers) && (
                  <>
                    {(mine || canEditOthers) && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onEdit}>
                          <Edit3 className="mr-2 h-3.5 w-3.5" /> {t('msg.edit')}
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuItem
                      onClick={onDelete}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> {t('msg.delete')}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <MediaLightbox
        url={imageOpen ? msg.attachmentUrl : null}
        alt={msg.attachmentName || 'Изображение'}
        onClose={() => setImageOpen(false)}
      />
    </motion.div>
  )
}

interface AlbumBubbleProps {
  messages: ChatMessage[]
  mine: boolean
  grouped: boolean
  nextGrouped?: boolean
  highlighted?: boolean
  showSenderProfile?: boolean
  canDeleteOthers?: boolean
  canPin?: boolean
  isPinned?: boolean
  onViewProfile?: () => void
  onReply: () => void
  onDelete: () => void
  onPin?: (pinned: boolean) => void
  onCopy: () => void
  onReact: (emoji: string) => void
  onForward: () => void
  onShare: () => void
  onFavorite: () => void
  onContextMenu?: (e: React.MouseEvent | React.TouchEvent, msg: ChatMessage) => void
  currentUserId: string
  t: (k: string) => string
  lang: string
}

function AlbumBubble({
  messages,
  mine,
  grouped,
  nextGrouped,
  highlighted,
  showSenderProfile,
  canDeleteOthers,
  canPin,
  isPinned,
  onViewProfile,
  onReply,
  onDelete,
  onPin,
  onCopy,
  onReact,
  onForward,
  onShare,
  onFavorite,
  onContextMenu,
  currentUserId,
  t,
}: AlbumBubbleProps) {
  const first = messages[0]
  const last = messages[messages.length - 1]
  const [openImageUrl, setOpenImageUrl] = useState<string | null>(null)
  const { openVideoPlayer } = useAppStore()
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const visible = messages.slice(0, 10)
  const cols = visible.length <= 1 ? 1 : visible.length === 2 ? 2 : visible.length <= 4 ? 2 : 3

  const reactionGroups: Record<string, { count: number; userIds: string[]; names: string[] }> = {}
  for (const r of first.reactions || []) {
    if (!reactionGroups[r.emoji]) {
      reactionGroups[r.emoji] = { count: 0, userIds: [], names: [] }
    }
    reactionGroups[r.emoji].count++
    reactionGroups[r.emoji].userIds.push(r.userId)
    reactionGroups[r.emoji].names.push(r.userName)
  }

  const openCell = (msg: ChatMessage) => {
    if (!msg.attachmentUrl) return
    const isVideo =
      msg.type === 'video' ||
      isVideoUrl(msg.attachmentUrl, msg.attachmentMime, msg.attachmentName)
    if (isVideo) {
      openVideoPlayer(msg.attachmentUrl, msg.attachmentName || msg.sender.name)
    } else {
      setOpenImageUrl(msg.attachmentUrl)
    }
  }

  return (
    <motion.div
      id={`message-${first.id}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={cn(
        'group relative flex',
        showSenderProfile ? 'gap-2' : 'gap-0',
        mine ? 'flex-row-reverse' : 'flex-row',
      )}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu?.(e, first)
      }}
      onTouchStart={(e) => {
        longPressTimerRef.current = setTimeout(() => {
          onContextMenu?.(e, first)
        }, 500)
      }}
      onTouchEnd={() => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = null
        }
      }}
      onTouchMove={() => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = null
        }
      }}
    >
      {showSenderProfile ? (
        <div className="w-9 shrink-0">
          {!grouped && onViewProfile ? (
            <button
              type="button"
              onClick={onViewProfile}
              className="rounded-full transition hover:opacity-80"
              title={first.sender.name}
            >
              <Avatar name={first.sender.name} color={first.sender.avatarColor} imageUrl={first.sender.avatarUrl} size="sm" />
            </button>
          ) : !grouped ? (
            <Avatar name={first.sender.name} color={first.sender.avatarColor} imageUrl={first.sender.avatarUrl} size="sm" />
          ) : null}
        </div>
      ) : null}
      <div className={cn('flex min-w-[200px] max-w-[85%] flex-col gap-0.5', mine ? 'items-end' : 'items-start')}>
        {!grouped && showSenderProfile && !mine && (
          <div className="flex items-baseline gap-2 px-1">
            <button
              type="button"
              onClick={onViewProfile}
              className="text-xs font-semibold text-[#3390ec] transition hover:underline"
            >
              {first.sender.name}
            </button>
          </div>
        )}
        <div
          className={cn(
            'relative overflow-hidden rounded-2xl p-1 shadow-sm',
            mine
              ? 'bg-[#3390ec] text-white'
              : 'bg-white text-foreground shadow-sm dark:bg-[#212121] dark:shadow-none',
            // Telegram-style tails
            !grouped && (mine ? 'rounded-tr-md' : 'rounded-tl-md'),
            !nextGrouped && (mine ? 'rounded-br-md' : 'rounded-bl-md'),
            highlighted && 'ring-2 ring-[#3390ec]',
          )}
        >
          <div
            className={cn('grid gap-1', albumGridClass(visible.length))}
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {visible.map((msg) => {
              const src = resolveMediaUrl(msg.attachmentUrl)
              const isVideo =
                msg.type === 'video' ||
                isVideoUrl(msg.attachmentUrl, msg.attachmentMime, msg.attachmentName)
              return (
                <button
                  key={msg.id}
                  type="button"
                  onClick={() => openCell(msg)}
                  className="relative aspect-square overflow-hidden rounded-lg bg-black/10"
                >
                  {src && (
                    isVideo ? (
                      <>
                        <video
                          src={src}
                          preload="metadata"
                          muted
                          playsInline
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute bottom-1 right-1 rounded-full bg-black/50 p-1 text-white">
                          <Maximize className="h-3 w-3" />
                        </span>
                      </>
                    ) : (
                      <img
                        src={src}
                          alt={msg.attachmentName || t('chat.album')}
                        className="h-full w-full cursor-zoom-in object-cover transition hover:opacity-90"
                        loading="lazy"
                      />
                    )
                  )}
                </button>
              )
            })}
          </div>
          <div
            className={cn(
              'mt-0.5 flex items-center gap-1 px-1 pb-0.5',
              mine ? 'justify-end' : 'justify-start',
            )}
          >
            {first.isFavorite && (
              <Star className={cn('h-3 w-3', mine ? 'fill-amber-300 text-amber-300' : 'fill-amber-500 text-amber-500')} />
            )}
            {isPinned && (
              <Pin className={cn('h-3 w-3', mine ? 'text-white/70' : 'text-[#3390ec]')} />
            )}
            <span
              className={cn(
                'text-[10px] tabular-nums',
                mine ? 'text-white/70' : 'text-muted-foreground',
              )}
            >
              {formatMessageTime(last.createdAt)}
            </span>
          </div>
        </div>

        {Object.keys(reactionGroups).length > 0 && (
          <div
            className={cn(
              'mt-1 flex flex-wrap gap-1',
              mine ? 'justify-end' : 'justify-start',
            )}
          >
            {Object.entries(reactionGroups).map(([emoji, info]) => {
              const mineReacted = info.userIds.includes(currentUserId)
              return (
                <button
                  key={emoji}
                  onClick={() => onReact(emoji)}
                  title={info.names.join(', ')}
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition',
                    mineReacted
                      ? 'border-[#3390ec] bg-[#3390ec]/15 text-[#3390ec]'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  <span>{emoji}</span>
                  <span className="tabular-nums">{info.count}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Hover actions */}
        <div
          className={cn(
            'absolute top-0 hidden gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 sm:flex',
            mine ? '-left-12' : '-right-12',
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full bg-background shadow-sm"
            onClick={() => onReact('👍')}
            title={t('msg.reaction')}
          >
            <Smile className="h-3.5 w-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full bg-background shadow-sm"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={mine ? 'end' : 'start'}>
              <DropdownMenuItem onClick={() => onReact('👍')}>
                <Smile className="mr-2 h-3.5 w-3.5" /> {t('msg.reaction')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onReply}>
                <Reply className="mr-2 h-3.5 w-3.5" /> {t('msg.reply')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCopy}>
                <Copy className="mr-2 h-3.5 w-3.5" /> {t('msg.copy')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onForward}>
                <Forward className="mr-2 h-3.5 w-3.5" /> {t('msg.forward')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onShare}>
                <Share2 className="mr-2 h-3.5 w-3.5" /> {t('msg.share')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onFavorite}>
                {first.isFavorite ? (
                  <><StarOff className="mr-2 h-3.5 w-3.5" /> {t('msg.unfavorite')}</>
                ) : (
                  <><Star className="mr-2 h-3.5 w-3.5" /> {t('msg.favorite')}</>
                )}
              </DropdownMenuItem>
              {canPin && onPin && (
                <DropdownMenuItem onClick={() => onPin(!isPinned)}>
                  {isPinned ? (
                    <><PinOff className="mr-2 h-3.5 w-3.5" /> {t('msg.unpin')}</>
                  ) : (
                    <><Pin className="mr-2 h-3.5 w-3.5" /> {t('msg.pin')}</>
                  )}
                </DropdownMenuItem>
              )}
              {(mine || canDeleteOthers) && (
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> {t('msg.delete')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <MediaLightbox
        url={openImageUrl}
        alt={first.attachmentName || t('chat.album')}
        onClose={() => setOpenImageUrl(null)}
      />
    </motion.div>
  )
}

function EmptyChatState() {
  const { t } = useI18n()
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-background p-8 text-center">
      <div className="absolute inset-0 -z-10 opacity-50">
        <div className="absolute left-1/4 top-1/4 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
      </div>
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500 to-cyan-400 shadow-2xl shadow-violet-500/30"
      >
        <Sparkle />
      </motion.div>
      <h2 className="mt-6 text-xl font-bold">{t('app.welcome')}</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        {t('app.welcomeHint')}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Realtime
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> {t('msg.reaction')}
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" /> {t('chat.image')}
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> {t('chat.voice')}
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> {t('msg.edit')}
        </span>
      </div>
    </div>
  )
}

function Sparkle() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-12 w-12 text-white"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3L13.9 8.6L19.5 10.5L13.9 12.4L12 18L10.1 12.4L4.5 10.5L10.1 8.6L12 3Z" />
      <path d="M19 14L19.7 16L21.7 16.7L19.7 17.4L19 19.4L18.3 17.4L16.3 16.7L18.3 16L19 14Z" />
      <path d="M5 4L5.7 6L7.7 6.7L5.7 7.4L5 9.4L4.3 7.4L2.3 6.7L4.3 6L5 4Z" />
    </svg>
  )
}

function AttachTile({
  icon,
  color,
  label,
  onClick,
}: {
  icon: React.ReactNode
  color: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 transition active:scale-95"
    >
      <span
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-md',
          color,
        )}
      >
        {icon}
      </span>
      <span className="max-w-[72px] truncate text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
    </button>
  )
}
