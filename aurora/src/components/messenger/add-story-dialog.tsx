'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, ImageIcon, Type, Loader2, ChevronDown, Users, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar } from './avatar'
import { useI18n } from '@/hooks/use-i18n'
import { cn } from '@/lib/utils'
import { STORY_TEXT_BACKGROUNDS } from '@/lib/stories'
import type { StoryVisibility } from '@/lib/story-visibility'
import { GALLERY_INPUT_ACCEPT, isVideoFile, VIDEO_INPUT_ACCEPT } from '@/lib/media-type'
import { toast } from 'sonner'

type StoryMode = 'photo' | 'video' | 'text'

interface AudienceUser {
  id: string
  name: string
  username: string
  avatarColor: string
  avatarUrl?: string | null
}

interface AddStoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}

export function AddStoryDialog({ open, onOpenChange, onCreated }: AddStoryDialogProps) {
  const { t } = useI18n()
  const [mode, setMode] = useState<StoryMode>('photo')
  const [text, setText] = useState('')
  const [caption, setCaption] = useState('')
  const [bgColor, setBgColor] = useState<string>(STORY_TEXT_BACKGROUNDS[0])
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<'photo' | 'video' | null>(null)
  const [visibility, setVisibility] = useState<StoryVisibility>('contacts')
  const [addToProfile, setAddToProfile] = useState(true)
  const [saveToGallery, setSaveToGallery] = useState(true)
  const [showOptions, setShowOptions] = useState(false)
  const [audienceQuery, setAudienceQuery] = useState('')
  const [audienceResults, setAudienceResults] = useState<AudienceUser[]>([])
  const [selectedAudience, setSelectedAudience] = useState<AudienceUser[]>([])
  const [searchingAudience, setSearchingAudience] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setMode('photo')
    setText('')
    setCaption('')
    setBgColor(STORY_TEXT_BACKGROUNDS[0])
    setPreviewUrl(null)
    setMediaUrl(null)
    setMediaType(null)
    setUploading(false)
    setVisibility('contacts')
    setAddToProfile(true)
    setSaveToGallery(true)
    setShowOptions(false)
    setAudienceQuery('')
    setAudienceResults([])
    setSelectedAudience([])
  }

  const handleClose = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  useEffect(() => {
    if (!open || (visibility !== 'selected' && visibility !== 'exclude')) return
    if (!audienceQuery.trim()) {
      setAudienceResults([])
      return
    }
    const timer = setTimeout(async () => {
      setSearchingAudience(true)
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(audienceQuery.trim())}`)
        const data = await res.json()
        if (res.ok && Array.isArray(data.users)) {
          setAudienceResults(
            data.users.filter(
              (u: AudienceUser) => !selectedAudience.some((s) => s.id === u.id),
            ),
          )
        }
      } catch {
        setAudienceResults([])
      } finally {
        setSearchingAudience(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [audienceQuery, open, visibility, selectedAudience])

  const uploadFile = async (file: File) => {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/uploads', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('stories.errorUpload'))

      const isVideo = data.isVideo || isVideoFile({ type: file.type, name: file.name })
      setMediaUrl(data.url)
      setMediaType(isVideo ? 'video' : 'photo')
      setPreviewUrl(data.url)
      setMode(isVideo ? 'video' : 'photo')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('stories.errorUpload'))
    } finally {
      setUploading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void uploadFile(file)
    e.target.value = ''
  }

  const addAudienceUser = (user: AudienceUser) => {
    setSelectedAudience((prev) => (prev.some((u) => u.id === user.id) ? prev : [...prev, user]))
    setAudienceQuery('')
    setAudienceResults([])
  }

  const removeAudienceUser = (userId: string) => {
    setSelectedAudience((prev) => prev.filter((u) => u.id !== userId))
  }

  const handlePublish = async () => {
    if (
      (visibility === 'selected' || visibility === 'exclude') &&
      selectedAudience.length === 0
    ) {
      toast.error(t('stories.errorAudience'))
      return
    }

    setUploading(true)
    try {
      let body: Record<string, unknown>
      if (mode === 'text') {
        const trimmed = text.trim()
        if (!trimmed) {
          toast.error(t('stories.errorEmptyText'))
          setUploading(false)
          return
        }
        body = {
          type: 'text',
          content: trimmed,
          backgroundColor: bgColor,
          visibility,
          audienceIds: selectedAudience.map((u) => u.id),
          addToProfile: false,
          saveToGallery: false,
        }
      } else {
        if (!mediaUrl) {
          toast.error(t('stories.errorNoMedia'))
          setUploading(false)
          return
        }
        const toGallery = addToProfile || saveToGallery
        body = {
          type: mediaType || mode,
          mediaUrl,
          content: caption.trim() || null,
          visibility,
          audienceIds: selectedAudience.map((u) => u.id),
          addToProfile: toGallery,
          saveToGallery: toGallery,
        }
      }

      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('stories.errorPublish'))

      toast.success(t('stories.published'))
      onCreated?.()
      handleClose(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('stories.errorPublish'))
    } finally {
      setUploading(false)
    }
  }

  const needsAudience = visibility === 'selected' || visibility === 'exclude'
  const isMediaMode = mode !== 'text'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md gap-0 p-0 max-h-[90dvh] flex flex-col max-w-full overflow-x-hidden">
        <DialogHeader className="border-b px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] shrink-0">
          <DialogTitle>{t('stories.addTitle')}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 border-b px-3 py-2 shrink-0">
          {(['photo', 'video', 'text'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition',
                mode === m
                  ? 'bg-gradient-to-r from-violet-500/15 to-cyan-400/15 text-violet-600 dark:text-cyan-300'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {m === 'photo' && <ImageIcon className="h-3.5 w-3.5" />}
              {m === 'video' && <Camera className="h-3.5 w-3.5" />}
              {m === 'text' && <Type className="h-3.5 w-3.5" />}
              {t(`stories.mode.${m}`)}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto p-4 flex-1 min-h-0">
          {mode === 'text' ? (
            <div className="space-y-3">
              <div
                className="flex min-h-[160px] items-center justify-center rounded-xl p-4"
                style={{ background: bgColor }}
              >
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t('stories.textPlaceholder')}
                  className="min-h-[100px] resize-none border-none bg-transparent text-center text-lg font-medium text-white placeholder:text-white/60 focus-visible:ring-0"
                  maxLength={500}
                />
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {STORY_TEXT_BACKGROUNDS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setBgColor(c)}
                    className={cn(
                      'h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-background transition',
                      bgColor === c ? 'ring-violet-500' : 'ring-transparent',
                    )}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {previewUrl ? (
                <div className="relative overflow-hidden rounded-xl bg-muted">
                  {mediaType === 'video' ? (
                    <video src={previewUrl} className="max-h-48 w-full object-cover" controls />
                  ) : (
                    <img src={previewUrl} alt="" className="max-h-48 w-full object-cover" />
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-violet-500/30 bg-gradient-to-br from-violet-500/5 to-cyan-400/5 transition hover:border-violet-500/50"
                >
                  {uploading ? (
                    <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                  ) : (
                    <>
                      <ImageIcon className="h-8 w-8 text-violet-500" />
                      <span className="text-sm text-muted-foreground">
                        {mode === 'video' ? t('stories.pickVideo') : t('stories.pickPhoto')}
                      </span>
                    </>
                  )}
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept={mode === 'video' ? VIDEO_INPUT_ACCEPT : GALLERY_INPUT_ACCEPT}
                className="hidden"
                onChange={handleFileChange}
              />
              {previewUrl && (
                <Textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder={t('stories.captionPlaceholder')}
                  className="min-h-[60px] resize-none"
                  maxLength={200}
                />
              )}
            </div>
          )}

          {/* Publishing options */}
          <div className="mt-4 rounded-xl border border-border bg-muted/30">
            <button
              type="button"
              onClick={() => setShowOptions((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium"
            >
              <span>{t('stories.publishOptions')}</span>
              <ChevronDown
                className={cn('h-4 w-4 transition', showOptions && 'rotate-180')}
              />
            </button>

            {showOptions && (
              <div className="space-y-3 border-t border-border px-3 py-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('stories.visibility')}
                  </label>
                  <Select
                    value={visibility}
                    onValueChange={(v) => setVisibility(v as StoryVisibility)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="everyone">{t('stories.visibilityEveryone')}</SelectItem>
                      <SelectItem value="contacts">{t('stories.visibilityContacts')}</SelectItem>
                      <SelectItem value="friends">{t('stories.visibilityFriends')}</SelectItem>
                      <SelectItem value="selected">{t('stories.visibilitySelected')}</SelectItem>
                      <SelectItem value="exclude">{t('stories.visibilityExclude')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {needsAudience && (
                  <div className="space-y-2">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      {visibility === 'selected'
                        ? t('stories.audienceSelected')
                        : t('stories.audienceExclude')}
                    </label>
                    {selectedAudience.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedAudience.map((u) => (
                          <span
                            key={u.id}
                            className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-xs"
                          >
                            {u.name}
                            <button
                              type="button"
                              onClick={() => removeAudienceUser(u.id)}
                              className="rounded-full hover:bg-violet-500/20"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <input
                      type="text"
                      value={audienceQuery}
                      onChange={(e) => setAudienceQuery(e.target.value)}
                      placeholder={t('stories.audienceSearch')}
                      className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    />
                    {searchingAudience && (
                      <p className="text-xs text-muted-foreground">{t('app.loading')}</p>
                    )}
                    {audienceResults.length > 0 && (
                      <div className="max-h-32 overflow-y-auto rounded-lg border border-border">
                        {audienceResults.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => addAudienceUser(u)}
                            className="flex w-full items-center gap-2 px-2 py-2 text-left text-sm hover:bg-muted"
                          >
                            <Avatar
                              name={u.name}
                              color={u.avatarColor}
                              imageUrl={u.avatarUrl}
                              size="sm"
                            />
                            <span className="truncate">{u.name}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              @{u.username}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {isMediaMode && (
                  <div className="space-y-2.5">
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <Checkbox
                        checked={addToProfile}
                        onCheckedChange={(v) => setAddToProfile(v === true)}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-medium">{t('stories.addToProfile')}</p>
                        <p className="text-xs text-muted-foreground">
                          {t('stories.addToProfileHint')}
                        </p>
                      </div>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <Checkbox
                        checked={saveToGallery}
                        onCheckedChange={(v) => setSaveToGallery(v === true)}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-medium">{t('stories.saveToGallery')}</p>
                        <p className="text-xs text-muted-foreground">
                          {t('stories.saveToGalleryHint')}
                        </p>
                      </div>
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 border-t px-4 pb-[max(0.75rem,calc(5.75rem+env(safe-area-inset-bottom)))] xl:pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shrink-0">
          <Button variant="outline" className="flex-1" onClick={() => handleClose(false)}>
            {t('misc.cancel')}
          </Button>
          <Button
            className="flex-1 bg-gradient-to-r from-violet-500 to-cyan-400 text-white"
            onClick={handlePublish}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('stories.publish')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
