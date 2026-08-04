'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  X,
  Signal,
  SignalLow,
  SignalMedium,
  SignalHigh,
  Volume2,
  Volume1,
} from 'lucide-react'
import { Avatar } from '@/components/messenger/avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CallInfo, ConnectionQuality } from '@/hooks/use-webrtc'

type SinkableAudioElement = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>
}

interface CallOverlayProps {
  call: CallInfo | null
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  micEnabled: boolean
  cameraEnabled: boolean
  peerCameraEnabled: boolean
  error: string | null
  connectionQuality: ConnectionQuality
  onAccept: () => void
  onReject: () => void
  onEnd: () => void
  onToggleMic: () => void
  onToggleCamera: () => void
}

const qualityConfig: Record<ConnectionQuality, {
  label: string
  color: string
  bg: string
  Icon: React.ComponentType<{ className?: string }>
}> = {
  excellent: { label: 'Отлично', color: 'text-emerald-400', bg: 'bg-emerald-500/20', Icon: Signal },
  good: { label: 'Хорошо', color: 'text-emerald-400', bg: 'bg-emerald-500/20', Icon: SignalHigh },
  fair: { label: 'Средне', color: 'text-amber-400', bg: 'bg-amber-500/20', Icon: SignalMedium },
  poor: { label: 'Плохо', color: 'text-rose-400', bg: 'bg-rose-500/20', Icon: SignalLow },
  unknown: { label: '', color: '', bg: '', Icon: Signal },
}

