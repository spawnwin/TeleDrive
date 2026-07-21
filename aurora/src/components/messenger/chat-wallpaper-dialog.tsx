'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Loader2, RotateCcw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/hooks/use-i18n'
import { useAppStore } from '@/lib/store'
import {
  type ChatWallpaper,
  WALLPAPER_PRESETS,
  parseChatWallpaper,
} from '@/lib/chat-wallpaper'
import { WallpaperPreviewThumb } from './chat-wallpaper-bg'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { uploadFileWithRetry } from '@/lib/upload-client'

export type WallpaperScope = 'global' | 'chat'

interface ChatWallpaperDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scope: WallpaperScope
  chatId?: string | null
  currentWallpaper?: ChatWallpaper | null
}

export function ChatWallpaperDialog({
  open,
  onOpenChange,
  scope,
  chatId,
  currentWallpaper,
}: ChatWallpaperDialogProps) {
  const { t } = useI18n()
  const { currentUser, setCurrentUser, setChatWallpaper } = useAppStore()
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selected, setSelected] = useState<ChatWallpaper | null>(currentWallpaper ?? null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const effectiveCurrent =
    scope === 'chat'
      ? currentWallpaper ?? null
      : currentUser?.chatWallpaper ?? null

  const wallpapersEqual = (a: ChatWallpaper | null, b: ChatWallpaper | null) =>
    JSON.stringify(a) === JSON.stringify(b)

  const handleOpen = (v: boolean) => {
    if (v) setSelected(effectiveCurrent)
    onOpenChange(v)
  }

  const applyWallpaper = async (wallpaper: ChatWallpaper | null) => {
    setSaving(true)
    try {
      if (scope === 'global') {
        const res = await fetch('/api/auth/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ chatWallpaper: wallpaper }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || t('misc.error'))
        setCurrentUser({ ...currentUser!, ...data.user })
        toast.success(
          wallpaper ? t('wallpaper.savedGlobal') : t('wallpaper.resetGlobal'),
        )
      } else if (chatId) {
        const res = await fetch(`/api/chats/${chatId}/wallpaper`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ wallpaper }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || t('misc.error'))
        setChatWallpaper(chatId, parseChatWallpaper(data.wallpaper))
        toast.success(
          wallpaper ? t('wallpaper.savedChat') : t('wallpaper.resetChat'),
        )
      }
      setSelected(wallpaper)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    } finally {
      setSaving(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)) {
      toast.error(t('wallpaper.uploadImageOnly'))
      return
    }
    setUploading(true)
    try {
      const data = await uploadFileWithRetry(file, t)
      const custom: ChatWallpaper = {
        id: 'custom',
        type: 'image',
        value: data.url,
        overlay: 0.4,
      }
      setSelected(custom)
      await applyWallpaper(custom)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('wallpaper.title')}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {scope === 'global' ? t('wallpaper.hintGlobal') : t('wallpaper.hintChat')}
        </p>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {WALLPAPER_PRESETS.map((preset) => (
            <WallpaperPreviewThumb
              key={preset.id}
              wallpaper={preset}
              selected={selected?.id === preset.id}
              label={t(preset.labelKey)}
              onClick={() => setSelected(preset)}
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={uploading || saving}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4" />
            )}
            {t('wallpaper.upload')}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={handleUpload}
          />

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={saving}
            onClick={() => applyWallpaper(null)}
          >
            <RotateCcw className="h-4 w-4" />
            {scope === 'global' ? t('wallpaper.resetDefault') : t('wallpaper.useGlobal')}
          </Button>
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('misc.cancel')}
          </Button>
          <Button
            disabled={saving || wallpapersEqual(selected, effectiveCurrent)}
            onClick={() => selected && applyWallpaper(selected)}
            className={cn(saving && 'opacity-70')}
          >
            {saving ? t('settings.saving') : t('wallpaper.apply')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
