'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Sparkles,
  Moon,
  Sun,
  Bell,
  Shield,
  Globe,
  Check,
  Camera,
  Loader2,
  Lock,
  KeyRound,
  Crown,
  Coins,
  Upload,
  Image as ImageIcon,
  Heart,
  User,
  Bot,
  Database,
  Palette,
  ChevronRight,
  ArrowLeft,
  Phone,
  Play,
  Volume2,
  RotateCcw,
  Trash2,
  LogOut,
  EllipsisVertical,
  X,
} from 'lucide-react'
import { Avatar } from './avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { useAppStore } from '@/lib/store'
import { useI18n } from '@/hooks/use-i18n'
import { getPushPermission, enableWebPush, unsubscribeFromPush, isWebPushSupported, getIosPushBlockReason, syncPushSubscription } from '@/hooks/use-push'
import {
  clearCustomSound,
  CUSTOM_SOUND_ACCEPT,
  CUSTOM_SOUND_MAX_SIZE,
  getResolvedSound,
  loadCustomSound,
  loadSoundPresetId,
  playCallRingPreview,
  playMessageSoundPreview,
  playSoundUrlPreview,
  saveCustomSoundFile,
  saveSoundPresetId,
  unlockNotificationAudio,
  type CustomSoundKind,
} from '@/lib/notification-sound'
import {
  IOS_ALERT_SOUNDS,
  IOS_RINGTONE_SOUNDS,
  iosSoundLabel,
  type IosAlertSound,
} from '@/lib/ios-alert-sounds'
import { languages, type Lang } from '@/lib/i18n'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { resolveMediaUrl } from '@/lib/media-url'
import { removeProfileAvatar } from '@/lib/remove-avatar'
import { useE2EE } from '@/hooks/use-e2ee'
import { isPremiumActive, getUploadLimitMb, PREMIUM_THEMES } from '@/lib/coins'
import { EmojiStatusPicker } from './emoji-status-picker'
import { EmojiStatusBadge } from './emoji-status-badge'
import { TwoFactorPanel } from './two-factor-panel'
import { BotManager } from './bot-manager'
import { StorageManager } from './storage-manager'
import { AvatarCropDialog } from './avatar-crop-dialog'
import { ChatWallpaperDialog } from './chat-wallpaper-dialog'
import { CreatorPremiumDialog } from '../shorts/creator-premium-dialog'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onOpenPremium?: () => void
  onOpenCoins?: () => void
  /** Open the current user's public profile wall. */
  onOpenMyProfile?: () => void
}

const COLOR_OPTIONS = [
  '#3390ec', '#0ea5e9', '#10b981', '#eab308',
  '#f97316', '#ef4444', '#ec4899', '#8b5cf6',
  '#06b6d4', '#14b8a6', '#f43f5e', '#64748b',
]

type SettingsPage =
  | 'main'
  | 'account'
  | 'notifications'
  | 'sound-message'
  | 'sound-call'
  | 'privacy'
  | 'appearance'
  | 'language'
  | 'premium'
  | 'data'
  | 'bots'

/** Telegram-style menu row: colored icon square, label, hint, chevron. */
function MenuRow({
  icon,
  color,
  label,
  hint,
  value,
  onClick,
}: {
  icon: React.ReactNode
  color: string
  label: string
  hint?: string
  value?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-muted"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-white"
        style={{ background: color }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
      </span>
      {value && <span className="shrink-0 text-xs text-muted-foreground">{value}</span>}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
    </button>
  )
}

function SoundSettingRow({
  icon,
  label,
  hint,
  enabled,
  soundLabel,
  chooseLabel,
  previewLabel,
  onEnabledChange,
  onPreview,
  onChoose,
}: {
  icon: React.ReactNode
  label: string
  hint: string
  enabled: boolean
  soundLabel: string
  chooseLabel: string
  previewLabel: string
  onEnabledChange: (enabled: boolean) => void
  onPreview: () => void
  onChoose: () => void
}) {
  return (
    <div className="rounded-2xl bg-muted/50 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5 text-sm">
          <span className="mt-0.5 shrink-0">{icon}</span>
          <div className="min-w-0">
            <p className="font-medium">{label}</p>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{hint}</p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </div>

      <button
        type="button"
        onClick={onChoose}
        disabled={!enabled}
        className="mt-3 flex w-full items-center gap-3 rounded-xl bg-background/80 px-3 py-2.5 text-left transition hover:bg-background disabled:opacity-50"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#3390ec]/15 text-[#3390ec]">
          <Volume2 className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{soundLabel}</span>
          <span className="block text-[11px] text-muted-foreground">{chooseLabel}</span>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            onPreview()
          }}
          disabled={!enabled}
          title={previewLabel}
        >
          <Play className="h-4 w-4" />
        </Button>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    </div>
  )
}

