'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Users, MessageCircle, UserPlus } from 'lucide-react'
import { Avatar } from './avatar'
import { FriendsDialog } from './friends-dialog'
import { useAppStore } from '@/lib/store'
import { useI18n } from '@/hooks/use-i18n'
import { cn } from '@/lib/utils'
import { countOnlineFriends, isFriendOnline, sortFriendsByOnline } from '@/lib/friends-client'
import { openPrivateChatWithUser } from '@/lib/open-private-chat'

interface FriendUser {
  id: string
  username: string
  name: string
  avatarColor: string
  avatarUrl?: string | null
  online: boolean
  lastSeen?: string | null
}

interface IncomingRequest {
  id: string
  user: FriendUser
  createdAt: string
}

interface FriendsSidebarSectionProps {
  onRefreshRef?: React.MutableRefObject<(() => void) | null>
}

const FRIENDS_EXPANDED_KEY = 'aurora:friends-sidebar-expanded'

function readFriendsExpanded(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const v = localStorage.getItem(FRIENDS_EXPANDED_KEY)
    if (v === '0' || v === 'false') return false
    if (v === '1' || v === 'true') return true
  } catch {
    // ignore
  }
  return true
}

function writeFriendsExpanded(expanded: boolean) {
  try {
    localStorage.setItem(FRIENDS_EXPANDED_KEY, expanded ? '1' : '0')
  } catch {
    // ignore
  }
}

