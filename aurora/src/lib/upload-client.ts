/** Client-side upload helper shared by chat, gallery, stories, wall, etc. */

export type UploadResponse = {
  url: string
  name: string
  type: string
  size: number
  isImage?: boolean
  isVoice?: boolean
  isVideo?: boolean
}

type Translate = (key: string) => string

function toUploadFile(file: File | Blob, filename?: string): File {
  if (typeof File !== 'undefined' && file instanceof File) return file
  const name = filename || `upload-${Date.now()}.bin`
  const type = (file as Blob).type || 'application/octet-stream'
  return new File([file], name, { type })
}

/**
 * POST /api/uploads with retries — survives mid-deploy chunk errors
 * and empty/non-JSON error bodies from proxies.
 * Does not retry client/server permanent failures (4xx except 408/429, and 502).
 */
export async function uploadFileWithRetry(
  file: File | Blob,
  t: Translate,
  attempts = 3,
  filename?: string,
): Promise<UploadResponse> {
  const uploadFile = toUploadFile(file, filename)
  if (!uploadFile.size) {
    throw new Error(t('composer.errorUploadFailed'))
  }

  let lastError: Error | null = null
  for (let i = 0; i < attempts; i++) {
    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      const res = await fetch('/api/uploads', { method: 'POST', body: formData })
      const data = (await res.json().catch(() => ({}))) as UploadResponse & { error?: string }
      if (!res.ok) {
        const err = new Error(data.error || t('composer.errorUploadFailed'))
        const permanent =
          (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) ||
          res.status === 502
        if (permanent) throw err
        lastError = err
        if (i < attempts - 1) {
          await new Promise((r) => setTimeout(r, 400 * (i + 1)))
          continue
        }
        throw err
      }
      if (!data.url) {
        throw new Error(t('composer.errorUploadFailed'))
      }
      return data
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(t('composer.errorUpload'))
      // Permanent API errors already thrown above; network/parse errors may retry.
      if (i < attempts - 1 && !(err instanceof Error && /обработать голосовое|Не удалось обработать/.test(err.message))) {
        await new Promise((r) => setTimeout(r, 400 * (i + 1)))
        continue
      }
      throw lastError
    }
  }
  throw lastError || new Error(t('composer.errorUpload'))
}
