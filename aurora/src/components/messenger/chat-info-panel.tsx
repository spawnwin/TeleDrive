'use client'

import { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  X,
  Bell,
  Palette,
  Shield,
  UserX,
  Star,
  Camera,
  Loader2,
  ChevronLeft,
  Info,
  AtSign,
  ChevronRight,
  Check,
  Pencil,
  Link2,
} from 'lucide-react'
import { Avatar } from './avatar'
import { EmojiStatusBadge } from './emoji-status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useAppStore } from '@/lib/store'
import { useI18n } from '@/hooks/use-i18n'
import { formatLastSeen } from '@/lib/format'
import { isUserOnline } from '@/lib/friends-client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { FriendButton, type FriendshipState } from './friend-button'
import { ChatAdminPanel, type ChatAdminMember } from './chat-admin-panel'
import { AvatarCropDialog } from './avatar-crop-dialog'
import { canEditChatInfo } from '@/lib/chat-permissions'
import { getChatAvatarImageUrl } from '@/lib/chat-avatar'
import { getPublicChannelLink } from '@/lib/chat-id'
import { ChatWallpaperDialog } from './chat-wallpaper-dialog'
import { useIsNarrowLayout, MESSENGER_NARROW_MAX_WIDTH } from '@/hooks/use-mobile'

const XL_BREAKPOINT = MESSENGER_NARROW_MAX_WIDTH
const XXL_BREAKPOINT = 1536

/** Matches the inner panel width across breakpoints so the animated
 *  outer wrapper never crops the content. */
function useInfoPanelWidth() {
  const [width, setWidth] = useState(380)
  useEffect(() => {
    const xl = window.matchMedia(`(min-width: ${XL_BREAKPOINT}px)`)
    const xxl = window.matchMedia(`(min-width: ${XXL_BREAKPOINT}px)`)
    const update = () => {
      if (xxl.matches) setWidth(460)
      else if (xl.matches) setWidth(420)
      else setWidth(380)
    }
    xl.addEventListener('change', update)
    xxl.addEventListener('change', update)
    update()
    return () => {
      xl.removeEventListener('change', update)
      xxl.removeEventListener('change', update)
    }
  }, [])
  return width
}

interface ChatInfoPanelProps {
  open: boolean
  onClose: () => void
}

