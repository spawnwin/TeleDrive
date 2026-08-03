'use client'

import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { readJsonResponse } from '@/lib/fetch-json'
import {
  Search,
  Plus,
  Settings,
  LogOut,
  MessageCirclePlus,
  Users,
  Sparkles,
  Check,
  CheckCheck,
  Pin,
  PinOff,
  Bookmark,
  BellOff,
  ImageIcon,
  Archive,
  ArchiveRestore,
  Mic,
  MessageSquare,
  Clapperboard,
  Newspaper,
  Coins,
  UserCircle,
  Trash2,
  Mail,
  FolderPlus,
  Shield,
  Store,
  Radio,
  MoreVertical,
  ArrowLeft,
  Megaphone,
} from 'lucide-react'
import { Avatar } from './avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useAppStore, type ChatListItem } from '@/lib/store'
import { useI18n } from '@/hooks/use-i18n'
import { cn } from '@/lib/utils'
import { isUserOnline } from '@/lib/friends-client'
import { toast } from 'sonner'
import { formatChatTime } from '@/lib/format'
import { getChatAvatarImageUrl } from '@/lib/chat-avatar'
import { isE2EEPayload } from '@/lib/e2ee-payload'
import { filterChatsByFolder, type ChatFolder } from '@/lib/chat-folders'
import { EmojiStatusBadge } from './emoji-status-badge'
import { StoriesRow } from './stories-row'
import { SwipeableRow } from './swipeable-row'
import { StoryRing } from './story-ring'
import { StoryViewer } from './story-viewer'
import { AddStoryDialog } from './add-story-dialog'
import { FriendsDialog } from './friends-dialog'
import { FriendButton } from './friend-button'
import { EXIT_TO_CHATS_EVENT } from '@/hooks/use-swipe-to-back'
import { joinPublicChatBySlug, openPrivateChatWithUser } from '@/lib/open-private-chat'
import { UnreadBadge, UnreadLeftMarker } from './unread-indicator'
import { TypingDots } from './typing-dots'
import { EditFoldersDialog } from './folder-dialogs'
import type { StoryFeedUser } from '@/lib/stories'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
interface SidebarProps {
  onOpenSettings: () => void
  onOpenCoins: () => void
  onOpenP2PMarketplace: () => void
  onOpenStreams: () => void
  /** Shared with mobile bottom search (Telegram-style). */
  query?: string
  onQueryChange?: (query: string) => void
  /** Hide mobile bottom nav while multi-select is active. */
  onSelectionModeChange?: (active: boolean) => void
}

