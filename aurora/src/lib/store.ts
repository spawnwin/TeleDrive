'use client'

import { create } from 'zustand'
import type { Lang } from '@/lib/i18n'
import type { ChatMessage } from '@/hooks/use-socket'
import type { ChatFolder } from '@/lib/chat-folders'
import type { SharePayload } from '@/lib/share-payload'
import type { ChatWallpaper } from '@/lib/chat-wallpaper'
import { parseChatWallpaper } from '@/lib/chat-wallpaper'
import { savePushEnabledPreference } from '@/lib/push-prefs'
import {
  loadCallSoundPreference,
  loadMessageSoundPreference,
  loadNotificationSoundPreference,
  saveCallSoundPreference,
  saveMessageSoundPreference,
  saveNotificationSoundPreference,
} from '@/lib/notification-sound'
import { isUserOnline } from '@/lib/friends-client'

const DRAFTS_KEY = 'aurora:drafts'

function loadDrafts(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(DRAFTS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveDrafts(drafts: Record<string, string>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts))
  } catch {
    /* ignore quota errors */
  }
}

export interface User {
  id: string
  username: string
  name: string
  avatarColor: string
  avatarUrl?: string | null
  bio?: string | null
  online?: boolean
  lastSeen?: string
  language?: Lang
  balance?: number
  coins?: number
  isPremium?: boolean
  isAdmin?: boolean
  premiumUntil?: string | null
  premiumTheme?: string | null
  chatWallpaper?: ChatWallpaper | null
  emojiStatus?: string | null
  lastDailyBonus?: string | null
  publicKey?: string | null
  twoFactorEnabled?: boolean
  storageUsed?: number
  storageQuota?: number
  isBot?: boolean
  /** Linked Yandex Music account (token never exposed to the client). */
  yandexMusicConnected?: boolean
}

export interface ChatListItem {
  id: string
  type: 'private' | 'group' | 'channel' | 'saved'
  title: string
  avatarColor: string
  avatarUrl?: string | null
  slug?: string | null
  description?: string | null
  subscriberCount?: number
  slowModeSeconds?: number
  unread: number
  lastReadAt: string
  /** Peer last-read timestamp (private chats only). */
  peerLastReadAt?: string | null
  isPinned: boolean
  isMuted: boolean
  isArchived: boolean
  pinnedAt: string | null
  wallpaper?: ChatWallpaper | null
  members: User[]
  lastMessage: {
    id: string
    content: string
    createdAt: string
    senderName: string
    senderId: string
    type?: string
    attachmentUrl?: string | null
    attachmentName?: string | null
    durationSec?: number | null
  } | null
  updatedAt: string
}

interface AppState {
  currentUser: User | null
  chats: ChatListItem[]
  activeChatId: string | null
  onlineUserIds: Set<string>
  presenceSynced: boolean
  theme: 'light' | 'dark'
  lang: Lang
  pushEnabled: boolean
  notificationSoundEnabled: boolean
  messageSoundEnabled: boolean
  callSoundEnabled: boolean
  view: 'chats' | 'feed' | 'shorts' | 'marketplace'
  profileUserId: string | null
  browserUrl: string | null
  videoPlayerUrl: string | null
  videoPlayerTitle: string | null
  pendingCall: { userId: string; type: 'audio' | 'video' } | null
  sharePayload: SharePayload | null
  pendingShortId: string | null
  pendingMessageJump: { chatId: string; messageId: string } | null
  messageBroadcastFn: ((msg: ChatMessage) => void) | null
  appendMessageFn: ((msg: ChatMessage) => void) | null
  webrtcStartCall:
    | ((
        peerId: string,
        peerName: string,
        peerAvatarColor: string,
        peerAvatarUrl: string | null,
        type: 'audio' | 'video',
      ) => void)
    | null
  // Shorts feed — creators the current user is subscribed to.
  subscribedCreatorIds: Set<string>
  // Shorts feed — active segment ("foryou" | "subscriptions"), persisted in localStorage by feed.
  shortsSegment: 'foryou' | 'subscriptions'
  // Personal Telegram-style chat folders.
  chatFolders: ChatFolder[]
  // null = "All Chats" pseudo-folder.
  activeFolderId: string | null

