'use client'

import { useEffect, useState } from 'react'
import {
  MessageCircle,
  Phone,
  Video,
  Crown,
  Loader2,
  Edit3,
  X,
  Images,
  ImageIcon,
  FileIcon,
  Link2,
  Mic,
  Clapperboard,
  Users,
  Flag,
  UserX,
  ChevronLeft,
  ChevronRight,
  Gift,
  Info,
  AtSign,
} from 'lucide-react'
import { Avatar } from './avatar'
import { EmojiStatusBadge } from './emoji-status-badge'
import { StoryRing } from './story-ring'
import { StoryViewer } from './story-viewer'
import { AddStoryDialog } from './add-story-dialog'
import type { StoryFeedUser } from '@/lib/stories'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useAppStore } from '@/lib/store'
import { useI18n } from '@/hooks/use-i18n'
import { useIsMobile } from '@/hooks/use-mobile'
import { translate } from '@/lib/i18n'
import { formatLastSeen } from '@/lib/format'
import { isUserOnline } from '@/lib/friends-client'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { ProfileTabContent, PROFILE_EMPTY_KEYS, type ProfileTab } from './profile-tab-content'
import { FriendButton, type FriendshipState } from './friend-button'
import { MediaLightbox } from './media-lightbox'
import { GiftPickerDialog } from './gift-picker-dialog'
import { ProfileGiftsSection, type ProfileGiftItem } from './profile-gifts-section'
import { CreatorPremiumDialog } from '../shorts/creator-premium-dialog'
import { ProfileWall } from './profile-wall'
import { ProfileVisitorsSection } from './profile-visitors-section'

interface SharedChat {
  id: string
  title: string
  avatarColor: string
  type: 'group' | 'channel'
}

interface MediaCounts {
  profilePhotos: number
  media: number
  files: number
  links: number
  voice: number
  gifs: number
}

interface ProfileData {
  id: string
  username: string
  name: string
  avatarColor: string
  avatarUrl?: string | null
  bio?: string | null
  online: boolean
  lastSeen: string
  isPremium: boolean
  isSelf: boolean
  emojiStatus?: string | null
  privateChatId?: string | null
  isMuted?: boolean
  isBlocked?: boolean
  friendship?: FriendshipState | null
  sharedChats?: SharedChat[]
  mediaCounts?: MediaCounts
}

interface UserProfileDialogProps {
  userId: string | null
  scopeChatId?: string | null
  onClose: () => void
  onMessage?: (userId: string) => void
  onCall?: (userId: string, type: 'audio' | 'video') => void
  onEditProfile?: () => void
  onOpenPremium?: () => void
}

