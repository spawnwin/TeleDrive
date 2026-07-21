'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, MessageCircle, Loader2, QrCode } from 'lucide-react'
import { Avatar } from './avatar'
import { FriendButton } from './friend-button'
import { QrDialog } from './qr-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAppStore } from '@/lib/store'
import { useI18n } from '@/hooks/use-i18n'
import { cn } from '@/lib/utils'
import { countOnlineFriends, isFriendOnline, sortFriendsByOnline } from '@/lib/friends-client'
import { openPrivateChatWithUser } from '@/lib/open-private-chat'
import type { FriendshipState } from './friend-button'
import { toast } from 'sonner'

type Tab = 'friends' | 'incoming' | 'outgoing'

interface FriendUser {
  id: string
  username: string
  name: string
  avatarColor: string
  avatarUrl?: string | null
  online: boolean
  lastSeen?: string | null
  friendshipId?: string
}

interface RequestItem {
  id: string
  user: FriendUser
  createdAt: string
}

interface FriendsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTab?: Tab
  onRefresh?: () => void
}

export function FriendsDialog({
  open,
  onOpenChange,
  initialTab = 'friends',
  onRefresh,
}: FriendsDialogProps) {
  const { t } = useI18n()
  const { onlineUserIds, presenceSynced, setProfileUserId } = useAppStore()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [showQr, setShowQr] = useState(false)
  const [friends, setFriends] = useState<FriendUser[]>([])
  const [incoming, setIncoming] = useState<RequestItem[]>([])
  const [outgoing, setOutgoing] = useState<RequestItem[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/friends')
      const data = await res.json()
      if (res.ok) {
        setFriends(data.friends || [])
        setIncoming(data.incoming || [])
        setOutgoing(data.outgoing || [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setTab(initialTab)
      void load()
    } else {
      setQuery('')
    }
  }, [open, initialTab, load])

  const filteredFriends = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? friends.filter(
          (f) =>
            f.name.toLowerCase().includes(q) ||
            f.username.toLowerCase().includes(q),
        )
      : friends
    return sortFriendsByOnline(list, onlineUserIds, presenceSynced)
  }, [friends, query, onlineUserIds, presenceSynced])

  const onlineCount = useMemo(
    () => countOnlineFriends(friends, onlineUserIds, presenceSynced),
    [friends, onlineUserIds, presenceSynced],
  )

  const startChat = async (userId: string) => {
    const result = await openPrivateChatWithUser(userId)
    if (result.ok) {
      onOpenChange(false)
      return
    }
    toast.error(result.error || t('friends.errorSend'))
  }

  const handleFriendUpdate = () => {
    void load()
    onRefresh?.()
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'friends', label: t('friends.all'), count: friends.length },
    { id: 'incoming', label: t('friends.incoming'), count: incoming.length },
    { id: 'outgoing', label: t('friends.outgoing'), count: outgoing.length },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <span className="flex-1">{t('friends.title')}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowQr(true)}
              title={t('qr.title')}
            >
              <QrCode className="h-4 w-4 text-[#3390ec]" />
            </Button>
          </DialogTitle>
        </DialogHeader>
        <QrDialog open={showQr} onOpenChange={setShowQr} />

        <div className="px-5 pt-3">
          <div className="flex rounded-xl bg-muted p-1">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  'relative flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium transition',
                  tab === item.id ? 'bg-background shadow text-foreground' : 'text-muted-foreground',
                )}
              >
                {item.label}
                {item.count != null && item.count > 0 && (
                  <span
                    className={cn(
                      'flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold',
                      item.id === 'incoming' && item.count > 0
                        ? 'bg-[#3390ec] text-white hover:bg-[#2b82d9]'
                        : 'bg-muted-foreground/20 text-muted-foreground',
                    )}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {tab === 'friends' && (
          <div className="space-y-2 px-5 pt-3">
            {friends.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {friends.length} {t('friends.total')}
                {' · '}
                <span className={onlineCount > 0 ? 'text-emerald-500' : undefined}>
                  {onlineCount} {t('friends.stats')}
                </span>
              </p>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('friends.search')}
                className="h-9 rounded-xl pl-10 text-sm"
              />
            </div>
          </div>
        )}

        <ScrollArea className="max-h-[420px] px-3 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-[#3390ec]" />
            </div>
          ) : tab === 'friends' ? (
            filteredFriends.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {query.trim() ? t('friends.noResults') : t('friends.empty')}
              </p>
            ) : (
              <div className="space-y-0.5">
                {filteredFriends.map((f) => (
                  <FriendRow
                    key={f.id}
                    user={f}
                    online={isFriendOnline(f.id, f.online, onlineUserIds, presenceSynced, f.lastSeen)}
                    onProfile={() => {
                      setProfileUserId(f.id)
                      onOpenChange(false)
                    }}
                    onMessage={() => startChat(f.id)}
                    friendship={{
                      id: f.friendshipId ?? null,
                      status: 'accepted',
                    }}
                    onUpdate={handleFriendUpdate}
                  />
                ))}
              </div>
            )
          ) : tab === 'incoming' ? (
            incoming.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {t('friends.noIncoming')}
              </p>
            ) : (
              <div className="space-y-2">
                {incoming.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-xl border border-[#3390ec]/20 bg-[#3390ec]/5 p-3"
                  >
                    <FriendRow
                      user={r.user}
                      online={isFriendOnline(r.user.id, r.user.online, onlineUserIds, presenceSynced, r.user.lastSeen)}
                      onProfile={() => {
                        setProfileUserId(r.user.id)
                        onOpenChange(false)
                      }}
                      onMessage={() => startChat(r.user.id)}
                      friendship={{ id: r.id, status: 'pending_incoming' }}
                      onUpdate={handleFriendUpdate}
                    />
                  </div>
                ))}
              </div>
            )
          ) : outgoing.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t('friends.noOutgoing')}
            </p>
          ) : (
            <div className="space-y-0.5">
              {outgoing.map((r) => (
                <FriendRow
                  key={r.id}
                  user={r.user}
                  online={isFriendOnline(r.user.id, r.user.online, onlineUserIds, presenceSynced)}
                  onProfile={() => {
                    setProfileUserId(r.user.id)
                    onOpenChange(false)
                  }}
                  onMessage={() => startChat(r.user.id)}
                  friendship={{ id: r.id, status: 'pending_outgoing' }}
                  onUpdate={handleFriendUpdate}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="border-t border-border px-5 py-3">
          <Button
            variant="outline"
            className="w-full rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            {t('misc.close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FriendRow({
  user,
  online,
  onProfile,
  onMessage,
  friendship,
  onUpdate,
}: {
  user: FriendUser
  online: boolean
  onProfile: () => void
  onMessage: () => void
  friendship: FriendshipState
  onUpdate: () => void
}) {
  const { t } = useI18n()

  return (
    <div className="flex items-center gap-2 rounded-xl px-2 py-2 transition hover:bg-muted/60">
      <button type="button" onClick={onProfile} className="shrink-0">
        <Avatar
          name={user.name}
          color={user.avatarColor}
          imageUrl={user.avatarUrl}
          size="sm"
          showStatus
          online={online}
        />
      </button>
      <button type="button" onClick={onProfile} className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">@{user.username}</p>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        {friendship.status === 'accepted' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onMessage}
            title={t('profile.message')}
          >
            <MessageCircle className="h-4 w-4 text-[#3390ec]" />
          </Button>
        )}
        <FriendButton
          userId={user.id}
          friendship={friendship}
          onUpdate={onUpdate}
          variant="compact"
        />
      </div>
    </div>
  )
}
