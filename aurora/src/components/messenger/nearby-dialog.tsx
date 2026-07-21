'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, MapPin, Radar, EyeOff, Eye, X } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface NearbyPerson {
  id: string
  distanceKm: number
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

export function NearbyDialog({ open, onOpenChange }: NearbyDialogProps) {
  const { t, lang } = useI18n()
  const setProfileUserId = useAppStore((s) => s.setProfileUserId)
  const [loading, setLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [people, setPeople] = useState<NearbyPerson[]>([])
  const [anonymous, setAnonymous] = useState(true)
  const [active, setActive] = useState(false)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const readPosition = useCallback((): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error(t('nearby.noGeo')))
        return
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000,
      })
    })
  }, [t])

  const refresh = useCallback(async (pos: { lat: number; lng: number }) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/nearby?lat=${pos.lat}&lng=${pos.lng}&radiusKm=3`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      setPeople(data.people || [])
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
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      setActive(true)
      toast.success(t('nearby.live'))
      await refresh(next)
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('misc.error')
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
          setError(err instanceof Error ? err.message : t('nearby.noGeo'))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, readPosition, refresh, t])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(85dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.5rem))] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radar className="h-5 w-5 text-[#3390ec]" />
            {t('nearby.title')}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">{t('nearby.subtitle')}</p>

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
                <li key={p.id} className="flex items-center gap-3 py-3">
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
