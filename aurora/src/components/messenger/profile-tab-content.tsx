'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Loader2,
  Download,
  File,
  Link2,
  ExternalLink,
  Play,
  Clapperboard,
  Plus,
  Pin,
  PinOff,
  Share2,
  MoreVertical,
  Pencil,
  Trash2,
  Eye,
  Heart,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { VoicePlayer } from './voice-player'
import { MediaLightbox } from './media-lightbox'
import { Avatar } from './avatar'
import { ProfilePhotoViewersPanel } from './profile-photo-viewers-panel'
import { isImageUrl, isVideoUrl, resolveMediaUrl } from '@/lib/media-url'
import { useI18n } from '@/hooks/use-i18n'
import { formatMessageTime } from '@/lib/format'
import { formatBytes } from '@/lib/format-storage'
import { GALLERY_INPUT_ACCEPT, isVideoFile } from '@/lib/media-type'
import { uploadFileWithRetry } from '@/lib/upload-client'
import { removeProfileAvatar } from '@/lib/remove-avatar'
import { toast } from 'sonner'
import { useAppStore } from '@/lib/store'
import { buildLinkSharePayload, buildMediaSharePayload } from '@/lib/share-payload'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export type ProfileTab = 'profilePhotos' | 'media' | 'files' | 'links' | 'voice' | 'gifs'

interface MediaItem {
  id: string
  chatId: string
  type: string
  content: string
  attachmentUrl: string | null
  attachmentName: string | null
  attachmentMime: string | null
  attachmentSize: number | null
  durationSec: number | null
  createdAt: string
  source?: 'gallery' | 'chat' | 'avatar'
  isPinned?: boolean
}

interface LinkItem {
  id: string
  messageId: string
  url: string
  title: string
  createdAt: string
  chatId: string
}

interface ProfileTabContentProps {
  userId: string
  activeTab: ProfileTab
  scopeChatId?: string | null
  isSelf?: boolean
  onOpenBrowser: (url: string) => void
  onOpenVideo: (url: string, title?: string) => void
  onMediaCountChange?: () => void
}

const EMPTY_KEYS: Record<ProfileTab, 'profile.emptyProfilePhotos' | 'profile.emptyMedia' | 'profile.emptyFiles' | 'profile.emptyLinks' | 'profile.emptyVoice' | 'profile.emptyGifs'> = {
  profilePhotos: 'profile.emptyProfilePhotos',
  media: 'profile.emptyMedia',
  files: 'profile.emptyFiles',
  links: 'profile.emptyLinks',
  voice: 'profile.emptyVoice',
  gifs: 'profile.emptyGifs',
}

export const PROFILE_EMPTY_KEYS = EMPTY_KEYS

const API_TYPE: Record<ProfileTab, string> = {
  profilePhotos: 'profilePhotos',
  media: 'media',
  files: 'files',
  links: 'links',
  voice: 'voice',
  gifs: 'gif',
}

