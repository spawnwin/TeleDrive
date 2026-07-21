import path from 'path'

export const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads')

export function resolveUploadFilePath(segments: string[]): string | null {
  if (!segments.length || segments.some((s) => s === '..' || s === '.')) return null
  const filePath = path.normalize(path.join(UPLOADS_DIR, ...segments))
  if (!filePath.startsWith(UPLOADS_DIR)) return null
  return filePath
}