export function ChatSidebar({
  onOpenSettings,
  onOpenCoins,
  onOpenP2PMarketplace,
  onOpenStreams,
  query: queryProp,
  onQueryChange,
  onSelectionModeChange,
}: SidebarProps) {
  const { t, lang } = useI18n()
  const router = useRouter()
  const { currentUser, chats, activeChatId, onlineUserIds, presenceSynced, view, setView, setProfileUserId, setChatPinned, chatFolders, activeFolderId, setActiveFolderId, removeChat, setChatArchived, markChatRead } = useAppStore()
  const [localQuery, setLocalQuery] = useState('')
  const query = queryProp !== undefined ? queryProp : localQuery
  const setQuery = onQueryChange ?? setLocalQuery
  const [showNewChat, setShowNewChat] = useState(false)
  const [newChatTab, setNewChatTab] = useState<'search' | 'group' | 'channel'>('search')
  const openNewChat = useCallback((tab: 'search' | 'group' | 'channel' = 'search') => {
    setNewChatTab(tab)
    setShowNewChat(true)
  }, [])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const chatListScrollRef = useRef<HTMLDivElement>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [archivePull, setArchivePull] = useState(0)
  const archivePullRef = useRef(0)
  const archiveTouchRef = useRef<{
    startY: number
    startX: number
    pulling: boolean
    swipingBack: boolean
  } | null>(null)
  const [showEditFolders, setShowEditFolders] = useState(false)
  const [showFriends, setShowFriends] = useState(false)
  const [friendsInitialTab, setFriendsInitialTab] = useState<'friends' | 'incoming' | 'outgoing'>('friends')
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const enterSelectionMode = useCallback((initialId?: string) => {
    setSelectionMode(true)
    setSelectedIds(initialId ? new Set([initialId]) : new Set())
  }, [])

  const exitSelection = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
    setBulkDeleteOpen(false)
  }, [])

  const toggleSelected = useCallback((chatId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(chatId)) next.delete(chatId)
      else next.add(chatId)
      return next
    })
  }, [])

  const confirmBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return
    setBulkDeleting(true)
    const ids = Array.from(selectedIds)
    let ok = 0
    let fail = 0
    await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(`/api/chats/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scope: 'me' }),
          })
          if (!res.ok) {
            fail += 1
            return
          }
          removeChat(id)
          ok += 1
        } catch {
          fail += 1
        }
      }),
    )
    setBulkDeleting(false)
    setBulkDeleteOpen(false)
    exitSelection()
    if (ok > 0) toast.success(t('chat.deleted'))
    if (fail > 0) toast.error(t('chat.deleteError'))
  }, [selectedIds, removeChat, exitSelection, t])

  const bulkArchive = useCallback(async () => {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    const archive = !showArchived
    let ok = 0
    let fail = 0
    await Promise.all(
      ids.map(async (id) => {
        setChatArchived(id, archive)
        try {
          const res = await fetch(`/api/chats/${id}/archive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ archived: archive }),
          })
          if (!res.ok) {
            setChatArchived(id, !archive)
            fail++
            return
          }
          ok++
        } catch {
          setChatArchived(id, !archive)
          fail++
        }
      }),
    )
    exitSelection()
    if (ok > 0) toast.success(archive ? t('chat.archived') : t('chat.unarchived'))
    if (fail > 0) toast.error(archive ? t('chat.archiveError') : t('chat.unarchiveError'))
  }, [selectedIds, exitSelection, t, setChatArchived, showArchived])

  const bulkMarkRead = useCallback(() => {
    if (selectedIds.size === 0) return
    for (const id of selectedIds) markChatRead(id)
    exitSelection()
  }, [selectedIds, exitSelection, markChatRead])

  const refreshPendingFriendRequests = useCallback(async () => {
    if (!currentUser) return
    try {
      const res = await fetch('/api/friends/requests')
      const data = await res.json().catch(() => ({}))
      if (res.ok) setPendingFriendRequests(data.count ?? 0)
    } catch {
      // ignore
    }
  }, [currentUser])

  useEffect(() => {
    void refreshPendingFriendRequests()
    const interval = setInterval(() => void refreshPendingFriendRequests(), 15000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshPendingFriendRequests()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refreshPendingFriendRequests])

  useEffect(() => {
    if ((view === 'shorts' || view === 'feed') && selectionMode) exitSelection()
  }, [view, selectionMode, exitSelection])

  useEffect(() => {
    onSelectionModeChange?.(selectionMode)
  }, [selectionMode, onSelectionModeChange])

  useEffect(() => {
    const onExit = () => exitSelection()
    window.addEventListener('aurora:exit-to-chats', onExit)
    window.addEventListener('aurora:exit-selection', onExit)
    return () => {
      window.removeEventListener('aurora:exit-to-chats', onExit)
      window.removeEventListener('aurora:exit-selection', onExit)
    }
  }, [exitSelection])

  const openFriendsDialog = (tab: 'friends' | 'incoming' | 'outgoing' = 'friends') => {
    setFriendsInitialTab(tab)
    setShowFriends(true)
  }

  // PWA shortcut "Новый чат" → ?action=new_chat posts this event.
  useEffect(() => {
    const handler = () => openNewChat('search')
    window.addEventListener('aurora:new-chat', handler)
    return () => window.removeEventListener('aurora:new-chat', handler)
  }, [openNewChat])
  type SearchUserHit = {
    id: string
    name: string
    username: string
    avatarColor: string
    avatarUrl?: string | null
    online: boolean
    friendship?: { id: string | null; status: import('@/lib/friends').FriendshipStatus }
  }
  type SearchPublicChatHit = {
    id: string
    type: 'channel' | 'group'
    title: string
    slug: string
    description: string | null
    avatarColor: string
    avatarUrl: string | null
    memberCount: number
    isMember: boolean
  }
  const [userResults, setUserResults] = useState<SearchUserHit[]>([])
  const [channelResults, setChannelResults] = useState<SearchPublicChatHit[]>([])
  const [groupResults, setGroupResults] = useState<SearchPublicChatHit[]>([])
  const [searchingUsers, setSearchingUsers] = useState(false)
  const [joiningSlug, setJoiningSlug] = useState<string | null>(null)
  const [storyFeed, setStoryFeed] = useState<StoryFeedUser[]>([])
  const [storyViewerIndex, setStoryViewerIndex] = useState<number | null>(null)
  const [showAddStory, setShowAddStory] = useState(false)

  const refreshStories = async () => {
    try {
      const res = await fetch('/api/stories/feed')
      const data = await readJsonResponse<{ users?: StoryFeedUser[] }>(res)
      if (data?.users) setStoryFeed(data.users)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    const onExit = () => setShowArchived(false)
    window.addEventListener(EXIT_TO_CHATS_EVENT, onExit)
    return () => window.removeEventListener(EXIT_TO_CHATS_EVENT, onExit)
  }, [])

  useEffect(() => {
    if (currentUser) void refreshStories()
  }, [currentUser?.id])

  // Open a story from a feed share card.
  useEffect(() => {
    const handler = async (e: Event) => {
      const storyId = (e as CustomEvent<{ storyId?: string }>).detail?.storyId
      if (!storyId) return
      try {
        await refreshStories()
        const res = await fetch('/api/stories/feed')
        const data = await readJsonResponse<{ users?: StoryFeedUser[] }>(res)
        const users = data?.users || []
        if (users.length) setStoryFeed(users)
        const idx = users.findIndex((u) => u.stories?.some((s) => s.id === storyId))
        if (idx >= 0) setStoryViewerIndex(idx)
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('aurora:open-story', handler)
    return () => window.removeEventListener('aurora:open-story', handler)
  }, [])

  const storyByUserId = useMemo(() => {
    const map = new Map<string, StoryFeedUser>()
    for (const u of storyFeed) map.set(u.id, u)
    return map
  }, [storyFeed])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setUserResults([])
      setChannelResults([])
      setGroupResults([])
      setSearchingUsers(false)
      return
    }
    const ac = new AbortController()
    const timer = setTimeout(async () => {
      setSearchingUsers(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: ac.signal,
        })
        const data = await readJsonResponse<{
          users?: SearchUserHit[]
          channels?: SearchPublicChatHit[]
          groups?: SearchPublicChatHit[]
        }>(res)
        if (ac.signal.aborted) return
        setUserResults(data?.users || [])
        setChannelResults(data?.channels || [])
        setGroupResults(data?.groups || [])
      } catch (err) {
        if (ac.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return
        setUserResults([])
        setChannelResults([])
        setGroupResults([])
      } finally {
        if (!ac.signal.aborted) setSearchingUsers(false)
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      ac.abort()
    }
  }, [query])

  const openSearchUserChat = useCallback(async (userId: string) => {
    const result = await openPrivateChatWithUser(userId)
    if (!result.ok) {
      toast.error(result.error || t('newChat.errorCreateChat'))
      return
    }
    setQuery('')
  }, [setQuery, t])

  const openSearchPublicChat = useCallback(async (hit: SearchPublicChatHit) => {
    if (hit.isMember) {
      useAppStore.getState().setActiveChat(hit.id)
      setQuery('')
      return
    }
    setJoiningSlug(hit.slug)
    try {
      const result = await joinPublicChatBySlug(hit.slug)
      if (!result.ok) {
        toast.error(result.error || t('newChat.errorCreateChat'))
        return
      }
      setQuery('')
    } finally {
      setJoiningSlug(null)
    }
  }, [setQuery, t])

  // Hide archived by default; show them only when archive toggle is on
  const archivedFiltered = useMemo(
    () => chats.filter((c) => showArchived ? c.isArchived : !c.isArchived),
    [chats, showArchived],
  )

  // Apply the active folder filter on top of the archived filter. "All Chats"
  // (activeFolderId === null) keeps everything; otherwise filter via the
  // Telegram-style rules in filterChatsByFolder. Folder filtering is disabled
  // while browsing archived chats so the archive view stays complete.
  const activeFolder: ChatFolder | null = useMemo(
    () => chatFolders.find((f) => f.id === activeFolderId) ?? null,
    [chatFolders, activeFolderId],
  )

  const visibleChats = useMemo(() => {
    if (!activeFolder || showArchived) return archivedFiltered
    return filterChatsByFolder(archivedFiltered, activeFolder)
  }, [archivedFiltered, activeFolder, showArchived])

  // Saved Messages chat is always shown separately at the top
  const savedChat = useMemo(
    () => visibleChats.find((c) => c.type === 'saved'),
    [visibleChats],
  )

  const regularChats = useMemo(
    () => visibleChats.filter((c) => c.type !== 'saved'),
    [visibleChats],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, '')
    if (!q) return regularChats
    return regularChats.filter((c) => {
      if (c.title.toLowerCase().includes(q)) return true
      if (c.slug?.toLowerCase().includes(q)) return true
      if (c.description?.toLowerCase().includes(q)) return true
      if (c.lastMessage?.content.toLowerCase().includes(q)) return true
      return c.members.some(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.username.toLowerCase().includes(q),
      )
    })
  }, [regularChats, query])

  const savedMatchesQuery = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, '')
    if (!savedChat) return false
    if (!q) return true
    const savedTitle = t('sidebar.savedMessages').toLowerCase()
    return (
      savedTitle.includes(q) ||
      savedChat.lastMessage?.content.toLowerCase().includes(q)
    )
  }, [savedChat, query, t])

  const myChatIds = useMemo(() => new Set(chats.map((c) => c.id)), [chats])
  const globalChannels = useMemo(
    () => channelResults.filter((c) => !myChatIds.has(c.id)),
    [channelResults, myChatIds],
  )
  const globalGroups = useMemo(
    () => groupResults.filter((c) => !myChatIds.has(c.id)),
    [groupResults, myChatIds],
  )
  const hasGlobalHits =
    userResults.length > 0 || globalChannels.length > 0 || globalGroups.length > 0
  const hasLocalHits = filtered.length > 0 || savedMatchesQuery
  const searchEmpty =
    !!query.trim() && !searchingUsers && !hasLocalHits && !hasGlobalHits

  // Group by pinned / unpinned for visual divider
  const pinned = filtered.filter((c) => c.isPinned)
  const unpinned = filtered.filter((c) => !c.isPinned)

  const archivedCount = chats.filter((c) => c.isArchived).length

  const ARCHIVE_PULL_OPEN = 72
  const ARCHIVE_SWIPE_BACK = 72

  const onArchiveTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (query.trim() || selectionMode) return
      const touch = e.touches[0]
      if (!touch) return
      const el = chatListScrollRef.current
      const atTop = !el || el.scrollTop <= 0
      archiveTouchRef.current = {
        startY: touch.clientY,
        startX: touch.clientX,
        pulling: !showArchived && atTop && archivedCount > 0,
        swipingBack: showArchived,
      }
      archivePullRef.current = 0
      setArchivePull(0)
    },
    [archivedCount, query, selectionMode, showArchived],
  )

  const onArchiveTouchMove = useCallback((e: React.TouchEvent) => {
    const state = archiveTouchRef.current
    if (!state) return
    const touch = e.touches[0]
    if (!touch) return
    const dy = touch.clientY - state.startY
    const dx = touch.clientX - state.startX

    if (state.swipingBack) {
      if (Math.abs(dx) > Math.abs(dy) && dx > 0) {
        const pull = Math.min(120, dx * 0.85)
        archivePullRef.current = pull
        setArchivePull(pull)
      }
      return
    }

    if (!state.pulling) return
    const el = chatListScrollRef.current
    if (el && el.scrollTop > 0) {
      state.pulling = false
      archivePullRef.current = 0
      setArchivePull(0)
      return
    }
    if (dy <= 0 || Math.abs(dx) > Math.abs(dy) + 12) {
      archivePullRef.current = 0
      setArchivePull(0)
      return
    }
    const pull = Math.min(120, dy * 0.55)
    archivePullRef.current = pull
    setArchivePull(pull)
  }, [])

  const onArchiveTouchEnd = useCallback(() => {
    const state = archiveTouchRef.current
    const pull = archivePullRef.current
    archiveTouchRef.current = null
    archivePullRef.current = 0
    setArchivePull(0)
    if (!state) return

    if (state.swipingBack && pull >= ARCHIVE_SWIPE_BACK) {
      setShowArchived(false)
      return
    }
    if (state.pulling && pull >= ARCHIVE_PULL_OPEN) {
      setShowArchived(true)
    }
  }, [])

  const totalUnread = useMemo(
    () =>
      chats
        .filter((c) => !c.isArchived && !c.isMuted)
        .reduce((sum, c) => sum + (c.unread || 0), 0),
    [chats],
  )

  // Update app icon badge with total unread count
  useEffect(() => {
    try {
      if ('setAppBadge' in navigator) {
        if (totalUnread > 0) {
          (navigator as Navigator & { setAppBadge: (n: number) => Promise<void> }).setAppBadge(totalUnread)
        } else {
          (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge()
        }
      }
    } catch {}
  }, [totalUnread])

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="aurora-sidebar-safe-top flex items-center justify-between gap-2 border-b border-sidebar-border/80 bg-sidebar/95 px-4 pb-2.5 backdrop-blur-md">
        {selectionMode ? (
          <>
            <button
              type="button"
              onClick={exitSelection}
              className="text-sm font-medium text-primary"
            >
              {t('misc.cancel')}
            </button>
            <p className="text-sm font-semibold">
              {t('msg.selectedCount').replace('{n}', String(selectedIds.size))}
            </p>
            <button
              type="button"
              disabled={selectedIds.size === 0 || bulkDeleting}
              onClick={() => setBulkDeleteOpen(true)}
              className="text-sm font-medium text-destructive disabled:opacity-40"
            >
              {t('misc.delete')}
            </button>
          </>
        ) : (
          <>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {showArchived ? (
            <button
              type="button"
              onClick={() => setShowArchived(false)}
              className="flex min-w-0 items-center gap-2 text-left"
            >
              <ArrowLeft className="h-5 w-5 shrink-0 text-primary" />
              <h1 className="truncate text-[26px] font-bold leading-none tracking-tight xl:text-lg">
                {t('sidebar.archived')}
              </h1>
            </button>
          ) : (
            <h1 className="truncate text-[26px] font-bold leading-none tracking-tight xl:text-lg">
              {t('nav.chats')}
            </h1>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-primary"
            onClick={() => openNewChat('search')}
            title={t('sidebar.newChat')}
            aria-label={t('sidebar.newChat')}
          >
            <Plus className="h-5 w-5 xl:h-4 xl:w-4" strokeWidth={2.25} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full"
                title={t('chat.more')}
              >
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setShowArchived((v) => !v)}>
                <Archive className="mr-2 h-4 w-4" />
                {showArchived ? t('sidebar.allChats') : t('sidebar.archived')}
                {archivedCount > 0 && !showArchived ? ` (${archivedCount})` : ''}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => enterSelectionMode()}>
                <Check className="mr-2 h-4 w-4" /> {t('msg.select')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowEditFolders(true)}>
                <FolderPlus className="mr-2 h-4 w-4" /> {t('folders.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenP2PMarketplace}>
                <Store className="mr-2 h-4 w-4 text-emerald-500" /> {t('marketplace.title')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenStreams}>
                <Radio className="mr-2 h-4 w-4 text-rose-500" /> {t('streams.title')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenCoins}>
                <Coins className="mr-2 h-4 w-4" /> {t('coins.title')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenSettings}>
                <Settings className="mr-2 h-4 w-4" /> {t('sidebar.settings')}
              </DropdownMenuItem>
              {currentUser?.isAdmin && (
                <DropdownMenuItem onClick={() => router.push('/admin')}>
                  <Shield className="mr-2 h-4 w-4 text-slate-500" /> {t('sidebar.admin')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
          </>
        )}
      </div>

      {/* Mode toggle: Чаты / Лента / Шорты — desktop */}
      <div className="hidden px-3 pt-3 xl:block">
        <div className="flex rounded-2xl bg-muted/70 p-1">
          <button
            onClick={() => setView('chats')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-medium transition',
              view === 'chats'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {t('nav.chats')}
          </button>
          <button
            onClick={() => setView('feed')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-medium transition',
              view === 'feed'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Newspaper className="h-3.5 w-3.5" />
            {t('nav.feed')}
          </button>
          <button
            onClick={() => setView('shorts')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-medium transition',
              view === 'shorts'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Clapperboard className="h-3.5 w-3.5" />
            {t('nav.shorts')}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Search — desktop only; on mobile it slides up from the bottom nav */}
          <div className="hidden px-4 pt-2 xl:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="aurora-sidebar-search"
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('sidebar.searchChats')}
                className="h-10 rounded-xl border-none bg-muted/80 pl-10 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-primary/30"
              />
            </div>
          </div>

          {/* Folder tabs — always visible so users can discover folders */}
          {!query.trim() && !showArchived && (
            <FolderTabs
              folders={chatFolders}
              activeFolderId={activeFolderId}
              onSelect={setActiveFolderId}
              onEdit={() => setShowEditFolders(true)}
            />
          )}

          {/* Chat list — h-0 + flex-1 required for scroll inside flex column on desktop */}
          <div className="mt-1 flex h-0 min-h-0 flex-1 flex-col overflow-hidden">
            <div
              ref={chatListScrollRef}
              className="relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-0 [-webkit-overflow-scrolling:touch]"
              onTouchStart={onArchiveTouchStart}
              onTouchMove={onArchiveTouchMove}
              onTouchEnd={onArchiveTouchEnd}
              onTouchCancel={onArchiveTouchEnd}
            >
            {/* Pull-to-open archive (Telegram-style) */}
            {!showArchived && archivedCount > 0 && archivePull > 0 && (
              <div
                className="pointer-events-none sticky top-0 z-20 flex items-center justify-center gap-2 overflow-hidden bg-sidebar/95 text-primary backdrop-blur-sm xl:hidden"
                style={{ height: Math.max(0, archivePull) }}
                aria-hidden
              >
                <Archive
                  className={cn(
                    'h-5 w-5 transition-transform',
                    archivePull >= ARCHIVE_PULL_OPEN && 'scale-110',
                  )}
                />
                <span className="text-xs font-medium">
                  {archivePull >= ARCHIVE_PULL_OPEN
                    ? t('sidebar.releaseArchive')
                    : t('sidebar.pullArchive')}
                </span>
              </div>
            )}
            {showArchived && archivePull > 0 && (
              <div
                className="pointer-events-none absolute inset-y-0 left-0 z-20 flex w-14 items-center justify-center bg-gradient-to-r from-primary/25 to-transparent xl:hidden"
                style={{ opacity: Math.min(1, archivePull / ARCHIVE_SWIPE_BACK) }}
                aria-hidden
              >
                <ArrowLeft className="h-5 w-5 text-primary" />
              </div>
            )}
            {/* Clearance under floating bottom nav on mobile */}
            <div
              className="pb-[calc(5.75rem+env(safe-area-inset-bottom))] xl:pb-4"
              style={
                showArchived && archivePull > 0
                  ? { transform: `translateX(${Math.min(56, archivePull * 0.35)}px)` }
                  : undefined
              }
            >
              {/* Stories strip — Telegram-style above chat list */}
              {!showArchived && !query.trim() && currentUser && (
                <StoriesRow
                  feed={storyFeed}
                  currentUser={currentUser}
                  onAddStory={() => setShowAddStory(true)}
                  onOpenViewer={(idx) => setStoryViewerIndex(idx)}
                />
              )}
              {showArchived && (
                <div className="xl:hidden">
                  <button
                    type="button"
                    onClick={() => setShowArchived(false)}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm font-medium text-primary"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    {t('sidebar.allChats')}
                  </button>
                  <p className="px-4 pb-1 text-[11px] text-muted-foreground">
                    {t('sidebar.swipeBackChats')}
                  </p>
                </div>
              )}
              {query.trim() && (
                <div className="mb-3 space-y-3">
                  {searchingUsers && (
                    <p className="px-3 py-2 text-center text-xs text-muted-foreground">{t('newChat.searching')}</p>
                  )}
                  {!searchingUsers && hasGlobalHits && (
                    <p className="px-3 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('sidebar.searchGlobal')}
                    </p>
                  )}
                  {userResults.length > 0 && (
                    <div>
                      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('profile.searchUsers')}
                      </p>
                      {userResults.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center gap-2.5 px-3 py-2 transition hover:bg-sidebar-accent/70"
                        >
                          <button
                            type="button"
                            onClick={() => setProfileUserId(u.id)}
                            className="shrink-0"
                            title={t('profile.viewProfile')}
                          >
                            <Avatar name={u.name} color={u.avatarColor} imageUrl={u.avatarUrl} size="md" showStatus online={u.online} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void openSearchUserChat(u.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="truncate text-[15px] font-medium leading-tight">{u.name}</p>
                            <p className="truncate text-[12px] text-muted-foreground">@{u.username}</p>
                          </button>
                          <FriendButton
                            userId={u.id}
                            peerName={u.name}
                            peerUsername={u.username}
                            friendship={u.friendship ?? { id: null, status: 'none' }}
                            variant="compact"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {globalChannels.length > 0 && (
                    <div>
                      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('sidebar.searchChannels')}
                      </p>
                      {globalChannels.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          disabled={joiningSlug === c.slug}
                          onClick={() => void openSearchPublicChat(c)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-sidebar-accent/70 disabled:opacity-60"
                        >
                          <Avatar name={c.title} color={c.avatarColor} imageUrl={c.avatarUrl} size="md" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <Megaphone className="h-3.5 w-3.5 shrink-0 text-[#8b5cf6]" />
                              <span className="truncate text-[15px] font-medium leading-tight">{c.title}</span>
                            </span>
                            <span className="block truncate text-[12px] text-muted-foreground">
                              @{c.slug}
                              {c.memberCount > 0 ? ` · ${c.memberCount} ${t('channel.subscribers')}` : ''}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-primary">
                            {joiningSlug === c.slug ? '…' : t('sidebar.joinChannel')}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {globalGroups.length > 0 && (
                    <div>
                      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('sidebar.searchGroups')}
                      </p>
                      {globalGroups.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          disabled={joiningSlug === c.slug}
                          onClick={() => void openSearchPublicChat(c)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-sidebar-accent/70 disabled:opacity-60"
                        >
                          <Avatar name={c.title} color={c.avatarColor} imageUrl={c.avatarUrl} size="md" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <Users className="h-3.5 w-3.5 shrink-0 text-[#2aabee]" />
                              <span className="truncate text-[15px] font-medium leading-tight">{c.title}</span>
                            </span>
                            <span className="block truncate text-[12px] text-muted-foreground">
                              @{c.slug}
                              {c.memberCount > 0 ? ` · ${c.memberCount} ${t('sidebar.membersCount')}` : ''}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-primary">
                            {joiningSlug === c.slug ? '…' : t('sidebar.joinGroup')}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {!searchingUsers && !hasGlobalHits && !hasLocalHits && (
                    <p className="px-3 py-2 text-center text-xs text-muted-foreground">{t('sidebar.noChatsFound')}</p>
                  )}
                  {hasLocalHits && (
                    <>
                      <div className="my-1 ml-3 mr-3 border-t border-sidebar-border/50" />
                      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('sidebar.searchChatsSection')}
                      </p>
                    </>
                  )}
                </div>
              )}
              {filtered.length === 0 && !query.trim() && !savedChat ? (
                <div className="mx-4 my-10 flex flex-col items-center justify-center gap-3 rounded-3xl bg-gradient-to-b from-primary/10 via-muted/40 to-transparent px-6 py-12 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-sm">
                    <MessageCirclePlus className="h-8 w-8" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[15px] font-semibold text-foreground">
                      {showArchived
                        ? t('sidebar.noArchived')
                        : activeFolder
                          ? t('folders.emptyChats')
                          : t('sidebar.noChats')}
                    </p>
                    {!showArchived && !activeFolder && (
                      <p className="text-xs text-muted-foreground">{t('sidebar.startChatting')}</p>
                    )}
                  </div>
                  {!showArchived && !activeFolder && (
                    <Button
                      size="sm"
                      className="mt-1 rounded-full bg-primary px-5 text-primary-foreground hover:bg-primary/90"
                      onClick={() => openNewChat('search')}
                    >
                      {t('sidebar.newChat')}
                    </Button>
                  )}
                </div>
              ) : searchEmpty ? null : filtered.length === 0 && query.trim() && !savedMatchesQuery ? (
                null
              ) : (
                <>
                  {!showArchived && !query.trim() && archivedCount > 0 && (
                    <ArchiveFolderRow
                      count={archivedCount}
                      onOpen={() => setShowArchived(true)}
                    />
                  )}
                  {savedChat && savedMatchesQuery && !showArchived && (
                    <>
                      <SavedChatRow chat={savedChat} selectionMode={selectionMode} />
                      {(pinned.length > 0 || unpinned.length > 0) && (
                        <div className="my-1.5 ml-3 mr-3 border-t border-sidebar-border/40" />
                      )}
                    </>
                  )}
                  {pinned.length > 0 && !showArchived && (
                    <>
                      <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('sidebar.pinned')}
                      </p>
                      {pinned.map((chat) => (
                        <ChatListItemRow
                          key={chat.id}
                          chat={chat}
                          storyUser={chat.type === 'private' ? storyByUserId.get(chat.members.find((m) => m.id !== currentUser?.id)?.id || '') : undefined}
                          onOpenStories={(userId) => {
                            const idx = storyFeed.findIndex((u) => u.id === userId)
                            if (idx >= 0) setStoryViewerIndex(idx)
                          }}
                          selectionMode={selectionMode}
                          selected={selectedIds.has(chat.id)}
                          onToggleSelect={() => toggleSelected(chat.id)}
                          onEnterSelection={() => enterSelectionMode(chat.id)}
                        />
                      ))}
                      {unpinned.length > 0 && (
                        <div className="my-1.5 ml-3 mr-3 border-t border-sidebar-border/40" />
                      )}
                    </>
                  )}
                  {unpinned.map((chat) => (
                    <ChatListItemRow
                      key={chat.id}
                      chat={chat}
                      storyUser={chat.type === 'private' ? storyByUserId.get(chat.members.find((m) => m.id !== currentUser?.id)?.id || '') : undefined}
                      onOpenStories={(userId) => {
                        const idx = storyFeed.findIndex((u) => u.id === userId)
                        if (idx >= 0) setStoryViewerIndex(idx)
                      }}
                      selectionMode={selectionMode}
                      selected={selectedIds.has(chat.id)}
                      onToggleSelect={() => toggleSelected(chat.id)}
                      onEnterSelection={() => enterSelectionMode(chat.id)}
                    />
                  ))}
                  {pinned.length > 0 && showArchived && pinned.map((chat) => (
                    <ChatListItemRow
                      key={chat.id}
                      chat={chat}
                      storyUser={chat.type === 'private' ? storyByUserId.get(chat.members.find((m) => m.id !== currentUser?.id)?.id || '') : undefined}
                      onOpenStories={(userId) => {
                        const idx = storyFeed.findIndex((u) => u.id === userId)
                        if (idx >= 0) setStoryViewerIndex(idx)
                      }}
                      selectionMode={selectionMode}
                      selected={selectedIds.has(chat.id)}
                      onToggleSelect={() => toggleSelected(chat.id)}
                      onEnterSelection={() => enterSelectionMode(chat.id)}
                    />
                  ))}
                </>
              )}
            </div>
            </div>
          </div>
      </div>

      {/* Current user footer */}
      <div className="hidden shrink-0 items-center justify-between gap-2 border-t border-sidebar-border/80 bg-sidebar/80 px-4 py-3 backdrop-blur-md safe-bottom-min xl:flex">
        {currentUser && (
          <button
            type="button"
            onClick={() => setProfileUserId(currentUser.id)}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1.5 py-1 text-left transition hover:bg-sidebar-accent/80"
          >
            <Avatar
              name={currentUser.name}
              color={currentUser.avatarColor}
              imageUrl={currentUser.avatarUrl}
              size="sm"
              showStatus
              online
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                <span className="inline-flex items-center gap-1">
                  {currentUser.name}
                  <EmojiStatusBadge emojiStatus={currentUser.emojiStatus} size="sm" />
                </span>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                @{currentUser.username}
              </p>
            </div>
          </button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'relative h-9 w-9 shrink-0 rounded-lg hover:text-foreground',
            pendingFriendRequests > 0 ? 'text-rose-500' : 'text-muted-foreground',
          )}
          onClick={() => openFriendsDialog(pendingFriendRequests > 0 ? 'incoming' : 'friends')}
          title={
            pendingFriendRequests > 0
              ? `${t('friends.incoming')} · ${pendingFriendRequests}`
              : t('sidebar.friends')
          }
        >
          <Users className="h-4 w-4" />
          {pendingFriendRequests > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white shadow-sm">
              {pendingFriendRequests > 99 ? '99+' : pendingFriendRequests}
            </span>
          )}
        </Button>
        {currentUser?.isAdmin && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
            onClick={() => router.push('/admin')}
            title={t('sidebar.admin')}
          >
            <Shield className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
            window.location.reload()
          }}
          title={t('sidebar.logout')}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      <NewChatDialog open={showNewChat} onOpenChange={setShowNewChat} initialTab={newChatTab} onViewProfile={setProfileUserId} />

      <FriendsDialog
        open={showFriends}
        onOpenChange={setShowFriends}
        initialTab={friendsInitialTab}
        onRefresh={refreshPendingFriendRequests}
      />

      <EditFoldersDialog open={showEditFolders} onOpenChange={setShowEditFolders} />

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('chat.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('chat.deleteConfirmMe')}
              {selectedIds.size > 1
                ? ` (${t('msg.selectedCount').replace('{n}', String(selectedIds.size))})`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>{t('misc.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkDeleting || selectedIds.size === 0}
              onClick={(e) => {
                e.preventDefault()
                void confirmBulkDelete()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleting ? t('chat.deleting') : t('chat.deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Telegram-style multi-select strip — replaces bottom nav while active */}
      {selectionMode && (
        <div className="z-10 shrink-0 border-t border-sidebar-border bg-sidebar/95 px-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md">
          <div className="mx-auto flex max-w-lg items-center justify-around gap-1">
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={() => void bulkArchive()}
              className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-primary transition hover:bg-primary/10 disabled:opacity-40"
            >
              <Archive className="h-5 w-5" />
              <span className="truncate text-[11px] font-medium">
                {showArchived ? t('chat.unarchiveShort') : t('chat.archiveShort')}
              </span>
            </button>
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={bulkMarkRead}
              className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-primary transition hover:bg-primary/10 disabled:opacity-40"
            >
              <CheckCheck className="h-5 w-5" />
              <span className="truncate text-[11px] font-medium">{t('chat.readShort')}</span>
            </button>
            <button
              type="button"
              disabled={selectedIds.size === 0 || bulkDeleting}
              onClick={() => setBulkDeleteOpen(true)}
              className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-destructive transition hover:bg-destructive/10 disabled:opacity-40"
            >
              <Trash2 className="h-5 w-5" />
              <span className="truncate text-[11px] font-medium">{t('misc.delete')}</span>
            </button>
          </div>
        </div>
      )}

      <AddStoryDialog
        open={showAddStory}
        onOpenChange={setShowAddStory}
        onCreated={refreshStories}
      />

      {storyViewerIndex !== null && storyFeed.length > 0 && (
        <StoryViewer
          feed={storyFeed}
          initialUserIndex={storyViewerIndex}
          onClose={() => {
            setStoryViewerIndex(null)
            void refreshStories()
          }}
          onRefresh={refreshStories}
        />
      )}
    </div>
  )
}

function ArchiveFolderRow({ count, onOpen }: { count: number; onOpen: () => void }) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-3 border-b border-sidebar-border/40 px-3 py-2.5 text-left transition-colors hover:bg-sidebar-accent/70 sm:px-4"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Archive className="h-5 w-5" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-tight">{t('sidebar.archived')}</p>
        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
          {t('sidebar.archivedCount').replace('{count}', String(count))}
        </p>
      </div>
      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
        {count > 99 ? '99+' : count}
      </span>
    </button>
  )
}

/**
 * Horizontal scrollable row of chat-folder tabs, Telegram-style.
 *
 * - The first tab is always the synthetic "All Chats" pseudo-folder
 *   (activeFolderId === null). It is not deletable.
 * - Each folder tab shows its emoji (if any) + name.
 * - A trailing "+" button opens the "Edit Folders" dialog.
 * - Right-click / long-press on a folder tab opens the same dialog so the
 *   user can rename, reorder or delete it.
 */
function FolderTabs({
  folders,
  activeFolderId,
  onSelect,
  onEdit,
}: {
  folders: ChatFolder[]
  activeFolderId: string | null
  onSelect: (id: string | null) => void
  onEdit: () => void
}) {
  const { t } = useI18n()
  const chats = useAppStore((s) => s.chats)
  const sorted = useMemo(
    () => [...folders].sort((a, b) => a.position - b.position),
    [folders],
  )

  // Unread message totals per tab (Telegram-style), not chat counts
  const allUnread = useMemo(
    () =>
      chats
        .filter((c) => !c.isMuted && !c.isArchived && c.type !== 'saved')
        .reduce((sum, c) => sum + (c.unread || 0), 0),
    [chats],
  )
  const folderUnread = useMemo(() => {
    const map = new Map<string, number>()
    for (const folder of sorted) {
      const filtered = filterChatsByFolder(chats, folder)
      const count = filtered
        .filter((c) => !c.isMuted)
        .reduce((sum, c) => sum + (c.unread || 0), 0)
      map.set(folder.id, count)
    }
    return map
  }, [chats, sorted])

  return (
    <div
      role="tablist"
      aria-label={t('folders.all')}
      className="shrink-0 touch-pan-x overflow-x-auto overscroll-y-none border-b border-sidebar-border px-0 pt-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex items-center gap-0 whitespace-nowrap px-2">
        <FolderTab
          active={activeFolderId === null}
          label={t('folders.all')}
          emoji={null}
          unread={allUnread}
          onClick={() => onSelect(null)}
          onEdit={onEdit}
        />
        {sorted.map((folder) => (
          <FolderTab
            key={folder.id}
            active={activeFolderId === folder.id}
            label={folder.name}
            emoji={folder.emoji}
            unread={folderUnread.get(folder.id) ?? 0}
            onClick={() => onSelect(folder.id)}
            onEdit={onEdit}
          />
        ))}
        <button
          onClick={onEdit}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
          title={t('folders.edit')}
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function FolderTab({
  active,
  label,
  emoji,
  unread,
  onClick,
  onEdit,
}: {
  active: boolean
  label: string
  emoji: string | null
  unread: number
  onClick: () => void
  onEdit: () => void
}) {
  // Right-click / long-press opens the Edit Folders dialog (Telegram parity).
  // A simple left click selects the tab.
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault()
        onEdit()
      }}
      className={cn(
        'flex h-9 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm whitespace-nowrap transition',
        active
          ? 'border-primary font-semibold text-primary'
          : 'font-medium text-muted-foreground hover:text-foreground',
      )}
      title={label}
    >
      {emoji && <span className="text-sm leading-none">{emoji}</span>}
      <span className="max-w-[120px] truncate">{label}</span>
      {unread > 0 && (
        <span className="ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  )
}

function unreadLabel(count: number, t: (key: string) => string): string {
  const n = count > 99 ? '99+' : String(count)
  return `${n} ${t('sidebar.newMessages')}`
}

function SavedChatRow({ chat, selectionMode = false }: { chat: ChatListItem; selectionMode?: boolean }) {
  const { t, lang } = useI18n()
  const { activeChatId, setActiveChat, markChatRead, drafts } = useAppStore()
  const isActive = activeChatId === chat.id
  const draftText = !isActive ? drafts[chat.id] : undefined

  const previewText = () => {
    if (!chat.lastMessage) return t('sidebar.savedHint')
    if (chat.lastMessage.type === 'image' && !chat.lastMessage.content) return t('chat.image')
    if (chat.lastMessage.type === 'share') return t('chat.share')
    if (chat.lastMessage.type === 'voice' && !chat.lastMessage.content) return t('chat.voice')
    if (chat.lastMessage.type === 'file' && !chat.lastMessage.content) {
      return `${t('chat.file')}: ${chat.lastMessage.attachmentName || ''}`
    }
    if (chat.lastMessage.content && isE2EEPayload(chat.lastMessage.content)) {
      return t('chat.encrypted')
    }
    return chat.lastMessage.content
  }

  const openSaved = () => {
    if (selectionMode) return
    setActiveChat(chat.id)
    markChatRead(chat.id)
  }

  return (
    <motion.div
      role="button"
      tabIndex={0}
      whileTap={{ scale: selectionMode ? 1 : 0.98 }}
      onClick={openSaved}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openSaved()
        }
      }}
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-none border-b border-sidebar-border/40 px-3 py-2.5 text-left transition-colors sm:px-4',
        selectionMode && 'opacity-60',
        isActive
          ? 'bg-sidebar-accent'
          : 'hover:bg-sidebar-accent/70',
      )}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary shadow-sm">
        <Bookmark className="h-5 w-5 text-primary-foreground" fill="currentColor" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              'truncate text-[15px] leading-tight',
              chat.unread > 0 ? 'font-semibold' : 'font-medium',
            )}
          >
            {t('sidebar.savedMessages')}
          </p>
          {chat.lastMessage && (
            <span
              className={cn(
                'shrink-0 text-[12px] tabular-nums',
                chat.unread > 0 ? 'font-semibold text-primary' : 'text-muted-foreground',
              )}
            >
              {formatChatTime(chat.lastMessage.createdAt, lang)}
            </span>
          )}
        </div>
        <p
          className={cn(
            'mt-0.5 truncate text-[13px] leading-snug',
            draftText ? 'text-rose-500' : 'text-muted-foreground',
          )}
        >
          {draftText ? (
            <>
              <span className="shrink-0 font-semibold">{t('chat.draft')}</span>
              {draftText}
            </>
          ) : (
            previewText()
          )}
        </p>
      </div>
      <UnreadBadge
        count={chat.unread}
        title={unreadLabel(chat.unread, t)}
        className="h-5 min-w-[20px] px-1.5 text-[10px]"
      />
    </motion.div>
  )
}

function ChatListItemRow({
  chat,
  storyUser,
  onOpenStories,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onEnterSelection,
}: {
  chat: ChatListItem
  storyUser?: StoryFeedUser
  onOpenStories?: (userId: string) => void
  selectionMode?: boolean
  selected?: boolean
  onToggleSelect?: () => void
  onEnterSelection?: () => void
}) {
  const { t, lang } = useI18n()
  const {
    activeChatId,
    setActiveChat,
    markChatRead,
    markChatUnread,
    onlineUserIds,
    presenceSynced,
    currentUser,
    setChatArchived,
    setChatPinned,
    removeChat,
    typingByChat,
    drafts,
  } = useAppStore()
  const [deleteScope, setDeleteScope] = useState<'me' | 'everyone' | null>(null)
  const [deleting, setDeleting] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggered = useRef(false)
  const isActive = activeChatId === chat.id
  const otherMember =
    chat.type === 'private'
      ? chat.members.find((m) => m.id !== currentUser?.id)
      : null
  const displayEmojiStatus = otherMember?.emojiStatus
  const isOnline =
    chat.type === 'private' && otherMember
      ? isUserOnline(otherMember.id, otherMember.online, onlineUserIds, presenceSynced, otherMember.lastSeen)
      : false

  const lastMsgMine = chat.lastMessage?.senderId === currentUser?.id
  const isImage = chat.lastMessage?.type === 'image'
  const isVoice = chat.lastMessage?.type === 'voice'
  const isFile = chat.lastMessage?.type === 'file'

  // Telegram-style: typing users and per-chat draft override the preview.
  const typingNames = typingByChat[chat.id]
    ? Object.values(typingByChat[chat.id])
    : []
  const draftText = !isActive ? drafts[chat.id] : undefined
  const showTyping = typingNames.length > 0 && !isActive
  const showDraft = !showTyping && !!draftText

  const previewText = () => {
    if (!chat.lastMessage) return t('chat.noMessages')
    if (isImage && !chat.lastMessage.content) return t('chat.image')
    if (chat.lastMessage.type === 'share') return t('chat.share')
    if (isVoice && !chat.lastMessage.content) return t('chat.voice')
    if (isFile && !chat.lastMessage.content) return `${t('chat.file')}: ${chat.lastMessage.attachmentName || ''}`
    if (chat.lastMessage.content && isE2EEPayload(chat.lastMessage.content)) {
      return t('chat.encrypted')
    }
    return chat.lastMessage.content
  }

  const otherUserId = otherMember?.id
  const hasStories = !!storyUser?.stories.length
  const myRole = (chat.members.find((m) => m.id === currentUser?.id) as { role?: string } | undefined)?.role
  const canDeleteForEveryone =
    chat.type === 'private' ||
    ((chat.type === 'group' || chat.type === 'channel') && myRole === 'owner')
  const isGroupLike = chat.type === 'group' || chat.type === 'channel'

  const confirmDelete = async () => {
    if (!deleteScope) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/chats/${chat.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: deleteScope }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data.error === 'saved_chat') {
          toast.error(t('chat.cannotDeleteSaved'))
        } else {
          toast.error(t('chat.deleteError'))
        }
        return
      }
      removeChat(chat.id)
      toast.success(t('chat.deleted'))
      setDeleteScope(null)
    } catch {
      toast.error(t('chat.deleteError'))
    } finally {
      setDeleting(false)
    }
  }

  const toggleArchive = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    const next = !chat.isArchived
    setChatArchived(chat.id, next)
    try {
      const res = await fetch(`/api/chats/${chat.id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: next }),
      })
      if (!res.ok) {
        setChatArchived(chat.id, !next)
        toast.error(t('misc.error'))
        return
      }
      toast.success(next ? t('chat.archived') : t('chat.unarchived'))
    } catch {
      setChatArchived(chat.id, !next)
      toast.error(t('misc.error'))
    }
  }

  const togglePin = async () => {
    const next = !chat.isPinned
    setChatPinned(chat.id, next)
    try {
      const res = await fetch(`/api/chats/${chat.id}/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: next }),
      })
      const data = await res.json()
      if (!res.ok) {
        setChatPinned(chat.id, !next)
        if (data.error === 'pin_limit') {
          toast.error(t('chat.pinLimit'))
        } else {
          toast.error(t('misc.error'))
        }
        return
      }
      toast.success(next ? t('chat.pinned') : t('chat.unpinned'))
    } catch {
      setChatPinned(chat.id, !next)
      toast.error(t('misc.error'))
    }
  }

  const markAsUnread = () => {
    if (chat.unread > 0) return
    markChatUnread(chat.id)
    toast.success(t('chat.markedUnread'))
  }

  const rowContent = (
    <motion.div
      role="button"
      tabIndex={0}
      whileTap={{ scale: selectionMode ? 1 : 0.98 }}
      onClick={() => {
        if (longPressTriggered.current) {
          longPressTriggered.current = false
          return
        }
        if (selectionMode) {
          if (chat.type === 'saved') return
          onToggleSelect?.()
          return
        }
        setActiveChat(chat.id)
        markChatRead(chat.id)
      }}
      onPointerDown={() => {
        if (selectionMode || chat.type === 'saved') return
        longPressTriggered.current = false
        longPressTimer.current = setTimeout(() => {
          longPressTriggered.current = true
          onEnterSelection?.()
        }, 450)
      }}
      onPointerUp={() => {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current)
          longPressTimer.current = null
        }
      }}
      onPointerLeave={() => {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current)
          longPressTimer.current = null
        }
      }}
      onPointerCancel={() => {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current)
          longPressTimer.current = null
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (selectionMode) {
            if (chat.type !== 'saved') onToggleSelect?.()
            return
          }
          setActiveChat(chat.id)
          markChatRead(chat.id)
        }
      }}
      className={cn(
        'group relative flex w-full min-w-0 items-center gap-3 rounded-none border-b border-sidebar-border/40 px-3 py-2.5 text-left transition-colors sm:px-4',
        selectionMode && selected
          ? 'bg-primary/10'
          : isActive
            ? 'bg-sidebar-accent'
            : 'hover:bg-sidebar-accent/70',
      )}
    >
      {selectionMode && chat.type !== 'saved' && (
        <span
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            selected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-muted-foreground/40 bg-transparent',
          )}
          aria-hidden
        >
          {selected && <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
      )}
      <UnreadLeftMarker show={chat.unread > 0 && !selectionMode} />
      <StoryRing
        hasStory={hasStories}
        hasUnviewed={storyUser?.hasUnviewed}
        size="md"
        onClick={
          hasStories && otherUserId
            ? (e) => {
                e.stopPropagation()
                onOpenStories?.(otherUserId)
              }
            : undefined
        }
      >
        <span
          className={cn(
            'relative inline-flex rounded-full',
            chat.type === 'group' && 'ring-2 ring-[#2aabee]/55 ring-offset-1 ring-offset-background',
            chat.type === 'channel' && 'ring-2 ring-[#8b5cf6]/60 ring-offset-1 ring-offset-background',
            chat.type === 'private' && 'ring-2 ring-transparent',
          )}
          title={
            chat.type === 'group'
              ? t('chat.typeGroup')
              : chat.type === 'channel'
                ? t('chat.typeChannel')
                : chat.type === 'private'
                  ? t('chat.typePrivate')
                  : undefined
          }
        >
          <Avatar
            name={chat.title}
            color={chat.avatarColor}
            imageUrl={getChatAvatarImageUrl(chat, currentUser?.id)}
            size="md"
            showStatus={chat.type === 'private'}
            online={isOnline}
          />
          {chat.type === 'group' && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#2aabee] text-white shadow-sm ring-2 ring-background">
              <Users className="h-2.5 w-2.5" strokeWidth={2.5} />
            </span>
          )}
          {chat.type === 'channel' && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#8b5cf6] text-white shadow-sm ring-2 ring-background">
              <Megaphone className="h-2.5 w-2.5" strokeWidth={2.5} />
            </span>
          )}
        </span>
      </StoryRing>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <p
              className={cn(
                'truncate text-[15px] leading-tight',
                chat.unread > 0 ? 'font-semibold text-foreground' : 'font-medium',
              )}
            >
              <span className="inline-flex max-w-full items-center gap-1">
                <span className="truncate">{chat.title}</span>
                {displayEmojiStatus && (
                  <EmojiStatusBadge emojiStatus={displayEmojiStatus} size="sm" />
                )}
              </span>
            </p>
            {chat.isMuted && (
              <BellOff className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {chat.isArchived && (
              <Archive className="h-3 w-3 text-muted-foreground" />
            )}
            {chat.lastMessage && (
              <span
                className={cn(
                  'text-[12px] tabular-nums',
                  chat.unread > 0 ? 'font-semibold text-primary' : 'text-muted-foreground',
                )}
              >
                {formatChatTime(chat.lastMessage.createdAt, lang)}
              </span>
            )}
          </div>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p
            className={cn(
              'flex min-w-0 items-center gap-1 truncate text-[13px] leading-snug',
              showTyping
                ? 'text-primary'
                : showDraft
                  ? 'text-rose-500'
                  : 'text-muted-foreground',
            )}
          >
            {showTyping ? (
              <span className="inline-flex items-center gap-1 truncate text-primary" title={t('chat.typing')} aria-label={t('chat.typing')}>
                <span className="truncate">{typingNames.join(', ')}</span>
                <TypingDots className="text-primary" size={3} gap={1.5} />
              </span>
            ) : showDraft ? (
              <>
                <span className="shrink-0 font-semibold">{t('chat.draft')}</span>
                <span className="truncate">{draftText}</span>
              </>
            ) : (
              <>
                {lastMsgMine && chat.lastMessage && (
                  <CheckCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                {isImage && !lastMsgMine && (
                  <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                {isVoice && !lastMsgMine && (
                  <Mic className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{previewText()}</span>
              </>
            )}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <UnreadBadge
              count={chat.unread}
              muted={chat.isMuted}
              title={unreadLabel(chat.unread, t)}
              className="h-5 min-w-[20px] px-1.5 text-[10px]"
            />
            <button
              onClick={toggleArchive}
              className="hidden h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-muted group-hover:opacity-100 sm:flex"
              title={chat.isArchived ? t('chat.unarchive') : t('chat.archive')}
            >
              {chat.isArchived ? (
                <ArchiveRestore className="h-3.5 w-3.5" />
              ) : (
                <Archive className="h-3.5 w-3.5" />
              )}
            </button>
            {chat.isPinned && chat.unread === 0 && !chat.isArchived && (
              <Pin className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )

  return (
    <>
      <SwipeableRow
        key={`${chat.id}:${activeChatId}:${selectionMode ? 'sel' : 'nav'}`}
        actions={selectionMode ? [] : [
          {
            key: 'archive',
            label: chat.isArchived ? t('chat.unarchiveShort') : t('chat.archiveShort'),
            icon: chat.isArchived ? ArchiveRestore : Archive,
            bg: 'bg-amber-500',
            onClick: () => void toggleArchive(),
          },
          {
            key: 'read',
            label: chat.unread > 0 ? t('chat.readShort') : t('chat.unreadShort'),
            icon: chat.unread > 0 ? CheckCheck : Check,
            bg: 'bg-sky-500',
            onClick: () => {
              if (chat.unread > 0) markChatRead(chat.id)
              else markAsUnread()
            },
          },
          {
            key: 'pin',
            label: chat.isPinned ? t('chat.unpinShort') : t('chat.pinShort'),
            icon: chat.isPinned ? PinOff : Pin,
            bg: 'bg-[#3390ec]',
            onClick: () => void togglePin(),
          },
          ...(chat.type !== 'saved'
            ? [{
                key: 'delete',
                label: t('chat.deleteShort'),
                icon: Trash2,
                bg: 'bg-red-500',
                onClick: () => setDeleteScope('me'),
              }]
            : []),
        ]}
      >
      <ContextMenu>
        <ContextMenuTrigger asChild>{rowContent}</ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          {chat.type !== 'saved' && (
            <ContextMenuItem onClick={() => onEnterSelection?.()}>
              <Check className="mr-2 h-4 w-4" />
              {t('msg.select')}
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={togglePin}>
            {chat.isPinned ? (
              <>
                <PinOff className="mr-2 h-4 w-4" />
                {t('chat.unpin')}
              </>
            ) : (
              <>
                <Pin className="mr-2 h-4 w-4" />
                {t('chat.pin')}
              </>
            )}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => toggleArchive()}>
            {chat.isArchived ? (
              <>
                <ArchiveRestore className="mr-2 h-4 w-4" />
                {t('chat.unarchive')}
              </>
            ) : (
              <>
                <Archive className="mr-2 h-4 w-4" />
                {t('chat.archive')}
              </>
            )}
          </ContextMenuItem>
          {chat.unread === 0 && (
            <ContextMenuItem onClick={markAsUnread}>
              <Mail className="mr-2 h-4 w-4" />
              {t('chat.markUnread')}
            </ContextMenuItem>
          )}
          {chat.type !== 'saved' && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                variant="destructive"
                onClick={() => setDeleteScope('me')}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('chat.deleteForMe')}
              </ContextMenuItem>
              {canDeleteForEveryone && (
                <ContextMenuItem
                  variant="destructive"
                  onClick={() => setDeleteScope('everyone')}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {chat.type === 'private' && otherMember ? (
                    <span className="truncate">
                      {t('chat.deleteForMeAnd')} {otherMember.name}
                    </span>
                  ) : (
                    t('chat.deleteForEveryone')
                  )}
                </ContextMenuItem>
              )}
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      <AlertDialog
        open={deleteScope !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteScope(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('chat.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteScope === 'everyone'
                ? t('chat.deleteConfirmEveryone')
                : isGroupLike
                  ? t('chat.deleteConfirmMeGroup')
                  : t('chat.deleteConfirmMe')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t('misc.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? t('chat.deleting') : t('chat.deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </SwipeableRow>
    </>
  )
}

function NewChatDialog({
  open,
  onOpenChange,
  onViewProfile,
  initialTab = 'search',
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onViewProfile?: (userId: string) => void
  initialTab?: 'search' | 'group' | 'channel'
}) {
  const { t } = useI18n()
  const { setActiveChat } = useAppStore()
  const [tab, setTab] = useState<'search' | 'group' | 'channel'>(initialTab)
  useEffect(() => {
    if (open) setTab(initialTab)
  }, [open, initialTab])
  const [search, setSearch] = useState('')
  const [groupTitle, setGroupTitle] = useState('')
  const [groupSlug, setGroupSlug] = useState('')
  const [groupIsForum, setGroupIsForum] = useState(false)
  const [channelTitle, setChannelTitle] = useState('')
  const [channelSlug, setChannelSlug] = useState('')
  const [channelDesc, setChannelDesc] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [results, setResults] = useState<
    Array<{
      id: string
      name: string
      username: string
      avatarColor: string
      avatarUrl?: string | null
      online: boolean
      friendship?: { id: string | null; status: import('@/lib/friends').FriendshipStatus }
    }>
  >([])
  const [channelHits, setChannelHits] = useState<
    Array<{ id: string; title: string; slug: string; avatarColor: string; avatarUrl: string | null; memberCount: number; isMember: boolean }>
  >([])
  const [groupHits, setGroupHits] = useState<
    Array<{ id: string; title: string; slug: string; avatarColor: string; avatarUrl: string | null; memberCount: number; isMember: boolean }>
  >([])
  const [loading, setLoading] = useState(false)
  const [joiningSlug, setJoiningSlug] = useState<string | null>(null)
  const searchAbortRef = useRef<AbortController | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSearch = (q: string) => {
    setSearch(q)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchAbortRef.current?.abort()
    if (!q.trim()) {
      setResults([])
      setChannelHits([])
      setGroupHits([])
      setLoading(false)
      return
    }
    searchTimerRef.current = setTimeout(async () => {
      const ac = new AbortController()
      searchAbortRef.current = ac
      setLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ac.signal })
        const data = await res.json().catch(() => ({}))
        if (ac.signal.aborted) return
        setResults(data.users || [])
        setChannelHits(data.channels || [])
        setGroupHits(data.groups || [])
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setResults([])
        setChannelHits([])
        setGroupHits([])
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    }, 300)
  }

  const startPrivateChat = async (targetUserId: string) => {
    const result = await openPrivateChatWithUser(targetUserId)
    if (!result.ok) {
      toast.error(result.error || t('newChat.errorCreateChat'))
      return
    }
    onOpenChange(false)
  }

  const joinPublicFromDialog = async (slug: string) => {
    setJoiningSlug(slug)
    try {
      const result = await joinPublicChatBySlug(slug)
      if (!result.ok) {
        toast.error(result.error || t('newChat.errorCreateChat'))
        return
      }
      onOpenChange(false)
    } finally {
      setJoiningSlug(null)
    }
  }

  const createGroup = async () => {
    if (!groupTitle.trim()) {
      toast.error(t('newChat.errorNoTitle'))
      return
    }
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'group',
        title: groupTitle,
        memberIds: selectedIds,
        isForum: groupIsForum,
        slug: groupSlug || undefined,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error || t('newChat.errorCreateGroup'))
      return
    }
    await refreshChats()
    setActiveChat(data.chat.id)
    setGroupTitle('')
    setGroupSlug('')
    setGroupIsForum(false)
    setSelectedIds([])
    onOpenChange(false)
    toast.success(t('newChat.groupCreated'))
  }

  const createChannel = async () => {
    if (!channelTitle.trim()) {
      toast.error(t('channel.errorNoTitle'))
      return
    }
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'channel',
        title: channelTitle,
        slug: channelSlug || undefined,
        description: channelDesc || undefined,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error || t('channel.errorCreate'))
      return
    }
    await refreshChats()
    setActiveChat(data.chat.id)
    setChannelTitle('')
    setChannelSlug('')
    setChannelDesc('')
    onOpenChange(false)
    toast.success(t('channel.created'))
  }

  const refreshChats = async () => {
    const res = await fetch('/api/chats')
    const data = await res.json()
    if (data.chats) {
      useAppStore.getState().setChats(data.chats)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>{t('newChat.title')}</DialogTitle>
        </DialogHeader>
        <div className="px-5 pt-3">
          <div className="flex rounded-xl bg-muted p-1">
            <button
              onClick={() => setTab('search')}
              className={cn(
                'flex-1 rounded-lg py-2 text-sm font-medium transition',
                tab === 'search' ? 'bg-background shadow' : 'text-muted-foreground',
              )}
            >
              {t('newChat.searchUser')}
            </button>
            <button
              onClick={() => setTab('group')}
              className={cn(
                'flex-1 rounded-lg py-2 text-sm font-medium transition',
                tab === 'group' ? 'bg-background shadow' : 'text-muted-foreground',
              )}
            >
              {t('newChat.createGroup')}
            </button>
            <button
              onClick={() => setTab('channel')}
              className={cn(
                'flex-1 rounded-lg py-2 text-sm font-medium transition',
                tab === 'channel' ? 'bg-background shadow' : 'text-muted-foreground',
              )}
            >
              {t('channel.create')}
            </button>
          </div>
        </div>

        {tab === 'search' ? (
          <div className="p-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => runSearch(e.target.value)}
                placeholder={t('newChat.searchPlaceholder')}
                className="pl-10"
                autoFocus
              />
            </div>
            <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
              {loading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('newChat.searching')}</p>
              ) : results.length === 0 && channelHits.length === 0 && groupHits.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {search ? t('newChat.nothingFound') : t('newChat.startTyping')}
                </p>
              ) : (
                <>
                  {results.map((u) => (
                    <div
                      key={u.id}
                      className="flex w-full items-center gap-2 rounded-xl px-2 py-2 transition hover:bg-muted"
                    >
                      <button
                        onClick={() => onViewProfile?.(u.id)}
                        className="shrink-0"
                        title={t('profile.viewProfile')}
                      >
                        <Avatar name={u.name} color={u.avatarColor} imageUrl={u.avatarUrl} size="sm" showStatus online={u.online} />
                      </button>
                      <button
                        onClick={() => startPrivateChat(u.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{u.name}</p>
                          <p className="truncate text-xs text-muted-foreground">@{u.username}</p>
                        </div>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => onViewProfile?.(u.id)}
                        title={t('profile.viewProfile')}
                      >
                        <UserCircle className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <FriendButton
                        userId={u.id}
                        peerName={u.name}
                        peerUsername={u.username}
                        friendship={u.friendship ?? { id: null, status: 'none' }}
                        variant="compact"
                      />
                    </div>
                  ))}
                  {channelHits.length > 0 && (
                    <>
                      <p className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('sidebar.searchChannels')}
                      </p>
                      {channelHits.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          disabled={joiningSlug === c.slug}
                          onClick={() => void joinPublicFromDialog(c.slug)}
                          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-muted disabled:opacity-60"
                        >
                          <Avatar name={c.title} color={c.avatarColor} imageUrl={c.avatarUrl} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{c.title}</span>
                            <span className="block truncate text-xs text-muted-foreground">@{c.slug}</span>
                          </span>
                          <span className="text-xs font-medium text-[#3390ec]">
                            {c.isMember ? t('sidebar.searchChatsSection') : t('sidebar.joinChannel')}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                  {groupHits.length > 0 && (
                    <>
                      <p className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('sidebar.searchGroups')}
                      </p>
                      {groupHits.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          disabled={joiningSlug === c.slug}
                          onClick={() => void joinPublicFromDialog(c.slug)}
                          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-muted disabled:opacity-60"
                        >
                          <Avatar name={c.title} color={c.avatarColor} imageUrl={c.avatarUrl} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{c.title}</span>
                            <span className="block truncate text-xs text-muted-foreground">@{c.slug}</span>
                          </span>
                          <span className="text-xs font-medium text-[#3390ec]">
                            {c.isMember ? t('sidebar.searchChatsSection') : t('sidebar.joinGroup')}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        ) : tab === 'group' ? (
          <div className="p-5">
            <Label htmlFor="groupTitle" className="text-xs">{t('newChat.groupTitle')}</Label>
            <Input
              id="groupTitle"
              value={groupTitle}
              onChange={(e) => setGroupTitle(e.target.value)}
              placeholder={t('newChat.groupTitlePlaceholder')}
              className="mt-1"
              autoFocus
            />
            <Label htmlFor="groupSlug" className="mt-4 block text-xs">{t('newChat.groupSlug')}</Label>
            <Input
              id="groupSlug"
              value={groupSlug}
              onChange={(e) => setGroupSlug(e.target.value)}
              placeholder={t('newChat.groupSlugPlaceholder')}
              className="mt-1"
            />
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setGroupIsForum(!groupIsForum)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-muted/60 active:bg-muted"
              >
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition ${groupIsForum ? 'border-primary bg-primary' : 'border-muted-foreground/40'}`}>
                  {groupIsForum && (
                    <svg className="h-3.5 w-3.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t('newChat.forumMode')}</p>
                  <p className="text-xs text-muted-foreground">{t('newChat.forumModeHint')}</p>
                </div>
              </button>
            </div>
            <Label className="mt-4 block text-xs">{t('newChat.addMembers')}</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => runSearch(e.target.value)}
                placeholder={t('newChat.searchUsersPlaceholder')}
                className="pl-10"
              />
            </div>
            <div className="mt-3 max-h-52 space-y-1 overflow-y-auto">
              {results.map((u) => {
                const checked = selectedIds.includes(u.id)
                return (
                  <button
                    key={u.id}
                    onClick={() => {
                      setSelectedIds((prev) =>
                        checked ? prev.filter((id) => id !== u.id) : [...prev, u.id],
                      )
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-muted',
                      checked && 'bg-[#3390ec]/10',
                    )}
                  >
                    <Avatar name={u.name} color={u.avatarColor} imageUrl={u.avatarUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{u.name}</p>
                      <p className="truncate text-xs text-muted-foreground">@{u.username}</p>
                    </div>
                    {checked && <Check className="h-4 w-4 text-[#3390ec]" />}
                  </button>
                )
              })}
            </div>
            <Button
              onClick={createGroup}
              className="mt-4 w-full bg-[#3390ec] text-white hover:bg-[#2b82d9]"
            >
              <Users className="mr-2 h-4 w-4" />
              {t('newChat.createGroupBtn')}
              {selectedIds.length > 0 && ` · ${selectedIds.length + 1}`}
            </Button>
          </div>
        ) : (
          <div className="p-5">
            <Label className="text-xs">{t('channel.title')}</Label>
            <Input
              value={channelTitle}
              onChange={(e) => setChannelTitle(e.target.value)}
              placeholder={t('channel.titlePlaceholder')}
              className="mt-1"
              autoFocus
            />
            <Label className="mt-4 block text-xs">{t('channel.slug')}</Label>
            <Input
              value={channelSlug}
              onChange={(e) => setChannelSlug(e.target.value)}
              placeholder="@mychannel"
              className="mt-1"
            />
            <Label className="mt-4 block text-xs">{t('channel.description')}</Label>
            <Input
              value={channelDesc}
              onChange={(e) => setChannelDesc(e.target.value)}
              placeholder={t('channel.descPlaceholder')}
              className="mt-1"
            />
            <Button
              onClick={createChannel}
              className="mt-4 w-full bg-[#3390ec] text-white hover:bg-[#2b82d9]"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {t('channel.createBtn')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
