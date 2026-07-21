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
  Trash2,
  Eye,
  Heart,
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
import { useIsNarrowLayout } from '@/hooks/use-mobile'
import { translate } from '@/lib/i18n'
import { formatLastSeen } from '@/lib/format'
import { isUserOnline } from '@/lib/friends-client'
import { cn } from '@/lib/utils'
import { resolveMediaUrl } from '@/lib/media-url'
import { removeProfileAvatar } from '@/lib/remove-avatar'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { ProfileTabContent, PROFILE_EMPTY_KEYS, type ProfileTab } from './profile-tab-content'
import { FriendButton, type FriendshipState } from './friend-button'
import { MediaLightbox } from './media-lightbox'
import { ProfilePhotoViewersPanel } from './profile-photo-viewers-panel'
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
  const isMobile = useIsNarrowLayout()
  const { onlineUserIds, presenceSynced, setActiveChat, openBrowser, openVideoPlayer, setProfileUserId, setCurrentUser, currentUser } = useAppStore()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<'not_found' | 'error' | null>(null)
  const [activeTab, setActiveTab] = useState<ProfileTab>('profilePhotos')
  const [photoOpen, setPhotoOpen] = useState(false)
  const [photoViewersOpen, setPhotoViewersOpen] = useState(false)
  const [photoViewCount, setPhotoViewCount] = useState(0)
  const [photoViewerPreviews, setPhotoViewerPreviews] = useState<
    Array<{ id: string; name: string; avatarColor: string; avatarUrl?: string | null }>
  >([])
  const [photoLiked, setPhotoLiked] = useState(false)
  const [photoLikeCount, setPhotoLikeCount] = useState(0)
  const [photoLiking, setPhotoLiking] = useState(false)
  const [confirmRemovePhoto, setConfirmRemovePhoto] = useState(false)
  const [removingPhoto, setRemovingPhoto] = useState(false)
  const [profileStories, setProfileStories] = useState<StoryFeedUser | null>(null)
  const [showStoryViewer, setShowStoryViewer] = useState(false)
  const [showAddStory, setShowAddStory] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [friendship, setFriendship] = useState<FriendshipState | null>(null)
  const [profileGifts, setProfileGifts] = useState<ProfileGiftItem[]>([])
  const [giftCollectibles, setGiftCollectibles] = useState<any[]>([])
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
      setPhotoViewersOpen(false)
      setPhotoViewCount(0)
      setPhotoViewerPreviews([])
      setProfileStories(null)
      setShowStoryViewer(false)
      setProfileGifts([])
      setGiftCollectibles([])
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

  // Record / load profile-photo views when the avatar lightbox opens.
  useEffect(() => {
    if (!photoOpen || !userId || !profile?.avatarUrl) return
    let cancelled = false
    if (profile.isSelf) {
      fetch(
        `/api/users/${encodeURIComponent(userId)}/profile/photo/viewers?url=${encodeURIComponent(profile.avatarUrl)}`,
        { credentials: 'include' },
      )
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return
          if (typeof data.total === 'number') setPhotoViewCount(data.total)
          const viewers = Array.isArray(data.viewers) ? data.viewers : []
          setPhotoViewerPreviews(
            viewers.slice(0, 3).map((v: { id: string; name: string; avatarColor: string; avatarUrl?: string | null }) => ({
              id: v.id,
              name: v.name,
              avatarColor: v.avatarColor,
              avatarUrl: v.avatarUrl,
            })),
          )
        })
        .catch(() => {})
      fetch(
        `/api/users/${encodeURIComponent(userId)}/profile/photo/like?url=${encodeURIComponent(profile.avatarUrl)}`,
        { credentials: 'include' },
      )
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled && typeof data.likes === 'number') setPhotoLikeCount(data.likes)
        })
        .catch(() => {})
    } else {
      setPhotoViewerPreviews([])
      fetch(`/api/users/${encodeURIComponent(userId)}/profile/photo/view`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: profile.avatarUrl }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled && typeof data.total === 'number') setPhotoViewCount(data.total)
        })
        .catch(() => {})
      fetch(
        `/api/users/${encodeURIComponent(userId)}/profile/photo/like?url=${encodeURIComponent(profile.avatarUrl)}`,
        { credentials: 'include' },
      )
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return
          setPhotoLiked(!!data.isLiked)
          if (typeof data.likes === 'number') setPhotoLikeCount(data.likes)
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [photoOpen, userId, profile?.avatarUrl, profile?.isSelf])

  const toggleAvatarLike = async () => {
    if (!userId || !profile?.avatarUrl || profile.isSelf || photoLiking) return
    setPhotoLiking(true)
    const prevLiked = photoLiked
    const prevCount = photoLikeCount
    setPhotoLiked(!prevLiked)
    setPhotoLikeCount(Math.max(0, prevCount + (prevLiked ? -1 : 1)))
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}/profile/photo/like`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: profile.avatarUrl }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('profile.photoLikeError'))
      setPhotoLiked(!!data.isLiked)
      if (typeof data.likes === 'number') setPhotoLikeCount(data.likes)
    } catch (err) {
      setPhotoLiked(prevLiked)
      setPhotoLikeCount(prevCount)
      toast.error(err instanceof Error ? err.message : t('profile.photoLikeError'))
    } finally {
      setPhotoLiking(false)
    }
  }

  useEffect(() => {
    if (!photoOpen) setPhotoViewersOpen(false)
  }, [photoOpen])

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
      setGiftCollectibles([])
      setGiftsLoading(false)
      return
    }

    let cancelled = false
    setGiftsLoading(true)

    fetch(`/api/users/${encodeURIComponent(userId)}/gifts`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) {
          setProfileGifts(data.gifts || [])
          setGiftCollectibles(data.collectibles || [])
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfileGifts([])
          setGiftCollectibles([])
        }
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
        <div className="min-h-0 w-full min-w-0 max-w-full flex-1 overflow-x-clip overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
          {/* Padded block — no negative horizontal margins (they widen scrollWidth on mobile) */}
          <div className="box-border w-full max-w-full px-4">
            {/* Profile header — Telegram style */}
            <div className={cn(
              'relative flex w-full min-w-0 flex-col items-center gap-3 bg-gradient-to-b from-[#3390ec]/12 via-background to-background pt-2',
              profile.bio ? 'pb-5' : 'pb-3',
            )}>
              <button
                type="button"
                onClick={() => {
                  // Own avatar: always open photo lightbox (Telegram viewers + delete).
                  // Stories stay available via the story ring / dedicated control below.
                  if (profile.isSelf && profile.avatarUrl) {
                    setPhotoOpen(true)
                    return
                  }
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
                  profile.isSelf && profile.avatarUrl
                    ? t('profile.openFullPhoto')
                    : profileStories?.stories.length
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
              </button>

              <div className="w-full min-w-0 text-center">
                <p className="flex flex-wrap items-center justify-center gap-1.5 text-xl font-semibold tracking-tight">
                  <span className="max-w-full break-words">{profile.name}</span>
                  <EmojiStatusBadge emojiStatus={profile.emojiStatus} size="lg" />
                  {profile.isPremium && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-amber-400/25 to-[#3390ec]/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-500"
                      title="Aurora Premium"
                    >
                      <Crown className="h-3.5 w-3.5" />
                      Premium
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={copyUsername}
                  className="mt-1.5 max-w-full truncate text-sm leading-snug text-[#3390ec] transition hover:text-[#1677d2]"
                >
                  @{profile.username}
                </button>
                <p className="mt-1.5 min-h-[1.25rem] px-2 text-sm leading-snug text-muted-foreground">
                  {formatLastSeen(profile.lastSeen, isOnline, lang)}
                </p>
              </div>

              {/* Actions — compact under avatar */}
              <div className="flex w-full min-w-0 max-w-full flex-col items-center gap-2 pt-1">
                {!profile.isSelf ? (
                  <div className="grid w-full min-w-0 max-w-full grid-cols-4 gap-1 rounded-2xl bg-muted/40 p-1.5 [grid-template-columns:repeat(4,minmax(0,1fr))]">
                    <button
                      type="button"
                      onClick={handleMessage}
                      className="flex min-h-[4rem] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl text-[#3390ec] transition hover:bg-background active:scale-[0.98]"
                    >
                      <MessageCircle className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" strokeWidth={1.75} />
                      <span className="block w-full truncate text-center text-[10px] font-medium leading-tight">{t('profile.message')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCall('audio')}
                      className="flex min-h-[4rem] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl text-[#3390ec] transition hover:bg-background active:scale-[0.98]"
                    >
                      <Phone className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" strokeWidth={1.75} />
                      <span className="block w-full truncate text-center text-[10px] font-medium leading-tight">{t('profile.call')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCall('video')}
                      className="flex min-h-[4rem] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl text-[#3390ec] transition hover:bg-background active:scale-[0.98]"
                    >
                      <Video className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" strokeWidth={1.75} />
                      <span className="block w-full truncate text-center text-[10px] font-medium leading-tight">{t('profile.video')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowGiftPicker(true)}
                      className="flex min-h-[4rem] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl text-[#3390ec] transition hover:bg-background active:scale-[0.98]"
                    >
                      <Gift className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" strokeWidth={1.75} />
                      <span className="block w-full truncate text-center text-[10px] font-medium leading-tight">
                        {t('gifts.sendGift')}
                      </span>
                    </button>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-center gap-2">
                  {profile.isSelf && !!profileStories?.stories.length && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-full px-3 text-xs font-medium"
                      onClick={() => setShowStoryViewer(true)}
                    >
                      {t('stories.viewStories')}
                    </Button>
                  )}
                  {profile.isSelf && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-full px-3 text-xs font-medium"
                      onClick={() => {
                        onClose()
                        onEditProfile?.()
                      }}
                    >
                      <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                      {t('profile.editProfile')}
                    </Button>
                  )}
                  {(creatorTiersCount > 0 || profile.isSelf) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-full px-3 text-xs font-medium"
                      onClick={() => setShowPremium(true)}
                    >
                      <Crown className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
                      {t('premium.support')}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Bio only — name/@username stay under the avatar */}
            {profile.bio && (
              <div className="min-w-0 space-y-1.5 pb-3 pt-2">
                <InfoRow
                  icon={<Info className="h-4 w-4" />}
                  label={t('profile.bioLabel')}
                  value={profile.bio}
                />
              </div>
            )}

            {/* Gifts on profile */}
            <div className="min-w-0 max-w-full overflow-x-clip">
              <ProfileGiftsSection
                gifts={profileGifts}
                collectibles={giftCollectibles}
                isSelf={profile.isSelf}
                loading={giftsLoading}
                showRecentFeed={profile.isSelf}
              />
            </div>

            {/* Friend request button */}
            {!profile.isSelf && !blocked && (
              <div className="min-w-0 max-w-full pb-2">
                <FriendButton
                  userId={profile.id}
                  friendship={friendship}
                  onUpdate={setFriendship}
                />
              </div>
            )}
          </div>

          <Separator />

          {/* Media tabs — full width inside sheet, no -mx-* */}
          <div className="min-w-0 max-w-full overflow-x-clip py-1">
            <div className="flex gap-0 overflow-x-auto border-b border-border px-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

            <div className="min-w-0 max-w-full overflow-x-clip px-1">
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

          {/* Lower sections with side padding again */}
          <div className="box-border w-full max-w-full px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
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
                <div className="min-w-0 max-w-full overflow-x-clip">
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
            <div className="min-w-0 max-w-full overflow-x-clip">
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
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-24 text-center text-sm text-muted-foreground">
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
            'flex flex-col gap-0 overflow-x-clip overflow-y-hidden border-0 bg-background p-0 shadow-lg [&>button]:hidden',
            isMobile
              ? // left/right insets only — do NOT set w-full (conflicts with inset-x-0 on iOS)
                '!inset-x-0 !bottom-0 !left-0 !right-0 !top-0 !h-[100dvh] !max-h-[100dvh] !w-auto !max-w-none !rounded-none !border-0 !p-0'
              : '!right-0 !top-0 !h-full !w-full !max-w-md !border-l !p-0 sm:!max-w-md',
          )}
          style={
            isMobile
              ? { padding: 0, left: 0, right: 0, width: 'auto', maxWidth: '100%' }
              : { padding: 0 }
          }
        >
          <div className="box-border flex w-full min-w-0 max-w-full shrink-0 items-center gap-2 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
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
        hideCloseLabel
        onDoubleTap={
          profile && !profile.isSelf
            ? () => {
                if (!photoLiked) void toggleAvatarLike()
              }
            : undefined
        }
        onClose={() => {
          setPhotoOpen(false)
          setPhotoViewersOpen(false)
        }}
        footer={
          profile?.avatarUrl ? (
            profile.isSelf ? (
              <div className="flex w-full items-center justify-between gap-3">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left active:opacity-80"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setPhotoViewersOpen(true)
                  }}
                >
                  {photoViewerPreviews.length > 0 ? (
                    <span className="flex shrink-0 items-center pl-1">
                      {photoViewerPreviews.map((viewer, index) => (
                        <span
                          key={viewer.id}
                          className="relative inline-flex rounded-full ring-2 ring-black"
                          style={{
                            marginLeft: index === 0 ? 0 : -10,
                            zIndex: photoViewerPreviews.length - index,
                          }}
                        >
                          <Avatar
                            name={viewer.name}
                            color={viewer.avatarColor}
                            imageUrl={viewer.avatarUrl}
                            size="sm"
                            className="h-8 w-8 [&>div]:!h-8 [&>div]:!w-8 [&>div]:!rounded-full [&>div]:text-[10px]"
                          />
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
                      <Eye className="h-4 w-4" />
                    </span>
                  )}
                  <span className="min-w-0 truncate text-[15px] font-medium text-white">
                    {photoViewCount > 0
                      ? t('profile.photoViewsCount').replace('{count}', String(photoViewCount))
                      : t('profile.photoViewsEmpty')}
                    {photoLikeCount > 0
                      ? ` · ${t('profile.photoLikesCount').replace('{count}', String(photoLikeCount))}`
                      : ''}
                  </span>
                </button>

                <button
                  type="button"
                  aria-label={t('profile.removePhotoAction')}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white active:bg-white/10"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setPhotoOpen(false)
                    window.setTimeout(() => setConfirmRemovePhoto(true), 50)
                  }}
                >
                  <Trash2 className="h-6 w-6" strokeWidth={1.75} />
                </button>
              </div>
            ) : (
              <div className="flex w-full items-center justify-end">
                <button
                  type="button"
                  disabled={photoLiking}
                  aria-label={photoLiked ? t('profile.photoLiked') : t('profile.photoLike')}
                  className={cn(
                    'flex h-11 items-center gap-2 rounded-full px-4 text-[15px] font-medium text-white active:bg-white/10',
                    photoLiked && 'text-rose-400',
                  )}
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    void toggleAvatarLike()
                  }}
                >
                  <Heart
                    className={cn('h-6 w-6', photoLiked && 'fill-rose-400 text-rose-400')}
                    strokeWidth={1.75}
                  />
                  <span>
                    {photoLiked ? t('profile.photoLiked') : t('profile.photoLike')}
                    {photoLikeCount > 0 ? ` · ${photoLikeCount}` : ''}
                  </span>
                </button>
              </div>
            )
          ) : null
        }
      />

      {profile?.isSelf && userId && (
        <ProfilePhotoViewersPanel
          userId={userId}
          open={photoViewersOpen}
          photoUrl={profile.avatarUrl}
          onClose={() => setPhotoViewersOpen(false)}
          onSelectUser={(id) => {
            setPhotoOpen(false)
            setPhotoViewersOpen(false)
            setProfileUserId(id)
          }}
        />
      )}

      <AlertDialog
        open={confirmRemovePhoto}
        onOpenChange={(open) => {
          setConfirmRemovePhoto(open)
        }}
      >
        <AlertDialogContent className="max-w-sm gap-0 overflow-hidden p-0 sm:max-w-md">
          <div className="relative aspect-square w-full bg-muted">
            {profile?.avatarUrl && (
              <img
                src={resolveMediaUrl(profile.avatarUrl)}
                alt=""
                className="h-full w-full object-cover"
              />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
          </div>
          <AlertDialogHeader className="space-y-2 px-5 pt-4 text-left">
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <Trash2 className="h-5 w-5 text-destructive" />
              {t('profile.removePhotoTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              {t('profile.removePhotoDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 px-5 pb-5 pt-4 sm:flex-col">
            <Button
              type="button"
              disabled={removingPhoto}
              className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                setRemovingPhoto(true)
                try {
                  await removeProfileAvatar()
                  setProfile((p) => (p ? { ...p, avatarUrl: null } : p))
                  if (currentUser) setCurrentUser({ ...currentUser, avatarUrl: null })
                  setConfirmRemovePhoto(false)
                  setPhotoOpen(false)
                  toast.success(t('profile.photoRemoved'))
                } catch {
                  toast.error(t('misc.error'))
                } finally {
                  setRemovingPhoto(false)
                }
              }}
            >
              {removingPhoto ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {t('profile.removePhotoAction')}
            </Button>
            <AlertDialogCancel className="mt-0 w-full" disabled={removingPhoto}>
              {t('misc.cancel')}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
