/** Client-side upload helper shared by chat, gallery, and other pickers. */

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

/**
 * POST /api/uploads with retries — survives mid-deploy chunk errors
 * and empty/non-JSON error bodies from proxies.
 */
export async function uploadFileWithRetry(
  file: File,
  t: Translate,
  attempts = 3,
): Promise<UploadResponse> {
  let lastError: Error | null = null
  for (let i = 0; i < attempts; i++) {
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/uploads', { method: 'POST', body: formData })
      const data = (await res.json().catch(() => ({}))) as UploadResponse & { error?: string }
      if (!res.ok) {
        throw new Error(data.error || t('composer.errorUploadFailed'))
      }
      if (!data.url) {
        throw new Error(t('composer.errorUploadFailed'))
      }
      return data
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(t('composer.errorUpload'))
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 400 * (i + 1)))
      }
    }
  }
  throw lastError || new Error(t('composer.errorUpload'))
}