function SoundPickerList({
  kind,
  lang,
  selectedId,
  onSelect,
  onUpload,
  uploadLabel,
  customName,
}: {
  kind: CustomSoundKind
  lang: string
  selectedId: string
  onSelect: (id: string) => void
  onUpload: () => void
  uploadLabel: string
  customName: string
}) {
  const list: IosAlertSound[] = kind === 'message' ? IOS_ALERT_SOUNDS : IOS_RINGTONE_SOUNDS
  const isCustom = selectedId === 'custom'

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl bg-muted/40">
        {list.map((sound, idx) => {
          const active = !isCustom && selectedId === sound.id
          return (
            <button
              key={sound.id}
              type="button"
              onClick={() => onSelect(sound.id)}
              className={cn(
                'flex w-full items-center gap-3 px-3.5 py-3 text-left transition',
                active ? 'bg-[#3390ec]/12' : 'hover:bg-muted/60',
                idx > 0 && 'border-t border-border/50',
              )}
            >
              <span
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                  active ? 'bg-[#3390ec] text-white' : 'bg-background text-[#3390ec]',
                )}
              >
                <Volume2 className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium leading-tight">
                  {iosSoundLabel(sound, lang)}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {sound.nameEn}
                </span>
              </span>
              <button
                type="button"
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full transition',
                  active ? 'bg-[#3390ec] text-white' : 'bg-muted text-muted-foreground',
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  playSoundUrlPreview(sound.src, kind === 'call' ? 3500 : 2000)
                }}
                title="▶"
              >
                <Play className="h-3.5 w-3.5" fill="currentColor" />
              </button>
              {active && <Check className="h-5 w-5 shrink-0 text-[#3390ec]" strokeWidth={2.5} />}
            </button>
          )
        })}
      </div>

      <div className="overflow-hidden rounded-2xl bg-muted/40">
        <button
          type="button"
          onClick={onUpload}
          className={cn(
            'flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-muted/60',
            isCustom && 'bg-[#3390ec]/12',
          )}
        >
          <span
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
              isCustom ? 'bg-[#3390ec] text-white' : 'bg-background text-muted-foreground',
            )}
          >
            <Upload className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium">{uploadLabel}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {isCustom && customName ? customName : 'MP3, WAV, M4A…'}
            </span>
          </span>
          {isCustom && <Check className="h-5 w-5 shrink-0 text-[#3390ec]" strokeWidth={2.5} />}
        </button>
      </div>
    </div>
  )
}