  // Telegram-style typing indicators in the chat list: chatId -> userId -> name
  typingByChat: Record<string, Record<string, string>>
  // Telegram-style per-chat text drafts (persisted to localStorage).
  drafts: Record<string, string>

  setCurrentUser: (u: User | null) => void
  setChats: (c: ChatListItem[]) => void
  upsertChat: (c: ChatListItem) => void
  setActiveChat: (id: string | null) => void
  markChatRead: (id: string) => void
  markChatUnread: (id: string) => void
  incrementUnread: (id: string) => void
  updateLastMessage: (chatId: string, msg: ChatListItem['lastMessage']) => void
  setChatPinned: (id: string, pinned: boolean) => void
  setChatMuted: (id: string, muted: boolean) => void
  setChatArchived: (id: string, archived: boolean) => void
  setChatWallpaper: (id: string, wallpaper: ChatWallpaper | null) => void
  removeChat: (id: string) => void
  setPresence: (userId: string, online: boolean) => void
  syncPresence: (userIds: string[]) => void
  toggleTheme: () => void
  setTheme: (t: 'light' | 'dark') => void
  setLang: (l: Lang) => void
  setPushEnabled: (v: boolean) => void
  setNotificationSoundEnabled: (v: boolean) => void
  setMessageSoundEnabled: (v: boolean) => void
  setCallSoundEnabled: (v: boolean) => void
  setView: (v: 'chats' | 'feed' | 'shorts' | 'marketplace') => void
  setProfileUserId: (id: string | null) => void
  openBrowser: (url: string) => void
  closeBrowser: () => void
  openVideoPlayer: (url: string, title?: string) => void
  closeVideoPlayer: () => void
  setPendingCall: (call: { userId: string; type: 'audio' | 'video' } | null) => void
  openShareToChat: (payload: SharePayload) => void
  closeShareToChat: () => void
  setPendingShortId: (id: string | null) => void
  setPendingMessageJump: (jump: { chatId: string; messageId: string } | null) => void
  clearPendingMessageJump: () => void
  setMessageBroadcastFn: (fn: ((msg: ChatMessage) => void) | null) => void
  setAppendMessageFn: (fn: ((msg: ChatMessage) => void) | null) => void
  setWebrtcStartCall: (
    fn:
      | ((
          peerId: string,
          peerName: string,
          peerAvatarColor: string,
          peerAvatarUrl: string | null,
          type: 'audio' | 'video',
        ) => void)
      | null,
  ) => void
  setSubscribedCreatorIds: (ids: string[]) => void
  addSubscribedCreator: (id: string) => void
  removeSubscribedCreator: (id: string) => void
  setShortsSegment: (segment: 'foryou' | 'subscriptions') => void
  setChatFolders: (folders: ChatFolder[]) => void
  upsertChatFolder: (folder: ChatFolder) => void
  removeChatFolder: (id: string) => void
  setActiveFolderId: (id: string | null) => void
  setTyping: (chatId: string, userId: string, name: string) => void
  clearTyping: (chatId: string, userId: string) => void
  clearChatTyping: (chatId: string) => void
  setDraft: (chatId: string, text: string) => void
  clearDraft: (chatId: string) => void
}