export function ProfileTabContent({
  userId,
  activeTab,
  scopeChatId,
  isSelf = false,
  onOpenBrowser,
  onOpenVideo,
  onMediaCountChange,
}: ProfileTabContentProps) {
  const { t, lang } = useI18n()
  const { openShareToChat } = useAppStore()
  const [items, setItems] = useState<Array<MediaItem | LinkItem>>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [lightboxItem, setLightboxItem] = useState<MediaItem | null>(null)
  const [photoViewCount, setPhotoViewCount] = useState(0)
  const [photoViewerPreviews, setPhotoViewerPreviews] = useState<
    Array<{ id: string; name: string; avatarColor: string; avatarUrl: string | null }>
  >([])
  const [photoViewersOpen, setPhotoViewersOpen] = useState(false)
  const [viewersPhotoUrl, setViewersPhotoUrl] = useState<string | null>(null)
  const [photoLiked, setPhotoLiked] = useState(false)
  const [photoLikeCount, setPhotoLikeCount] = useState(0)
  const [photoLiking, setPhotoLiking] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null)
  const [captionTarget, setCaptionTarget] = useState<MediaItem | null>(null)
  const [captionDraft, setCaptionDraft] = useState('')
  const [galleryActionLoading, setGalleryActionLoading] = useState(false)
  const loadedTabs = useRef(new Set<string>())
  const uploadRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const photoKey = lightboxItem?.attachmentUrl || null
    const isProfilePhoto =
      !!lightboxItem &&
      (lightboxItem.source === 'avatar' ||
        (lightboxItem.source === 'gallery' && lightboxItem.type !== 'video'))

    if (!lightboxUrl || !photoKey || !isProfilePhoto) {
      if (!lightboxUrl) {
        setPhotoViewCount(0)
        setPhotoViewerPreviews([])
        setPhotoLiked(false)
        setPhotoLikeCount(0)
      }
      return
    }

    let cancelled = false
    if (isSelf) {
      fetch(
        `/api/users/${encodeURIComponent(userId)}/profile/photo/viewers?url=${encodeURIComponent(photoKey)}`,
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
              avatarUrl: v.avatarUrl ?? null,
            })),
          )
        })
        .catch(() => {})
      fetch(
        `/api/users/${encodeURIComponent(userId)}/profile/photo/like?url=${encodeURIComponent(photoKey)}`,
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
        body: JSON.stringify({ url: photoKey }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled && typeof data.total === 'number') setPhotoViewCount(data.total)
        })
        .catch(() => {})
      fetch(
        `/api/users/${encodeURIComponent(userId)}/profile/photo/like?url=${encodeURIComponent(photoKey)}`,
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
  }, [lightboxUrl, lightboxItem?.attachmentUrl, lightboxItem?.source, lightboxItem?.type, isSelf, userId])

  const togglePhotoLike = useCallback(async () => {
    const photoKey = lightboxItem?.attachmentUrl
    if (!photoKey || isSelf || photoLiking) return
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
        body: JSON.stringify({ url: photoKey }),
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
  }, [
    lightboxItem?.attachmentUrl,
    isSelf,
    photoLiking,
    photoLiked,
    photoLikeCount,
    userId,
    t,
  ])

  const isLightboxProfilePhoto =
    !!lightboxItem &&
    (lightboxItem.source === 'avatar' ||
      (lightboxItem.source === 'gallery' && lightboxItem.type !== 'video'))

  /** Gallery item ids come back as `gallery:<realId>` (see galleryItemToMediaItem). */
  const galleryItemId = (item: MediaItem) =>
    item.source === 'gallery' && item.id.startsWith('gallery:') ? item.id.slice('gallery:'.length) : null

  const patchGalleryItem = async (item: MediaItem, body: Record<string, unknown>) => {
    const realId = galleryItemId(item)
    if (!realId) return null
    const res = await fetch(`/api/users/${encodeURIComponent(userId)}/gallery/${realId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || t('profile.galleryActionError'))
    return data.item as { id: string; caption: string | null; isPinned: boolean }
  }

  const handleTogglePin = async (item: MediaItem) => {
    setGalleryActionLoading(true)
    try {
      const updated = await patchGalleryItem(item, { isPinned: !item.isPinned })
      if (updated) {
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, isPinned: updated.isPinned } : it)),
        )
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('profile.galleryActionError'))
    } finally {
      setGalleryActionLoading(false)
    }
  }

  const handleSaveCaption = async () => {
    if (!captionTarget) return
    setGalleryActionLoading(true)
    try {
      const updated = await patchGalleryItem(captionTarget, { caption: captionDraft })
      if (updated) {
        setItems((prev) =>
          prev.map((it) => (it.id === captionTarget.id ? { ...it, content: updated.caption || '' } : it)),
        )
        toast.success(t('profile.galleryCaptionSaved'))
      }
      setCaptionTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('profile.galleryActionError'))
    } finally {
      setGalleryActionLoading(false)
    }
  }

  const handleDeleteGalleryItem = async () => {
    const item = deleteTarget
    if (!item) return

    if (item.source === 'avatar') {
      setGalleryActionLoading(true)
      try {
        await removeProfileAvatar()
        setItems((prev) => prev.filter((it) => it.id !== item.id))
        const me = useAppStore.getState().currentUser
        if (me) useAppStore.getState().setCurrentUser({ ...me, avatarUrl: null })
        toast.success(t('profile.photoRemoved'))
        onMediaCountChange?.()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('profile.galleryActionError'))
      } finally {
        setGalleryActionLoading(false)
        setDeleteTarget(null)
      }
      return
    }

    const realId = galleryItemId(item)
    if (!realId) {
      setDeleteTarget(null)
      return
    }
    setGalleryActionLoading(true)
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}/gallery/${realId}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('profile.galleryActionError'))
      setItems((prev) => prev.filter((it) => it.id !== item.id))
      toast.success(t('profile.galleryDeleted'))
      onMediaCountChange?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('profile.galleryActionError'))
    } finally {
      setGalleryActionLoading(false)
      setDeleteTarget(null)
    }
  }

  const fetchTab = useCallback(
    async (tab: ProfileTab, cursor?: string | null, append = false) => {
      const params = new URLSearchParams({
        type: API_TYPE[tab],
        take: '24',
      })
      if (cursor) params.set('cursor', cursor)

      const res = await fetch(`/api/users/${encodeURIComponent(userId)}/profile/media?${params}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed')

      const newItems = (data.items || []) as Array<MediaItem | LinkItem>
      setItems((prev) => (append ? [...prev, ...newItems] : newItems))
      setNextCursor(data.nextCursor ?? null)
    },
    [userId],
  )

  useEffect(() => {
    const key = `${userId}:${activeTab}:${scopeChatId || 'all'}`
    let cancelled = false

    setItems([])
    setNextCursor(null)
    setLoading(true)

    fetchTab(activeTab)
      .catch(() => {
        if (!cancelled) setItems([])
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
          loadedTabs.current.add(key)
        }
      })

    return () => {
      cancelled = true
    }
  }, [userId, activeTab, scopeChatId, fetchTab])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      await fetchTab(activeTab, nextCursor, true)
    } catch {
      // keep current items
    } finally {
      setLoadingMore(false)
    }
  }

  const handleGalleryUpload = async (file: File) => {
    setUploading(true)
    try {
      const uploadData = await uploadFileWithRetry(file, t)

      const isVideo = uploadData.isVideo || isVideoFile({ type: file.type, name: file.name })
      const galleryRes = await fetch(`/api/users/${encodeURIComponent(userId)}/gallery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaUrl: uploadData.url,
          type: isVideo ? 'video' : 'photo',
        }),
      })
      const galleryData = await galleryRes.json().catch(() => ({}))
      if (!galleryRes.ok) throw new Error(galleryData.error || t('profile.galleryUploadError'))

      toast.success(t('profile.galleryUploaded'))
      loadedTabs.current.delete(`${userId}:${activeTab}:${scopeChatId || 'all'}`)
      setItems([])
      setNextCursor(null)
      setLoading(true)
      await fetchTab(activeTab)
      onMediaCountChange?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('profile.galleryUploadError'))
    } finally {
      setUploading(false)
    }
  }

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleGalleryUpload(file)
    e.target.value = ''
  }

  if (loading) {
    return (
      <div className="flex min-h-[120px] items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-[#3390ec]" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="space-y-3">
        {isSelf && activeTab === 'profilePhotos' && (
          <GalleryUploadBar
            uploading={uploading}
            onClick={() => uploadRef.current?.click()}
            label={t('profile.addToGallery')}
          />
        )}
        <input
          ref={uploadRef}
          type="file"
          accept={GALLERY_INPUT_ACCEPT}
          className="hidden"
          onChange={onFileInput}
        />
        <div className="flex min-h-[80px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">{t(EMPTY_KEYS[activeTab])}</p>
        </div>
      </div>
    )
  }

  if (activeTab === 'profilePhotos' || activeTab === 'media' || activeTab === 'gifs') {
    const mediaItems = items as MediaItem[]
    return (
      <>
        {isSelf && activeTab === 'profilePhotos' && (
          <GalleryUploadBar
            uploading={uploading}
            onClick={() => uploadRef.current?.click()}
            label={t('profile.addToGallery')}
          />
        )}
        <input
          ref={uploadRef}
          type="file"
          accept={GALLERY_INPUT_ACCEPT}
          className="hidden"
          onChange={onFileInput}
        />
        <div className="grid w-full min-w-0 max-w-full grid-cols-3 gap-1 [grid-template-columns:repeat(3,minmax(0,1fr))]">
          {mediaItems.map((item) => {
            const url = resolveMediaUrl(
              item.attachmentUrl || (item.content.match(/https?:\/\/\S+/)?.[0] ?? null),
            )
            const isVideo =
              item.type === 'video' ||
              isVideoUrl(url, item.attachmentMime, item.attachmentName)
            const isImage =
              !isVideo &&
              (item.type === 'image' ||
                isImageUrl(url, item.attachmentMime, item.attachmentName))
            const isGif =
              !!url &&
              (url.includes('tenor.com') || url.includes('giphy.com') || /\.gif(\?|$)/i.test(url))
            return (
              <div key={item.id} className="group relative aspect-square overflow-hidden rounded-lg bg-black/20">
                <button
                  type="button"
                  onClick={() => {
                    if (!url) return
                    if (isVideo) onOpenVideo(url, item.attachmentName || undefined)
                    else if (isGif) {
                      onOpenBrowser(url)
                    } else {
                      setLightboxUrl(url)
                      setLightboxItem(item)
                    }
                  }}
                  className="absolute inset-0 z-0 flex items-center justify-center"
                >
                {item.isPinned && (
                  <span className="pointer-events-none absolute left-1 top-1 z-10 rounded bg-black/50 p-0.5">
                    <Pin className="h-3 w-3 text-white" />
                  </span>
                )}
                {url && (isImage || isVideo) && !isGif ? (
                  isVideo ? (
                    <video
                      src={url}
                      className="max-h-full max-w-full object-contain"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                     
                    <img
                      src={url}
                      alt=""
                      className="max-h-full max-w-full object-contain"
                      loading="lazy"
                      decoding="async"
                    />
                  )
                ) : url && isGif ? (
                   
                  <img
                    src={url}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#3390ec]/20 to-[#3390ec]/10">
                    <Clapperboard className="h-8 w-8 text-[#3390ec]" />
                  </div>
                )}
                {isVideo && url && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
                    <Play className="h-8 w-8 text-white drop-shadow" />
                  </span>
                )}
                </button>
                {/* Controls above the open-photo hit target; always visible on touch. */}
                <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-end gap-1 p-1">
                {url && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      openShareToChat(buildMediaSharePayload(item))
                    }}
                    className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/70 pointer-fine:h-8 pointer-fine:w-8 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
                    title={t('share.title')}
                  >
                    <Share2 className="h-4 w-4 pointer-fine:h-3.5 pointer-fine:w-3.5" />
                  </button>
                )}
                {isSelf && (item.source === 'gallery' || item.source === 'avatar') && (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/70 pointer-fine:h-8 pointer-fine:w-8 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
                        title={t('profile.more')}
                        aria-label={t('profile.more')}
                      >
                        <MoreVertical className="h-4 w-4 pointer-fine:h-3.5 pointer-fine:w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      sideOffset={6}
                      className="z-[500]"
                      onCloseAutoFocus={(e) => e.preventDefault()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {item.source === 'gallery' && (
                        <>
                          <DropdownMenuItem onClick={() => handleTogglePin(item)} disabled={galleryActionLoading}>
                            {item.isPinned ? (
                              <PinOff className="h-4 w-4" />
                            ) : (
                              <Pin className="h-4 w-4" />
                            )}
                            {item.isPinned ? t('profile.galleryUnpin') : t('profile.galleryPin')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setCaptionTarget(item)
                              setCaptionDraft(item.content || '')
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                            {t('profile.galleryEditCaption')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleteTarget(item)}
                          >
                            <Trash2 className="h-4 w-4" />
                            {t('profile.galleryDelete')}
                          </DropdownMenuItem>
                        </>
                      )}
                      {item.source === 'avatar' && (
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleteTarget(item)}
                        >
                          <Trash2 className="h-4 w-4" />
                          {t('profile.removeAvatarFromGallery')}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                </div>
              </div>
            )
          })}
        </div>
        {nextCursor && (
          <LoadMoreButton loading={loadingMore} onClick={loadMore} label={t('profile.loadMore')} />
        )}
        <MediaLightbox
          url={lightboxUrl}
          hideCloseLabel={isLightboxProfilePhoto}
          onDoubleTap={
            !isSelf && isLightboxProfilePhoto
              ? () => {
                  if (!photoLiked) void togglePhotoLike()
                }
              : undefined
          }
          onClose={() => {
            setLightboxUrl(null)
            setLightboxItem(null)
            setPhotoViewersOpen(false)
            setViewersPhotoUrl(null)
          }}
          footer={
            isLightboxProfilePhoto ? (
              isSelf ? (
                <div className="flex w-full items-center justify-between gap-3">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left active:opacity-80"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setViewersPhotoUrl(lightboxItem?.attachmentUrl ?? null)
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
                      if (lightboxItem) {
                        setDeleteTarget(lightboxItem)
                        setLightboxUrl(null)
                        setLightboxItem(null)
                      }
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
                      void togglePhotoLike()
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

        {isSelf && (
          <ProfilePhotoViewersPanel
            userId={userId}
            open={photoViewersOpen}
            photoUrl={viewersPhotoUrl}
            onClose={() => {
              setPhotoViewersOpen(false)
              setViewersPhotoUrl(null)
            }}
          />
        )}

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent className="max-w-sm gap-0 overflow-hidden p-0 sm:max-w-md">
            {deleteTarget?.attachmentUrl && (
              <div className="relative aspect-square w-full bg-muted">
                <img
                  src={resolveMediaUrl(deleteTarget.attachmentUrl)}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
              </div>
            )}
            <AlertDialogHeader className="space-y-2 px-5 pt-4 text-left">
              <AlertDialogTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-destructive" />
                {deleteTarget?.source === 'avatar'
                  ? t('profile.removePhotoTitle')
                  : t('profile.galleryDeleteConfirmTitle')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget?.source === 'avatar'
                  ? t('profile.removeAvatarFromGalleryDesc')
                  : t('profile.galleryDeleteConfirmDesc')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col gap-2 px-5 pb-5 pt-4 sm:flex-col">
              <Button
                type="button"
                onClick={() => void handleDeleteGalleryItem()}
                disabled={galleryActionLoading}
                className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {galleryActionLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                {deleteTarget?.source === 'avatar'
                  ? t('profile.removePhotoAction')
                  : t('profile.galleryDelete')}
              </Button>
              <AlertDialogCancel className="mt-0 w-full" disabled={galleryActionLoading}>
                {t('misc.cancel')}
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={!!captionTarget} onOpenChange={(open) => !open && setCaptionTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('profile.galleryEditCaption')}</DialogTitle>
            </DialogHeader>
            <Textarea
              value={captionDraft}
              onChange={(e) => setCaptionDraft(e.target.value)}
              placeholder={t('profile.galleryCaptionPlaceholder')}
              maxLength={500}
              rows={3}
              autoFocus
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setCaptionTarget(null)}>
                {t('misc.cancel')}
              </Button>
              <Button onClick={() => void handleSaveCaption()} disabled={galleryActionLoading}>
                {t('misc.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  if (activeTab === 'files') {
    const fileItems = items as MediaItem[]
    return (
      <div className="space-y-1">
        {fileItems.map((item) => (
          <a
            key={item.id}
            href={item.attachmentUrl || '#'}
            download={item.attachmentName || 'file'}
            className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-muted"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#3390ec]/15 text-[#3390ec]">
              <File className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {item.attachmentName || t('profile.tabFiles')}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.attachmentSize ? formatBytes(item.attachmentSize) : ''}
                {item.attachmentSize ? ' · ' : ''}
                {formatMessageTime(item.createdAt, lang)}
              </p>
            </div>
            <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
          </a>
        ))}
        {nextCursor && (
          <LoadMoreButton loading={loadingMore} onClick={loadMore} label={t('profile.loadMore')} />
        )}
      </div>
    )
  }

  if (activeTab === 'links') {
    const linkItems = items as LinkItem[]
    return (
      <div className="space-y-1">
        {linkItems.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-1 rounded-xl transition hover:bg-muted"
          >
            <button
              type="button"
              onClick={() => onOpenBrowser(item.url)}
              className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2.5 text-left"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-500">
                <Link2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="truncate text-xs text-muted-foreground">{item.url}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatMessageTime(item.createdAt, lang)}
                </p>
              </div>
              <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
            <button
              type="button"
              onClick={() =>
                openShareToChat(buildLinkSharePayload(item.url, { title: item.title }))
              }
              className="mr-2 rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-[#3390ec]"
              title={t('share.title')}
            >
              <Share2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {nextCursor && (
          <LoadMoreButton loading={loadingMore} onClick={loadMore} label={t('profile.loadMore')} />
        )}
      </div>
    )
  }

  if (activeTab === 'voice') {
    const voiceItems = items as MediaItem[]
    return (
      <div className="space-y-2">
        {voiceItems.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-border bg-muted/30 px-3 py-2"
          >
            {item.attachmentUrl && (
              <VoicePlayer
                url={item.attachmentUrl}
                durationSec={item.durationSec}
                mine={false}
              />
            )}
            <p className="mt-1 text-[10px] text-muted-foreground">
              {formatMessageTime(item.createdAt, lang)}
            </p>
          </div>
        ))}
        {nextCursor && (
          <LoadMoreButton loading={loadingMore} onClick={loadMore} label={t('profile.loadMore')} />
        )}
      </div>
    )
  }

  return null
}

function GalleryUploadBar({
  uploading,
  onClick,
  label,
}: {
  uploading: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={uploading}
      className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#3390ec]/40 bg-[#3390ec]/5 py-2.5 text-sm font-medium text-[#3390ec] transition hover:bg-[#3390ec]/10 disabled:opacity-50 dark:text-[#8fc8ff]"
    >
      {uploading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Plus className="h-4 w-4" />
      )}
      {label}
    </button>
  )
}

function LoadMoreButton({
  loading,
  onClick,
  label,
}: {
  loading: boolean
  onClick: () => void
  label: string
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="mt-3 w-full text-[#3390ec]"
      onClick={onClick}
      disabled={loading}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : label}
    </Button>
  )
}