export function ChatInfoPanel({ open, onClose }: ChatInfoPanelProps) {
  const { t, lang } = useI18n()
  /** Full-screen sheet below xl — matches sidebar/chat swap and swipe-back. */
  const isNarrowLayout = useIsNarrowLayout()
  const panelWidth = useInfoPanelWidth()
  const { activeChatId, chats, currentUser, onlineUserIds, presenceSynced, setProfileUserId, upsertChat } = useAppStore()
  const [chat, setChat] = useState<any>(null)
  const [myMembership, setMyMembership] = useState<ChatAdminMember | null>(null)
  const [favorites, setFavorites] = useState<any[]>([])
  const [friendship, setFriendship] = useState<FriendshipState | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [showWallpaper, setShowWallpaper] = useState(false)
  const [editingInfo, setEditingInfo] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [blocking, setBlocking] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const activeChat = chats.find((c) => c.id === activeChatId)
  const otherMember =
    activeChat?.type === 'private'
      ? activeChat.members.find((m) => m.id !== currentUser?.id)
      : null
  const isOnline = otherMember
    ? isUserOnline(otherMember.id, otherMember.online, onlineUserIds, presenceSynced, otherMember.lastSeen)
    : false

  const refresh = async () => {
    if (!activeChatId) return
    const [membersRes, favRes] = await Promise.all([
      fetch(`/api/chats/${activeChatId}/members?take=300`),
      fetch(`/api/favorites`),
    ])
    const membersData = await membersRes.json()
    const favData = await favRes.json()
    setChat(membersData.chat)
    setMyMembership(membersData.myMembership ?? null)
    setFavorites((favData.favorites || []).filter((f: any) => f.message.chatId === activeChatId))

    const other = activeChat?.type === 'private'
      ? activeChat.members.find((m) => m.id !== currentUser?.id)
      : null
    if (other) {
      const profileRes = await fetch(`/api/users/${other.id}/profile?chatId=${activeChatId}`)
      const profileData = await profileRes.json()
      setFriendship(profileData.profile?.friendship ?? null)
    } else {
      setFriendship(null)
    }
  }

  useEffect(() => {
    if (!open || !activeChatId) return
    refresh().catch(console.error)
  }, [open, activeChatId])

  useEffect(() => {
    if (!chat) return
    setEditTitle(chat.title || '')
    setEditDesc(chat.description || '')
    setEditSlug(chat.slug || '')
  }, [chat])

  const handleBlock = async () => {
    if (!otherMember || blocking) return
    setBlocking(true)
    try {
      const res = await fetch(`/api/users/${otherMember.id}/block`, { method: 'POST' })
      if (res.ok) {
        toast.success(t('info.blocked'))
        onClose?.()
      }
    } catch {} finally {
      setBlocking(false)
    }
  }

  if (!activeChat) return null

  const canManage = myMembership && ['owner', 'admin'].includes(myMembership.role)
  const canEdit = canEditChatInfo(myMembership)
  const isGroupOrChannel = activeChat.type === 'group' || activeChat.type === 'channel'
  const chatAvatarUrl = getChatAvatarImageUrl(activeChat, currentUser?.id)
  const memberCount =
    chat?.memberTotal ??
    (activeChat.type === 'channel'
      ? activeChat.subscriberCount ?? activeChat.members.length
      : activeChat.members.length)

  // Online count among loaded members (groups only — channels don't expose
  // the subscriber list to non-admins, so we can't compute online there).
  const onlineMemberCount = isGroupOrChannel
    ? (chat?.members || []).filter((m: any) =>
        isUserOnline(m.id, m.online, onlineUserIds, presenceSynced, m.lastSeen),
      ).length
    : 0

  const copyText = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(msg)
    } catch {
      toast.error(t('misc.error'))
    }
  }

  const saveInfo = async () => {
    if (!activeChatId) return
    try {
      const res = await fetch(`/api/chats/${activeChatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          description: editDesc,
          slug: activeChat.type === 'channel' ? editSlug : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      toast.success(t('admin.infoSaved'))
      setEditingInfo(false)
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    }
  }

  const handleAvatarPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setCropSrc(URL.createObjectURL(file))
  }

  const closeCrop = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  const uploadChatAvatar = async (file: File) => {
    if (!activeChatId) return
    setUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/chats/${activeChatId}/avatar`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      upsertChat({ ...activeChat, avatarUrl: data.url })
      setChat((prev: any) => (prev ? { ...prev, avatarUrl: data.url } : prev))
      toast.success(t('admin.photoUpdated'))
      if (cropSrc) {
        URL.revokeObjectURL(cropSrc)
        setCropSrc(null)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
      throw err
    } finally {
      setUploadingAvatar(false)
    }
  }

  const updateSlowMode = async (seconds: number) => {
    try {
      const res = await fetch(`/api/chats/${activeChatId}/moderation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slowModeSeconds: seconds }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(t('mod.slowMode'))
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    }
  }

  const toggleForum = async () => {
    try {
      const res = await fetch(`/api/chats/${activeChatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isForum: !chat?.isForum }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(chat?.isForum ? 'Форум отключён' : 'Форум включён')
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    }
  }

  const panelBody = (
    <ScrollArea className="flex-1">
      {/* Header: avatar + name + status */}
      <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
        <div className="relative">
          <button
            onClick={() => otherMember && setProfileUserId(otherMember.id)}
            className={cn(otherMember && 'cursor-pointer transition hover:opacity-90')}
            disabled={!otherMember}
          >
            <Avatar
              name={activeChat.title}
              color={activeChat.avatarColor}
              imageUrl={chatAvatarUrl}
              size="xl"
              showStatus={activeChat.type === 'private'}
              online={isOnline}
            />
          </button>
          {isGroupOrChannel && canEdit && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 text-white shadow-md transition hover:from-violet-400 hover:to-cyan-300 disabled:opacity-50"
                title={t('admin.changePhoto')}
              >
                {uploadingAvatar ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleAvatarPick}
                className="hidden"
              />
            </>
          )}
        </div>
        <div className="min-w-0 w-full">
          <button
            onClick={() => otherMember && setProfileUserId(otherMember.id)}
            className={cn(otherMember && 'cursor-pointer hover:underline')}
            disabled={!otherMember}
          >
            <h3 className="flex items-center justify-center gap-1.5 truncate text-lg font-bold">
              {activeChat.title}
              {otherMember?.emojiStatus && (
                <EmojiStatusBadge emojiStatus={otherMember.emojiStatus} size="md" />
              )}
            </h3>
          </button>
          <p className="truncate text-xs text-muted-foreground">
            {activeChat.type === 'private'
              ? formatLastSeen(
                  activeChat.members.find((m) => m.id !== currentUser?.id)?.lastSeen,
                  isOnline,
                  lang,
                )
              : activeChat.type === 'channel'
                ? `${memberCount} ${t('channel.subscribers')}`
                : onlineMemberCount > 0
                  ? `${memberCount} ${t('chat.members')}, ${onlineMemberCount} ${t('chat.online')}`
                  : `${memberCount} ${t('chat.members')}`}
          </p>
        </div>
      </div>

      {/* Private: friend button */}
      {chat?.members && activeChat.type === 'private' && otherMember && (
        <div className="px-4 pb-4">
          <FriendButton
            userId={otherMember.id}
            friendship={friendship}
            onUpdate={setFriendship}
          />
        </div>
      )}

      {/* Info section: bio (private) or description + public link (group/channel) */}
      {activeChat.type === 'private' && chat?.members && (
        <div className="px-4 pb-4">
          <InfoRow
            icon={<Info className="h-4 w-4" />}
            label={t('info.about')}
            value={
              chat.members.find((m: any) => m.id !== currentUser?.id)?.bio ||
              t('info.aboutEmpty')
            }
          />
        </div>
      )}

      {isGroupOrChannel && (
        <div className="px-4 pb-4 space-y-2">
          {editingInfo && canEdit ? (
            <div className="rounded-xl bg-muted/40 p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">
                {t('info.settings')}
              </p>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder={t('channel.title')}
              />
              <Input
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder={t('channel.descPlaceholder')}
              />
              {activeChat.type === 'channel' && (
                <Input
                  value={editSlug}
                  onChange={(e) => setEditSlug(e.target.value.replace(/^@/, ''))}
                  placeholder={t('channel.slug')}
                />
              )}
              <div className="flex gap-2">
                <Button size="sm" className="gap-1" onClick={saveInfo}>
                  <Check className="h-3.5 w-3.5" />
                  {t('misc.save')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingInfo(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <InfoRow
              icon={<Info className="h-4 w-4" />}
              label={t('info.description')}
              value={chat?.description || t('info.noDescription')}
              onCopy={
                chat?.description
                  ? () => copyText(chat.description, t('info.copied'))
                  : undefined
              }
              onEdit={canEdit ? () => setEditingInfo(true) : undefined}
            />
          )}

          {activeChat.type === 'channel' && chat?.slug && (
            <InfoRow
              icon={<AtSign className="h-4 w-4" />}
              label={t('info.link')}
              value={`@${chat.slug}`}
              onCopy={() => {
                const link = getPublicChannelLink(chat.slug!)
                if (link) void copyText(link, t('admin.linkCopied'))
              }}
            />
          )}
        </div>
      )}

      <Separator />

      {/* Preferences */}
      <div className="space-y-1 px-2 py-2">
        <ToggleRow icon={<Bell className="h-4 w-4" />} label={t('info.notifications')} defaultChecked />
        <button
          type="button"
          onClick={() => setShowWallpaper(true)}
          className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm transition hover:bg-muted/60"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="shrink-0 text-muted-foreground">
              <Palette className="h-4 w-4" />
            </span>
            <span className="truncate">{t('wallpaper.title')}</span>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
        <ToggleRow icon={<Shield className="h-4 w-4" />} label={t('info.hideReadReceipts')} />
      </div>

      {favorites.length > 0 && (
        <>
          <Separator />
          <div className="px-4 py-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Star className="h-3.5 w-3.5 text-amber-500" />
              {t('info.favorites')} · {favorites.length}
            </p>
            <div className="space-y-1">
              {favorites.slice(0, 5).map((f) => (
                <div
                  key={f.id}
                  className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5"
                >
                  <p className="line-clamp-2 text-xs">{f.message.content || (f.message.type === 'image' ? t('chat.image') : t('chat.file'))}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {f.message.sender.name}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {chat?.members && (activeChat.type === 'group' || activeChat.type === 'channel') && (
        <ChatAdminPanel
          chatId={activeChatId!}
          chatType={activeChat.type as 'group' | 'channel'}
          chat={chat}
          myMembership={myMembership}
          onRefresh={refresh}
        />
      )}

      {chat?.members && activeChat.type === 'group' && canManage && (
        <>
          <Separator />
          <div className="px-4 py-3">
            <Label className="text-xs">{t('mod.slowMode')}</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {[0, 5, 10, 30, 60].map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={chat.slowModeSeconds === s ? 'default' : 'outline'}
                  className="h-7 px-2 text-xs"
                  onClick={() => updateSlowMode(s)}
                >
                  {s === 0 ? 'Off' : `${s}s`}
                </Button>
              ))}
            </div>
          </div>
        </>
      )}

      {chat?.members && activeChat.type === 'group' && canManage && (
        <>
          <Separator />
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/></svg>
                </span>
                <div>
                  <p className="text-sm font-medium">Режим форума</p>
                  <p className="text-xs text-muted-foreground">Темы как в Telegram</p>
                </div>
              </div>
              <Switch
                checked={!!chat?.isForum}
                onCheckedChange={toggleForum}
              />
            </div>
          </div>
        </>
      )}

      <Separator />

      <div className="px-4 py-4">
        {(activeChat.type === 'group' || activeChat.type === 'channel') && (
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={async () => {
              if (!currentUser?.id || !activeChatId) return
              const res = await fetch(`/api/chats/${activeChatId}/members/${currentUser.id}`, {
                method: 'DELETE',
              })
              if (!res.ok) {
                toast.error((await res.json()).error || t('misc.error'))
                return
              }
              toast.success(
                activeChat.type === 'channel' ? t('admin.unsubscribed') : t('info.leaveGroup'),
              )
              onClose()
            }}
          >
            <UserX className="h-4 w-4" />
            {activeChat.type === 'channel' ? t('admin.unsubscribe') : t('info.leaveGroup')}
          </Button>
        )}
        {activeChat.type === 'private' && (
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={handleBlock}
            disabled={blocking}
          >
            {blocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
            {t('info.block')}
          </Button>
        )}
      </div>
    </ScrollArea>
  )

  return (
    <>
      {isNarrowLayout ? (
        <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
          <SheetContent
            side="bottom"
            className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 overflow-x-hidden rounded-none p-0 [&>button]:hidden"
          >
            <div className="flex items-center gap-2 border-b border-border px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onClose}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <h3 className="flex-1 text-center text-sm font-semibold">{t('info.title')}</h3>
              <div className="w-9" />
            </div>
            {panelBody}
          </SheetContent>
        </Sheet>
      ) : (
        <motion.div
          initial={false}
          animate={{ width: open ? panelWidth : 0, opacity: open ? 1 : 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="h-full shrink-0 overflow-hidden border-l border-border bg-sidebar"
        >
          <div
            className="flex h-full flex-col"
            style={{ width: panelWidth }}
          >
            <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3">
              <h3 className="text-sm font-semibold">{t('info.title')}</h3>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {panelBody}
          </div>
        </motion.div>
      )}

      <AvatarCropDialog
        open={!!cropSrc}
        imageSrc={cropSrc}
        onClose={closeCrop}
        onConfirm={uploadChatAvatar}
      />

      <ChatWallpaperDialog
        open={showWallpaper}
        onOpenChange={setShowWallpaper}
        scope="chat"
        chatId={activeChatId}
        currentWallpaper={activeChat.wallpaper}
      />
    </>
  )
}

function ToggleRow({
  icon,
  label,
  defaultChecked = false,
}: {
  icon: React.ReactNode
  label: string
  defaultChecked?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-3 text-sm">
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <Switch defaultChecked={defaultChecked} />
    </div>
  )
}

function InfoRow({
  icon,
  label,
  value,
  onCopy,
  onEdit,
}: {
  icon: React.ReactNode
  label: string
  value: string
  onCopy?: () => void
  onEdit?: () => void
}) {
  const clickable = !!onCopy
  return (
    <div className="group relative flex items-start gap-3 rounded-xl bg-muted/40 px-3 py-2.5">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <button
        type="button"
        disabled={!clickable}
        onClick={onCopy}
        className={cn(
          'min-w-0 flex-1 text-left',
          clickable && 'cursor-pointer',
        )}
        title={clickable ? undefined : undefined}
      >
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className={cn('text-sm break-words', !value && 'italic text-muted-foreground/70')}>
          {value}
        </p>
      </button>
      {onEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}
