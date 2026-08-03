'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ImagePlus,
  Pencil,
  Mic,
  Send,
  Trash2,
  X,
  Loader2,
  Play,
  Pause,
  Eraser,
  Download,
  Music,
  Heart,
  Check,
} from 'lucide-react'
import { Avatar } from './avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/hooks/use-i18n'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { uploadFileWithRetry } from '@/lib/upload-client'
import { VoicePlayer } from './voice-player'
import { resolveMediaUrl } from '@/lib/media-url'
import { MusicPickerDialog } from './music-picker-dialog'
import { ChatMusicPlayer } from './chat-music-player'
import { buildChatMusicMetadata } from '@/lib/music-message'
import { WallPostComments } from './wall-post-comments'

interface WallAuthor {
  id: string
  name: string
  username: string
  avatarColor: string
  avatarUrl?: string | null
}

interface WallPost {
  id: string
  type: 'text' | 'image' | 'voice' | 'drawing' | 'music'
  content: string | null
  attachmentUrl: string | null
  attachmentName: string | null
  attachmentMime: string | null
  attachmentDuration: number | null
  attachmentCoverUrl: string | null
  likes: number
  likedByMe: boolean
  comments: number
  commentsClosed: boolean
  editedAt: string | null
  createdAt: string
  author: WallAuthor
  mine: boolean
  onMyWall: boolean
  canModerate?: boolean
}

interface ProfileWallProps {
  profileId: string
  isSelf: boolean
  blocked?: boolean
}

