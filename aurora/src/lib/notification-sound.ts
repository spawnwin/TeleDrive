import {
  DEFAULT_CALL_PRESET_ID,
  DEFAULT_MESSAGE_PRESET_ID,
  getIosSoundById,
  type IosAlertSound,
} from '@/lib/ios-alert-sounds'

const LEGACY_SOUND_ENABLED_KEY = 'aurora-notification-sound'
const MESSAGE_SOUND_ENABLED_KEY = 'aurora-message-sound-enabled'
const CALL_SOUND_ENABLED_KEY = 'aurora-call-sound-enabled'
const DEFAULT_RING_SRC = '/sounds/call-ring.wav'
const MESSAGE_SOUND_SRC_KEY = 'aurora-message-sound-src'
const MESSAGE_SOUND_NAME_KEY = 'aurora-message-sound-name'
const CALL_SOUND_SRC_KEY = 'aurora-call-sound-src'
const CALL_SOUND_NAME_KEY = 'aurora-call-sound-name'
const MESSAGE_PRESET_KEY = 'aurora-message-sound-preset'
const CALL_PRESET_KEY = 'aurora-call-sound-preset'

export const CUSTOM_SOUND_ACCEPT = 'audio/*,.mp3,.wav,.ogg,.m4a,.aac,.webm'
export const CUSTOM_SOUND_MAX_SIZE = 2 * 1024 * 1024

export type CustomSoundKind = 'message' | 'call'

export interface CustomSoundMeta {
  name: string
  src: string
}

let audioContext: AudioContext | null = null
let callRingTimer: ReturnType<typeof setInterval> | null = null
let callRingNodes: OscillatorNode[] = []
let ringAudio: HTMLAudioElement | null = null
let ringAudioSrc = ''
let ringWarm = false
let activeRingCallId: string | null = null
let ringSession = 0
let ringbackTimer: ReturnType<typeof setInterval> | null = null
let ringbackNodes: OscillatorNode[] = []
let previewAudio: HTMLAudioElement | null = null

/** Закрыть push-уведомления о звонке (на устройстве). */
export async function dismissCallNotifications(callId?: string): Promise<void> {
  if (!callId || typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    const notifications = await reg.getNotifications()
    const prefix = `aurora-call-${callId}`
    for (const n of notifications) {
      if ((n.tag || '').startsWith(prefix)) n.close()
    }
  } catch {
    // ignore
  }
}

function loadBooleanPreference(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  try {
    const v = localStorage.getItem(key)
    if (v === null) return fallback
    return v === '1'
  } catch {
    return fallback
  }
}

function saveBooleanPreference(key: string, enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, enabled ? '1' : '0')
  } catch {
    // ignore
  }
}

function loadLegacyNotificationSoundPreference(): boolean {
  return loadBooleanPreference(LEGACY_SOUND_ENABLED_KEY, true)
}

export function loadMessageSoundPreference(): boolean {
  return loadBooleanPreference(MESSAGE_SOUND_ENABLED_KEY, loadLegacyNotificationSoundPreference())
}

export function saveMessageSoundPreference(enabled: boolean): void {
  saveBooleanPreference(MESSAGE_SOUND_ENABLED_KEY, enabled)
  saveBooleanPreference(LEGACY_SOUND_ENABLED_KEY, enabled)
}

export function loadCallSoundPreference(): boolean {
  return loadBooleanPreference(CALL_SOUND_ENABLED_KEY, loadLegacyNotificationSoundPreference())
}

export function saveCallSoundPreference(enabled: boolean): void {
  saveBooleanPreference(CALL_SOUND_ENABLED_KEY, enabled)
}

/** Backward-compatible name: message notification sound preference. */
export function loadNotificationSoundPreference(): boolean {
  return loadMessageSoundPreference()
}

/** Backward-compatible setter: toggles both messages and calls. */
export function saveNotificationSoundPreference(enabled: boolean): void {
  saveMessageSoundPreference(enabled)
  saveCallSoundPreference(enabled)
}

