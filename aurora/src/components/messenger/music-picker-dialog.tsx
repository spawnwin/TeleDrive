'use client'

import { useEffect, useState } from 'react'
import { Heart, ListMusic, Loader2, Music } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/hooks/use-i18n'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import type { YandexPlaylist, YandexTrack } from '@/lib/yandex-music'

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
  onPickFile?: () => void
  onPickYandex: (track: YandexTrack) => void | Promise<void>
  yandexOnly?: boolean
  title?: string
  onOpenYandexSettings?: () => void
}

type BrowseMode = 'favorites' | 'playlists' | 'playlist-tracks'

export function MusicPickerDialog({
  open,
  onOpenChange,
  onPickFile,
  onPickYandex,
  yandexOnly = false,
  title,
  onOpenYandexSettings,
}: MusicPickerDialogProps) {
  const { t } = useI18n()
  const currentUser = useAppStore((s) => s.currentUser)
  const [tab, setTab] = useState<'file' | 'yandex'>('yandex')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<YandexTrack[]>([])
  const [favorites, setFavorites] = useState<YandexTrack[]>([])
  const [favoritesConnected, setFavoritesConnected] = useState(false)
  const [favoritesLoaded, setFavoritesLoaded] = useState(false)
  const [favoritesHasMore, setFavoritesHasMore] = useState(false)
  const [favoritesOffset, setFavoritesOffset] = useState(0)
  const [playlists, setPlaylists] = useState<YandexPlaylist[]>([])
  const [activePlaylist, setActivePlaylist] = useState<YandexPlaylist | null>(null)
  const [playlistTracks, setPlaylistTracks] = useState<YandexTrack[]>([])
  const [browse, setBrowse] = useState<BrowseMode>('favorites')
  const [searching, setSearching] = useState(false)
  const [loadingFavorites, setLoadingFavorites] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadingPlaylists, setLoadingPlaylists] = useState(false)
  const [fetchingId, setFetchingId] = useState<string | null>(null)
  const [fullTracks, setFullTracks] = useState(!!currentUser?.yandexMusicConnected)
  const [tokenExpired, setTokenExpired] = useState(false)

  const loadFavorites = (offset: number, append: boolean) => {
    const req = append ? setLoadingMore : setLoadingFavorites
    req(true)
    fetch(`/api/yandex-music/favorites?limit=40&offset=${offset}`)
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        const tracks = Array.isArray(data.tracks) ? data.tracks : []
        setFavorites((prev) => (append ? [...prev, ...tracks] : tracks))
        setFavoritesConnected(!!data.connected)
        setFavoritesHasMore(!!data.hasMore)
        setFavoritesOffset(offset + tracks.length)
        setFullTracks(!!data.connected || data.source === 'env')
        setTokenExpired(!!data.expired)
      })
      .catch(() => {
        if (!append) {
          setFavorites([])
          setFavoritesConnected(false)
        }
      })
      .finally(() => {
        req(false)
        setFavoritesLoaded(true)
      })
  }

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setTab('yandex')
      setFetchingId(null)
      setBrowse('favorites')
      setActivePlaylist(null)
      setPlaylistTracks([])
      return
    }
    setFavoritesLoaded(false)
    loadFavorites(0, false)

    fetch('/api/yandex-music/connect')
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        setFullTracks(!!data.fullTracks)
        setTokenExpired(!!data.expired)
      })
      .catch(() => {})
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
          if (!cancelled) {
            setResults(data.tracks || [])
            if (data.expired) setTokenExpired(true)
          }
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

  const openPlaylists = () => {
    setBrowse('playlists')
    setLoadingPlaylists(true)
    fetch('/api/yandex-music/playlists')
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        setPlaylists(Array.isArray(data.playlists) ? data.playlists : [])
        if (data.expired) setTokenExpired(true)
      })
      .catch(() => setPlaylists([]))
      .finally(() => setLoadingPlaylists(false))
  }

  const openPlaylist = (pl: YandexPlaylist) => {
    setActivePlaylist(pl)
    setBrowse('playlist-tracks')
    setLoadingPlaylists(true)
    setPlaylistTracks([])
    const qs = new URLSearchParams({ kind: pl.kind, uid: pl.uid || '' })
    fetch(`/api/yandex-music/playlists?${qs}`)
      .then((r) => r.json().catch(() => ({})))
      .then((data) => setPlaylistTracks(Array.isArray(data.tracks) ? data.tracks : []))
      .catch(() => setPlaylistTracks([]))
      .finally(() => setLoadingPlaylists(false))
  }

  const showBrowse = tab === 'yandex' && !query.trim()
  const list = !showBrowse
    ? results
    : browse === 'playlist-tracks'
      ? playlistTracks
      : browse === 'favorites'
        ? favorites
        : []

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
            {(!fullTracks || tokenExpired) && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-snug text-amber-700 dark:text-amber-200/90">
                {tokenExpired ? t('music.tokenExpired') : t('music.previewHint')}{' '}
                {onOpenYandexSettings ? (
                  <button
                    type="button"
                    className="font-semibold text-primary underline-offset-2 hover:underline"
                    onClick={() => {
                      onOpenChange(false)
                      onOpenYandexSettings()
                    }}
                  >
                    {t('music.connectLink')}
                  </button>
                ) : (
                  t('music.connectInSettings')
                )}
              </div>
            )}

            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('wall.searchPlaceholder')}
              className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:bg-background"
              autoFocus
            />

            {showBrowse && (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setBrowse('favorites')
                    setActivePlaylist(null)
                  }}
                  className={cn(
                    'flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
                    browse === 'favorites' || browse === 'playlist-tracks'
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  <Heart className="h-3 w-3" />
                  {t('music.favorites')}
                </button>
                <button
                  type="button"
                  onClick={openPlaylists}
                  className={cn(
                    'flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
                    browse === 'playlists' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  <ListMusic className="h-3 w-3" />
                  {t('music.playlists')}
                </button>
              </div>
            )}

            {showBrowse && browse === 'playlist-tracks' && activePlaylist && (
              <button
                type="button"
                onClick={() => {
                  setBrowse('playlists')
                  setActivePlaylist(null)
                }}
                className="text-left text-xs text-primary hover:underline"
              >
                ← {activePlaylist.title}
              </button>
            )}

            <div className="max-h-[min(360px,50dvh)] space-y-1 overflow-y-auto overscroll-contain">
              {(searching ||
                (showBrowse && browse === 'favorites' && loadingFavorites) ||
                (showBrowse && (browse === 'playlists' || browse === 'playlist-tracks') && loadingPlaylists)) && (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {!searching && !showBrowse && query.trim() && results.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('wall.noResults')}</p>
              )}

              {showBrowse &&
                browse === 'favorites' &&
                favoritesLoaded &&
                !loadingFavorites &&
                !favoritesConnected && (
                  <div className="space-y-2 py-6 text-center">
                    <p className="text-sm text-muted-foreground">{t('music.favoritesNeedConnect')}</p>
                    {onOpenYandexSettings && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          onOpenChange(false)
                          onOpenYandexSettings()
                        }}
                      >
                        {t('music.connectLink')}
                      </Button>
                    )}
                  </div>
                )}

              {showBrowse &&
                browse === 'favorites' &&
                favoritesLoaded &&
                !loadingFavorites &&
                favoritesConnected &&
                favorites.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {t('music.favoritesEmpty')}
                  </p>
                )}

              {showBrowse && browse === 'playlists' && !loadingPlaylists && playlists.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('music.playlistsEmpty')}</p>
              )}

              {showBrowse &&
                browse === 'playlists' &&
                !loadingPlaylists &&
                playlists.map((pl) => (
                  <button
                    key={`${pl.uid}:${pl.kind}`}
                    type="button"
                    onClick={() => openPlaylist(pl)}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-muted"
                  >
                    {pl.coverUrl ? (
                      <img src={pl.coverUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-rose-500/20">
                        <ListMusic className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{pl.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {pl.trackCount} {t('music.tracks')}
                      </p>
                    </div>
                  </button>
                ))}

              {!searching &&
                !loadingFavorites &&
                !loadingPlaylists &&
                (browse !== 'playlists' || !showBrowse) &&
                list.map((tr) => (
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

              {showBrowse && browse === 'favorites' && favoritesHasMore && (
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => loadFavorites(favoritesOffset, true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm text-primary hover:bg-muted disabled:opacity-50"
                >
                  {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t('music.loadMore')}
                </button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