export function SettingsDialog({ open, onOpenChange, onOpenPremium, onOpenCoins, onOpenMyProfile }: SettingsDialogProps) {
  const { t, lang, setLang } = useI18n()
  const router = useRouter()
  const {
    currentUser,
    theme,
    setTheme,
    pushEnabled,
    setPushEnabled,
    messageSoundEnabled,
    setMessageSoundEnabled,
    callSoundEnabled,
    setCallSoundEnabled,
    setCurrentUser,
  } = useAppStore()
  const { e2eeEnabled, toggleE2EE, generating } = useE2EE()
  const [page, setPage] = useState<SettingsPage>('main')
  const [name, setName] = useState(currentUser?.name || '')
  const [bio, setBio] = useState(currentUser?.bio || '')
  const [avatarColor, setAvatarColor] = useState(currentUser?.avatarColor || '#3390ec')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(currentUser?.avatarUrl || null)
  const [premiumTheme, setPremiumTheme] = useState(currentUser?.premiumTheme || 'classic')
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [showWallpaper, setShowWallpaper] = useState(false)
  const [showCreatorPremium, setShowCreatorPremium] = useState(false)
  const [confirmRemovePhoto, setConfirmRemovePhoto] = useState(false)
  const [removingPhoto, setRemovingPhoto] = useState(false)
  const [messageSoundName, setMessageSoundName] = useState('')
  const [callSoundName, setCallSoundName] = useState('')
  const [messagePresetId, setMessagePresetId] = useState('note')
  const [callPresetId, setCallPresetId] = useState('ringtone-marimba')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messageSoundInputRef = useRef<HTMLInputElement>(null)
  const callSoundInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setPage('main')
      setName(currentUser?.name || '')
      setBio(currentUser?.bio || '')
      setAvatarColor(currentUser?.avatarColor || '#3390ec')
      setAvatarUrl(currentUser?.avatarUrl || null)
      setPremiumTheme(currentUser?.premiumTheme || 'classic')
      setMessageSoundName(loadCustomSound('message')?.name || '')
      setCallSoundName(loadCustomSound('call')?.name || '')
      setMessagePresetId(loadSoundPresetId('message'))
      setCallPresetId(loadSoundPresetId('call'))
    }
  }, [open, currentUser])

  const handleAvatarPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const url = URL.createObjectURL(file)
    setCropSrc(url)
  }

  const uploadCroppedAvatar = async (file: File) => {
    setUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/auth/avatar', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('settings.errorSave'))
      setAvatarUrl(data.url)
      await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ avatarUrl: data.url }),
      })
      if (currentUser) {
        setCurrentUser({ ...currentUser, avatarUrl: data.url })
      }
      toast.success(t('avatarCrop.updated'))
      if (cropSrc) {
        URL.revokeObjectURL(cropSrc)
        setCropSrc(null)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.errorSave'))
      throw err
    } finally {
      setUploadingAvatar(false)
    }
  }

  const closeCrop = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  const saveProfile = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          bio,
          avatarColor,
          avatarUrl,
          ...(isPremiumActive(currentUser || {}) ? { premiumTheme } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('settings.errorSave'))
      setCurrentUser(data.user)
      toast.success(t('settings.saved'))
      setPage('main')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.errorSave'))
    } finally {
      setSaving(false)
    }
  }

  /** Telegram applies language immediately — no save button. */
  const applyLanguage = async (code: Lang) => {
    setLang(code)
    try {
      await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ language: code }),
      })
      if (currentUser) setCurrentUser({ ...currentUser, language: code })
    } catch {
      // language is applied locally regardless
    }
  }

  const togglePush = async (enabled: boolean) => {
    if (!enabled) {
      setPushEnabled(false)
      await unsubscribeFromPush()
      return
    }
    if (!isWebPushSupported()) {
      toast.error(t('settings.pushUnsupported'))
      return
    }
    const iosBlock = getIosPushBlockReason()
    if (iosBlock === 'ios-home-screen') {
      toast.error(t('settings.pushIosHomeScreen'))
      return
    }
    if (iosBlock === 'ios-version') {
      toast.error(t('settings.pushIosVersion'))
      return
    }
    const result = await enableWebPush()
    if (result.ok) {
      const synced = await syncPushSubscription()
      setPushEnabled(synced)
      if (synced) {
        toast.success(t('settings.pushEnabled'))
      } else {
        toast.error(t('settings.pushSubscribeFailed'))
      }
    } else if (result.reason === 'denied') {
      toast.error(t('settings.pushDenied'))
    } else if (result.reason === 'subscribe-failed') {
      toast.error(t('settings.pushSubscribeFailed'))
    } else {
      toast.error(t('settings.pushUnsupported'))
    }
  }

  const toggleMessageSound = (enabled: boolean) => {
    unlockNotificationAudio()
    setMessageSoundEnabled(enabled)
    if (enabled) {
      playMessageSoundPreview()
    }
  }

  const toggleCallSound = (enabled: boolean) => {
    unlockNotificationAudio()
    setCallSoundEnabled(enabled)
    if (enabled) {
      playCallRingPreview()
    }
  }

  const soundLimitMb = Math.round(CUSTOM_SOUND_MAX_SIZE / (1024 * 1024))

  const uploadSound = async (kind: CustomSoundKind, file: File) => {
    unlockNotificationAudio()
    const result = await saveCustomSoundFile(kind, file)
    if (!result.ok) {
      const message =
        result.reason === 'unsupported'
          ? t('settings.soundUnsupported')
          : result.reason === 'too-large'
            ? t('settings.soundTooLarge').replace('{size}', String(soundLimitMb))
            : t('settings.soundStorageError')
      toast.error(message)
      return
    }

    if (kind === 'message') {
      setMessageSoundName(result.name)
      setMessagePresetId('custom')
      setMessageSoundEnabled(true)
      playMessageSoundPreview()
    } else {
      setCallSoundName(result.name)
      setCallPresetId('custom')
      setCallSoundEnabled(true)
      playCallRingPreview()
    }
    toast.success(t('settings.soundSaved'))
  }

  const handleSoundFileChange = (
    kind: CustomSoundKind,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    void uploadSound(kind, file)
  }

  const resetSound = (kind: CustomSoundKind) => {
    clearCustomSound(kind)
    if (kind === 'message') {
      setMessageSoundName('')
      setMessagePresetId(loadSoundPresetId('message'))
      if (messageSoundEnabled) playMessageSoundPreview()
    } else {
      setCallSoundName('')
      setCallPresetId(loadSoundPresetId('call'))
      if (callSoundEnabled) playCallRingPreview()
    }
    toast.success(t('settings.soundResetDone'))
  }

  const selectPreset = (kind: CustomSoundKind, id: string) => {
    saveSoundPresetId(kind, id)
    if (kind === 'message') {
      setMessageSoundName('')
      setMessagePresetId(id)
      setMessageSoundEnabled(true)
      playMessageSoundPreview()
    } else {
      setCallSoundName('')
      setCallPresetId(id)
      setCallSoundEnabled(true)
      playCallRingPreview()
    }
    toast.success(t('settings.soundSaved'))
  }

  const resolvedMessageLabel = (() => {
    const r = getResolvedSound('message')
    if (r.mode === 'custom') return r.name
    if (r.preset) return iosSoundLabel(r.preset, lang)
    return t('settings.soundDefault')
  })()

  const resolvedCallLabel = (() => {
    const r = getResolvedSound('call')
    if (r.mode === 'custom') return r.name
    if (r.preset) return iosSoundLabel(r.preset, lang)
    return t('settings.soundDefault')
  })()

  const pushStatusText = (() => {
    if (!isWebPushSupported()) return t('settings.pushUnsupported')
    const iosBlock = getIosPushBlockReason()
    if (iosBlock === 'ios-home-screen') return t('settings.pushIosHomeScreen')
    if (iosBlock === 'ios-version') return t('settings.pushIosVersion')
    if (getPushPermission() === 'denied') return t('settings.pushDenied')
    if (pushEnabled) return t('settings.pushEnabled')
    return t('settings.pushAvailable')
  })()

  const pageTitles: Record<SettingsPage, string> = {
    main: t('settings.title'),
    account: t('settings.account'),
    notifications: t('settings.notifications'),
    'sound-message': t('settings.messageSound'),
    'sound-call': t('settings.callRingtone'),
    privacy: t('settings.privacy'),
    appearance: t('settings.appearance'),
    language: t('settings.language'),
    premium: t('settings.premiumSection'),
    data: t('settings.data'),
    bots: t('settings.bots'),
  }

  const currentLangLabel = languages.find((l) => l.code === lang)?.label

  const handleLogout = async () => {
    if (!window.confirm(lang === 'ru' ? 'Выйти из аккаунта?' : 'Log out of this account?')) return
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      /* still reload to clear local session UI */
    }
    window.location.href = '/'
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'max-w-md gap-0 overflow-x-clip p-0 safe-top-min safe-bottom-min',
          // Full-bleed Telegram settings on mobile — MUST reset Dialog's 50%/translate centering
          'max-xl:!inset-0 max-xl:!left-0 max-xl:!top-0 max-xl:!right-0 max-xl:!bottom-0',
          'max-xl:!h-[100dvh] max-xl:!max-h-[100dvh] max-xl:!w-full max-xl:!max-w-none',
          'max-xl:!translate-x-0 max-xl:!translate-y-0 max-xl:!rounded-none max-xl:!border-0',
          'max-xl:flex max-xl:flex-col max-xl:gap-0',
        )}
      >
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="flex items-center gap-1.5">
            {page !== 'main' && (
              <button
                type="button"
                onClick={() =>
                  setPage(page === 'sound-message' || page === 'sound-call' ? 'notifications' : 'main')
                }
                className="-ml-1 flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-muted"
                title={t('settings.back')}
                aria-label={t('settings.back')}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <span className="min-w-0 flex-1 truncate">{pageTitles[page]}</span>
            {/* Close (Telegram-style X) */}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-muted"
              title={t('misc.close')}
              aria-label={t('misc.close')}
            >
              <X className="h-4 w-4" />
            </button>
            {/* Telegram Android/Desktop: Settings → ⋮ → Log out */}
            {page === 'main' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-muted"
                    title={lang === 'ru' ? 'Ещё' : 'More'}
                    aria-label={lang === 'ru' ? 'Ещё' : 'More'}
                  >
                    <EllipsisVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[10rem]">
                  <DropdownMenuItem
                    className="gap-2 text-[#e53935] focus:text-[#e53935]"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4" />
                    {t('sidebar.logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </DialogTitle>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={handleAvatarPick}
          className="hidden"
        />
        <input
          ref={messageSoundInputRef}
          type="file"
          accept={CUSTOM_SOUND_ACCEPT}
          onChange={(event) => handleSoundFileChange('message', event)}
          className="hidden"
        />
        <input
          ref={callSoundInputRef}
          type="file"
          accept={CUSTOM_SOUND_ACCEPT}
          onChange={(event) => handleSoundFileChange('call', event)}
          className="hidden"
        />

        <div className="max-h-[75vh] overflow-y-auto overflow-x-hidden p-4 max-xl:max-h-none max-xl:min-h-0 max-xl:flex-1">
          <motion.div
            key={page}
            initial={{ opacity: 0, x: page === 'main' ? -24 : 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            {page === 'main' && (
              <>
                {/* Profile header — tap opens public profile wall */}
                <div className="mb-3 flex flex-col items-center gap-3 pb-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenMyProfile) {
                          onOpenChange(false)
                          onOpenMyProfile()
                        } else {
                          setPage('account')
                        }
                      }}
                      className="rounded-full transition hover:opacity-90"
                      title={t('profile.myProfile')}
                    >
                      <Avatar
                        name={currentUser?.name || '?'}
                        color={currentUser?.avatarColor || avatarColor}
                        imageUrl={currentUser?.avatarUrl || null}
                        size="xl"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingAvatar}
                      className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-[#3390ec] text-white shadow-md transition hover:bg-[#2b82d9] disabled:opacity-50"
                      title={t('settings.changePhoto')}
                    >
                      {uploadingAvatar ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Camera className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenMyProfile) {
                        onOpenChange(false)
                        onOpenMyProfile()
                      } else {
                        setPage('account')
                      }
                    }}
                    className="text-center transition hover:opacity-90"
                  >
                    <p className="flex items-center justify-center gap-1 text-base font-semibold">
                      {currentUser?.name}
                      {currentUser?.emojiStatus && (
                        <EmojiStatusBadge emojiStatus={currentUser.emojiStatus} size="md" />
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">@{currentUser?.username}</p>
                    <p className="mt-1 text-[11px] font-medium text-[#3390ec]">
                      {t('profile.myProfile')}
                    </p>
                  </button>
                </div>

                {/* Telegram-style menu */}
                <div className="space-y-0.5">
                  {onOpenMyProfile && (
                    <MenuRow
                      icon={<Sparkles className="h-5 w-5" />}
                      color="#3390ec"
                      label={t('profile.myProfile')}
                      hint={t('profile.myProfileHint')}
                      onClick={() => {
                        onOpenChange(false)
                        onOpenMyProfile()
                      }}
                    />
                  )}
                  <MenuRow
                    icon={<User className="h-5 w-5" />}
                    color="#5c6bc0"
                    label={t('settings.account')}
                    hint={t('settings.accountHint')}
                    onClick={() => setPage('account')}
                  />
                  <MenuRow
                    icon={<Bell className="h-5 w-5" />}
                    color="#e53935"
                    label={t('settings.notifications')}
                    hint={t('settings.notificationsHint')}
                    onClick={() => setPage('notifications')}
                  />
                  <MenuRow
                    icon={<Lock className="h-5 w-5" />}
                    color="#43a047"
                    label={t('settings.privacy')}
                    hint={t('settings.privacyHint')}
                    onClick={() => setPage('privacy')}
                  />
                  <MenuRow
                    icon={<Palette className="h-5 w-5" />}
                    color="#8e24aa"
                    label={t('settings.appearance')}
                    hint={t('settings.appearanceHint')}
                    onClick={() => setPage('appearance')}
                  />
                  <MenuRow
                    icon={<Globe className="h-5 w-5" />}
                    color="#fb8c00"
                    label={t('settings.language')}
                    value={currentLangLabel}
                    onClick={() => setPage('language')}
                  />
                  <MenuRow
                    icon={<Crown className="h-5 w-5" />}
                    color="#f4a12e"
                    label={t('settings.premiumSection')}
                    hint={t('settings.premiumSectionHint')}
                    onClick={() => setPage('premium')}
                  />
                  <MenuRow
                    icon={<Database className="h-5 w-5" />}
                    color="#00897b"
                    label={t('settings.data')}
                    hint={t('settings.dataHint')}
                    onClick={() => setPage('data')}
                  />
                  <MenuRow
                    icon={<Bot className="h-5 w-5" />}
                    color="#039be5"
                    label={t('settings.bots')}
                    hint={t('settings.botsHint')}
                    onClick={() => setPage('bots')}
                  />
                  {currentUser?.isAdmin && (
                    <MenuRow
                      icon={<Shield className="h-5 w-5" />}
                      color="#546e7a"
                      label={t('sidebar.admin')}
                      hint={t('sidebar.adminHint')}
                      onClick={() => {
                        onOpenChange(false)
                        router.push('/admin')
                      }}
                    />
                  )}
                </div>

                {/* Telegram iOS-style: Log out at the bottom of Settings */}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-muted/50 px-4 py-3.5 text-sm font-semibold text-[#e53935] transition hover:bg-[#e53935]/10 active:scale-[0.99]"
                >
                  <LogOut className="h-4 w-4" />
                  {t('sidebar.logout')}
                </button>
              </>
            )}

            {page === 'account' && (
              <>
                <div className="mb-4 flex flex-col items-center gap-3">
                  <div className="relative">
                    <Avatar
                      name={name || currentUser?.name || '?'}
                      color={avatarColor}
                      imageUrl={avatarUrl}
                      size="xl"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingAvatar}
                      className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-[#3390ec] text-white shadow-md transition hover:bg-[#2b82d9] disabled:opacity-50"
                      title={t('settings.changePhoto')}
                    >
                      {uploadingAvatar ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Camera className="h-4 w-4" />
                      )}
                    </button>
                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={() => setConfirmRemovePhoto(true)}
                        className="absolute bottom-0 left-0 flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white shadow-md transition hover:bg-red-600"
                        title={t('profile.removePhotoAction')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="text-xs text-[#3390ec] hover:underline"
                  >
                    {uploadingAvatar ? t('avatarCrop.saving') : t('settings.changePhoto')}
                  </button>
                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={() => setConfirmRemovePhoto(true)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      {t('profile.removePhotoAction')}
                    </button>
                  )}
                </div>

                <Label className="text-xs">{t('settings.displayName')}</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1"
                  placeholder={t('settings.displayNamePlaceholder')}
                />

                <Label className="mt-4 block text-xs">{t('settings.bio')}</Label>
                <Input
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="mt-1"
                  placeholder={t('settings.bioPlaceholder')}
                />

                <Label className="mt-4 block text-xs">{t('settings.avatarColor')}</Label>
                <div className="mt-2 grid grid-cols-6 gap-2">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setAvatarColor(c)}
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-full transition',
                        avatarColor === c && 'ring-2 ring-foreground ring-offset-2 ring-offset-background',
                      )}
                      style={{ background: c }}
                    >
                      {avatarColor === c && <Check className="h-4 w-4 text-white" />}
                    </button>
                  ))}
                </div>

                <Button
                  onClick={saveProfile}
                  disabled={saving}
                  className="mt-5 w-full bg-[#3390ec] text-white hover:bg-[#2b82d9]"
                >
                  {saving ? t('settings.saving') : t('settings.save')}
                </Button>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-[#e53935] transition hover:bg-[#e53935]/10"
                >
                  <LogOut className="h-4 w-4" />
                  {t('sidebar.logout')}
                </button>
              </>
            )}

            {page === 'notifications' && (
              <div className="space-y-2">
                <p className="px-1 pb-1 text-xs text-muted-foreground">{t('settings.iosSoundsHint')}</p>
                <SoundSettingRow
                  icon={<Bell className="h-4 w-4 text-[#3390ec]" />}
                  label={t('settings.messageSound')}
                  hint={t('settings.messageSoundHint')}
                  enabled={messageSoundEnabled}
                  soundLabel={resolvedMessageLabel}
                  chooseLabel={t('settings.chooseSound')}
                  previewLabel={t('settings.soundPreview')}
                  onEnabledChange={toggleMessageSound}
                  onPreview={playMessageSoundPreview}
                  onChoose={() => setPage('sound-message')}
                />
                <SoundSettingRow
                  icon={<Phone className="h-4 w-4 text-emerald-500" />}
                  label={t('settings.callRingtone')}
                  hint={t('settings.callRingtoneHint')}
                  enabled={callSoundEnabled}
                  soundLabel={resolvedCallLabel}
                  chooseLabel={t('settings.chooseSound')}
                  previewLabel={t('settings.soundPreview')}
                  onEnabledChange={toggleCallSound}
                  onPreview={playCallRingPreview}
                  onChoose={() => setPage('sound-call')}
                />
                <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5">
                  <div className="flex items-center gap-2.5 text-sm">
                    <Shield className="h-4 w-4" />
                    <span>{t('settings.showPreview')}</span>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5">
                  <div className="flex items-center gap-2.5 text-sm">
                    <Bell className="h-4 w-4" />
                    <div>
                      <p>{t('settings.enablePush')}</p>
                      <p className="text-xs text-muted-foreground">{pushStatusText}</p>
                    </div>
                  </div>
                  <Switch
                    checked={pushEnabled}
                    onCheckedChange={togglePush}
                    disabled={!isWebPushSupported() || getPushPermission() === 'denied' || !!getIosPushBlockReason()}
                  />
                </div>
              </div>
            )}

            {page === 'sound-message' && (
              <SoundPickerList
                kind="message"
                lang={lang}
                selectedId={messagePresetId}
                customName={messageSoundName}
                uploadLabel={t('settings.soundUpload')}
                onSelect={(id) => selectPreset('message', id)}
                onUpload={() => messageSoundInputRef.current?.click()}
              />
            )}

            {page === 'sound-call' && (
              <SoundPickerList
                kind="call"
                lang={lang}
                selectedId={callPresetId}
                customName={callSoundName}
                uploadLabel={t('settings.soundUpload')}
                onSelect={(id) => selectPreset('call', id)}
                onUpload={() => callSoundInputRef.current?.click()}
              />
            )}

            {page === 'privacy' && (
              <>
                <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5">
                  <div className="flex items-center gap-2.5 text-sm">
                    <KeyRound className="h-4 w-4 text-[#3390ec]" />
                    <div>
                      <p>Сквозное шифрование (E2EE)</p>
                      <p className="text-xs text-muted-foreground">
                        {e2eeEnabled
                          ? 'Включено — сообщения шифруются на устройстве'
                          : 'Сообщения хранятся в открытом виде'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={e2eeEnabled}
                    onCheckedChange={toggleE2EE}
                    disabled={generating}
                  />
                </div>
                <div className="mt-3">
                  <TwoFactorPanel />
                </div>
              </>
            )}

            {page === 'appearance' && (
              <>
                <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5">
                  <div className="flex items-center gap-2.5 text-sm">
                    {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                    <span>{t('settings.darkTheme')}</span>
                  </div>
                  <Switch
                    checked={theme === 'dark'}
                    onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowWallpaper(true)}
                  className="mt-2 flex w-full items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5 text-sm transition hover:bg-muted"
                >
                  <div className="flex items-center gap-2.5">
                    <ImageIcon className="h-4 w-4" />
                    <span>{t('wallpaper.title')}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{t('wallpaper.globalShort')}</span>
                </button>

                {currentUser && isPremiumActive(currentUser) && (
                  <>
                    <Label className="mt-4 mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('premium.selectTheme')}
                    </Label>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {PREMIUM_THEMES.map((th) => (
                        <button
                          key={th}
                          onClick={() => setPremiumTheme(th)}
                          className={cn(
                            'rounded-xl border px-2 py-2 text-xs font-medium transition',
                            premiumTheme === th
                              ? 'border-[#3390ec] bg-[#3390ec]/10 text-[#3390ec]'
                              : 'border-border hover:bg-muted',
                          )}
                        >
                          {t(`premium.theme.${th}`)}
                        </button>
                      ))}
                    </div>
                    <Button
                      onClick={saveProfile}
                      disabled={saving}
                      className="mt-4 w-full bg-[#3390ec] text-white hover:bg-[#2b82d9]"
                    >
                      {saving ? t('settings.saving') : t('settings.save')}
                    </Button>
                  </>
                )}
              </>
            )}

            {page === 'language' && (
              <div className="space-y-1">
                {languages.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => void applyLanguage(l.code)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition hover:bg-muted',
                      lang === l.code && 'bg-[#3390ec]/10 text-[#3390ec]',
                    )}
                  >
                    <span className="text-lg">{l.flag}</span>
                    {l.label}
                    {lang === l.code && <Check className="ml-auto h-4 w-4" />}
                  </button>
                ))}
              </div>
            )}

            {page === 'premium' && (
              <>
                <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5">
                  <div className="flex items-center gap-2.5 text-sm">
                    <span className="text-lg text-amber-500">₽</span>
                    <div>
                      <p className="font-medium">{currentUser?.coins ?? 0} ₽</p>
                      <p className="text-xs text-muted-foreground">{t('coins.balance')}</p>
                    </div>
                  </div>
                  {onOpenCoins && (
                    <Button variant="outline" size="sm" onClick={onOpenCoins}>
                      {t('coins.transactions')}
                    </Button>
                  )}
                </div>

                <div className="mt-2 flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5">
                  <div className="flex items-center gap-2.5 text-sm">
                    <Crown className="h-4 w-4 text-amber-500" />
                    <div>
                      <p>{t('premium.settings')}</p>
                      <p className="text-xs text-muted-foreground">
                        {currentUser && isPremiumActive(currentUser)
                          ? `${t('premium.active')} · ${t('premium.until')} ${currentUser.premiumUntil ? new Date(currentUser.premiumUntil).toLocaleDateString() : ''}`
                          : t('premium.subtitle')}
                      </p>
                    </div>
                  </div>
                  {onOpenPremium && (
                    <Button
                      size="sm"
                      className="bg-gradient-to-r from-amber-500 to-[#3390ec] text-white"
                      onClick={onOpenPremium}
                    >
                      {currentUser && isPremiumActive(currentUser) ? t('premium.extend') : t('premium.buy')}
                    </Button>
                  )}
                </div>

                {currentUser && isPremiumActive(currentUser) && (
                  <>
                    <Label className="mt-4 mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('emojiStatus.title')}
                    </Label>
                    <p className="mb-2 text-xs text-muted-foreground">{t('premium.emojiStatusHint')}</p>
                    <div className="mb-2 flex items-center gap-2">
                      <EmojiStatusBadge emojiStatus={currentUser.emojiStatus} size="md" />
                      <span className="text-sm text-muted-foreground">{currentUser.name}</span>
                    </div>
                    <EmojiStatusPicker
                      value={currentUser.emojiStatus}
                      autoSave
                      compact
                      onSaved={(id) => {
                        setCurrentUser({ ...currentUser, emojiStatus: id })
                      }}
                    />
                    <div className="mt-2 flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                      <Upload className="h-3.5 w-3.5" />
                      {t('premium.benefitUpload')}: {getUploadLimitMb(true)} МБ
                    </div>
                  </>
                )}

                {/* Creator Premium — fan-funded subscriptions (separate from Aurora Premium) */}
                <button
                  type="button"
                  onClick={() => setShowCreatorPremium(true)}
                  className="mt-2 flex w-full items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5 text-sm transition hover:bg-muted"
                >
                  <div className="flex items-center gap-2.5">
                    <Heart className="h-4 w-4 text-rose-500" />
                    <div className="text-left">
                      <p>{t('premium.manage')}</p>
                      <p className="text-xs text-muted-foreground">{t('premium.tiers')} · {t('premium.subscribers')}</p>
                    </div>
                  </div>
                  <span className="text-xs text-[#3390ec]">{t('shorts.edit')}</span>
                </button>
              </>
            )}

            {page === 'data' && <StorageManager />}

            {page === 'bots' && <BotManager />}
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>

    <AvatarCropDialog
      open={!!cropSrc}
      imageSrc={cropSrc}
      onClose={closeCrop}
      onConfirm={uploadCroppedAvatar}
    />

    <AlertDialog open={confirmRemovePhoto} onOpenChange={setConfirmRemovePhoto}>
      <AlertDialogContent className="max-w-sm gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="relative aspect-square w-full bg-muted">
          {avatarUrl && (
            <img
              src={resolveMediaUrl(avatarUrl)}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
        </div>
        <AlertDialogHeader className="space-y-2 px-5 pt-4 text-left">
          <AlertDialogTitle className="flex items-center gap-2 text-base">
            <Trash2 className="h-5 w-5 text-destructive" />
            {t('profile.removePhotoTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed">
            {t('profile.removePhotoDesc')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 px-5 pb-5 pt-4 sm:flex-col">
          <Button
            type="button"
            disabled={removingPhoto}
            className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={async () => {
              setRemovingPhoto(true)
              try {
                await removeProfileAvatar()
                setAvatarUrl(null)
                if (currentUser) setCurrentUser({ ...currentUser, avatarUrl: null })
                setConfirmRemovePhoto(false)
                toast.success(t('profile.photoRemoved'))
              } catch {
                toast.error(t('misc.error'))
              } finally {
                setRemovingPhoto(false)
              }
            }}
          >
            {removingPhoto ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            {t('profile.removePhotoAction')}
          </Button>
          <AlertDialogCancel className="mt-0 w-full" disabled={removingPhoto}>
            {t('misc.cancel')}
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <ChatWallpaperDialog
      open={showWallpaper}
      onOpenChange={setShowWallpaper}
      scope="global"
    />

    {currentUser && (
      <CreatorPremiumDialog
        open={showCreatorPremium}
        creatorId={currentUser.id}
        onOpenChange={setShowCreatorPremium}
        manageMode
      />
    )}
  </>
  )
}