function customSoundKeys(kind: CustomSoundKind) {
  return kind === 'message'
    ? { src: MESSAGE_SOUND_SRC_KEY, name: MESSAGE_SOUND_NAME_KEY }
    : { src: CALL_SOUND_SRC_KEY, name: CALL_SOUND_NAME_KEY }
}

export function loadCustomSound(kind: CustomSoundKind): CustomSoundMeta | null {
  if (typeof window === 'undefined') return null
  try {
    const keys = customSoundKeys(kind)
    const src = localStorage.getItem(keys.src)
    if (!src) return null
    return {
      src,
      name: localStorage.getItem(keys.name) || 'custom sound',
    }
  } catch {
    return null
  }
}

export function clearCustomSound(kind: CustomSoundKind): void {
  if (typeof window === 'undefined') return
  try {
    const keys = customSoundKeys(kind)
    localStorage.removeItem(keys.src)
    localStorage.removeItem(keys.name)
    const preset = localStorage.getItem(presetKey(kind))
    if (preset === 'custom' || !preset) {
      localStorage.setItem(
        presetKey(kind),
        kind === 'message' ? DEFAULT_MESSAGE_PRESET_ID : DEFAULT_CALL_PRESET_ID,
      )
    }
    if (kind === 'call' && ringAudio) {
      ringAudio.pause()
      ringAudio.currentTime = 0
      ringAudioSrc = getCallRingSrc()
      ringAudio.src = ringAudioSrc
      ringAudio.load()
    }
  } catch {
    // ignore
  }
}


export type SoundPresetChoice = 'default' | 'custom' | string // ios sound id

function presetKey(kind: CustomSoundKind) {
  return kind === 'message' ? MESSAGE_PRESET_KEY : CALL_PRESET_KEY
}

export function loadSoundPresetId(kind: CustomSoundKind): string {
  if (typeof window === 'undefined') {
    return kind === 'message' ? DEFAULT_MESSAGE_PRESET_ID : DEFAULT_CALL_PRESET_ID
  }
  try {
    // Custom upload takes priority
    if (loadCustomSound(kind)) return 'custom'
    const v = localStorage.getItem(presetKey(kind))
    if (v && (v === 'default' || getIosSoundById(v))) return v
    return kind === 'message' ? DEFAULT_MESSAGE_PRESET_ID : DEFAULT_CALL_PRESET_ID
  } catch {
    return kind === 'message' ? DEFAULT_MESSAGE_PRESET_ID : DEFAULT_CALL_PRESET_ID
  }
}

export function saveSoundPresetId(kind: CustomSoundKind, id: string): void {
  if (typeof window === 'undefined') return
  try {
    // Selecting a built-in preset clears custom upload
    if (id !== 'custom') {
      const keys = customSoundKeys(kind)
      localStorage.removeItem(keys.src)
      localStorage.removeItem(keys.name)
      localStorage.setItem(presetKey(kind), id)
    }
    if (kind === 'call' && ringAudio) {
      ringAudio.pause()
      ringAudio.currentTime = 0
      ringAudioSrc = getCallRingSrc()
      ringAudio.src = ringAudioSrc
      ringAudio.load()
    }
  } catch {
    // ignore
  }
}

export function getResolvedSound(kind: CustomSoundKind): {
  mode: 'custom' | 'preset' | 'default'
  name: string
  src: string | null
  preset: IosAlertSound | null
} {
  const custom = loadCustomSound(kind)
  if (custom) {
    return { mode: 'custom', name: custom.name, src: custom.src, preset: null }
  }
  const presetId = loadSoundPresetId(kind)
  if (presetId === 'default') {
    return { mode: 'default', name: 'default', src: null, preset: null }
  }
  const preset = getIosSoundById(presetId)
  if (preset) {
    return { mode: 'preset', name: preset.nameEn, src: preset.src, preset }
  }
  const fallbackId = kind === 'message' ? DEFAULT_MESSAGE_PRESET_ID : DEFAULT_CALL_PRESET_ID
  const fallback = getIosSoundById(fallbackId)
  return {
    mode: fallback ? 'preset' : 'default',
    name: fallback?.nameEn || 'default',
    src: fallback?.src || null,
    preset: fallback,
  }
}

