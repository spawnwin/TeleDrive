'use client'

import { useEffect, useState } from 'react'
import { Radio, Loader2, Video, Users, Camera, MonitorPlay, History, Heart, Pencil, EyeOff, Eye, ChevronLeft, Gamepad2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAppStore } from '@/lib/store'
import { useI18n } from '@/hooks/use-i18n'
import { toast } from 'sonner'
import { StreamRoom } from './stream-room'
import type { StreamSource } from '@/hooks/use-live-stream'
import { cn } from '@/lib/utils'
import { resolveMediaUrl } from '@/lib/media-url'

interface StreamGameRef {
  id: string
  slug: string
  title: string
  titleEn?: string | null
  color: string
}

interface StreamSummary {
  id: string
  title: string
  roomId: string
  viewerCount: number
  startedAt: string
  host: { id: string; name: string; username: string; avatarColor: string; avatarUrl: string | null }
  game?: StreamGameRef | null
}

interface GameSummary extends StreamGameRef {
  coverImageUrl: string | null
  liveCount: number
}

interface StreamHistoryItem {
  id: string
  title: string
  viewerCount: number
  totalDonationsCoins: number
  startedAt: string
  endedAt: string | null
  hidden: boolean
}

interface StreamsDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function StreamsDialog({ open, onOpenChange }: StreamsDialogProps) {
  const { t } = useI18n()
  const { currentUser } = useAppStore()
  const [view, setView] = useState<'browse' | 'history'>('browse')
  const [streams, setStreams] = useState<StreamSummary[]>([])
  const [history, setHistory] = useState<StreamHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [showGoLive, setShowGoLive] = useState(false)
  const [title, setTitle] = useState('')
  const [goLiveGameId, setGoLiveGameId] = useState<string>('')
  const [shareToFeed, setShareToFeed] = useState(true)
  const [starting, setStarting] = useState(false)
  const [activeStream, setActiveStream] = useState<StreamSummary | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [source, setSource] = useState<StreamSource>('camera')
  const [screenSupported, setScreenSupported] = useState(false)
  const [games, setGames] = useState<GameSummary[]>([])
  const [selectedGame, setSelectedGame] = useState<GameSummary | null>(null)

  useEffect(() => {
    setScreenSupported(typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia)
  }, [])