export function UserProfileDialog({
  userId,
  scopeChatId,
  onClose,
  onMessage,
  onCall,
  onEditProfile,
  onOpenPremium,
}: UserProfileDialogProps) {
  const { t, lang } = useI18n()
  const isMobile = useIsMobile()
  const { onlineUserIds, presenceSynced, setActiveChat, openBrowser, openVideoPlayer, setProfileUserId } = useAppStore()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<'not_found' | 'error' | null>(null)
  const [activeTab, setActiveTab] = useState<ProfileTab>('profilePhotos')
  const [photoOpen, setPhotoOpen] = useState(false)
  const [profileStories, setProfileStories] = useState<StoryFeedUser | null>(null)
  const [showStoryViewer, setShowStoryViewer] = useState(false)
  const [showAddStory, setShowAddStory] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [friendship, setFriendship] = useState<FriendshipState | null>(null)
  const [profileGifts, setProfileGifts] = useState<ProfileGiftItem[]>([])
  const [giftsLoading, setGiftsLoading] = useState(false)
  const [showGiftPicker, setShowGiftPicker] = useState(false)
  const [creatorTiersCount, setCreatorTiersCount] = useState(0)
  const [showPremium, setShowPremium] = useState(false)

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setLoading(false)
      setLoadError(null)
      setActiveTab('profilePhotos')
      setPhotoOpen(false)
      setProfileStories(null)
      setShowStoryViewer(false)
      setProfileGifts([])
      setGiftsLoading(false)
      return
    }

    const controller = new AbortController()
    let cancelled = false

    setProfile(null)
    setLoading(true)
    setLoadError(null)
    setActiveTab('profilePhotos')

    fetch(`/api/users/${encodeURIComponent(userId)}/profile${scopeChatId ? `?chatId=${scopeChatId}` : ''}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (res.status === 404) {
          if (!cancelled) {
            setProfile(null)
            setLoadError('not_found')
          }
          return null
        }
        if (!res.ok) {
          throw new Error(
            typeof data.error === 'string' ? data.error : `HTTP ${res.status}`,
          )
        }
        return data as { profile?: ProfileData }
      })
      .then((data) => {
        if (!data || cancelled) return
        setProfile(data.profile ?? null)
        setBlocked(data.profile?.isBlocked ?? false)
        setFriendship(data.profile?.friendship ?? null)
        if (!data.profile) setLoadError('not_found')
      })
      .catch((err: unknown) => {
        if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return
        toast.error(translate(lang, 'profile.errorLoad'))
        if (!cancelled) {
          setProfile(null)
          setLoadError('error')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [userId, lang, scopeChatId])

  useEffect(() => {
    if (!userId) {
      setProfileStories(null)
      return
    }
    let cancelled = false
    fetch(`/api/stories/user/${userId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.user?.stories?.length) {
          setProfileStories(data.user as StoryFeedUser)
        } else if (!cancelled) {
          setProfileStories(null)
        }
      })
      .catch(() => {
        if (!cancelled) setProfileStories(null)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setProfileGifts([])
      setGiftsLoading(false)
      return
    }

    let cancelled = false
    setGiftsLoading(true)

    fetch(`/api/users/${encodeURIComponent(userId)}/gifts`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) setProfileGifts(data.gifts || [])
      })
      .catch(() => {
        if (!cancelled) setProfileGifts([])
      })
      .finally(() => {
        if (!cancelled) setGiftsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  // Fetch the creator's premium tier count to decide whether to show the
  // "Premium-подписка" section.
  useEffect(() => {
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCreatorTiersCount(0)
      return
    }
    let cancelled = false
    fetch(`/api/creators/${encodeURIComponent(userId)}/premium`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) {
          setCreatorTiersCount(Array.isArray(data.tiers) ? data.tiers.length : 0)
        }
      })
      .catch(() => {
        if (!cancelled) setCreatorTiersCount(0)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const isOnline = profile
    ? isUserOnline(profile.id, profile.online, onlineUserIds, presenceSynced, profile.lastSeen)
    : false
  const counts = profile?.mediaCounts ?? {
    profilePhotos: 0,
    media: 0,
    files: 0,
    links: 0,
    voice: 0,
    gifs: 0,
  }

  const handleMessage = () => {
    if (!profile || profile.isSelf) return
    onMessage?.(profile.id)
    onClose()
  }

  const handleCall = (type: 'audio' | 'video') => {
    if (!profile || profile.isSelf) return
    onCall?.(profile.id, type)
    onClose()
  }

  const copyUsername = () => {
    if (!profile) return
    navigator.clipboard.writeText(`@${profile.username}`).then(() => {
      toast.success(t('profile.usernameCopied'))
    })
  }

  const handleBlock = async () => {
    if (!profile || profile.isSelf) return
    try {
      const res = await fetch(`/api/users/${profile.id}/block`, {
        method: blocked ? 'DELETE' : 'POST',
      })
      if (!res.ok) throw new Error()
      const next = !blocked
      setBlocked(next)
      toast.success(next ? t('profile.blocked') : t('profile.unblocked'))
      if (next) onClose()
    } catch {
      toast.error(t('misc.error'))
    }
  }

  const handleReport = async () => {
    if (!profile || profile.isSelf) return
    const reason = window.prompt(t('profile.reportPrompt'))
    if (!reason?.trim()) return
    try {
      const res = await fetch(`/api/users/${profile.id}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) throw new Error()
      toast.success(t('profile.reportSent'))
    } catch {
      toast.error(t('misc.error'))
    }
  }

  const openGroup = (chatId: string) => {
    setActiveChat(chatId)
    onClose()
  }

  const tabs: { id: ProfileTab; label: string; icon: React.ReactNode; count: number }[] = [
    {
      id: 'profilePhotos',
      label: t('profile.tabProfilePhotos'),
      icon: <Images className="h-4 w-4" />,
      count: counts.profilePhotos,
    },
    {
      id: 'media',
      label: t('profile.tabSharedMedia'),
      icon: <ImageIcon className="h-4 w-4" />,
      count: counts.media,
    },
    { id: 'files', label: t('profile.tabFiles'), icon: <FileIcon className="h-4 w-4" />, count: counts.files },
    { id: 'links', label: t('profile.tabLinks'), icon: <Link2 className="h-4 w-4" />, count: counts.links },
    { id: 'voice', label: t('profile.tabVoice'), icon: <Mic className="h-4 w-4" />, count: counts.voice },
    { id: 'gifs', label: t('profile.tabGifs'), icon: <Clapperboard className="h-4 w-4" />, count: counts.gifs },
  ]

  const profileBody = (
    <>
      {loading ? (
        <div className="flex flex-1 items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-[#3390ec]" />
        </div>
      ) : profile ? (
        <div className="min-h-0 w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
          {/* Fixed horizontal padding — avoids Radix ScrollArea display:table overflow */}
          <div className="box-border w-full max-w-full px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {/* Profile header — Telegram style */}
          <div className="relative flex w-full min-w-0 flex-col items-center gap-3 bg-gradient-to-b from-[#3390ec]/12 via-background to-background pb-5 pt-2">
            <button
              type="button"
              onClick={() => {
                if (profileStories?.stories.length) {
                  setShowStoryViewer(true)
                } else if (profile.avatarUrl) {
                  setPhotoOpen(true)
                } else if (profile.isSelf) {
                  setShowAddStory(true)
                }
              }}
              className={cn(
                'relative overflow-visible rounded-full transition',
                (profileStories?.stories.length || profile.avatarUrl) && 'cursor-pointer hover:opacity-90',
              )}
              title={
                profileStories?.stories.length
                  ? t('stories.viewStories')
                  : profile.avatarUrl
                    ? t('profile.openFullPhoto')
                    : profile.isSelf
                      ? t('stories.addStory')
                      : undefined
              }
            >
              <StoryRing
                hasStory={!!profileStories?.stories.length}
                hasUnviewed={profileStories?.hasUnviewed}
                size="lg"
                className="rounded-full"
              >
                <Avatar
                  name={profile.name}
                  color={profile.avatarColor}
                  imageUrl={profile.avatarUrl}
                  size="2xl"
                  showStatus
                  online={isOnline}
                  className="rounded-full ring-4 ring-background [&_>div]:!rounded-full"
                />
              </StoryRing>
              {profile.isPremium && (
                <span className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-[#3390ec] shadow-lg ring-2 ring-background">
                  <Crown className="h-3.5 w-3.5 text-white" />
                </span>
              )}
            </button>

            <div className="w-full min-w-0 text-center">
              <p className="flex flex-wrap items-center justify-center gap-1.5 text-xl font-semibold tracking-tight">
                <span className="max-w-full break-words">{profile.name}</span>
                <EmojiStatusBadge emojiStatus={profile.emojiStatus} size="lg" />
                {profile.isPremium && (
                  <span className="rounded-full bg-[#3390ec]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#3390ec]">
                    Premium
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={copyUsername}
                className="mt-1 max-w-full truncate text-sm text-[#3390ec] transition hover:text-[#1677d2]"
              >
                @{profile.username}
              </button>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatLastSeen(profile.lastSeen, isOnline, lang)}
              </p>
            </div>

            {/* Actions — only under avatar (Telegram-style) */}
            <div className="w-full min-w-0 pt-1">
              {!profile.isSelf ? (
                <div className="grid w-full min-w-0 grid-cols-4 gap-1 rounded-2xl bg-muted/40 p-1.5">
                  <button
                    type="button"
                    onClick={handleMessage}
                    className="flex min-h-[4rem] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl text-[#3390ec] transition hover:bg-background active:scale-[0.98]"
                  >
                    <MessageCircle className="h-6 w-6 shrink-0" strokeWidth={1.75} />
                    <span className="block w-full truncate text-center text-[10px] font-medium leading-tight">{t('profile.message')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCall('audio')}
                    className="flex min-h-[4rem] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl text-[#3390ec] transition hover:bg-background active:scale-[0.98]"
                  >
                    <Phone className="h-6 w-6 shrink-0" strokeWidth={1.75} />
                    <span className="block w-full truncate text-center text-[10px] font-medium leading-tight">{t('profile.call')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCall('video')}
                    className="flex min-h-[4rem] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl text-[#3390ec] transition hover:bg-background active:scale-[0.98]"
                  >
                    <Video className="h-6 w-6 shrink-0" strokeWidth={1.75} />
                    <span className="block w-full truncate text-center text-[10px] font-medium leading-tight">{t('profile.video')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGiftPicker(true)}
                    className="flex min-h-[4rem] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl text-[#3390ec] transition hover:bg-background active:scale-[0.98]"
                  >
                    <Gift className="h-6 w-6 shrink-0" strokeWidth={1.75} />
                    <span className="block w-full truncate text-center text-[10px] font-medium leading-tight">
                      {lang === 'ru' ? 'Подарок' : 'Gift'}
                    </span>
                  </button>
                </div>
              ) : (
                <div className="grid w-full min-w-0 grid-cols-1 gap-1 rounded-2xl bg-muted/40 p-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      onEditProfile?.()
                    }}
                    className="flex min-h-[3.25rem] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl text-[#3390ec] transition hover:bg-background active:scale-[0.98]"
                  >
                    <Edit3 className="h-6 w-6 shrink-0" strokeWidth={1.75} />
                    <span className="block w-full truncate text-center text-[10px] font-medium">{t('profile.editProfile')}</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Info rows */}
          <div className="min-w-0 space-y-1.5 pb-3 pt-2">
            {profile.bio && (
              <InfoRow
                icon={<Info className="h-4 w-4" />}
                label={t('profile.bioLabel')}
                value={profile.bio}
              />
            )}
            <InfoRow
              icon={<AtSign className="h-4 w-4" />}
              label={t('profile.usernameLabel')}
              value={`@${profile.username}`}
              onClick={copyUsername}
            />
          </div>

          {/* Gifts on profile */}
          <div className="min-w-0 overflow-hidden">
          <ProfileGiftsSection
            gifts={profileGifts}
            isSelf={profile.isSelf}
            loading={giftsLoading}
          />
          </div>

          {/* Creator Premium */}
          {(creatorTiersCount > 0 || profile.isSelf) && (
            <div className="min-w-0 pb-2">
              <MenuRow
                icon={<Crown className="h-5 w-5" />}
                color="#f4a12e"
                label={t('premium.support')}
                hint={
                  profile.isSelf
                    ? t('premium.manage')
                    : `${creatorTiersCount} ${t('premium.tiers').toLowerCase()}`
                }
                value={profile.isSelf ? t('shorts.edit') : t('premium.subscribe')}
                onClick={() => setShowPremium(true)}
              />
            </div>
          )}

          {/* Friend request button */}
          {!profile.isSelf && !blocked && (
            <div className="min-w-0 pb-2">
              <FriendButton
                userId={profile.id}
                friendship={friendship}
                onUpdate={setFriendship}
              />
            </div>
          )}

          <Separator />

          {/* Media tabs — Telegram underline style */}
          <div className="min-w-0 py-1">
            <div className="-mx-4 flex gap-0 overflow-x-auto border-b border-border px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium transition',
                    activeTab === tab.id
                      ? 'text-[#3390ec]'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className="truncate">{tab.label}</span>
                  <span className="tabular-nums opacity-70">{tab.count}</span>
                  {activeTab === tab.id && (
                    <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#3390ec]" />
                  )}
                </button>
              ))}
            </div>

            <div className="min-w-0 overflow-hidden">
            {userId ? (
              <ProfileTabContent
                key={`${userId}:${activeTab}:${scopeChatId || 'all'}`}
                userId={userId}
                activeTab={activeTab}
                scopeChatId={scopeChatId}
                isSelf={!!profile?.isSelf}
                onOpenBrowser={openBrowser}
                onOpenVideo={openVideoPlayer}
                onMediaCountChange={() => {
                  if (!userId) return
                  fetch(`/api/users/${userId}/profile${scopeChatId ? `?chatId=${scopeChatId}` : ''}`)
                    .then((res) => res.json())
                    .then((data) => {
                      if (data.profile?.mediaCounts) {
                        setProfile((p) => (p ? { ...p, mediaCounts: data.profile.mediaCounts } : p))
                      }
                    })
                    .catch(() => {})
                }}
              />
            ) : (
              <div className="flex min-h-[80px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
                <p className="text-sm text-muted-foreground">{t(PROFILE_EMPTY_KEYS[activeTab])}</p>
              </div>
            )}
            </div>
          </div>

          {/* Shared groups & channels */}
          {!profile.isSelf && (
            <>
              <Separator />
              <div className="min-w-0 py-3">
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  {t('profile.sharedChats')}
                  {profile.sharedChats && profile.sharedChats.length > 0 && (
                    <span>· {profile.sharedChats.length}</span>
                  )}
                </p>
                {profile.sharedChats && profile.sharedChats.length > 0 ? (
                  <div className="space-y-0.5">
                    {profile.sharedChats.map((chat) => (
                      <button
                        key={chat.id}
                        type="button"
                        onClick={() => openGroup(chat.id)}
                        className="flex w-full min-w-0 items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-muted"
                      >
                        <Avatar name={chat.title} color={chat.avatarColor} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{chat.title}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {t('profile.noSharedChats')}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Premium-exclusive: who viewed your profile */}
          {profile.isSelf && userId && (
            <>
              <Separator />
              <div className="min-w-0 overflow-hidden">
              <ProfileVisitorsSection
                userId={userId}
                isPremium={!!profile.isPremium}
                onOpenPremium={onOpenPremium}
                onOpenProfile={(id) => setProfileUserId(id)}
              />
              </div>
            </>
          )}

          {/* VK-style wall */}
          <Separator />
          <div className="min-w-0 overflow-hidden">
          <ProfileWall
            profileId={profile.id}
            isSelf={profile.isSelf}
            blocked={blocked}
          />
          </div>

          {/* Block / Report */}
          {!profile.isSelf && (
            <div className="min-w-0 space-y-0.5 py-3">
              <MenuRow
                icon={<UserX className="h-5 w-5" />}
                color="#e53935"
                label={blocked ? t('profile.unblock') : t('profile.block')}
                onClick={handleBlock}
              />
              <MenuRow
                icon={<Flag className="h-5 w-5" />}
                color="#9e9e9e"
                label={t('profile.report')}
                onClick={handleReport}
              />
            </div>
          )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 px-6 text-center text-sm text-muted-foreground">
          <p>
            {loadError === 'not_found'
              ? t('profile.deleted')
              : loadError === 'error'
                ? t('profile.errorLoad')
                : t('profile.notFound')}
          </p>
        </div>
      )}

    </>
  )

  return (
    <>
      <Sheet open={!!userId} onOpenChange={(v) => !v && onClose()}>
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className={cn(
            // Kill sheet default safe-x / gap so nothing clips on the right edge
            'flex flex-col gap-0 overflow-hidden border-0 bg-background p-0 shadow-lg [padding:0!important] [&>button]:hidden',
            isMobile
              ? 'inset-x-0 bottom-0 h-[100dvh] max-h-[100dvh] w-full max-w-none rounded-none'
              : 'inset-y-0 right-0 h-full w-full max-w-md border-l sm:max-w-md',
          )}
        >
          <div className="flex w-full shrink-0 items-center gap-2 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full"
              onClick={onClose}
              aria-label={isMobile ? t('misc.back') : t('misc.close')}
            >
              {isMobile ? <ChevronLeft className="h-5 w-5" /> : <X className="h-4 w-4" />}
            </Button>
            <div className="min-w-0 flex-1" />
            <div className="h-9 w-9 shrink-0" aria-hidden />
          </div>
          {profileBody}
        </SheetContent>
      </Sheet>

      <MediaLightbox
        url={photoOpen && profile?.avatarUrl ? profile.avatarUrl : null}
        alt={profile?.name ?? ''}
        onClose={() => setPhotoOpen(false)}
      />

      {showStoryViewer && profileStories && (
        <StoryViewer
          feed={[profileStories]}
          initialUserIndex={0}
          onClose={() => setShowStoryViewer(false)}
          onRefresh={() => {
            if (!userId) return
            fetch(`/api/stories/user/${userId}`)
              .then((res) => res.json())
              .then((data) => {
                if (data.user?.stories?.length) {
                  setProfileStories(data.user as StoryFeedUser)
                } else {
                  setProfileStories(null)
                  setShowStoryViewer(false)
                }
              })
              .catch(() => {})
          }}
        />
      )}

      <AddStoryDialog
        open={showAddStory}
        onOpenChange={setShowAddStory}
        onCreated={() => {
          if (!userId) return
          fetch(`/api/stories/user/${userId}`)
            .then((res) => res.json())
            .then((data) => {
              if (data.user?.stories?.length) {
                setProfileStories(data.user as StoryFeedUser)
              }
            })
            .catch(() => {})
        }}
      />

      {profile && !profile.isSelf && userId && (
        <GiftPickerDialog
          open={showGiftPicker}
          onOpenChange={setShowGiftPicker}
          recipientId={userId}
          recipientName={profile.name}
          chatId={profile.privateChatId}
          onSent={(chatId) => {
            setActiveChat(chatId)
            onMessage?.(userId)
            fetch(`/api/users/${userId}/gifts`)
              .then((r) => r.json())
              .then((d) => setProfileGifts(d.gifts || []))
          }}
        />
      )}

      {profile && userId && (creatorTiersCount > 0 || profile.isSelf) && (
        <CreatorPremiumDialog
          open={showPremium}
          creatorId={userId}
          onOpenChange={setShowPremium}
          manageMode={profile.isSelf}
        />
      )}
    </>
  )
}

/** Telegram-style menu row matching the settings dialog: colored icon
 *  square, label, optional hint/value, chevron. */
function MenuRow({
  icon,
  color,
  label,
  hint,
  value,
  onClick,
}: {
  icon: React.ReactNode
  color: string
  label: string
  hint?: string
  value?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full min-w-0 items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-muted/70 active:scale-[0.99]"
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm"
        style={{ background: color }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
      </span>
      {value && <span className="max-w-[40%] shrink-0 truncate text-xs font-medium text-[#3390ec]">{value}</span>}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
    </button>
  )
}

/** Settings-style info row: small icon, uppercase label, value. Optionally
 *  tappable (e.g. copy username). */
function InfoRow({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value: string
  onClick?: () => void
}) {
  const Wrapper: React.ElementType = onClick ? 'button' : 'div'
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full min-w-0 items-start gap-3 rounded-2xl bg-muted/40 px-4 py-3 text-left',
        onClick && 'transition hover:bg-muted/70 active:scale-[0.99]',
      )}
    >
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="block break-words text-sm">{value}</span>
      </span>
    </Wrapper>
  )
}
