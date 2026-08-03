'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Heart,
  ImagePlus,
  Loader2,
  Newspaper,
  Pencil,
  Send,
  Trash2,
  X,
  Check,
} from 'lucide-react'
import { Avatar } from './avatar'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/hooks/use-i18n'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { uploadFileWithRetry } from '@/lib/upload-client'
import { VoicePlayer } from './voice-player'
import { resolveMediaUrl } from '@/lib/media-url'
import { ChatMusicPlayer } from './chat-music-player'
import { buildChatMusicMetadata } from '@/lib/music-message'
import { WallPostComments } from './wall-post-comments'

export interface FeedPost {
  id: string
  profileId?: string
  type: 'text' | 'image' | 'voice' | 'drawing' | 'music' | string
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
  author: {
    id: string
    name: string
    username: string
    avatarColor: string
    avatarUrl?: string | null
  }
  mine: boolean
  onMyWall?: boolean
  canModerate?: boolean
}

interface FriendsFeedProps {
  onBack?: () => void
}

export function FriendsFeed({ onBack }: FriendsFeedProps) {
  const { t } = useI18n()
  const { currentUser, setProfileUserId } = useAppStore()
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const load = useCallback(
    async (opts?: { cursor?: string | null; append?: boolean }) => {
      if (opts?.append) setLoadingMore(true)
      else setLoading(true)
      try {
        const qs = new URLSearchParams({ take: '20' })
        if (opts?.cursor) qs.set('cursor', opts.cursor)
        const res = await fetch(`/api/feed?${qs}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || t('misc.error'))
        const next = (data.posts || []) as FeedPost[]
        setPosts((prev) => (opts?.append ? [...prev, ...next] : next))
        setCursor(typeof data.nextCursor === 'string' ? data.nextCursor : null)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('misc.error'))
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [t],
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !cursor) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && cursor && !loadingMore) {
          void load({ cursor, append: true })
        }
      },
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [cursor, loadingMore, load])

  const clearComposer = () => {
    setText('')
    setImageFile(null)
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImagePreview(null)
  }

  const publish = async () => {
    if (!currentUser) return
    const hasText = text.trim().length > 0
    if (!hasText && !imageFile) return
    setSending(true)
    try {
      let payload: Record<string, unknown>
      if (imageFile) {
        const up = await uploadFileWithRetry(imageFile, t)
        payload = {
          type: 'image',
          content: hasText ? text.trim() : null,
          attachmentUrl: up.url,
          attachmentName: imageFile.name,
          attachmentMime: up.type,
        }
      } else {
        payload = { type: 'text', content: text.trim() }
      }
      const res = await fetch('/api/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      if (data.post) setPosts((p) => [data.post as FeedPost, ...p])
      clearComposer()
      toast.success(t('feed.published'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    } finally {
      setSending(false)
    }
  }

  const toggleLike = async (postId: string) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              likedByMe: !p.likedByMe,
              likes: Math.max(0, p.likes + (p.likedByMe ? -1 : 1)),
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

  const remove = async (postId: string) => {
    if (!confirm(t('feed.confirmDelete'))) return
    try {
      const res = await fetch(`/api/feed/${encodeURIComponent(postId)}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      setPosts((p) => p.filter((x) => x.id !== postId))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    }
  }

  const saveEdit = async (postId: string, content: string) => {
    const res = await fetch(`/api/feed/${encodeURIComponent(postId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || t('misc.error'))
    if (data.post) {
      setPosts((prev) => prev.map((p) => (p.id === postId ? (data.post as FeedPost) : p)))
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="xl:hidden text-sm font-medium text-primary"
          >
            {t('misc.back')}
          </button>
        )}
        <Newspaper className="h-5 w-5 text-[#3390ec]" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{t('feed.title')}</h1>
          <p className="truncate text-[11px] text-muted-foreground">{t('feed.subtitle')}</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-xl space-y-3 px-3 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-4 xl:pb-4">
          {currentUser && (
            <div className="space-y-2 rounded-2xl border border-border bg-card/70 p-3 shadow-sm">
              <div className="flex items-start gap-2">
                <Avatar
                  name={currentUser.name}
                  color={currentUser.avatarColor}
                  imageUrl={currentUser.avatarUrl}
                  size="sm"
                />
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t('feed.placeholder')}
                  className="min-h-[64px] flex-1 resize-none border-0 bg-transparent p-0 focus-visible:ring-0"
                  rows={2}
                />
              </div>
              {imagePreview && (
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt=""
                    className="max-h-56 w-full rounded-xl object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setImageFile(null)
                      if (imagePreview) URL.revokeObjectURL(imagePreview)
                      setImagePreview(null)
                    }}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/85 shadow"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <ImagePlus className="h-4 w-4" />
                  {t('feed.photo')}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    e.target.value = ''
                    setImageFile(file)
                    if (imagePreview) URL.revokeObjectURL(imagePreview)
                    setImagePreview(URL.createObjectURL(file))
                  }}
                />
                <button
                  type="button"
                  disabled={sending || (!text.trim() && !imageFile)}
                  onClick={() => void publish()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#3390ec] px-3.5 text-sm font-medium text-white disabled:opacity-40"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {t('feed.publish')}
                </button>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && posts.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center">
              <Newspaper className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">{t('feed.empty')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('feed.emptyHint')}</p>
            </div>
          )}

          {posts.map((post) => (
            <FeedPostCard
              key={post.id}
              post={post}
              onOpenAuthor={() => setProfileUserId(post.author.id)}
              onLike={() => void toggleLike(post.id)}
              onDelete={() => void remove(post.id)}
              onSaveEdit={(content) => saveEdit(post.id, content)}
              onMetaChange={(meta) =>
                setPosts((prev) =>
                  prev.map((p) =>
                    p.id === post.id
                      ? {
                          ...p,
                          comments: meta.comments,
                          commentsClosed: meta.commentsClosed,
                        }
                      : p,
                  ),
                )
              }
              t={t}
            />
          ))}

          <div ref={sentinelRef} className="h-4" />
          {loadingMore && (
            <div className="flex justify-center py-3">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FeedPostCard({
  post,
  onOpenAuthor,
  onLike,
  onDelete,
  onSaveEdit,
  onMetaChange,
  t,
}: {
  post: FeedPost
  onOpenAuthor: () => void
  onLike: () => void
  onDelete: () => void
  onSaveEdit: (content: string) => Promise<void>
  onMetaChange: (meta: { comments: number; commentsClosed: boolean }) => void
  t: (key: string) => string
}) {
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
    <article className="rounded-2xl border border-border bg-card/70 p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <button type="button" onClick={onOpenAuthor} className="shrink-0">
          <Avatar
            name={post.author.name}
            color={post.author.avatarColor}
            imageUrl={post.author.avatarUrl}
            size="sm"
          />
        </button>
        <button type="button" onClick={onOpenAuthor} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium">{post.author.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {new Date(post.createdAt).toLocaleString()}
            {post.editedAt ? ` · ${t('feed.edited')}` : ''}
          </p>
        </button>
        {post.mine && !editing && (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              title={t('feed.edit')}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title={t('feed.delete')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
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
              {t('feed.save')}
            </button>
          </div>
        </div>
      ) : (
        post.content && (
          <p className="mb-2 whitespace-pre-wrap break-words text-sm">{post.content}</p>
        )
      )}

      {(post.type === 'image' || post.type === 'drawing') && post.attachmentUrl && (
        <img
          src={post.attachmentUrl}
          alt={post.attachmentName || ''}
          className={cn(
            'mb-2 max-h-96 w-full rounded-xl object-contain',
            post.type === 'drawing' && 'bg-white',
          )}
        />
      )}
      {post.type === 'voice' && post.attachmentUrl && (
        <div className="mb-2">
          <VoicePlayer
            url={resolveMediaUrl(post.attachmentUrl) || post.attachmentUrl}
            durationSec={post.attachmentDuration ?? 0}
            mimeType={post.attachmentMime}
            mine={false}
            circle={false}
          />
        </div>
      )}
      {post.type === 'music' && post.attachmentUrl && (
        <div className="mb-2">
          {(() => {
            const yandexId =
              post.attachmentMime === 'application/x-yandex-music' &&
              post.attachmentUrl.startsWith('yandex:')
                ? post.attachmentUrl.slice('yandex:'.length)
                : post.attachmentUrl.startsWith('/api/yandex-music/stream/')
                  ? post.attachmentUrl.split('/').pop() || null
                  : null
            if (!yandexId) {
              return (
                <p className="text-xs text-muted-foreground">{post.attachmentName || '🎵'}</p>
              )
            }
            const parts = (post.attachmentName || '').split(' — ')
            const artist = parts.length > 1 ? parts[0] : '—'
            const title =
              parts.length > 1 ? parts.slice(1).join(' — ') : post.attachmentName || 'Track'
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
          })()}
        </div>
      )}

      <div className="mt-1 flex flex-col gap-1 border-t border-border/60 pt-2">
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
            {post.likes > 0 ? post.likes : t('feed.like')}
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
    </article>
  )
}