function getMessageSoundSrc(): string | null {
  return getResolvedSound('message').src
}


function soundFileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() || ''
}

function isSupportedSoundFile(file: File): boolean {
  if (file.type.toLowerCase().startsWith('audio/')) return true
  return ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'webm'].includes(soundFileExtension(file.name))
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Invalid sound file'))
    }
    reader.onerror = () => reject(reader.error || new Error('Could not read sound file'))
    reader.readAsDataURL(file)
  })
}

export async function saveCustomSoundFile(
  kind: CustomSoundKind,
  file: File,
): Promise<{ ok: true; name: string } | { ok: false; reason: 'unsupported' | 'too-large' | 'quota' }> {
  if (!isSupportedSoundFile(file)) return { ok: false, reason: 'unsupported' }
  if (file.size > CUSTOM_SOUND_MAX_SIZE) return { ok: false, reason: 'too-large' }
  if (typeof window === 'undefined') return { ok: false, reason: 'quota' }

  try {
    const dataUrl = await readFileAsDataUrl(file)
    const keys = customSoundKeys(kind)
    localStorage.setItem(keys.src, dataUrl)
    localStorage.setItem(keys.name, file.name)
    localStorage.setItem(presetKey(kind), 'custom')
    if (kind === 'call' && ringAudio) {
      ringAudio.pause()
      ringAudio.currentTime = 0
      ringAudioSrc = dataUrl
      ringAudio.src = dataUrl
      ringAudio.load()
    }
    return { ok: true, name: file.name }
  } catch {
    return { ok: false, reason: 'quota' }
  }
}

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function getAudioContext(): AudioContext {
  if (!audioContext) {
    const Ctx =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) throw new Error('AudioContext unavailable')
    audioContext = new Ctx()
  }
  return audioContext
}

function configureInlineAudio(el: HTMLAudioElement) {
  el.setAttribute('playsinline', 'true')
  el.setAttribute('webkit-playsinline', 'true')
  el.preload = 'auto'
}

/** Создаёт <audio> для рингтона — вызывать при первом жесте пользователя. */
export function initCallRingElement(): void {
  if (typeof document === 'undefined') return
  getRingAudio()
}

function getRingAudio(): HTMLAudioElement {
  if (!ringAudio && typeof document !== 'undefined') {
    ringAudio = document.createElement('audio')
    ringAudioSrc = getCallRingSrc()
    ringAudio.src = ringAudioSrc
    ringAudio.loop = true
    ringAudio.volume = 1
    configureInlineAudio(ringAudio)
    ringAudio.style.display = 'none'
    document.body.appendChild(ringAudio)
  } else if (ringAudio) {
    const src = getCallRingSrc()
    if (ringAudioSrc !== src) {
      ringAudio.pause()
      ringAudio.currentTime = 0
      ringAudioSrc = src
      ringAudio.src = src
      ringAudio.load()
    }
  }
  return ringAudio!
}

function getCallRingSrc(): string {
  const resolved = getResolvedSound('call')
  return resolved.src || DEFAULT_RING_SRC
}

/** Resume AudioContext after a user gesture (browser autoplay policy). */
export function unlockNotificationAudio(): void {
  if (typeof window === 'undefined') return
  try {
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }
  } catch {
    // ignore
  }
}

/** Однократный прогрев после жеста — без бесконечного loop. */
export function warmUpCallRing(): void {
  if (typeof window === 'undefined' || ringWarm) return
  unlockNotificationAudio()
  initCallRingElement()
  try {
    const audio = getRingAudio()
    const prev = audio.volume
    audio.volume = 0.001
    void audio
      .play()
      .then(() => {
        ringWarm = true
        setTimeout(() => {
          audio.pause()
          audio.currentTime = 0
          audio.volume = prev
        }, 80)
      })
      .catch(() => {
        audio.volume = prev
      })
  } catch {
    // ignore
  }
}

async function ensureAudioReady(): Promise<void> {
  unlockNotificationAudio()
  initCallRingElement()
  try {
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }
  } catch {
    // ignore
  }
}

