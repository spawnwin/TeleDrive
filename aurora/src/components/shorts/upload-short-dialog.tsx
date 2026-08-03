'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Upload, Link2, Film, Loader2, Youtube, Scissors, ImageIcon, Instagram } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/hooks/use-i18n'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { parseVideoUrl } from '@/lib/video-url'
import { isVideoFile, VIDEO_INPUT_ACCEPT } from '@/lib/media-type'
import { uploadFileWithRetry } from '@/lib/upload-client'
import {
  loadVideoFromFile,
  captureVideoFrame,
  compressVideo,
  blobToFile,
  formatTime,
  type LoadedVideo,
} from '@/lib/client-video'

const MAX_SHORT_DURATION = 60 // seconds
const MAX_OUTPUT_SIZE = 100 * 1024 * 1024 // 100 MB
const COVER_MAX_WIDTH = 720
const COMPRESS_MAX_W = 1080
const COMPRESS_MAX_H = 1920

interface UploadShortDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onPublished: () => void
  parentShort?: { id: string; title: string; thumbnailUrl?: string | null } | null
  duetMode?: 'reply' | 'duet' | 'challenge' | null
}

type Stage = 'idle' | 'compressing' | 'uploading' | 'server-trim' | 'publishing'

export function UploadShortDialog({
  open,
  onOpenChange,
  onPublished,
  parentShort = null,
  duetMode = null,
}: UploadShortDialogProps) {
  const { t } = useI18n()
  const [tab, setTab] = useState<'upload' | 'external' | 'instagram'>('upload')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [externalUrl, setExternalUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoName, setVideoName] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [preview, setPreview] = useState<{ source: string; externalId: string; thumbnail?: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Instagram-tab state — the video is downloaded and re-hosted server-side.
  const [igUrl, setIgUrl] = useState('')
  const [igImporting, setIgImporting] = useState(false)
  const [shareToFeed, setShareToFeed] = useState(false)

  // Upload-tab processing state
  const [file, setFile] = useState<File | null>(null)
  const [loaded, setLoaded] = useState<LoadedVideo | null>(null)
  const [duration, setDuration] = useState(0)
  const [trim, setTrim] = useState<[number, number]>([0, 0])
  const [coverTime, setCoverTime] = useState(0)
  const [coverThumb, setCoverThumb] = useState<string | null>(null)
  const [stage, setStage] = useState<Stage>('idle')
  const [progress, setProgress] = useState(0)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const objectUrlRef = useRef<string | null>(null)
  const coverThumbUrlRef = useRef<string | null>(null)

  const reset = useCallback(() => {
    setTitle('')
    setDescription('')
    setTags('')
    setExternalUrl('')
    setIgUrl('')
    setIgImporting(false)
    setShareToFeed(false)
    setVideoUrl(null)
    setVideoName('')
    setPreview(null)
    setFile(null)
    setLoaded(null)
    setDuration(0)
    setTrim([0, 0])
    setCoverTime(0)
    setCoverThumb(null)
    setStage('idle')
    setProgress(0)
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    if (coverThumbUrlRef.current) {
      URL.revokeObjectURL(coverThumbUrlRef.current)
      coverThumbUrlRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  // Keep the live <video> element in sync with the cover scrubber.
  useEffect(() => {
    const v = previewVideoRef.current
    if (!v || !loaded) return
    const target = Math.max(0, Math.min(coverTime, duration || 0))
    if (Math.abs(v.currentTime - target) > 0.05) {
      try {
        v.currentTime = target
      } catch {
        // ignore
      }
    }
  }, [coverTime, loaded, duration])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0]
    if (!picked) return
    e.target.value = ''
    if (!isVideoFile({ type: picked.type, name: picked.name })) {
      toast.error(t('shorts.upload.errorUpload'))
      return
    }
    // Reset any previous object URL before creating a new one.
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    setFile(picked)
    setVideoUrl(null)
    setVideoName(picked.name)
    setCoverThumb(null)
    setUploading(true)
    try {
      const info = await loadVideoFromFile(picked)
      // Reuse the same object URL for the preview <video> element so we
      // don't keep two copies of the file in memory.
      objectUrlRef.current = info.url
      setLoaded(info)
      setDuration(info.duration)
      setTrim([0, Math.min(MAX_SHORT_DURATION, info.duration)])
      const initialCover = Math.min(1, info.duration)
      setCoverTime(initialCover)
      await renderCoverThumb(picked, initialCover)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('shorts.upload.errorUpload'))
      setFile(null)
      setVideoName('')
    } finally {
      setUploading(false)
    }
  }

  const renderCoverThumb = async (srcFile: File, time: number) => {
    try {
      const info = await loadVideoFromFile(srcFile)
      try {
        const v = document.createElement('video')
        v.src = info.url
        v.muted = true
        v.playsInline = true
        await new Promise<void>((resolve, reject) => {
          v.addEventListener('loadedmetadata', () => resolve(), { once: true })
          v.addEventListener('error', () => reject(new Error('load failed')), { once: true })
        })
        const blob = await captureVideoFrame(v, time, COVER_MAX_WIDTH)
        if (blob) {
          if (coverThumbUrlRef.current) {
            URL.revokeObjectURL(coverThumbUrlRef.current)
          }
          const url = URL.createObjectURL(blob)
          coverThumbUrlRef.current = url
          setCoverThumb(url)
        }
      } finally {
        URL.revokeObjectURL(info.url)
      }
    } catch {
      setCoverThumb(null)
    }
  }

  const onCoverScrub = (vals: number[]) => {
    const time = vals[0] ?? 0
    setCoverTime(time)
    // Debounce thumbnail refresh via rAF.
    window.requestAnimationFrame(() => {
      renderCoverThumb(file!, time)
    })
  }

  const onTrimChange = (vals: number[]) => {
    const start = vals[0] ?? 0
    const end = vals[1] ?? duration
    if (end - start > MAX_SHORT_DURATION) {
      toast.error(t('shorts.error.tooLong'))
      // Clamp end to start + MAX.
      setTrim([start, Math.min(duration, start + MAX_SHORT_DURATION)])
      return
    }
    setTrim([start, end])
    // If cover falls outside the trimmed range, snap it to start.
    if (coverTime < start || coverTime > end) {
      setCoverTime(Math.max(start, Math.min(end, start + Math.min(1, end - start))))
    }
  }

  const handleUrlChange = (url: string) => {
    setExternalUrl(url)
    if (!url.trim()) {
      setPreview(null)
      return
    }
    const parsed = parseVideoUrl(url.trim())
    if (parsed) {
      setPreview({
        source: parsed.source,
        externalId: parsed.externalId,
        thumbnail: parsed.thumbnailUrl,
      })
    } else {
      setPreview(null)
    }
  }

  const uploadBlob = async (
    blob: Blob,
    filename: string,
    isVideo: boolean,
  ): Promise<string> => {
    const data = await uploadFileWithRetry(blobToFile(blob, filename), t)
    if (isVideo && data.isVideo === false) {
      throw new Error(t('shorts.upload.errorUpload'))
    }
    return data.url
  }

  const publish = async () => {
    if (tab !== 'instagram' && !title.trim()) {
      toast.error(t('shorts.upload.errorTitle'))
      return
    }
    if (tab === 'upload' && !file && !videoUrl) {
      toast.error(t('shorts.upload.errorFile'))
      return
    }
    if (tab === 'external' && !preview) {
      toast.error(t('shorts.upload.errorUrl'))
      return
    }
    if (tab === 'instagram' && !igUrl.trim()) {
      toast.error(t('shorts.upload.errorInstagramUrl'))
      return
    }

    if (tab === 'instagram') {
      setIgImporting(true)
      try {
        const res = await fetch('/api/shorts/import-instagram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: igUrl.trim(),
            title: title.trim(),
            description: description.trim(),
            tags: tags.split(',').map((tg) => tg.trim()).filter(Boolean),
            shareToFeed,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || t('misc.error'))
        toast.success(t('shorts.upload.published'))
        reset()
        onOpenChange(false)
        onPublished()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('misc.error'))
      } finally {
        setIgImporting(false)
      }
      return
    }

    setPublishing(true)
    setStage('publishing')
    try {
      let finalVideoUrl = videoUrl
      let finalThumbnail = preview?.thumbnail ?? null
      let finalDuration: number | undefined

      if (tab === 'upload') {
        const start = trim[0]
        const end = trim[1]
        if (end - start > MAX_SHORT_DURATION) {
          toast.error(t('shorts.error.tooLong'))
          return
        }
        finalDuration = end - start

        // 1. Capture / upload the cover thumbnail (auto frame at coverTime).
        if (file && !finalThumbnail) {
          try {
            const thumbBlob = await captureCoverBlob(file, coverTime)
            if (thumbBlob) {
              setStage('uploading')
              finalThumbnail = await uploadBlob(thumbBlob, `cover-${Date.now()}.jpg`, false)
            }
          } catch {
            // Non-fatal — publish without a thumbnail.
          }
        }

        // 2. Process the video: trim + compress client-side if we haven't
        //    already uploaded it (we always re-process from the raw file so
        //    the trim is reflected in the uploaded output).
        if (file) {
          let outBlob: Blob | null = null
          try {
            setStage('compressing')
            setProgress(0)
            const result = await compressVideo({
              file,
              start,
              end,
              maxWidth: COMPRESS_MAX_W,
              maxHeight: COMPRESS_MAX_H,
              onProgress: (r) => setProgress(r),
            })
            outBlob = result?.blob ?? null
            if (result) finalDuration = result.duration
          } catch {
            outBlob = null
          }

          if (outBlob) {
            if (outBlob.size > MAX_OUTPUT_SIZE) {
              toast.error(t('shorts.error.tooLarge'))
              return
            }
            setStage('uploading')
            setProgress(0)
            const ext = outBlob.type.includes('mp4') ? 'mp4' : 'webm'
            finalVideoUrl = await uploadBlob(
              outBlob,
              `short-${Date.now()}.${ext}`,
              true,
            )
          } else {
            // Compression unsupported — upload the original, then ask the
            // server to trim it with FFmpeg if a trim was requested.
            toast.message(t('shorts.upload.compressionFailed'))
            setStage('uploading')
            const uploaded = await uploadBlob(file, file.name, true)
            if (start > 0.1 || end < duration - 0.1) {
              setStage('server-trim')
              const trimRes = await fetch('/api/shorts/trim', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceUrl: uploaded, start, end }),
              })
              const trimData = await trimRes.json().catch(() => null)
              if (trimRes.ok && trimData?.url) {
                finalVideoUrl = trimData.url
                if (typeof trimData.duration === 'number') {
                  finalDuration = trimData.duration
                }
              } else if (trimRes.status === 501) {
                // No FFmpeg — keep the untrimmed original.
                finalVideoUrl = uploaded
                finalDuration = duration
              } else {
                throw new Error(trimData?.error || t('misc.error'))
              }
            } else {
              finalVideoUrl = uploaded
              finalDuration = duration
            }
          }
        }
      }

      const res = await fetch('/api/shorts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
          source: tab === 'upload' ? 'upload' : 'external',
          videoUrl: tab === 'upload' ? finalVideoUrl : undefined,
          externalUrl: tab === 'external' ? externalUrl.trim() : undefined,
          thumbnailUrl: tab === 'upload' ? finalThumbnail : undefined,
          duration: tab === 'upload' ? finalDuration : undefined,
          parentShortId: parentShort?.id || undefined,
          duetMode: parentShort ? (duetMode || 'reply') : undefined,
          challengeTitle:
            parentShort && duetMode === 'challenge' ? parentShort.title : undefined,
          shareToFeed,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      toast.success(t('shorts.upload.published'))
      reset()
      onOpenChange(false)
      onPublished()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    } finally {
      setPublishing(false)
      setStage('idle')
      setProgress(0)
    }
  }

  const busy = publishing || uploading
  const stageLabel =
    stage === 'compressing'
      ? t('shorts.upload.compressing')
      : stage === 'server-trim'
        ? t('shorts.upload.serverTrim')
        : stage === 'uploading'
          ? t('shorts.upload.publishing')
          : t('shorts.upload.publishing')

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>
            {parentShort
              ? duetMode === 'duet'
                ? t('shorts.duetUpload')
                : duetMode === 'challenge'
                  ? t('shorts.challengeUpload')
                  : t('shorts.replyUpload')
              : t('shorts.upload.title')}
          </DialogTitle>
        {parentShort && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm">
            {parentShort.thumbnailUrl ? (
              <img src={parentShort.thumbnailUrl} alt="" className="h-12 w-9 rounded object-cover" />
            ) : null}
            <div className="min-w-0">
              <p className="text-[10px] uppercase text-muted-foreground">{t('shorts.replyingTo')}</p>
              <p className="truncate font-medium">{parentShort.title}</p>
            </div>
          </div>
        )}
        </DialogHeader>

        <div className="max-h-[80vh] overflow-y-auto p-5">
          {/* Source tabs */}
          <div className="flex rounded-xl bg-muted p-1">
            <button
              onClick={() => setTab('upload')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition',
                tab === 'upload' ? 'bg-background shadow' : 'text-muted-foreground',
              )}
            >
              <Upload className="h-3.5 w-3.5" />
              {t('shorts.upload.upload')}
            </button>
            <button
              onClick={() => setTab('external')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition',
                tab === 'external' ? 'bg-background shadow' : 'text-muted-foreground',
              )}
            >
              <Link2 className="h-3.5 w-3.5" />
              {t('shorts.upload.external')}
            </button>
            <button
              onClick={() => setTab('instagram')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition',
                tab === 'instagram' ? 'bg-background shadow' : 'text-muted-foreground',
              )}
            >
              <Instagram className="h-3.5 w-3.5" />
              Instagram
            </button>
          </div>

          {tab === 'instagram' ? (
            <div className="mt-4 space-y-2">
              <Label htmlFor="ig-url" className="text-xs">{t('shorts.upload.instagramUrlLabel')}</Label>
              <Input
                id="ig-url"
                value={igUrl}
                onChange={(e) => setIgUrl(e.target.value)}
                placeholder="https://www.instagram.com/reel/..."
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">{t('shorts.upload.instagramUrlHint')}</p>
            </div>
          ) : tab === 'upload' ? (
            <div className="mt-4">
              <input
                ref={fileInputRef}
                type="file"
                accept={VIDEO_INPUT_ACCEPT}
                onChange={handleFile}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/30 px-4 py-8 text-center transition hover:bg-muted/50"
              >
                {uploading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                ) : file ? (
                  <>
                    <Film className="h-8 w-8 text-emerald-500" />
                    <p className="text-sm font-medium">{videoName}</p>
                    <p className="text-xs text-muted-foreground">✓ {t('shorts.upload.fileBtn')}</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium">{t('shorts.upload.fileBtn')}</p>
                    <p className="text-xs text-muted-foreground">{t('shorts.upload.fileHint')}</p>
                  </>
                )}
              </button>

              {/* Preview + cover + trim */}
              {loaded && file && (
                <div className="mt-4 space-y-4 rounded-2xl border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">
                      {t('shorts.upload.preview')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(duration)} · {loaded.videoWidth}×{loaded.videoHeight}
                    </span>
                  </div>

                  <div className="relative mx-auto aspect-[9/16] max-h-64 overflow-hidden rounded-xl bg-black">
                    <video
                      ref={previewVideoRef}
                      src={objectUrlRef.current ?? undefined}
                      muted
                      playsInline
                      preload="auto"
                      className="h-full w-full object-contain"
                    />
                  </div>

                  {/* Cover picker */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-3.5 w-3.5 text-violet-500" />
                      <span className="text-xs font-medium">{t('shorts.upload.cover')}</span>
                      <span className="text-xs text-muted-foreground">· {formatTime(coverTime)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{t('shorts.upload.coverHint')}</p>
                    <div className="flex gap-3">
                      <div className="h-16 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
                        {coverThumb ? (
                           
                          <img src={coverThumb} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 pt-1">
                        <Slider
                          min={0}
                          max={Math.max(0.1, duration)}
                          step={0.05}
                          value={[coverTime]}
                          onValueChange={onCoverScrub}
                          aria-label={t('shorts.upload.cover')}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Trim handles */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Scissors className="h-3.5 w-3.5 text-cyan-500" />
                      <span className="text-xs font-medium">{t('shorts.upload.trim')}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatTime(trim[0])} – {formatTime(trim[1])}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{t('shorts.upload.trimHint')}</p>
                    <Slider
                      min={0}
                      max={Math.max(0.1, duration)}
                      step={0.05}
                      value={trim}
                      minStepsBetweenThumbs={1}
                      onValueChange={onTrimChange}
                      aria-label={t('shorts.upload.trim')}
                    />
                    {trim[1] - trim[0] > MAX_SHORT_DURATION && (
                      <p className="text-xs text-rose-500">{t('shorts.error.tooLong')}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              <Label htmlFor="url" className="text-xs">{t('shorts.upload.urlLabel')}</Label>
              <Input
                id="url"
                value={externalUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder={t('shorts.upload.urlPlaceholder')}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">{t('shorts.upload.urlHint')}</p>
              {preview && (
                <div className="mt-2 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                  {preview.thumbnail ? (
                     
                    <img
                      src={preview.thumbnail}
                      alt=""
                      className="h-12 w-20 rounded-md object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-20 items-center justify-center rounded-md bg-violet-500/20">
                      <Youtube className="h-5 w-5 text-violet-500" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                      ✓ {preview.source === 'youtube' ? 'YouTube' : 'TikTok'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">ID: {preview.externalId}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Title */}
          <Label htmlFor="title" className="mt-4 block text-xs">
            {t('shorts.upload.title.label')}
          </Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('shorts.upload.titlePlaceholder')}
            className="mt-1"
            maxLength={100}
          />

          {/* Description */}
          <Label htmlFor="desc" className="mt-4 block text-xs">
            {t('shorts.upload.description')}
          </Label>
          <Textarea
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('shorts.upload.descriptionPlaceholder')}
            className="mt-1 resize-none"
            rows={3}
            maxLength={500}
          />

          {/* Tags */}
          <Label htmlFor="tags" className="mt-4 block text-xs">
            {t('shorts.upload.tags')}
          </Label>
          <Input
            id="tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder={t('shorts.upload.tagsPlaceholder')}
            className="mt-1"
          />

          {publishing && stage !== 'idle' && stage !== 'publishing' && (
            <div className="mt-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{stageLabel}</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <Progress value={progress * 100} />
            </div>
          )}

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
            onClick={publish}
            disabled={busy || igImporting}
            className="mt-4 w-full bg-gradient-to-r from-violet-500 to-cyan-400 text-white"
          >
            {igImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('shorts.upload.instagramImporting')}
              </>
            ) : publishing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {stageLabel}
              </>
            ) : (
              t('shorts.upload.publish')
            )}
          </Button>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            {t('earnings.rate')}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Capture a cover frame Blob from a file at a given time. */
async function captureCoverBlob(file: File, time: number): Promise<Blob | null> {
  const info = await loadVideoFromFile(file)
  try {
    const v = document.createElement('video')
    v.src = info.url
    v.muted = true
    v.playsInline = true
    await new Promise<void>((resolve, reject) => {
      v.addEventListener('loadedmetadata', () => resolve(), { once: true })
      v.addEventListener('error', () => reject(new Error('load failed')), { once: true })
    })
    return await captureVideoFrame(v, time, COVER_MAX_WIDTH)
  } finally {
    URL.revokeObjectURL(info.url)
  }
}

