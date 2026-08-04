/** Cross-browser voice recording (MediaRecorder + WAV fallback). */

export const VOICE_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mpeg',
] as const

type LegacyGetUserMedia = (
  constraints: MediaStreamConstraints,
  success: (stream: MediaStream) => void,
  error: (err: Error) => void,
) => void

/** Polyfill navigator.mediaDevices.getUserMedia from legacy prefixed APIs. */
export function ensureMediaDevicesPolyfill(): void {
  if (typeof navigator === 'undefined') return

  const nav = navigator as Navigator & {
    mediaDevices?: MediaDevices
    webkitGetUserMedia?: LegacyGetUserMedia
    mozGetUserMedia?: LegacyGetUserMedia
    msGetUserMedia?: LegacyGetUserMedia
  }

  if (!nav.mediaDevices) {
    nav.mediaDevices = {} as MediaDevices
  }

  if (!nav.mediaDevices.getUserMedia) {
    const legacy =
      nav.webkitGetUserMedia || nav.mozGetUserMedia || nav.msGetUserMedia
    if (legacy) {
      nav.mediaDevices.getUserMedia = (constraints) =>
        new Promise((resolve, reject) => {
          legacy.call(nav, constraints ?? {}, resolve, reject)
        })
    }
  }
}

export function getGetUserMedia():
  | ((constraints: MediaStreamConstraints) => Promise<MediaStream>)
  | null {
  if (typeof navigator === 'undefined') return null
  ensureMediaDevicesPolyfill()
  if (navigator.mediaDevices?.getUserMedia) {
    return navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
  }
  return null
}

export function pickVoiceMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  for (const mime of VOICE_MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime
    } catch {
      // ignore
    }
  }
  return undefined
}

/** MediaRecorder may report video/webm for audio-only streams — normalize for voice uploads. */
export function normalizeVoiceMimeType(mimeType: string, stream: MediaStream): string {
  const mime = mimeType.toLowerCase()
  const audioOnly = stream.getVideoTracks().length === 0
  if (!audioOnly) return mimeType
  if (mime.startsWith('audio/')) return mimeType
  if (mime.includes('webm')) return 'audio/webm'
  if (mime.includes('mp4') || mime.includes('aac')) return 'audio/mp4'
  if (mime.includes('ogg')) return 'audio/ogg'
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'audio/mpeg'
  return 'audio/webm'
}

export function mimeToVoiceExt(mime: string): string {
  const m = mime.toLowerCase()
  if (m.includes('ogg')) return 'ogg'
  if (m.includes('mp4') || m.includes('aac') || m.includes('m4a')) return 'm4a'
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3'
  if (m.includes('wav')) return 'wav'
  return 'webm'
}

export function createVoiceMediaRecorder(stream: MediaStream): {
  recorder: MediaRecorder
  mimeType: string
  ext: string
} {
  const preferred = pickVoiceMimeType()
  let recorder: MediaRecorder
  if (preferred) {
    try {
      recorder = new MediaRecorder(stream, { mimeType: preferred })
    } catch {
      recorder = new MediaRecorder(stream)
    }
  } else {
    recorder = new MediaRecorder(stream)
  }
  const rawMime = recorder.mimeType || preferred || 'audio/webm'
  const mimeType = normalizeVoiceMimeType(rawMime, stream)
  return { recorder, mimeType, ext: mimeToVoiceExt(mimeType) }
}

export function canRecordVoiceInBrowser(): boolean {
  if (typeof window === 'undefined') return false
  if (!window.isSecureContext) return false
  return !!getGetUserMedia()
}

function mergeFloat32(chunks: Float32Array[]): Float32Array {
  const length = chunks.reduce((sum, c) => sum + c.length, 0)
  const out = new Float32Array(length)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

/** Fallback when MediaRecorder is missing (older WebViews). */
export class WavVoiceRecorder {
  private chunks: Float32Array[] = []
  private processor: ScriptProcessorNode | null = null
  private source: MediaStreamAudioSourceNode | null = null

  private constructor(
    private stream: MediaStream,
    private context: AudioContext,
  ) {}

  static async create(stream: MediaStream): Promise<WavVoiceRecorder> {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) throw new Error('AudioContext unsupported')
    const context = new Ctx()
    if (context.state === 'suspended') await context.resume()
    return new WavVoiceRecorder(stream, context)
  }

  start() {
    this.source = this.context.createMediaStreamSource(this.stream)
    this.processor = this.context.createScriptProcessor(4096, 1, 1)
    this.processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0)
      this.chunks.push(new Float32Array(input))
    }
    this.source.connect(this.processor)
    // Keep the graph alive without monitoring into speakers (avoids echo).
    const mute = this.context.createGain()
    mute.gain.value = 0
    this.processor.connect(mute)
    mute.connect(this.context.destination)
  }

  async stop(): Promise<Blob> {
    this.processor?.disconnect()
    this.source?.disconnect()
    const samples = mergeFloat32(this.chunks)
    this.chunks = []
    const blob = encodeWav(samples, this.context.sampleRate)
    this.stream.getTracks().forEach((t) => t.stop())
    await this.context.close().catch(() => {})
    return blob
  }

  async discard(): Promise<void> {
    this.processor?.disconnect()
    this.source?.disconnect()
    this.chunks = []
    this.stream.getTracks().forEach((t) => t.stop())
    await this.context.close().catch(() => {})
  }
}

export async function getAudioDurationSec(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    let done = false

    const finish = (duration: number) => {
      if (done) return
      done = true
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(duration) && duration > 0 ? Math.max(1, Math.round(duration)) : 1)
    }

    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      const d = audio.duration
      if (Number.isFinite(d) && d > 0) {
        finish(d)
        return
      }
      // MediaRecorder WebM files can expose duration as Infinity until the
      // browser seeks near the end. The timeout below keeps unsupported files
      // from hanging forever.
      audio.ontimeupdate = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          finish(audio.duration)
        }
      }
      try {
        audio.currentTime = Number.MAX_SAFE_INTEGER
      } catch {
        finish(1)
      }
    }
    audio.onerror = () => {
      finish(1)
    }
    audio.src = url
    setTimeout(() => finish(1), 3000)
  })
}