export function CallOverlay({
  call,
  localStream,
  remoteStream,
  micEnabled,
  cameraEnabled,
  peerCameraEnabled,
  error,
  connectionQuality,
  onAccept,
  onReject,
  onEnd,
  onToggleMic,
  onToggleCamera,
}: CallOverlayProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  // iOS Safari doesn't implement HTMLMediaElement.setSinkId at all, so there
  // is no real API to pick earpiece vs loudspeaker there. The known working
  // trick: WebKit routes <video> playback through the loudspeaker by default
  // and <audio>-only playback through the earpiece/receiver — so "speaker
  // mode" is simulated by moving the same remote stream from the <audio>
  // element onto this hidden <video> element instead of asking for a device.
  const speakerVideoRef = useRef<HTMLVideoElement>(null)
  const [duration, setDuration] = useState(0)
  // Off by default — a call should start like a normal (quiet) call, with
  // loudspeaker/hands-free mode something the user turns on themselves.
  const [speakerOn, setSpeakerOn] = useState(false)

  // CallOverlay stays mounted for the whole session (see CallManager), so
  // without this, turning speaker on during one call would silently carry
  // over as "already on" into every call after it.
  useEffect(() => {
    setSpeakerOn(false)
    setDuration(0)
  }, [call?.callId])

  const isIncoming = call?.state === 'incoming'
  const isOutgoing = call?.state === 'outgoing'
  const isConnected = call?.state === 'connected'
  const isVideo = call?.type === 'video'
  const remoteAudioTrackCount = remoteStream?.getAudioTracks().length ?? 0

  // srcObject подключаем с учётом момента МОНТИРОВАНИЯ элементов: видео
  // появляется в DOM только когда звонок connected, поэтому эффект зависит
  // и от состояния звонка — иначе элемент монтируется после установки
  // стрима и остаётся чёрным (эффект с deps [stream] не перезапускается).
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream, isConnected, isVideo, cameraEnabled])

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream
    }
  }, [remoteStream, isConnected, isVideo, peerCameraEnabled])

  // Звук собеседника всегда играет через отдельный <audio> ИЛИ через
  // скрытый <video> (см. speakerVideoRef выше) — оба держат один и тот же
  // srcObject, но активен только один из них за раз (см. следующий эффект).
  useEffect(() => {
    if (!remoteStream || !isConnected) return
    // Retry setting srcObject in case the element isn't mounted yet
    const setSrcObject = () => {
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream
      if (speakerVideoRef.current) speakerVideoRef.current.srcObject = remoteStream
    }
    setSrcObject()
    const timer = setTimeout(setSrcObject, 100)
    return () => clearTimeout(timer)
  }, [remoteStream, isConnected, remoteAudioTrackCount])

  // Retry play() with exponential backoff to handle autoplay policy.
  // Uses a ref-based abort flag so stale retry chains from a previous effect
  // run are silently stopped when speakerOn or remoteStream changes.
  const playRetryAbortRef = useRef(0)
  const playWithRetry = async (el: HTMLAudioElement, maxRetries = 5) => {
    const generation = ++playRetryAbortRef.current
    for (let i = 0; i < maxRetries; i++) {
      if (generation !== playRetryAbortRef.current) return // stale chain — abort
      try {
        el.muted = false
        await el.play()
        return
      } catch (e) {
        console.warn(`[audio] play() attempt ${i + 1} failed:`, e)
        if (i < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, 300 * (i + 1)))
        }
      }
    }
    if (generation === playRetryAbortRef.current) {
      console.error('[audio] All play() attempts failed')
    }
  }

  // Переключение звонка между "обычным" (через <audio>) и громкой связью
  // (через скрытый <video>) — см. комментарий у speakerVideoRef выше.
  useEffect(() => {
    if (!isConnected) return
    const audioEl = remoteAudioRef.current
    const videoEl = speakerVideoRef.current
    if (speakerOn) {
      audioEl?.pause()
      if (audioEl) audioEl.muted = true
      if (videoEl) {
        videoEl.muted = false
        void videoEl.play().catch(() => {})
      }
    } else {
      videoEl?.pause()
      if (videoEl) videoEl.muted = true
      if (audioEl) {
        void playWithRetry(audioEl)
      }
    }
  }, [speakerOn, isConnected, remoteStream, remoteAudioTrackCount])

  // Duration timer
  useEffect(() => {
    if (call?.state !== 'connected' || !call.startedAt) return
    const startedAt = call.startedAt
    const interval = setInterval(() => {
      setDuration(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [call?.state, call?.startedAt])

  const toggleSpeaker = async () => {
    const nextOn = !speakerOn
    setSpeakerOn(nextOn)

    // Best-effort extra: on platforms that DO support explicit output
    // selection (Chrome/Android), also try to point at a device labeled
    // "speaker" — harmless no-op everywhere else (notably iOS Safari, where
    // the <audio>/<video> swap above is the only thing that actually works).
    const el = remoteAudioRef.current as SinkableAudioElement | null
    if (el && typeof el.setSinkId === 'function') {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const outputs = devices.filter((d) => d.kind === 'audiooutput')
        const speaker = outputs.find((d) => /speaker|громк/i.test(d.label))
        const earpiece = outputs.find((d) => d.deviceId !== speaker?.deviceId && d.deviceId !== 'default')
        const target = nextOn ? speaker?.deviceId || 'default' : earpiece?.deviceId || 'default'
        await el.setSinkId(target)
      } catch {
        // ignore — the <audio>/<video> swap is the primary mechanism
      }
    }
  }

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  const quality = connectionQuality !== 'unknown' ? qualityConfig[connectionQuality] : null

  // Портал в body: CallOverlay рендерится внутри ChatView, а <main> бывает
  // скрыт (display:none) на узких окнах без открытого чата — fixed-оверлей
  // внутри скрытого родителя не отображается, и входящий звонок не виден.
  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {call && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex flex-col bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 safe-top safe-bottom"
        >
          {/* Звук собеседника: отдельный элемент, работает и в аудио-, и в видеозвонке */}
          {isConnected && <audio ref={remoteAudioRef} playsInline className="hidden" />}
          {/* Скрытый видео-элемент только для режима громкой связи на iOS
              (см. speakerVideoRef выше) — не влияет на видимую картинку звонка. */}
          {isConnected && (
            <video
              ref={speakerVideoRef}
              playsInline
              muted
              className="pointer-events-none fixed h-px w-px opacity-0"
            />
          )}

          {/* Remote video (fills the screen when connected) */}
          {isVideo && isConnected && (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}

          {/* Собеседник выключил камеру — показываем аватар (как в Telegram) */}
          {isVideo && isConnected && !peerCameraEnabled && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900">
              <Avatar
                name={call.peerName}
                color={call.peerAvatarColor || '#7c3aed'}
                imageUrl={call.peerAvatarUrl}
                size="xl"
              />
              <p className="text-sm text-white/60">Камера выключена</p>
            </div>
          )}

          {/* Local video (picture-in-picture) */}
          {isVideo && isConnected && (
            <div className="absolute right-[max(1rem,env(safe-area-inset-right,1rem))] top-20 z-10 h-32 w-24 overflow-hidden rounded-2xl border-2 border-white/20 bg-black shadow-2xl sm:h-40 sm:w-28">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={cn(
                  'h-full w-full object-cover [-webkit-transform:scaleX(-1)] [transform:scaleX(-1)]',
                  !cameraEnabled && 'hidden',
                )}
              />
              {!cameraEnabled && (
                <div className="flex h-full w-full items-center justify-center bg-slate-800">
                  <VideoOff className="h-6 w-6 text-white/50" />
                </div>
              )}
            </div>
          )}

          {/* Quality indicator (top-center, when connected) */}
          {isConnected && quality && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'absolute left-1/2 top-16 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium backdrop-blur',
                quality.bg,
                quality.color,
              )}
            >
              <quality.Icon className="h-3.5 w-3.5" />
              <span>{quality.label}</span>
              <span className="ml-1 tabular-nums text-white/70">{formatDuration(duration)}</span>
            </motion.div>
          )}

          {/* Top: peer info or status */}
          <div className="z-10 flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center text-white">
            {!isConnected ? (
              <>
                <motion.div
                  animate={{ scale: isOutgoing ? [1, 1.05, 1] : 1 }}
                  transition={{ duration: 1.5, repeat: isOutgoing ? Infinity : 0 }}
                >
                  <Avatar
                    name={call.peerName}
                    color={call.peerAvatarColor || '#7c3aed'}
                    imageUrl={call.peerAvatarUrl}
                    size="xl"
                  />
                </motion.div>
                <div>
                  <h2 className="text-2xl font-bold">{call.peerName}</h2>
                  <p className="mt-1 text-sm text-white/60">
                    {isIncoming && 'Входящий звонок...'}
                    {isOutgoing && 'Звоним...'}
                  </p>
                </div>
              </>
            ) : (
              <>
                {!isVideo && (
                  <>
                    <Avatar
                      name={call.peerName}
                      color={call.peerAvatarColor || '#7c3aed'}
                      imageUrl={call.peerAvatarUrl}
                      size="xl"
                    />
                    <h2 className="text-xl font-bold">{call.peerName}</h2>
                  </>
                )}
                {!quality && (
                  <p className="text-sm text-white/70">{formatDuration(duration)}</p>
                )}
              </>
            )}

            {error && (
              <p className="mt-2 rounded-lg bg-rose-500/20 px-3 py-2 text-sm text-rose-300">
                {error}
              </p>
            )}
          </div>

          {/* Bottom: controls */}
          <div className="z-10 flex items-center justify-center gap-4 p-8">
            {isIncoming ? (
              <>
                <Button
                  onClick={onReject}
                  size="icon"
                  className="h-16 w-16 rounded-full bg-rose-500 text-white shadow-lg hover:bg-rose-600"
                >
                  <PhoneOff className="h-7 w-7" />
                </Button>
                <Button
                  onClick={onAccept}
                  size="icon"
                  className="h-16 w-16 rounded-full bg-emerald-500 text-white shadow-lg hover:bg-emerald-600"
                >
                  {isVideo ? <Video className="h-7 w-7" /> : <Phone className="h-7 w-7" />}
                </Button>
              </>
            ) : (
              <>
                {isConnected && (
                  <>
                    <Button
                      onClick={onToggleMic}
                      size="icon"
                      className={cn(
                        'h-14 w-14 rounded-full text-white shadow-lg',
                        micEnabled ? 'bg-white/10 hover:bg-white/20' : 'bg-rose-500 hover:bg-rose-600',
                      )}
                    >
                      {micEnabled ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
                    </Button>
                    {/* Кнопка камеры доступна и в аудиозвонке: включение
                        камеры делает upgrade до видеозвонка (как в Telegram) */}
                    <Button
                      onClick={onToggleCamera}
                      size="icon"
                      title={
                        isVideo
                          ? cameraEnabled
                            ? 'Выключить камеру'
                            : 'Включить камеру'
                          : 'Включить камеру'
                      }
                      className={cn(
                        'h-14 w-14 rounded-full text-white shadow-lg',
                        !isVideo
                          ? 'bg-white/10 hover:bg-emerald-500/30'
                          : cameraEnabled
                            ? 'bg-white/10 hover:bg-white/20'
                            : 'bg-rose-500 hover:bg-rose-600',
                      )}
                    >
                      {!isVideo ? (
                        <Video className="h-6 w-6" />
                      ) : cameraEnabled ? (
                        <Video className="h-6 w-6" />
                      ) : (
                        <VideoOff className="h-6 w-6" />
                      )}
                    </Button>
                    <Button
                      onClick={toggleSpeaker}
                      size="icon"
                      title={speakerOn ? 'Выключить громкую связь' : 'Включить громкую связь'}
                      className={cn(
                        'h-14 w-14 rounded-full text-white shadow-lg',
                        speakerOn ? 'bg-emerald-500/80 hover:bg-emerald-500' : 'bg-white/10 hover:bg-white/20',
                      )}
                    >
                      {speakerOn ? <Volume2 className="h-6 w-6" /> : <Volume1 className="h-6 w-6" />}
                    </Button>
                  </>
                )}
                <Button
                  onClick={onEnd}
                  size="icon"
                  className="h-16 w-16 rounded-full bg-rose-500 text-white shadow-lg hover:bg-rose-600"
                >
                  <PhoneOff className="h-7 w-7" />
                </Button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