function playDefaultMessageSound(): void {
  if (typeof window === 'undefined') return

  try {
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }

    const now = ctx.currentTime
    const master = ctx.createGain()
    master.gain.setValueAtTime(0.3, now)
    master.gain.exponentialRampToValueAtTime(0.001, now + 0.5)
    master.connect(ctx.destination)

    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, start)
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(1, start + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
      osc.connect(gain)
      gain.connect(master)
      osc.start(start)
      osc.stop(start + duration + 0.05)
    }

    playTone(880, now, 0.1)
    playTone(1174.66, now + 0.09, 0.2)
  } catch (e) {
    console.warn('[notification-sound] play failed', e)
  }
}

function stopPreviewAudio() {
  if (!previewAudio) return
  try {
    previewAudio.pause()
    previewAudio.currentTime = 0
    previewAudio.remove()
  } catch {
    // ignore
  }
  previewAudio = null
}

async function playAudioOnce(src: string, maxMs = 2000): Promise<boolean> {
  if (typeof document === 'undefined') return false
  try {
    stopPreviewAudio()
    const audio = document.createElement('audio')
    audio.src = src
    audio.volume = 1
    configureInlineAudio(audio)
    document.body.appendChild(audio)
    previewAudio = audio
    await audio.play()
    const cleanup = () => {
      if (previewAudio === audio) stopPreviewAudio()
    }
    audio.addEventListener('ended', cleanup, { once: true })
    setTimeout(cleanup, maxMs)
    return true
  } catch (e) {
    console.warn('[notification-sound] custom sound play failed', e)
    stopPreviewAudio()
    return false
  }
}

/** Short chime for incoming messages. Uses custom sound when configured. */
export function playNotificationSound(): void {
  if (!loadMessageSoundPreference()) return
  const resolved = getResolvedSound('message')
  if (!resolved.src) {
    playDefaultMessageSound()
    return
  }
  void playAudioOnce(resolved.src).then((ok) => {
    if (!ok) playDefaultMessageSound()
  })
}

export function playMessageSoundPreview(): void {
  unlockNotificationAudio()
  const resolved = getResolvedSound('message')
  if (!resolved.src) {
    playDefaultMessageSound()
    return
  }
  void playAudioOnce(resolved.src, 2500).then((ok) => {
    if (!ok) playDefaultMessageSound()
  })
}

/** Preview any absolute/public sound URL (picker UI). */
export function playSoundUrlPreview(src: string, maxMs = 2500): void {
  unlockNotificationAudio()
  void playAudioOnce(src, maxMs)
}


function stopCallRingNodes() {
  for (const node of callRingNodes) {
    try {
      node.stop()
      node.disconnect()
    } catch {
      // already stopped
    }
  }
  callRingNodes = []
}

function stopRingAudio() {
  if (ringAudio) {
    ringAudio.pause()
    ringAudio.currentTime = 0
  }
}

/** Web Audio fallback — если <audio> заблокирован autoplay. */
function playCallRingBurst(): void {
  if (!loadCallSoundPreference()) return
  if (typeof window === 'undefined') return

  try {
    const ctx = getAudioContext()
    stopCallRingNodes()

    const now = ctx.currentTime
    const master = ctx.createGain()
    master.gain.setValueAtTime(0.95, now)
    master.gain.exponentialRampToValueAtTime(0.001, now + 1.05)
    master.connect(ctx.destination)

    for (const freq of [425, 480]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.setValueAtTime(freq, now)
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.7, now + 0.02)
      gain.gain.setValueAtTime(0.7, now + 0.95)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.05)
      osc.connect(gain)
      gain.connect(master)
      osc.start(now)
      osc.stop(now + 1.1)
      callRingNodes.push(osc)
    }

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([400, 200, 400, 600])
    }
  } catch (e) {
    console.warn('[notification-sound] call ring burst failed', e)
  }
}

