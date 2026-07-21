'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, MapPin, Radar, EyeOff, Eye, X, Hand, MessageCircle } from 'lucide-react'
import { Avatar } from './avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/hooks/use-i18n'
import { useAppStore } from '@/lib/store'
import { openPrivateChatWithUser } from '@/lib/open-private-chat'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface NearbyPerson {
  id: string
  presenceId: string
  distanceKm: number
  offsetMeters?: { x: number; y: number }
  anonymous: boolean
  label?: string | null
  updatedAt: string
  user: {
    id: string
    name: string
    username: string
    avatarColor: string
    avatarUrl?: string | null
  } | null
}

interface NearbyDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
}

/** GeolocationPositionError is often NOT `instanceof Error` — map codes to i18n. */
function formatGeoError(err: unknown, t: (k: string) => string): string {
  const code =
    err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'number'
      ? (err as { code: number }).code
      : null
  if (code === 1) return t('nearby.geoDenied')
  if (code === 2) return t('nearby.geoUnavailable')
  if (code === 3) return t('nearby.geoTimeout')
  if (err instanceof Error && err.message.trim()) return err.message
  if (err && typeof err === 'object' && 'message' in err) {
    const m = String((err as { message: unknown }).message || '').trim()
    if (m) return m
  }
  return t('nearby.noGeo')
}

function readPositionOnce(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(Object.assign(new Error('no-geo'), { code: 2 }))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options)
  })
}

