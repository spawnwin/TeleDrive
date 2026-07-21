'use client'

import { useEffect, useState } from 'react'
import { Loader2, Music } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/hooks/use-i18n'
import { cn } from '@/lib/utils'
import type { YandexTrack } from '@/lib/yandex-music'

function formatTime(s: number) {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export type { YandexTrack }

interface MusicPickerDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** When set, shows a "file" tab that calls this callback. */
  onPickFile?: () => void
  onPickYandex: (track: YandexTrack) => void | Promise<void>
  /** Chat mode: Yandex-only, no file upload. */
  yandexOnly?: boolean
  title?: string
}

export function MusicPickerDialog({
  open,
  onOpenChange,
  onPickFile,
  onPickYandex,
  yandexOnly = false,
  title,
}: MusicPickerDialogProps) {
  const { t } = useI18n()
  const [tab, setTab] = useState<'file' | 'yandex'>('yandex')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<YandexTrack[]>([])
  const [searching, setSearching] = useState(false)
  const [fetchingId, setFetchingId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setTab('yandex')
      setFetchingId(null)
    }
  }, [open])

  useEffect(() => {
    if (!open || tab !== 'yandex') return
    const q = query.trim()
    if (!q) {
      setResults([])
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(() => {
      fetch(`/api/yandex-music/search?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r)))
        .then((data) => {
          if (!cancelled) setResults(data.tracks || [])
        })
        .catch(() => {
          if (!cancelled) setResults([])
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, open, tab])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="h-4 w-4 text-primary" />
            {title || t('wall.musicTitle')}
          </DialogTitle>
        </DialogHeader>

        {!yandexOnly && onPickFile && (
          <div className="flex gap-1 rounded-lg bg-muted/60 p-1">
            <button
              type="button"
              onClick={() => setTab('yandex')}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition',
                tab === 'yandex' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              {t('wall.tabYandex')}
            </button>
            <button
              type="button"
              onClick={() => setTab('file')}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition',
                tab === 'file' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              {t('wall.tabFile')}
            </button>
          </div>
        )}

        {tab === 'file' && onPickFile ? (
          <div className="py-6 text-center">
            <Button onClick={onPickFile} className="gap-2">
              <Music className="h-4 w-4" />
              {t('wall.chooseFile')}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">{t('wall.fileHint')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('wall.searchPlaceholder')}
              className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:bg-background"
              autoFocus
            />
            <div className="max-h-[min(360px,50dvh)] space-y-1 overflow-y-auto overscroll-contain">
              {searching && (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!searching && query.trim() && results.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t('wall.noResults')}
                </p>
              )}
              {!searching && !query.trim() && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t('wall.searchHint')}
                </p>
              )}
              {results.map((tr) => (
                <button
                  key={tr.id}
                  type="button"
                  disabled={!!fetchingId}
                  onClick={async () => {
                    setFetchingId(tr.id)
                    try {
                      await onPickYandex(tr)
                    } finally {
                      setFetchingId(null)
                    }
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-muted disabled:opacity-50"
                >
                  {tr.coverUrl ? (
                    <img
                      src={tr.coverUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-lg object-cover shadow-sm"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-rose-500/20">
                      <Music className="h-5 w-5 text-primary" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{tr.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{tr.artist}</p>
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {formatTime(tr.durationSec)}
                  </span>
                  {fetchingId === tr.id && (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
