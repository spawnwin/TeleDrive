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

function isRetryableStatus(status: number): boolean {
  if (status === 408 || status === 429) return true
  if (status >= 500 && status !== 502) return true
  return false
}

/**
 * POST /api/uploads with retries — survives mid-deploy chunk errors
 * and empty/non-JSON error bodies from proxies.
 * Does not retry permanent 4xx or 502 (e.g. voice transcode failure).
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
        if (!isRetryableStatus(res.status) || i === attempts - 1) throw err
        lastError = err
        await new Promise((r) => setTimeout(r, 400 * (i + 1)))
        continue
      }
      if (!data.url) {
        throw new Error(t('composer.errorUploadFailed'))
      }
      return data
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(t('composer.errorUpload'))
      // Don't retry permanent Error thrown from !res.ok above on last path —
      // network failures still retry.
      const msg = lastError.message || ''
      const permanent =
        /обработать голосовое|Не удалось обработать|слишком большой|Не авторизован|Недопустимое/.test(
          msg,
        )
      if (permanent || i === attempts - 1) throw lastError
      await new Promise((r) => setTimeout(r, 400 * (i + 1)))
    }
  }
  throw lastError || new Error(t('composer.errorUpload'))
}