export function ProfileWall({ profileId, isSelf, blocked }: ProfileWallProps) {
  const { t } = useI18n()
  const { currentUser, setProfileUserId } = useAppStore()
  const [posts, setPosts] = useState<WallPost[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [showDraw, setShowDraw] = useState(false)
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null)
  const [voiceSecs, setVoiceSecs] = useState(0)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const musicInputRef = useRef<HTMLInputElement>(null)
  const [musicFile, setMusicFile] = useState<File | null>(null)
  const [musicPreview, setMusicPreview] = useState<string | null>(null)
  const [showMusicPicker, setShowMusicPicker] = useState(false)
  const [ymTrack, setYmTrack] = useState<{
    url: string
    coverUrl: string | null
    name: string
    mime: string
    duration: number
    title: string
    artist: string
    trackId: string
  } | null>(null)

  const canPost = !blocked && !!currentUser

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(profileId)}/wall?take=50`)
      const data = await res.json()
      if (res.ok) setPosts(data.posts || [])
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [profileId])

  useEffect(() => {
    load()
  }, [load])

  const clearComposer = () => {
    setText('')
    setImageFile(null)
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImagePreview(null)
    if (musicPreview) URL.revokeObjectURL(musicPreview)
    setMusicPreview(null)
    setMusicFile(null)
    setYmTrack(null)
    setVoiceBlob(null)
    setVoiceSecs(0)
  }

  const uploadAttachment = async (file: Blob, name: string, mime: string) => {
    const typed =
      file instanceof File
        ? file
        : new File([file], name, { type: mime || file.type || 'application/octet-stream' })
    const data = await uploadFileWithRetry(typed, t)
    return data as {
      url: string
      name?: string
      type: string
      isImage: boolean
      isVoice: boolean
    }
  }

  const send = async () => {
    if (!canPost) return
    const hasText = text.trim().length > 0
    if (!hasText && !imageFile && !voiceBlob && !musicFile && !ymTrack) return
    setSending(true)
    try {
      if (ymTrack) {
        await createPost({
          type: 'music',
          content: hasText ? text.trim() : null,
          attachmentUrl: ymTrack.url,
          attachmentName: ymTrack.name,
          attachmentMime: ymTrack.mime,
          attachmentDuration: ymTrack.duration || null,
          attachmentCoverUrl: ymTrack.coverUrl,
        })
      } else if (imageFile) {
        const up = await uploadAttachment(imageFile, imageFile.name, imageFile.type)
        await createPost({
          type: 'image',
          content: hasText ? text.trim() : null,
          attachmentUrl: up.url,
          attachmentName: imageFile.name,
          attachmentMime: up.type,
        })
      } else if (voiceBlob) {
        const name = `voice-${Date.now()}.webm`
        const up = await uploadAttachment(voiceBlob, name, voiceBlob.type || 'audio/webm')
        await createPost({
          type: 'voice',
          content: hasText ? text.trim() : null,
          attachmentUrl: up.url,
          attachmentName: up.name || name,
          attachmentMime: up.type || 'audio/mp4',
          attachmentDuration: voiceSecs,
        })
      } else if (musicFile) {
        const up = await uploadAttachment(musicFile, musicFile.name, musicFile.type)
        await createPost({
          type: 'music',
          content: hasText ? text.trim() : null,
          attachmentUrl: up.url,
          attachmentName: musicFile.name,
          attachmentMime: up.type,
        })
      } else {
        await createPost({ type: 'text', content: text.trim() })
      }
      clearComposer()
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    } finally {
      setSending(false)
    }
  }

  const createPost = async (payload: Record<string, unknown>) => {
    const res = await fetch(`/api/users/${encodeURIComponent(profileId)}/wall`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || t('misc.error'))
  }

  const sendDrawing = async (blob: Blob) => {
    setShowDraw(false)
    if (!canPost) return
    setSending(true)
    try {
      const name = `drawing-${Date.now()}.png`
      const up = await uploadAttachment(blob, name, 'image/png')
      await createPost({
        type: 'drawing',
        content: text.trim() || null,
        attachmentUrl: up.url,
        attachmentName: name,
        attachmentMime: 'image/png',
      })
      clearComposer()
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    } finally {
      setSending(false)
    }
  }

  const remove = async (postId: string) => {
    if (!confirm(t('wall.confirmDelete'))) return
    try {
      const res = await fetch(
        `/api/users/${encodeURIComponent(profileId)}/wall/${postId}`,
        { method: 'DELETE' },
      )
      if (!res.ok) throw new Error((await res.json()).error || t('misc.error'))
      setPosts((p) => p.filter((x) => x.id !== postId))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    }
  }

  const toggleLike = async (postId: string) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              likedByMe: !p.likedByMe,
              likes: Math.max(0, (p.likes || 0) + (p.likedByMe ? -1 : 1)),
            }
          : p,
      ),
    )
    try {
      const res = await fetch(`/api/feed/${encodeURIComponent(postId)}/like`, {
        method: 'POST',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, likedByMe: !!data.likedByMe, likes: Number(data.likes) || 0 }
            : p,
        ),
      )
    } catch (err) {
      void load()
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    }
  }

  const saveEdit = async (postId: string, content: string) => {
    const res = await fetch(
      `/api/users/${encodeURIComponent(profileId)}/wall/${encodeURIComponent(postId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || t('misc.error'))
    if (data.post) {
      setPosts((prev) => prev.map((p) => (p.id === postId ? (data.post as WallPost) : p)))
    }
  }

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImageFile(file)
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImagePreview(URL.createObjectURL(file))
    setVoiceBlob(null)
    setMusicFile(null)
    if (musicPreview) URL.revokeObjectURL(musicPreview)
    setMusicPreview(null)
    setYmTrack(null)
  }

  const onPickMusic = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setMusicFile(file)
    if (musicPreview) URL.revokeObjectURL(musicPreview)
    setMusicPreview(URL.createObjectURL(file))
    setImageFile(null)
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImagePreview(null)
    setVoiceBlob(null)
    setYmTrack(null)
  }

  const hasAttachment = !!imageFile || !!voiceBlob || !!musicFile || !!ymTrack

  return (
    <div className="safe-x px-4 py-4">
      <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('wall.title')}
        {posts.length > 0 && <span>· {posts.length}</span>}
      </p>

      {canPost && (
        <div className="mb-4 space-y-2 rounded-xl border border-border bg-muted/30 p-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('wall.placeholder')}
            className="min-h-[60px] resize-none border-0 bg-transparent p-0 focus-visible:ring-0"
            rows={2}
          />

          {imagePreview && (
            <div className="relative">
              <img
                src={imagePreview}
                alt="preview"
                className="max-h-48 rounded-lg object-contain"
              />
              <button
                type="button"
                onClick={() => {
                  if (imagePreview) URL.revokeObjectURL(imagePreview)
                  setImagePreview(null)
                  setImageFile(null)
                }}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 text-foreground shadow hover:bg-background"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {voiceBlob && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <Mic className="h-4 w-4 text-violet-500" />
              <span className="flex-1">
                {t('wall.voiceReady')} · {Math.round(voiceSecs)}с
              </span>
              <button
                type="button"
                onClick={() => {
                  setVoiceBlob(null)
                  setVoiceSecs(0)
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {musicFile && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <Music className="h-4 w-4 text-violet-500" />
              <span className="min-w-0 flex-1 truncate">{musicFile.name}</span>
              <span className="text-[11px] text-muted-foreground">
                {Math.round(musicFile.size / 1024 / 1024 * 10) / 10} МБ
              </span>
              <button
                type="button"
                onClick={() => {
                  if (musicPreview) URL.revokeObjectURL(musicPreview)
                  setMusicPreview(null)
                  setMusicFile(null)
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {ymTrack && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
              {ymTrack.coverUrl ? (
                <img
                  src={ymTrack.coverUrl}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded object-cover"
                />
              ) : (
                <Music className="h-4 w-4 shrink-0 text-violet-500" />
              )}
              <span className="min-w-0 flex-1 truncate">
                <span className="block truncate text-xs text-muted-foreground">Яндекс Музыка</span>
                {ymTrack.artist} — {ymTrack.title}
              </span>
              <button
                type="button"
                onClick={() => setYmTrack(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <ComposerBtn
                icon={<ImagePlus className="h-4 w-4" />}
                label={t('wall.image')}
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || !!voiceBlob || !!musicFile || !!ymTrack}
              />
              <ComposerBtn
                icon={<Pencil className="h-4 w-4" />}
                label={t('wall.draw')}
                onClick={() => setShowDraw(true)}
                disabled={sending || !!voiceBlob || !!imageFile || !!musicFile || !!ymTrack}
              />
              <ComposerBtn
                icon={<Music className="h-4 w-4" />}
                label={t('wall.music')}
                onClick={() => setShowMusicPicker(true)}
                disabled={sending || !!voiceBlob || !!imageFile || !!ymTrack}
              />
              <VoiceRecorder
                disabled={sending || !!imageFile || !!musicFile || !!ymTrack}
                onRecorded={(blob, secs) => {
                  setVoiceBlob(blob)
                  setVoiceSecs(secs)
                }}
              />
            </div>
            <Button
              size="sm"
              className="gap-1"
              onClick={send}
              disabled={sending || (!text.trim() && !hasAttachment)}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {t('wall.post')}
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={onPickImage}
            className="hidden"
          />
          <input
            ref={musicInputRef}
            type="file"
            accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/m4a,audio/x-m4a,audio/aac,audio/flac,audio/x-flac,audio/mp4,audio/aac"
            onChange={onPickMusic}
            className="hidden"
          />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : posts.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t('wall.empty')}</p>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <WallPostCard
              key={p.id}
              post={p}
              canDelete={p.mine || p.onMyWall || isSelf}
              onDelete={() => remove(p.id)}
              onLike={() => void toggleLike(p.id)}
              onSaveEdit={(content) => saveEdit(p.id, content)}
              onMetaChange={(meta) =>
                setPosts((prev) =>
                  prev.map((x) =>
                    x.id === p.id
                      ? {
                          ...x,
                          comments: meta.comments,
                          commentsClosed: meta.commentsClosed,
                        }
                      : x,
                  ),
                )
              }
              onOpenAuthor={() => setProfileUserId(p.author.id)}
            />
          ))}
        </div>
      )}

      <DrawingDialog
        open={showDraw}
        onOpenChange={setShowDraw}
        onSave={sendDrawing}
      />

      <MusicPickerDialog
        open={showMusicPicker}
        onOpenChange={setShowMusicPicker}
        onPickFile={() => {
          setShowMusicPicker(false)
          musicInputRef.current?.click()
        }}
        onOpenYandexSettings={() => {
          window.dispatchEvent(
            new CustomEvent('aurora:open-settings', { detail: { page: 'yandex' } }),
          )
        }}
        onPickYandex={async (track) => {
          setShowMusicPicker(false)
          // Stream-only — no MP3 download to disk.
          setImageFile(null)
          if (imagePreview) URL.revokeObjectURL(imagePreview)
          setImagePreview(null)
          setMusicFile(null)
          if (musicPreview) URL.revokeObjectURL(musicPreview)
          setMusicPreview(null)
          setVoiceBlob(null)
          setVoiceSecs(0)
          setYmTrack({
            url: `yandex:${track.id}`,
            coverUrl: track.coverUrl,
            name: `${track.artist} — ${track.title}`,
            mime: 'application/x-yandex-music',
            duration: track.durationSec || 0,
            title: track.title,
            artist: track.artist,
            trackId: track.id,
          })
        }}
      />
    </div>
  )
}

function ComposerBtn({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"
    >
      {icon}
    </button>
  )
}

function WallPostCard({
  post,
  canDelete,
  onDelete,
  onLike,
  onSaveEdit,
  onMetaChange,
  onOpenAuthor,
}: {
  post: WallPost
  canDelete: boolean
  onDelete: () => void
  onLike: () => void
  onSaveEdit: (content: string) => Promise<void>
  onMetaChange: (meta: { comments: number; commentsClosed: boolean }) => void
  onOpenAuthor: () => void
}) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(post.content || '')
  const [saving, setSaving] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(post.content || '')
  }, [post.content, editing])

  const save = async () => {
    setSaving(true)
    try {
      await onSaveEdit(draft)
      setEditing(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <button type="button" onClick={onOpenAuthor} className="shrink-0">
          <Avatar
            name={post.author.name}
            color={post.author.avatarColor}
            imageUrl={post.author.avatarUrl}
            size="sm"
          />
        </button>
        <button
          type="button"
          onClick={onOpenAuthor}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-sm font-medium">{post.author.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {new Date(post.createdAt).toLocaleString()}
            {post.editedAt ? ` · ${t('wall.edited')}` : ''}
          </p>
        </button>
        {post.mine && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
            title={t('wall.edit')}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {canDelete && !editing && (
          <button
            type="button"
            onClick={onDelete}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
            title={t('wall.delete')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {editing ? (
        <div className="mb-2 space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[72px] resize-none"
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setDraft(post.content || '')
              }}
              className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              {t('misc.cancel')}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="inline-flex items-center gap-1 rounded-lg bg-[#3390ec] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {t('wall.save')}
            </button>
          </div>
        </div>
      ) : (
        post.content && (
          <p className="mb-2 whitespace-pre-wrap break-words text-sm">{post.content}</p>
        )
      )}

      {post.type === 'image' && post.attachmentUrl && (
        <img
          src={post.attachmentUrl}
          alt={post.attachmentName || 'image'}
          className="max-h-80 w-full rounded-lg object-contain"
        />
      )}
      {post.type === 'drawing' && post.attachmentUrl && (
        <img
          src={post.attachmentUrl}
          alt="drawing"
          className="max-h-80 w-full rounded-lg object-contain bg-white"
        />
      )}
      {post.type === 'voice' && post.attachmentUrl && (
        <VoicePlayer
          url={resolveMediaUrl(post.attachmentUrl) || post.attachmentUrl}
          durationSec={post.attachmentDuration ?? 0}
          mimeType={post.attachmentMime}
          mine={false}
          circle={false}
        />
      )}
      {post.type === 'music' && post.attachmentUrl && (
        (() => {
          const yandexId =
            post.attachmentMime === 'application/x-yandex-music' &&
            post.attachmentUrl.startsWith('yandex:')
              ? post.attachmentUrl.slice('yandex:'.length)
              : post.attachmentUrl.startsWith('/api/yandex-music/stream/')
                ? post.attachmentUrl.split('/').pop() || null
                : null
          if (yandexId) {
            const parts = (post.attachmentName || '').split(' — ')
            const artist = parts.length > 1 ? parts[0] : '—'
            const title = parts.length > 1 ? parts.slice(1).join(' — ') : post.attachmentName || 'Track'
            return (
              <ChatMusicPlayer
                meta={buildChatMusicMetadata({
                  id: yandexId,
                  title,
                  artist,
                  coverUrl: post.attachmentCoverUrl,
                  durationSec: post.attachmentDuration || 0,
                })}
              />
            )
          }
          return (
            <MusicPlayer
              url={post.attachmentUrl}
              name={post.attachmentName || 'track'}
              coverUrl={post.attachmentCoverUrl}
            />
          )
        })()
      )}

      <div className="mt-2 flex flex-col gap-1 border-t border-border/60 pt-2">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={onLike}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition',
              post.likedByMe
                ? 'bg-rose-500/10 text-rose-500'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Heart className={cn('h-4 w-4', post.likedByMe && 'fill-current')} />
            {(post.likes || 0) > 0 ? post.likes : t('wall.like')}
          </button>
        </div>
        <WallPostComments
          postId={post.id}
          commentsCount={post.comments || 0}
          commentsClosed={!!post.commentsClosed}
          canModerate={!!(post.canModerate ?? (post.mine || post.onMyWall))}
          open={commentsOpen}
          onOpenChange={setCommentsOpen}
          onMetaChange={onMetaChange}
        />
      </div>
    </div>
  )
}

function formatTime(s: number) {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function MusicPlayer({ url, name, coverUrl }: { url: string; name: string; coverUrl?: string | null }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onTime = () => setCurrent(a.currentTime)
    const onMeta = () => setDuration(a.duration || 0)
    const onEnd = () => {
      setPlaying(false)
      setCurrent(0)
    }
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('loadedmetadata', onMeta)
    a.addEventListener('durationchange', onMeta)
    a.addEventListener('ended', onEnd)
    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('loadedmetadata', onMeta)
      a.removeEventListener('durationchange', onMeta)
      a.removeEventListener('ended', onEnd)
    }
  }, [])

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (playing) {
      a.pause()
      setPlaying(false)
    } else {
      void a.play()
      setPlaying(true)
    }
  }

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current
    if (!a || !duration) return
    const v = Number(e.target.value)
    a.currentTime = (v / 100) * duration
    setCurrent(a.currentTime)
  }

  const trackName = name.replace(/\.[^.]+$/, '')

  return (
    <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-violet-500/15 to-cyan-500/10 px-3 py-2.5">
      <button
        type="button"
        onClick={toggle}
        className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full shadow transition"
        aria-label={playing ? 'pause' : 'play'}
      >
        {coverUrl ? (
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-500 to-cyan-400 text-white">
            <Music className="h-5 w-5" />
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white">
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <p className="mb-1 truncate text-sm font-medium">{trackName}</p>
        <div className="flex items-center gap-2">
          <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
            {formatTime(current)}
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={duration ? (current / duration) * 100 : 0}
            onChange={seek}
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-violet-500"
          />
          <span className="w-9 shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {formatTime(duration)}
          </span>
        </div>
      </div>
      <audio ref={audioRef} src={url} preload="metadata" />
    </div>
  )
}

function VoiceRecorder({
  disabled,
  onRecorded,
}: {
  disabled?: boolean
  onRecorded: (blob: Blob, secs: number) => void
}) {
  const { t } = useI18n()
  const [recording, setRecording] = useState(false)
  const [secs, setSecs] = useState(0)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    mediaRef.current?.stop()
    mediaRef.current = null
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
    setRecording(false)
  }, [])

  useEffect(() => () => stop(), [stop])

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        onRecorded(blob, secs)
        setSecs(0)
      }
      mr.start()
      mediaRef.current = mr
      setRecording(true)
      setSecs(0)
      timerRef.current = setInterval(() => setSecs((s) => s + 1), 1000)
    } catch {
      toast.error(t('wall.micDenied'))
    }
  }

  if (recording) {
    return (
      <button
        type="button"
        onClick={stop}
        className="flex items-center gap-1.5 rounded-lg bg-red-500/15 px-2.5 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-500/25"
      >
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
        {secs}с · {t('wall.stop')}
      </button>
    )
  }

  return (
    <ComposerBtn
      icon={<Mic className="h-4 w-4" />}
      label={t('wall.voice')}
      onClick={start}
      disabled={disabled}
    />
  )
}

function DrawingDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSave: (blob: Blob) => void
}) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastRef = useRef<{ x: number; y: number } | null>(null)
  const [color, setColor] = useState('#7c3aed')
  const [size, setSize] = useState(4)

  const setupCanvas = () => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, c.width, c.height)
  }

  useEffect(() => {
    if (open) {
      requestAnimationFrame(setupCanvas)
    }
  }, [open])

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!
    const rect = c.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * c.width,
      y: ((e.clientY - rect.top) / rect.height) * c.height,
    }
  }

  const startDraw = (e: React.PointerEvent) => {
    drawingRef.current = true
    lastRef.current = pos(e)
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  const moveDraw = (e: React.PointerEvent) => {
    if (!drawingRef.current) return
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx || !lastRef.current) return
    const p = pos(e)
    ctx.strokeStyle = color
    ctx.lineWidth = size
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(lastRef.current.x, lastRef.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastRef.current = p
  }

  const endDraw = () => {
    drawingRef.current = false
    lastRef.current = null
  }

  const clear = () => {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, c.width, c.height)
  }

  const save = async () => {
    const c = canvasRef.current
    if (!c) return
    const blob = await new Promise<Blob | null>((resolve) =>
      c.toBlob((b) => resolve(b), 'image/png'),
    )
    if (!blob) {
      toast.error(t('misc.error'))
      return
    }
    onSave(blob)
  }

  const colors = ['#000000', '#7c3aed', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6']

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            {t('wall.drawTitle')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <canvas
            ref={canvasRef}
            width={900}
            height={560}
            onPointerDown={startDraw}
            onPointerMove={moveDraw}
            onPointerUp={endDraw}
            onPointerLeave={endDraw}
            className="h-auto w-full touch-none rounded-lg border border-border bg-white"
            style={{ aspectRatio: '900 / 560' }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1">
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    'h-6 w-6 rounded-full border-2 transition',
                    color === c ? 'border-foreground scale-110' : 'border-transparent',
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
            <div className="flex items-center gap-1">
              <input
                type="range"
                min={1}
                max={20}
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                className="w-24 accent-violet-500"
              />
            </div>
            <Button variant="outline" size="sm" className="gap-1" onClick={clear}>
              <Eraser className="h-3.5 w-3.5" />
              {t('wall.clear')}
            </Button>
            <Button size="sm" className="ml-auto gap-1" onClick={save}>
              <Download className="h-3.5 w-3.5" />
              {t('wall.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