export function FriendsSidebarSection({ onRefreshRef }: FriendsSidebarSectionProps) {
  const { t } = useI18n()
  const { onlineUserIds, presenceSynced, setProfileUserId, currentUser } = useAppStore()
  const [expanded, setExpanded] = useState(true)
  const [allFriends, setAllFriends] = useState<FriendUser[]>([])
  const [incoming, setIncoming] = useState<IncomingRequest[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [showDialog, setShowDialog] = useState(false)
  const [dialogTab, setDialogTab] = useState<'friends' | 'incoming' | 'outgoing'>('friends')

  const load = useCallback(async () => {
    if (!currentUser) return
    try {
      const [friendsRes, requestsRes] = await Promise.all([
        fetch('/api/friends'),
        fetch('/api/friends/requests'),
      ])
      const friendsData = await friendsRes.json().catch(() => ({}))
      const requestsData = await requestsRes.json().catch(() => ({}))
      if (friendsRes.ok) {
        setAllFriends(friendsData.friends || [])
        setIncoming((friendsData.incoming || []).slice(0, 3))
      }
      if (requestsRes.ok) {
        setPendingCount(requestsData.count ?? 0)
      } else if (friendsRes.ok) {
        setPendingCount(friendsData.incoming?.length ?? 0)
      }
    } catch {
      // ignore
    }
  }, [currentUser])

  const friends = useMemo(
    () => sortFriendsByOnline(allFriends, onlineUserIds, presenceSynced).slice(0, 8),
    [allFriends, onlineUserIds, presenceSynced],
  )

  const onlineCount = useMemo(
    () => countOnlineFriends(allFriends, onlineUserIds, presenceSynced),
    [allFriends, onlineUserIds, presenceSynced],
  )

  const totalFriendsCount = allFriends.length

  useLayoutEffect(() => {
    setExpanded(readFriendsExpanded())
  }, [])

  const toggleExpanded = () => {
    setExpanded((v) => {
      const next = !v
      writeFriendsExpanded(next)
      return next
    })
  }

  useEffect(() => {
    void load()
    const interval = setInterval(() => void load(), 30000)
    return () => clearInterval(interval)
  }, [load])

  useEffect(() => {
    if (onRefreshRef) {
      onRefreshRef.current = load
    }
  }, [load, onRefreshRef])

  const startChat = async (userId: string) => {
    await openPrivateChatWithUser(userId)
  }

  const openDialog = (tab: 'friends' | 'incoming' | 'outgoing' = 'friends') => {
    setDialogTab(tab)
    setShowDialog(true)
  }

  if (!currentUser) return null

  return (
    <>
      <div className="px-3 pt-2">
        <button
          type="button"
          onClick={toggleExpanded}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-sidebar-accent"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <Users className="h-3.5 w-3.5 text-cyan-500" />
          <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('friends.title')}
          </span>
          {totalFriendsCount > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {totalFriendsCount}
              <span className={onlineCount > 0 ? 'text-emerald-500' : undefined}>
                {' · '}
                {onlineCount}
              </span>
            </span>
          )}
          {pendingCount > 0 && (
            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 px-1 text-[9px] font-bold text-white">
              {pendingCount > 99 ? '99+' : pendingCount}
            </span>
          )}
        </button>

        {expanded && (
          <div className="mt-1 max-h-48 space-y-0.5 overflow-y-auto pb-2">
            {pendingCount > 0 && (
              <div className="mb-1 space-y-0.5">
                {incoming.map((request) => (
                  <button
                    key={request.id}
                    type="button"
                    onClick={() => openDialog('incoming')}
                    className="flex w-full items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/5 px-2 py-1.5 text-left transition hover:bg-violet-500/10"
                  >
                    <Avatar
                      name={request.user.name}
                      color={request.user.avatarColor}
                      imageUrl={request.user.avatarUrl}
                      size="sm"
                      showStatus
                      online={isFriendOnline(request.user.id, request.user.online, onlineUserIds, presenceSynced, request.user.lastSeen)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{request.user.name}</p>
                      <p className="truncate text-[10px] text-violet-500">
                        {t('friends.incoming')}
                      </p>
                    </div>
                    <UserPlus className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                  </button>
                ))}
                {pendingCount > incoming.length && (
                  <button
                    type="button"
                    onClick={() => openDialog('incoming')}
                    className="w-full rounded-lg px-2 py-1 text-center text-[11px] font-medium text-violet-500 transition hover:bg-violet-500/10"
                  >
                    {t('friends.incoming')} · {pendingCount}
                  </button>
                )}
              </div>
            )}

            {friends.length === 0 && pendingCount === 0 ? (
              <button
                type="button"
                onClick={() => openDialog('friends')}
                className="w-full rounded-xl px-3 py-3 text-center text-xs text-muted-foreground transition hover:bg-sidebar-accent"
              >
                {t('friends.empty')}
              </button>
            ) : friends.length === 0 ? (
              <button
                type="button"
                onClick={() => openDialog('incoming')}
                className="w-full rounded-xl px-3 py-2 text-center text-xs text-muted-foreground transition hover:bg-sidebar-accent"
              >
                {t('friends.viewAll')}
              </button>
            ) : (
              <>
                {friends.map((f) => (
                  <div
                    key={f.id}
                    className="group flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-sidebar-accent"
                  >
                    <button
                      type="button"
                      onClick={() => setProfileUserId(f.id)}
                      className="shrink-0"
                    >
                      <Avatar
                        name={f.name}
                        color={f.avatarColor}
                        imageUrl={f.avatarUrl}
                        size="sm"
                        showStatus
                        online={isFriendOnline(f.id, f.online, onlineUserIds, presenceSynced, f.lastSeen)}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => setProfileUserId(f.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm font-medium">{f.name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">@{f.username}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => startChat(f.id)}
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition hover:bg-violet-500/10 hover:text-violet-500 group-hover:opacity-100',
                      )}
                      title={t('profile.message')}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => openDialog(pendingCount > 0 ? 'incoming' : 'friends')}
                  className="mt-1 w-full rounded-lg px-2 py-1.5 text-center text-[11px] font-medium text-violet-500 transition hover:bg-violet-500/10"
                >
                  {pendingCount > 0
                    ? `${t('friends.incoming')} · ${pendingCount}`
                    : t('friends.viewAll')}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <FriendsDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        initialTab={dialogTab}
        onRefresh={load}
      />
    </>
  )
}
