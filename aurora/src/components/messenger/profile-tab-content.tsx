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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { VoicePlayer } from './voice-player'
import { MediaLightbox } from './media-lightbox'
import { isImageUrl, isVideoUrl, resolveMediaUrl } from '@/lib/media-url'
import { useI18n } from '@/hooks/use-i18n'
import { formatMessageTime } from '@/lib/format'
import { formatBytes } from '@/lib/format-storage'
import { GALLERY_INPUT_ACCEPT, isVideoFile } from '@/lib/media-type'
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
  AlertDialogAction,
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
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null)
  const [captionTarget, setCaptionTarget] = useState<MediaItem | null>(null)
  const [captionDraft, setCaptionDraft] = useState('')
  const [galleryActionLoading, setGalleryActionLoading] = useState(false)
  const loadedTabs = useRef(new Set<string>())
  const uploadRef = useRef<HTMLInputElement>(null)

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
      const form = new FormData()
      form.append('file', file)
      const uploadRes = await fetch('/api/uploads', { method: 'POST', body: form })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(uploadData.error || t('profile.galleryUploadError'))

      const isVideo = uploadData.isVideo || isVideoFile({ type: file.type, name: file.name })
      const galleryRes = await fetch(`/api/users/${encodeURIComponent(userId)}/gallery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaUrl: uploadData.url,
          type: isVideo ? 'video' : 'photo',
        }),
      })
      const galleryData = await galleryRes.json()
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
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
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
                    }
                  }}
                  className="flex h-full w-full items-center justify-center"
                >
                {item.isPinned && (
                  <span className="absolute left-1 top-1 z-10 rounded bg-black/50 p-0.5">
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
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-500/20 to-cyan-500/20">
                    <Clapperboard className="h-8 w-8 text-violet-500" />
                  </div>
                )}
                {isVideo && url && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
                    <Play className="h-8 w-8 text-white drop-shadow" />
                  </span>
                )}
                </button>
                {/* pointer-coarse (touch) has no hover, so hover-revealed
                    controls would be unreachable on phones — keep them
                    always visible there and hover-only on desktop. */}
                {url && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      openShareToChat(buildMediaSharePayload(item))
                    }}
                    className={`absolute top-1 z-10 rounded-full bg-black/50 p-1.5 text-white transition hover:bg-black/70 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 ${
                      isSelf && item.source === 'gallery' ? 'right-8' : 'right-1'
                    }`}
                    title={t('share.title')}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                  </button>
                )}
                {isSelf && item.source === 'gallery' && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-1 top-1 z-10 rounded-full bg-black/50 p-1.5 text-white transition hover:bg-black/70 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
                        title={t('profile.more')}
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
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
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )
          })}
        </div>
        {nextCursor && (
          <LoadMoreButton loading={loadingMore} onClick={loadMore} label={t('profile.loadMore')} />
        )}
        <MediaLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-destructive" />
                {t('profile.galleryDeleteConfirmTitle')}
              </AlertDialogTitle>
              <AlertDialogDescription>{t('profile.galleryDeleteConfirmDesc')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('misc.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  void handleDeleteGalleryItem()
                }}
                disabled={galleryActionLoading}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t('profile.galleryDelete')}
              </AlertDialogAction>
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
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-500">
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
              className="mr-2 rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-violet-500"
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
      className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-violet-500/40 bg-violet-500/5 py-2.5 text-sm font-medium text-violet-600 transition hover:bg-violet-500/10 disabled:opacity-50 dark:text-cyan-300"
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
      className="mt-3 w-full text-violet-500"
      onClick={onClick}
      disabled={loading}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : label}
    </Button>
  )
}