export function NearbyDialog({ open, onOpenChange }: NearbyDialogProps) {
  const { t, lang } = useI18n()
  const setProfileUserId = useAppStore((s) => s.setProfileUserId)
  const [loading, setLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [wavingId, setWavingId] = useState<string | null>(null)
  const [people, setPeople] = useState<NearbyPerson[]>([])
  const [anonymous, setAnonymous] = useState(true)
  const [active, setActive] = useState(false)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [radiusKm, setRadiusKm] = useState(3)
  const [error, setError] = useState<string | null>(null)

  const readPosition = useCallback(async (): Promise<GeolocationPosition> => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      throw new Error(t('nearby.geoInsecure'))
    }
    if (!navigator.geolocation) {
      throw new Error(t('nearby.noGeo'))
    }
    try {
      return await readPositionOnce({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      })
    } catch (first) {
      // Retry with coarse location — many desktops/VPNs time out on high accuracy.
      try {
        return await readPositionOnce({
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 120000,
        })
      } catch (second) {
        throw second || first
      }
    }
  }, [t])

  const refresh = useCallback(async (pos: { lat: number; lng: number }) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/nearby?lat=${pos.lat}&lng=${pos.lng}&radiusKm=3`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      setPeople(data.people || [])
      if (typeof data.radiusKm === 'number') setRadiusKm(data.radiusKm)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('misc.error'))
      setPeople([])
    } finally {
      setLoading(false)
    }
  }, [t])

  const goLive = async () => {
    setPublishing(true)
    setError(null)
    try {
      const pos = await readPosition()
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      setCoords(next)
      const res = await fetch('/api/nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...next, anonymous }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      setActive(true)
      toast.success(t('nearby.live'))
      await refresh(next)
    } catch (err) {
      const msg = formatGeoError(err, t)
      setError(msg)
      toast.error(msg)
    } finally {
      setPublishing(false)
    }
  }

  const goOffline = async () => {
    try {
      await fetch('/api/nearby', { method: 'DELETE' })
      setActive(false)
      toast.success(t('nearby.offline'))
    } catch {
      // ignore
    }
  }

  const wave = async (person: NearbyPerson) => {
    if (!person.presenceId || wavingId) return
    setWavingId(person.presenceId)
    try {
      const res = await fetch('/api/nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'wave', presenceId: person.presenceId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      toast.success(t('nearby.waveSent'))
      if (data.chatId) {
        onOpenChange(false)
        if (person.user?.id) {
          await openPrivateChatWithUser(person.user.id)
        } else {
          useAppStore.getState().setActiveChat(data.chatId)
          useAppStore.getState().setView('chats')
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    } finally {
      setWavingId(null)
    }
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const pos = await readPosition()
        if (cancelled) return
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setCoords(next)
        await refresh(next)
      } catch (err) {
        if (!cancelled) {
          // Soft hint on open — don't toast spam; button "Показать меня" will retry.
          setError(formatGeoError(err, t))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, readPosition, refresh, t])

  const radarDots = useMemo(() => {
    const maxM = Math.max(300, radiusKm * 1000)
    return people
      .filter((p) => p.offsetMeters)
      .map((p) => {
        const ox = p.offsetMeters!.x
        const oy = p.offsetMeters!.y
        const nx = 50 + (ox / maxM) * 42
        const ny = 50 - (oy / maxM) * 42
        return {
          ...p,
          left: Math.max(8, Math.min(92, nx)),
          top: Math.max(8, Math.min(92, ny)),
        }
      })
  }, [people, radiusKm])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(85dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.5rem))] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radar className="h-5 w-5 text-[#3390ec]" />
            {t('nearby.title')}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">{t('nearby.subtitle')}</p>

        {/* Radar map */}
        <div className="relative mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-full border border-[#3390ec]/25 bg-[radial-gradient(circle_at_center,#1a3a56_0%,#0b141a_70%)] shadow-inner">
          {[18, 36, 54, 72].map((r) => (
            <div
              key={r}
              className="pointer-events-none absolute left-1/2 top-1/2 rounded-full border border-[#3390ec]/20"
              style={{ width: `${r}%`, height: `${r}%`, transform: 'translate(-50%, -50%)' }}
            />
          ))}
          <div className="absolute left-1/2 top-1/2 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3390ec] shadow-[0_0_12px_#3390ec]" />
          <div className="pointer-events-none absolute inset-0 animate-[spin_12s_linear_infinite] opacity-40">
            <div className="absolute left-1/2 top-1/2 h-1/2 w-[2px] origin-bottom -translate-x-1/2 bg-gradient-to-t from-[#3390ec]/0 to-[#3390ec]/60" />
          </div>
          {radarDots.map((d) => (
            <button
              key={d.presenceId}
              type="button"
              title={d.user?.name || t('nearby.anonUser')}
              onClick={() => {
                if (d.user) {
                  setProfileUserId(d.user.id)
                  onOpenChange(false)
                }
              }}
              className="absolute z-20 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] transition hover:scale-125"
              style={{ left: `${d.left}%`, top: `${d.top}%` }}
            />
          ))}
          <p className="absolute bottom-3 left-0 right-0 text-center text-[10px] text-white/50">
            {people.length} · {radiusKm} {lang === 'ru' ? 'км' : 'km'}
          </p>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            {anonymous ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {t('nearby.anonymous')}
          </div>
          <Switch checked={anonymous} onCheckedChange={setAnonymous} />
        </div>

        <div className="flex gap-2">
          <Button className="flex-1" onClick={goLive} disabled={publishing}>
            {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2 h-4 w-4" />}
            {active ? t('nearby.refresh') : t('nearby.goLive')}
          </Button>
          {active && (
            <Button variant="outline" onClick={goOffline}>
              <X className="mr-1 h-4 w-4" />
              {t('nearby.stop')}
            </Button>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="min-h-[8rem]">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : people.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('nearby.empty')}</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {people.map((p) => (
                <li key={p.presenceId} className="flex items-center gap-3 py-3">
                  {p.user ? (
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() => {
                        setProfileUserId(p.user!.id)
                        onOpenChange(false)
                      }}
                    >
                      <Avatar
                        name={p.user.name}
                        color={p.user.avatarColor}
                        imageUrl={p.user.avatarUrl}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.user.name}</p>
                        <p className="truncate text-xs text-muted-foreground">@{p.user.username}</p>
                      </div>
                    </button>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#3390ec]/15 text-[#3390ec]">
                        <EyeOff className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t('nearby.anonUser')}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.label || t('nearby.nearbyHint')}
                        </p>
                      </div>
                    </div>
                  )}
                  <span
                    className={cn(
                      'shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground',
                    )}
                  >
                    {p.distanceKm < 1
                      ? `${Math.round(p.distanceKm * 1000)} ${lang === 'ru' ? 'м' : 'm'}`
                      : `${p.distanceKm.toFixed(1)} ${lang === 'ru' ? 'км' : 'km'}`}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 shrink-0"
                    disabled={wavingId === p.presenceId}
                    title={t('nearby.wave')}
                    onClick={() => void wave(p)}
                  >
                    {wavingId === p.presenceId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : p.user ? (
                      <MessageCircle className="h-4 w-4 text-[#3390ec]" />
                    ) : (
                      <Hand className="h-4 w-4 text-[#3390ec]" />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {coords && (
          <p className="text-[10px] text-muted-foreground">
            {t('nearby.coordsHint')} · {coords.lat.toFixed(3)}, {coords.lng.toFixed(3)}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