function sortChats(chats: ChatListItem[]): ChatListItem[] {
  const saved = chats.filter((c) => c.type === 'saved')
  const rest = chats.filter((c) => c.type !== 'saved')
  const sortedRest = [...rest].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
    if (a.isPinned && b.isPinned && a.pinnedAt && b.pinnedAt) {
      return new Date(b.pinnedAt).getTime() - new Date(a.pinnedAt).getTime()
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
  return [...saved, ...sortedRest]
}

export const useAppStore = create<AppState>((set) => ({
  currentUser: null,
  chats: [],
  activeChatId: null,
  onlineUserIds: new Set<string>(),
  presenceSynced: false,
  theme: 'dark',
  lang: 'ru',
  pushEnabled: false,
  notificationSoundEnabled: loadNotificationSoundPreference(),
  messageSoundEnabled: loadMessageSoundPreference(),
  callSoundEnabled: loadCallSoundPreference(),
  view: 'chats',
  profileUserId: null,
  browserUrl: null,
  videoPlayerUrl: null,
  videoPlayerTitle: null,
  pendingCall: null,
  sharePayload: null,
  pendingShortId: null,
  pendingMessageJump: null,
  messageBroadcastFn: null,
  appendMessageFn: null,
  webrtcStartCall: null,
  subscribedCreatorIds: new Set<string>(),
  shortsSegment: 'foryou',
  chatFolders: [],
  activeFolderId: null,
  typingByChat: {},
  drafts: loadDrafts(),

  setCurrentUser: (u) =>
    set((state) => ({
      currentUser: u
        ? {
            ...u,
            chatWallpaper: parseChatWallpaper(
              (u as { chatWallpaper?: unknown }).chatWallpaper,
            ),
          }
        : null,
      lang: u?.language || 'ru',
      ...(u === null
        ? {
            presenceSynced: false,
            onlineUserIds: new Set<string>(),
            chatFolders: [],
            activeFolderId: null,
          }
        : {}),
      // Preserve the active folder across the bootstrap refetch; only clear it
      // when the active folder is genuinely gone (handled in setChatFolders).
      chatFolders: u === null ? [] : state.chatFolders,
    })),
  setChats: (c) =>
    set((state) => {
      const next = new Set(state.onlineUserIds)
      // Only seed onlineUserIds from DB `online` before the live socket set
      // (presence:sync) arrives. Once synced, the socket set is authoritative —
      // re-adding DB-online members on every chat refetch would resurrect users
      // whose DB row is stale-online after an ungraceful disconnect.
      if (!state.presenceSynced) {
        for (const chat of c) {
          for (const m of chat.members) {
            if (isUserOnline(m.id, m.online, new Set(), false, m.lastSeen)) {
              next.add(m.id)
            }
          }
        }
      }
      const activeId = state.activeChatId
      const normalized = activeId
        ? c.map((chat) =>
            chat.id === activeId ? { ...chat, unread: 0 } : chat,
          )
        : c
      return { chats: sortChats(normalized), onlineUserIds: next }
    }),
  upsertChat: (chat) =>
    set((state) => {
      const idx = state.chats.findIndex((c) => c.id === chat.id)
      if (idx === -1) return { chats: sortChats([chat, ...state.chats]) }
      const copy = [...state.chats]
      copy[idx] = { ...copy[idx], ...chat }
      return { chats: sortChats(copy) }
    }),
  setActiveChat: (id) => set({ activeChatId: id }),
  markChatRead: (id) => {
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === id
          ? { ...c, unread: 0, lastReadAt: new Date().toISOString() }
          : c,
      ),
    }))
    fetch(`/api/chats/${id}/read`, { method: 'POST' }).catch(() => {})
  },
  markChatUnread: (id) => {
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === id ? { ...c, unread: Math.max(c.unread || 0, 1) } : c,
      ),
    }))
    fetch(`/api/chats/${id}/unread`, { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        if (data.unread != null) {
          set((state) => ({
            chats: state.chats.map((c) =>
              c.id === id ? { ...c, unread: data.unread } : c,
            ),
          }))
        }
      })
      .catch(() => {})
  },
  incrementUnread: (id) =>
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === id && !c.isMuted ? { ...c, unread: (c.unread || 0) + 1 } : c,
      ),
    })),
  updateLastMessage: (chatId, msg) =>
    set((state) => {
      const idx = state.chats.findIndex((c) => c.id === chatId)
      if (idx === -1) return {}
      const updated = {
        ...state.chats[idx],
        lastMessage: msg,
        unread:
          state.chats[idx].id === state.activeChatId
            ? 0
            : (state.chats[idx].unread || 0) +
              (msg && msg.senderId !== state.currentUser?.id ? 1 : 0),
      }
      const rest = state.chats.filter((_, i) => i !== idx)
      const next = sortChats([updated, ...rest])
      return { chats: next }
    }),
  setPresence: (userId, online) =>
    set((state) => {
      const next = new Set(state.onlineUserIds)
      if (online) next.add(userId)
      else next.delete(userId)
      // Reflect the transition in lastSeen so formatLastSeen doesn't show a
      // stale "был вчера" right after we learn the user is online / just went
      // offline. The DB write happens server-side; this is the local mirror.
      const nowIso = new Date().toISOString()
      const chats = state.chats.map((chat) => ({
        ...chat,
        members: chat.members.map((m) =>
          m.id === userId ? { ...m, online, lastSeen: nowIso } : m,
        ),
      }))
      return { onlineUserIds: next, chats }
    }),
  syncPresence: (userIds) =>
    set((state) => {
      const next = new Set(userIds)
      const nowIso = new Date().toISOString()
      const prevOnline = state.onlineUserIds
      const chats = state.chats.map((chat) => ({
        ...chat,
        members: chat.members.map((m) => {
          if (next.has(m.id)) {
            // Live socket says online — lastSeen is "now".
            return { ...m, online: true, lastSeen: nowIso }
          }
          // User is offline per the live set. If we previously thought they
          // were online (DB or prior set), treat the drop as "just now" rather
          // than stranding the UI on a stale "был вчера" from an old DB row.
          if (prevOnline.has(m.id) || m.online) {
            return { ...m, online: false, lastSeen: nowIso }
          }
          return { ...m, online: false }
        }),
      }))
      return { onlineUserIds: next, chats, presenceSynced: true }
    }),
  setChatPinned: (id, pinned) =>
    set((state) => ({
      chats: sortChats(
        state.chats.map((c) =>
          c.id === id
            ? { ...c, isPinned: pinned, pinnedAt: pinned ? new Date().toISOString() : null }
            : c,
        ),
      ),
    })),
  setChatMuted: (id, muted) =>
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === id ? { ...c, isMuted: muted } : c,
      ),
    })),
  setChatArchived: (id, archived) =>
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === id ? { ...c, isArchived: archived } : c,
      ),
    })),
  setChatWallpaper: (id, wallpaper) =>
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === id ? { ...c, wallpaper } : c,
      ),
    })),
  removeChat: (id) =>
    set((state) => ({
      chats: state.chats.filter((c) => c.id !== id),
      activeChatId: state.activeChatId === id ? null : state.activeChatId,
    })),
  toggleTheme: () =>
    set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
  setTheme: (t) => set({ theme: t }),
  setLang: (l) => set({ lang: l }),
  setPushEnabled: (v) => {
    savePushEnabledPreference(v)
    set({ pushEnabled: v })
  },
  setNotificationSoundEnabled: (v) => {
    saveNotificationSoundPreference(v)
    set({ notificationSoundEnabled: v, messageSoundEnabled: v, callSoundEnabled: v })
  },
  setMessageSoundEnabled: (v) => {
    saveMessageSoundPreference(v)
    set({ messageSoundEnabled: v })
  },
  setCallSoundEnabled: (v) => {
    saveCallSoundPreference(v)
    set({ callSoundEnabled: v })
  },
  setView: (v) => set({ view: v }),
  setProfileUserId: (id) => set({ profileUserId: id }),
  openBrowser: (url) => set({ browserUrl: url }),
  closeBrowser: () => set({ browserUrl: null }),
  openVideoPlayer: (url, title) => set({ videoPlayerUrl: url, videoPlayerTitle: title ?? null }),
  closeVideoPlayer: () => set({ videoPlayerUrl: null, videoPlayerTitle: null }),
  setPendingCall: (call) => set({ pendingCall: call }),
  openShareToChat: (payload) => set({ sharePayload: payload }),
  closeShareToChat: () => set({ sharePayload: null }),
  setPendingShortId: (id) => set({ pendingShortId: id }),
  setPendingMessageJump: (jump) => set({ pendingMessageJump: jump }),
  clearPendingMessageJump: () => set({ pendingMessageJump: null }),
  setMessageBroadcastFn: (fn) => set({ messageBroadcastFn: fn }),
  setAppendMessageFn: (fn) => set({ appendMessageFn: fn }),
  setWebrtcStartCall: (fn) => set({ webrtcStartCall: fn }),
  setSubscribedCreatorIds: (ids) =>
    set({ subscribedCreatorIds: new Set(ids) }),
  addSubscribedCreator: (id) =>
    set((state) => {
      if (state.subscribedCreatorIds.has(id)) return {}
      const next = new Set(state.subscribedCreatorIds)
      next.add(id)
      return { subscribedCreatorIds: next }
    }),
  removeSubscribedCreator: (id) =>
    set((state) => {
      if (!state.subscribedCreatorIds.has(id)) return {}
      const next = new Set(state.subscribedCreatorIds)
      next.delete(id)
      return { subscribedCreatorIds: next }
    }),
  setShortsSegment: (segment) => set({ shortsSegment: segment }),
  setChatFolders: (folders) =>
    set((state) => {
      const sorted = [...folders].sort((a, b) => a.position - b.position)
      const activeId = state.activeFolderId
      const activeStillExists =
        activeId == null || sorted.some((f) => f.id === activeId)
      return {
        chatFolders: sorted,
        activeFolderId: activeStillExists ? activeId : null,
      }
    }),
  upsertChatFolder: (folder) =>
    set((state) => {
      const idx = state.chatFolders.findIndex((f) => f.id === folder.id)
      let next: ChatFolder[]
      if (idx === -1) {
        next = [...state.chatFolders, folder]
      } else {
        next = [...state.chatFolders]
        next[idx] = folder
      }
      return { chatFolders: next.sort((a, b) => a.position - b.position) }
    }),
  removeChatFolder: (id) =>
    set((state) => ({
      chatFolders: state.chatFolders.filter((f) => f.id !== id),
      activeFolderId: state.activeFolderId === id ? null : state.activeFolderId,
    })),
  setActiveFolderId: (id) => set({ activeFolderId: id }),
  setTyping: (chatId, userId, name) =>
    set((state) => {
      const cur = state.typingByChat[chatId] || {}
      if (cur[userId] === name) {
        // already set; no-op to avoid re-renders
        return {}
      }
      return {
        typingByChat: {
          ...state.typingByChat,
          [chatId]: { ...cur, [userId]: name },
        },
      }
    }),
  clearTyping: (chatId, userId) =>
    set((state) => {
      const cur = state.typingByChat[chatId]
      if (!cur || !cur[userId]) return {}
      const nextChat = { ...cur }
      delete nextChat[userId]
      const nextTyping = { ...state.typingByChat }
      if (Object.keys(nextChat).length === 0) delete nextTyping[chatId]
      else nextTyping[chatId] = nextChat
      return { typingByChat: nextTyping }
    }),
  clearChatTyping: (chatId) =>
    set((state) => {
      if (!state.typingByChat[chatId]) return {}
      const nextTyping = { ...state.typingByChat }
      delete nextTyping[chatId]
      return { typingByChat: nextTyping }
    }),
  setDraft: (chatId, text) =>
    set((state) => {
      const trimmed = text ?? ''
      if ((state.drafts[chatId] ?? '') === trimmed) return {}
      const next = { ...state.drafts }
      if (trimmed) next[chatId] = trimmed
      else delete next[chatId]
      saveDrafts(next)
      return { drafts: next }
    }),
  clearDraft: (chatId) =>
    set((state) => {
      if (!state.drafts[chatId]) return {}
      const next = { ...state.drafts }
      delete next[chatId]
      saveDrafts(next)
      return { drafts: next }
    }),
}))