async function playRingAudioLoop(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const audio = getRingAudio()
    ringAudioSrc = getCallRingSrc()
    audio.src = ringAudioSrc
    audio.volume = 1
    audio.currentTime = 0
    await audio.play()
    return true
  } catch (e) {
    console.warn('[notification-sound] ring audio play failed', e)
    return false
  }
}

/** Loop incoming call ringtone until stopIncomingCallRing(). */
export function startIncomingCallRing(callId?: string): void {
  if (!loadCallSoundPreference()) return
  if (callId) activeRingCallId = callId
  stopIncomingCallRing(false)
  const session = ++ringSession

  void (async () => {
    await ensureAudioReady()
    if (session !== ringSession) return
    const ok = await playRingAudioLoop()
    if (session !== ringSession) return
    if (!ok) {
      playCallRingBurst()
      callRingTimer = setInterval(() => {
        if (session !== ringSession) return
        void ensureAudioReady().then(() => playCallRingBurst())
      }, 2800)
    }
  })()
}

/** Входящий звонок: in-app рингтон только когда приложение на экране. */
export function alertIncomingCall(
  fromName: string,
  callType: 'audio' | 'video' = 'audio',
  callId?: string,
): void {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
  void ensureAudioReady().then(() => startIncomingCallRing(callId))

  if (typeof window === 'undefined') return
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible' && isIosDevice()) return

  try {
    const body = callType === 'video' ? 'Входящий видеозвонок' : 'Входящий звонок'
    const n = new Notification(fromName, {
      body,
      icon: '/apple-touch-icon.png',
      tag: callId ? `aurora-incoming-call-${callId}` : 'aurora-incoming-call',
      requireInteraction: true,
      silent: false,
    })
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    // ignore
  }
}

export function stopIncomingCallRing(clearCallId = true): void {
  ringSession += 1
  if (callRingTimer) {
    clearInterval(callRingTimer)
    callRingTimer = null
  }
  stopRingAudio()
  stopCallRingNodes()
  const endedCallId = clearCallId ? activeRingCallId : null
  if (clearCallId) activeRingCallId = null
  if (endedCallId) void dismissCallNotifications(endedCallId)
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(0)
  }
}

export function getActiveRingCallId(): string | null {
  return activeRingCallId
}

function playRingbackBurst(): void {
  if (typeof window === 'undefined') return
  try {
    const ctx = getAudioContext()
    const now = ctx.currentTime
    const master = ctx.createGain()
    master.gain.setValueAtTime(0.5, now)
    master.connect(ctx.destination)

    // European-style ringback: a single 425 Hz tone, ~1s on.
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(425, now)
    osc.connect(master)
    osc.start(now)
    osc.stop(now + 1)
    master.gain.setValueAtTime(0.5, now + 0.95)
    master.gain.exponentialRampToValueAtTime(0.001, now + 1)
    ringbackNodes.push(osc)
  } catch (e) {
    console.warn('[notification-sound] ringback burst failed', e)
  }
}

/** Ringback tone heard by the caller while the callee's phone is ringing. */
export function startOutgoingRingback(): void {
  if (!loadCallSoundPreference()) return
  stopOutgoingRingback()
  void (async () => {
    await ensureAudioReady()
    playRingbackBurst()
    ringbackTimer = setInterval(playRingbackBurst, 4000)
  })()
}

export function stopOutgoingRingback(): void {
  if (ringbackTimer) {
    clearInterval(ringbackTimer)
    ringbackTimer = null
  }
  for (const node of ringbackNodes) {
    try {
      node.stop()
      node.disconnect()
    } catch {
      // already stopped
    }
  }
  ringbackNodes = []
}

/** Повторная попытка при возврате в приложение (входящий звонок ещё активен). */
export function retryIncomingCallRingIfNeeded(isIncoming: boolean, callId?: string): void {
  if (!isIncoming) return
  void ensureAudioReady().then(() => startIncomingCallRing(callId))
}

export function playCallRingPreview(): void {
  if (!loadCallSoundPreference()) return
  void (async () => {
    await ensureAudioReady()
    const ok = await playAudioOnce(getCallRingSrc(), 2500)
    if (!ok) playCallRingBurst()
  })()
}
