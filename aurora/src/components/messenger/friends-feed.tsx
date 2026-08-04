'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Heart,
  ImagePlus,
  Loader2,
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
import { openFeedShareTarget, parseFeedShareRef } from '@/lib/feed-share'
import { formatFeedTime } from '@/lib/format'
import { Clapperboard, Radio, Store, CircleDot, Sparkles, ArrowLeft } from 'lucide-react'

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
  const { t, lang } = useI18n()
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
  const loadingMoreRef = useRef(false)
  const likeInFlightRef = useRef<Set<string>>(new Set())

  const load = useCallback(
    async (opts?: { cursor?: string | null; append?: boolean }) => {
      if (opts?.append) {
        if (loadingMoreRef.current) return
        loadingMoreRef.current = true
        setLoadingMore(true)
      } else {
        setLoading(true)
      }
      try {
        const qs = new URLSearchParams({ take: '20' })
        if (opts?.cursor) qs.set('cursor', opts.cursor)
        const res = await fetch(`/api/feed?${qs}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || t('misc.error'))
        const next = (data.posts || []) as FeedPost[]
        setPosts((prev) => {
          if (!opts?.append) return next
          const seen = new Set(prev.map((p) => p.id))
          const merged = [...prev]
          for (const p of next) {
            if (!seen.has(p.id)) {
              seen.add(p.id)
              merged.push(p)
            }
          }
          return merged
        })
        setCursor(typeof data.nextCursor === 'string' ? data.nextCursor : null)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('misc.error'))
      } finally {
        setLoading(false)
        setLoadingMore(false)
        loadingMoreRef.current = false
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
        if (entries[0]?.isIntersecting && cursor && !loadingMoreRef.current) {
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
    if (likeInFlightRef.current.has(postId)) return
    likeInFlightRef.current.add(postId)
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
    } finally {
      likeInFlightRef.current.delete(postId)
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
    <div className="aurora-feed flex h-full min-h-0 flex-col">
      <header className="aurora-feed-header aurora-feed-safe-top relative z-20 flex shrink-0 items-center gap-3 px-4 pb-3.5 sm:px-5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="xl:hidden relative z-20 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#8fa0b5] transition hover:bg-white/5 hover:text-white"
            aria-label={t('misc.back')}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div className="aurora-feed-orb flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,#3aa0ff,#2dd4bf)] text-white shadow-[0_8px_24px_rgb(58_160_255_/_28%)]">
          <Sparkles className="h-5 w-5" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="aurora-feed-title truncate text-[1.35rem] text-white sm:text-[1.5rem]">
            {t('feed.title')}
          </h1>
          <p className="truncate text-[11px] tracking-wide text-[#8fa0b5]">{t('feed.subtitle')}</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-xl space-y-4 px-3 py-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-5 xl:pb-6">
          {currentUser && (
            <div className="aurora-feed-composer space-y-3 rounded-[1.35rem] p-3.5 sm:p-4">
              <div className="flex items-start gap-3">
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
                  className="min-h-[72px] flex-1 resize-none border-0 bg-transparent p-0 text-[15px] leading-relaxed text-[#e8eef6] placeholder:text-[#6f8196] focus-visible:ring-0"
                  rows={2}
                />
              </div>
              {imagePreview && (
                <div className="relative overflow-hidden rounded-2xl">
                  <img
                    src={imagePreview}
                    alt=""
                    className="max-h-64 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setImageFile(null)
                      if (imagePreview) URL.revokeObjectURL(imagePreview)
                      setImagePreview(null)
                    }}
                    className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-xl bg-black/55 text-white backdrop-blur-sm transition hover:bg-black/70"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-sm text-[#8fa0b5] transition hover:bg-white/5 hover:text-[#e8eef6]"
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
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[linear-gradient(135deg,#3aa0ff,#2b82d9)] px-4 text-sm font-semibold text-white shadow-[0_8px_20px_rgb(58_160_255_/_28%)] transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
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
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#3aa0ff]/30 border-t-[#3aa0ff]" />
              <p className="text-xs tracking-wide text-[#8fa0b5]">{t('feed.loading')}</p>
            </div>
          )}

          {!loading && posts.length === 0 && (
            <div className="aurora-feed-composer rounded-[1.35rem] px-6 py-14 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,rgb(58_160_255_/_22%),rgb(45_212_191_/_14%))] text-[#3aa0ff]">
                <Sparkles className="h-6 w-6" />
              </div>
              <p className="aurora-feed-title text-lg text-white">{t('feed.empty')}</p>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-[#8fa0b5]">
                {t('feed.emptyHint')}
              </p>
            </div>
          )}

          {posts.map((post, index) => (
            <FeedPostCard
              key={post.id}
              post={post}
              index={index}
              lang={lang}
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
            <div className="flex justify-center py-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#3aa0ff]/30 border-t-[#3aa0ff]" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FeedShareCard({
  attachmentUrl,
  attachmentMime,
  attachmentName,
  attachmentCoverUrl,
  content,
  t,
}: {
  attachmentUrl: string | null
  attachmentMime: string | null
  attachmentName: string | null
  attachmentCoverUrl: string | null
  content: string | null
  t: (key: string) => string
}) {
  const ref = parseFeedShareRef(attachmentUrl, attachmentMime)
  if (!ref) {
    return content ? (
      <p className="mb-2 whitespace-pre-wrap break-words text-sm">{content}</p>
    ) : null
  }

  const kindLabel =
    ref.kind === 'story'
      ? t('feed.shareKind.story')
      : ref.kind === 'short'
        ? t('feed.shareKind.short')
        : ref.kind === 'stream'
          ? t('feed.shareKind.stream')
          : t('feed.shareKind.listing')

  const KindIcon =
    ref.kind === 'story'
      ? CircleDot
      : ref.kind === 'short'
        ? Clapperboard
        : ref.kind === 'stream'
          ? Radio
          : Store

  return (
    <button
      type="button"
      onClick={() => openFeedShareTarget(ref.kind, ref.id)}
      className="aurora-feed-share mb-1 w-full rounded-2xl text-left"
    >
      {attachmentCoverUrl && (
        <img
          src={attachmentCoverUrl}
          alt=""
          className="max-h-56 w-full object-cover"
        />
      )}
      <div className="flex items-start gap-3 p-3.5">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(145deg,rgb(58_160_255_/_22%),rgb(45_212_191_/_14%))] text-[#3aa0ff]">
          <KindIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8fa0b5]">
            {kindLabel}
          </p>
          <p className="mt-0.5 truncate text-[15px] font-semibold text-white">
            {attachmentName || kindLabel}
          </p>
          {content && content !== attachmentName && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#8fa0b5]">{content}</p>
          )}
          <p className="mt-2 text-[11px] font-semibold text-[#3aa0ff]">{t('feed.openShare')} →</p>
        </div>
      </div>
    </button>
  )
}

function FeedPostCard({
  post,
  index,
  lang,
  onOpenAuthor,
  onLike,
  onDelete,
  onSaveEdit,
  onMetaChange,
  t,
}: {
  post: FeedPost
  index: number
  lang: 'ru' | 'en'
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
    <article
      className="aurora-feed-post rounded-[1.35rem] p-3.5 sm:p-4"
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <div className="mb-3 flex items-center gap-2.5">
        <button type="button" onClick={onOpenAuthor} className="shrink-0">
          <Avatar
            name={post.author.name}
            color={post.author.avatarColor}
            imageUrl={post.author.avatarUrl}
            size="sm"
          />
        </button>
        <button type="button" onClick={onOpenAuthor} className="min-w-0 flex-1 text-left">
          <p className="truncate text-[15px] font-semibold tracking-tight text-white">
            {post.author.name}
          </p>
          <p className="text-[11px] text-[#8fa0b5]">
            @{post.author.username}
            <span className="mx-1.5 text-white/15">·</span>
            {formatFeedTime(post.createdAt, lang)}
            {post.editedAt ? ` · ${t('feed.edited')}` : ''}
          </p>
        </button>
        {post.mine && !editing && (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-[#8fa0b5] transition hover:bg-white/5 hover:text-white"
              title={t('feed.edit')}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-[#8fa0b5] transition hover:bg-rose-500/10 hover:text-rose-400"
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
            className="min-h-[80px] resize-none border-white/10 bg-black/20 text-[#e8eef6]"
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setDraft(post.content || '')
              }}
              className="rounded-xl px-3 py-1.5 text-xs text-[#8fa0b5] transition hover:bg-white/5"
            >
              {t('misc.cancel')}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="inline-flex items-center gap-1 rounded-xl bg-[#3aa0ff] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {t('feed.save')}
            </button>
          </div>
        </div>
      ) : (
        post.content &&
        post.type !== 'share' && (
          <p className="mb-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-[#e8eef6]">
            {post.content}
          </p>
        )
      )}

      {(post.type === 'image' || post.type === 'drawing') && post.attachmentUrl && (
        <img
          src={post.attachmentUrl}
          alt={post.attachmentName || ''}
          className={cn(
            'mb-3 max-h-[28rem] w-full rounded-2xl object-cover',
            post.type === 'drawing' && 'bg-white object-contain',
          )}
        />
      )}
      {post.type === 'voice' && post.attachmentUrl && (
        <div className="mb-3">
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
        <div className="mb-3">
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
                <p className="text-xs text-[#8fa0b5]">{post.attachmentName || 'Track'}</p>
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

      {post.type === 'share' && (
        <FeedShareCard
          attachmentUrl={post.attachmentUrl}
          attachmentMime={post.attachmentMime}
          attachmentName={post.attachmentName}
          attachmentCoverUrl={post.attachmentCoverUrl}
          content={post.content}
          t={t}
        />
      )}

      <div className="mt-1 flex flex-col gap-1 border-t border-white/[0.06] pt-2.5">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={onLike}
            className={cn(
              'aurora-feed-like inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium',
              post.likedByMe
                ? 'is-liked bg-rose-500/15 text-rose-400'
                : 'text-[#8fa0b5] hover:bg-white/5 hover:text-white',
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