  // Open a specific live stream from a feed share card.
  useEffect(() => {
    const handler = async (e: Event) => {
      const streamId = (e as CustomEvent<{ streamId?: string }>).detail?.streamId
      if (!streamId) return
      try {
        // Prefer the live list (already openable), then fall back to detail.
        const listRes = await fetch('/api/streams')
        const listData = await listRes.json().catch(() => ({}))
        const live = (listData.streams || []).find((s: StreamSummary) => s.id === streamId)
        if (live) {
          setActiveStream(live)
          setIsHost(live.host?.id === currentUser?.id)
          return
        }
        const res = await fetch(`/api/streams/${encodeURIComponent(streamId)}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.stream) {
          toast.error(data.error || t('streams.notFound'))
          return
        }
        if (data.stream.status !== 'live') {
          toast.error(t('streams.ended'))
          return
        }
        setActiveStream({
          id: data.stream.id,
          title: data.stream.title,
          roomId: data.stream.roomId,
          viewerCount: data.stream.viewerCount,
          startedAt: data.stream.startedAt,
          host: data.stream.host,
          game: data.stream.game,
        })
        setIsHost(data.stream.host?.id === currentUser?.id)
      } catch {
        toast.error(t('misc.error'))
      }
    }
    window.addEventListener('aurora:open-streams', handler)
    return () => window.removeEventListener('aurora:open-streams', handler)
  }, [currentUser?.id, t])

  const load = async (gameId?: string | null) => {
    setLoading(true)
    try {
      const qs = gameId ? `?gameId=${encodeURIComponent(gameId)}` : ''
      const res = await fetch(`/api/streams${qs}`)
      const data = await res.json()
      setStreams(data.streams || [])
    } finally {
      setLoading(false)
    }
  }

  const loadGames = async () => {
    try {
      const res = await fetch('/api/streams/games')
      const data = await res.json()
      setGames(data.games || [])
    } catch {
      // Categories are a nice-to-have — a failed fetch shouldn't block browsing streams.
    }
  }

  const openGame = (game: GameSummary) => {
    setSelectedGame(game)
    void load(game.id)
  }

  const backToCategories = () => {
    setSelectedGame(null)
    void load()
  }

  const loadHistory = async () => {
    setView('history')
    setLoading(true)
    try {
      const res = await fetch('/api/streams/history')
      const data = await res.json()
      setHistory(data.streams || [])
    } finally {
      setLoading(false)
    }
  }

  const renameStream = async (item: StreamHistoryItem) => {
    const next = window.prompt(t('streams.renamePrompt'), item.title)
    if (!next?.trim() || next.trim() === item.title) return
    try {
      const res = await fetch(`/api/streams/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: next.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      setHistory((prev) => prev.map((h) => (h.id === item.id ? { ...h, title: next.trim() } : h)))
      toast.success(t('streams.renamed'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    }
  }

  const toggleHidden = async (item: StreamHistoryItem) => {
    if (!item.hidden && !window.confirm(t('streams.hideConfirm'))) return
    try {
      const res = await fetch(`/api/streams/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden: !item.hidden }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      setHistory((prev) => prev.map((h) => (h.id === item.id ? { ...h, hidden: !item.hidden } : h)))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    }
  }

  useEffect(() => {
    if (open) {
      setView('browse')
      setSelectedGame(null)
      void load()
      void loadGames()
    }
  }, [open])

  const backToBrowse = () => {
    setView('browse')
    setSelectedGame(null)
    load()
  }

  const goLive = async () => {
    if (!title.trim()) {
      toast.error(t('streams.errorTitle'))
      return
    }
    setStarting(true)
    try {
      const res = await fetch('/api/streams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          gameId: goLiveGameId || null,
          shareToFeed,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      setActiveStream(data.stream)
      setIsHost(true)
      setShowGoLive(false)
      setTitle('')
      setGoLiveGameId('')
      setShareToFeed(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    } finally {
      setStarting(false)
    }
  }

  const watchStream = (s: StreamSummary) => {
    setActiveStream(s)
    setIsHost(false)
  }

  if (activeStream) {
    return (
      <StreamRoom
        stream={activeStream}
        isHost={isHost}
        source={source}
        currentUser={currentUser}
        onClose={() => {
          setActiveStream(null)
          if (open) load()
        }}
      />
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[85vh]">
        <DialogHeader className="shrink-0 px-5 pt-5 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-rose-500" />
            <span className="flex-1">{view === 'history' ? t('streams.history') : t('streams.title')}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => (view === 'history' ? backToBrowse() : loadHistory())}
              title={t('streams.history')}
            >
              <History className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {view === 'browse' ? (
            <>
              <Button
                className="w-full bg-gradient-to-r from-rose-500 to-orange-400 text-white"
                onClick={() => setShowGoLive(true)}
              >
                <Video className="mr-2 h-4 w-4" />
                {t('streams.goLive')}
              </Button>

              {games.length > 0 && (
                <>
                  <p className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('streams.categories')}
                  </p>
                  <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
                    {games.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => openGame(g)}
                        className="flex w-20 shrink-0 flex-col items-center gap-1"
                      >
                        <div
                          className={cn(
                            'relative aspect-[3/4] w-20 overflow-hidden rounded-lg border-2 transition',
                            selectedGame?.id === g.id
                              ? 'border-rose-500'
                              : 'border-transparent hover:border-rose-500/40',
                          )}
                          style={
                            g.coverImageUrl
                              ? undefined
                              : { background: `linear-gradient(135deg, ${g.color}, #000000aa)` }
                          }
                        >
                          {g.coverImageUrl ? (
                            <img
                              src={resolveMediaUrl(g.coverImageUrl)}
                              alt={g.title}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Gamepad2 className="absolute inset-0 m-auto h-8 w-8 text-white/80" />
                          )}
                          {g.liveCount > 0 && (
                            <span className="absolute bottom-1 left-1 right-1 truncate rounded bg-black/70 px-1 py-0.5 text-center text-[9px] font-semibold text-white">
                              {g.liveCount}
                            </span>
                          )}
                        </div>
                        <p className="w-full truncate text-center text-[10px] text-muted-foreground">
                          {g.title}
                        </p>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="mt-4 mb-2 flex items-center gap-2">
                {selectedGame && (
                  <button
                    type="button"
                    onClick={backToCategories}
                    className="flex items-center text-muted-foreground transition hover:text-foreground"
                    title={t('streams.backToCategories')}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                )}
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {selectedGame ? selectedGame.title : t('streams.liveNow')}
                </p>
              </div>

              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
                </div>
              ) : streams.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  {selectedGame ? t('streams.noStreamsForGame') : t('streams.empty')}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {streams.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => watchStream(s)}
                      className="flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition hover:border-rose-500/50"
                    >
                      <div
                        className="flex aspect-video items-center justify-center text-2xl font-bold text-white"
                        style={{ backgroundColor: s.host.avatarColor }}
                      >
                        {s.host.name[0]?.toUpperCase()}
                      </div>
                      <div className="p-2.5">
                        <p className="truncate text-sm font-medium">{s.title}</p>
                        <div className="mt-1 flex items-center justify-between gap-1">
                          <p className="truncate text-xs text-muted-foreground">@{s.host.username}</p>
                          <span className="flex shrink-0 items-center gap-1 rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-500">
                            <Users className="h-2.5 w-2.5" />
                            {s.viewerCount}
                          </span>
                        </div>
                        {s.game && (
                          <p className="mt-1 truncate text-[10px] text-violet-500">{s.game.title}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
            </div>
          ) : history.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">{t('streams.historyEmpty')}</p>
          ) : (
            <div className="space-y-2">
              {history.map((s) => {
                const durationMin =
                  s.endedAt
                    ? Math.max(1, Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000))
                    : null
                return (
                  <div key={s.id} className={cn('rounded-xl border border-border bg-card p-3', s.hidden && 'opacity-60')}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{s.title}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {new Date(s.startedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {s.viewerCount}
                      </span>
                      {durationMin != null && <span>{durationMin} {t('streams.minutesShort')}</span>}
                      <span className="flex items-center gap-1 text-amber-500">
                        <Heart className="h-3 w-3" />
                        {s.totalDonationsCoins} ₽
                      </span>
                      {s.hidden && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                          {t('streams.hiddenBadge')}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 flex-1 text-muted-foreground"
                        onClick={() => renameStream(s)}
                      >
                        <Pencil className="mr-1.5 h-3 w-3" />
                        {t('marketplace.edit')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 flex-1 text-muted-foreground"
                        onClick={() => toggleHidden(s)}
                      >
                        {s.hidden ? (
                          <>
                            <Eye className="mr-1.5 h-3 w-3" />
                            {t('streams.unhide')}
                          </>
                        ) : (
                          <>
                            <EyeOff className="mr-1.5 h-3 w-3" />
                            {t('streams.hide')}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>

      <Dialog open={showGoLive} onOpenChange={setShowGoLive}>
        <DialogContent className="max-w-sm gap-0 p-0">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle>{t('streams.goLive')}</DialogTitle>
          </DialogHeader>
          <div className="p-5">
            <Label className="text-xs">{t('streams.titleLabel')}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('streams.titlePlaceholder')}
              className="mt-1"
              maxLength={100}
              autoFocus
            />

            <Label className="mt-4 block text-xs">{t('streams.gameLabel')}</Label>
            <Select value={goLiveGameId || 'none'} onValueChange={(v) => setGoLiveGameId(v === 'none' ? '' : v)}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue placeholder={t('streams.gameNone')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('streams.gameNone')}</SelectItem>
                {games.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Label className="mt-4 block text-xs">{t('streams.sourceLabel')}</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSource('camera')}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border px-3 py-2.5 text-xs font-medium transition',
                  source === 'camera'
                    ? 'border-rose-500 bg-rose-500/10 text-rose-500'
                    : 'border-border text-muted-foreground hover:border-rose-500/40',
                )}
              >
                <Camera className="h-5 w-5" />
                {t('streams.sourceCamera')}
              </button>
              <button
                type="button"
                disabled={!screenSupported}
                onClick={() => setSource('screen')}
                title={screenSupported ? undefined : t('streams.sourceScreenUnsupported')}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border px-3 py-2.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40',
                  source === 'screen'
                    ? 'border-rose-500 bg-rose-500/10 text-rose-500'
                    : 'border-border text-muted-foreground hover:border-rose-500/40',
                )}
              >
                <MonitorPlay className="h-5 w-5" />
                {t('streams.sourceScreen')}
              </button>
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-2.5">
              <Checkbox
                checked={shareToFeed}
                onCheckedChange={(v) => setShareToFeed(v === true)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium">{t('feed.shareToFeed')}</p>
                <p className="text-xs text-muted-foreground">{t('feed.shareToFeedHint')}</p>
              </div>
            </label>

            <Button
              onClick={goLive}
              disabled={starting}
              className="mt-4 w-full bg-gradient-to-r from-rose-500 to-orange-400 text-white"
            >
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('streams.startBtn')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
