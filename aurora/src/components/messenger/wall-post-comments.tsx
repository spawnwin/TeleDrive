'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, MessageCircle, Send, Trash2 } from 'lucide-react'
import { Avatar } from './avatar'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/hooks/use-i18n'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export type WallComment = {
  id: string
  content: string
  createdAt: string
  user: {
    id: string
    name: string
    username: string
    avatarColor: string
    avatarUrl?: string | null
  }
  mine: boolean
  canDelete: boolean
}

interface WallPostCommentsProps {
  postId: string
  commentsCount: number
  commentsClosed: boolean
  canModerate: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onMetaChange?: (meta: { comments: number; commentsClosed: boolean }) => void
}

export function WallPostComments({
  postId,
  commentsCount,
  commentsClosed,
  canModerate,
  open,
  onOpenChange,
  onMetaChange,
}: WallPostCommentsProps) {
  const { t } = useI18n()
  const { setProfileUserId } = useAppStore()
  const [comments, setComments] = useState<WallComment[]>([])
  const [loading, setLoading] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/feed/${encodeURIComponent(postId)}/comments?take=100`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      setComments((data.comments || []) as WallComment[])
      setLoaded(true)
      if (typeof data.commentsCount === 'number' || typeof data.commentsClosed === 'boolean') {
        onMetaChange?.({
          comments: typeof data.commentsCount === 'number' ? data.commentsCount : commentsCount,
          commentsClosed:
            typeof data.commentsClosed === 'boolean' ? data.commentsClosed : commentsClosed,
        })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    } finally {
      setLoading(false)
    }
    // Intentionally omit onMetaChange / count props to avoid reload loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, t])

  useEffect(() => {
    setLoaded(false)
    setComments([])
  }, [postId])

  useEffect(() => {
    if (open && !loaded) void load()
  }, [open, loaded, load])

  const submit = async () => {
    const content = text.trim()
    if (!content || commentsClosed) return
    setSending(true)
    try {
      const res = await fetch(`/api/feed/${encodeURIComponent(postId)}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      if (data.comment) setComments((prev) => [...prev, data.comment as WallComment])
      setText('')
      onMetaChange?.({
        comments: typeof data.commentsCount === 'number' ? data.commentsCount : commentsCount + 1,
        commentsClosed,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    } finally {
      setSending(false)
    }
  }

  const remove = async (commentId: string) => {
    if (!confirm(t('feed.confirmDeleteComment'))) return
    try {
      const res = await fetch(
        `/api/feed/${encodeURIComponent(postId)}/comments?commentId=${encodeURIComponent(commentId)}`,
        { method: 'DELETE' },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      setComments((prev) => prev.filter((c) => c.id !== commentId))
      onMetaChange?.({
        comments:
          typeof data.commentsCount === 'number'
            ? data.commentsCount
            : Math.max(0, commentsCount - 1),
        commentsClosed,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    }
  }

  const toggleClosed = async () => {
    if (!canModerate) return
    const next = !commentsClosed
    try {
      const res = await fetch(`/api/feed/${encodeURIComponent(postId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentsClosed: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      const closed = data.post ? !!data.post.commentsClosed : next
      onMetaChange?.({ comments: commentsCount, commentsClosed: closed })
      toast.success(closed ? t('feed.commentsClosedToast') : t('feed.commentsOpenedToast'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    }
  }

  return (
    <div className="mt-1 w-full">
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition',
            open
              ? 'bg-[#3390ec]/10 text-[#3390ec]'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <MessageCircle className="h-4 w-4" />
          {commentsCount > 0 ? commentsCount : t('feed.comment')}
          {commentsClosed && (
            <span className="text-[10px] font-normal opacity-80">· {t('feed.commentsClosed')}</span>
          )}
        </button>
        {canModerate && (
          <button
            type="button"
            onClick={() => void toggleClosed()}
            className="rounded-xl px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            {commentsClosed ? t('feed.openComments') : t('feed.closeComments')}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 space-y-2 rounded-xl bg-muted/30 p-2.5">
          {loading && (
            <div className="flex justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && comments.length === 0 && !commentsClosed && (
            <p className="py-2 text-center text-xs text-muted-foreground">{t('feed.noComments')}</p>
          )}

          {comments.map((c) => (
            <div key={c.id} className="flex gap-2">
              <button
                type="button"
                onClick={() => setProfileUserId(c.user.id)}
                className="mt-0.5 shrink-0"
              >
                <Avatar
                  name={c.user.name}
                  color={c.user.avatarColor}
                  imageUrl={c.user.avatarUrl}
                  size="sm"
                  className="h-7 w-7 [&>div]:!h-7 [&>div]:!w-7 [&>div]:text-[10px]"
                />
              </button>
              <div className="min-w-0 flex-1 rounded-xl bg-background/80 px-2.5 py-1.5">
                <div className="flex items-start gap-1">
                  <button
                    type="button"
                    onClick={() => setProfileUserId(c.user.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-xs font-medium">{c.user.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(c.createdAt).toLocaleString()}
                    </p>
                  </button>
                  {c.canDelete && (
                    <button
                      type="button"
                      onClick={() => void remove(c.id)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title={t('feed.deleteComment')}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{c.content}</p>
              </div>
            </div>
          ))}

          {commentsClosed ? (
            <p className="pt-1 text-center text-[11px] text-muted-foreground">
              {t('feed.commentsClosedHint')}
            </p>
          ) : (
            <div className="flex items-end gap-2 pt-1">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('feed.commentPlaceholder')}
                className="min-h-[40px] flex-1 resize-none bg-background text-sm"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void submit()
                  }
                }}
              />
              <button
                type="button"
                disabled={sending || !text.trim()}
                onClick={() => void submit()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#3390ec] text-white disabled:opacity-40"
                title={t('feed.sendComment')}
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
