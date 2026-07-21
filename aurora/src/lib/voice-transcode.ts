import { execFile } from 'child_process'
import { promisify } from 'util'
import { unlink, stat } from 'fs/promises'
import path from 'path'

const execFileAsync = promisify(execFile)

/** WebM/Ogg Opus is not playable in Safari / iOS — convert to AAC/M4A. */
export function needsVoiceTranscode(mime: string, filename: string): boolean {
  const m = (mime || '').toLowerCase()
  const ext = path.extname(filename).toLowerCase()
  if (['.m4a', '.mp3', '.mp4', '.aac', '.wav'].includes(ext)) return false
  if (
    m.includes('mp4') ||
    m.includes('mpeg') ||
    m.includes('aac') ||
    m.includes('wav') ||
    m === 'audio/x-m4a'
  ) {
    return false
  }
  return (
    ext === '.webm' ||
    ext === '.ogg' ||
    ext === '.oga' ||
    m.includes('webm') ||
    m.includes('ogg')
  )
}

export async function transcodeVoiceToM4a(inputPath: string): Promise<{
  outputPath: string
  mimeType: string
  filename: string
  size: number
} | null> {
  const dir = path.dirname(inputPath)
  const base = path.basename(inputPath, path.extname(inputPath))
  const outputPath = path.join(dir, `${base}.m4a`)
  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        inputPath,
        '-vn',
        '-c:a',
        'aac',
        '-b:a',
        '64k',
        '-movflags',
        '+faststart',
        outputPath,
      ],
      { timeout: 90_000, maxBuffer: 8 * 1024 * 1024 },
    )
    const st = await stat(outputPath)
    if (st.size < 32) {
      await unlink(outputPath).catch(() => {})
      return null
    }
    await unlink(inputPath).catch(() => {})
    return {
      outputPath,
      mimeType: 'audio/mp4',
      filename: `${base}.m4a`,
      size: st.size,
    }
  } catch (err) {
    console.error('[voice-transcode] failed', err)
    await unlink(outputPath).catch(() => {})
    return null
  }
}
