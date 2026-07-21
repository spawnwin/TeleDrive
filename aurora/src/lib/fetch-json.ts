export async function readJsonResponse<T>(res: Response): Promise<T | null> {
  const text = await res.text()
  if (!text.trim()) {
    if (!res.ok) {
      console.error('[fetch]', res.url, res.status, res.statusText)
    }
    return null
  }
  try {
    return JSON.parse(text) as T
  } catch (err) {
    const contentType = res.headers.get('content-type') ?? ''
    console.error('[fetch] invalid JSON', { url: res.url, status: res.status, contentType, err })
    return null
  }
}
