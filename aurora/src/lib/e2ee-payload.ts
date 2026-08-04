/** Detect Aurora E2EE JSON payload stored in message.content. */
export function isE2EEPayload(s: string): boolean {
  // Cheap pre-check: E2EE payloads always start with '{"'
  if (!s || s[0] !== '{') return false
  try {
    const p = JSON.parse(s)
    return p && typeof p.wk === 'string' && typeof p.iv === 'string' && typeof p.ct === 'string'
  } catch {
    return false
  }
}

export function pushBodyForContent(content: string | null | undefined): string {
  if (!content) return 'Новое сообщение'
  if (isE2EEPayload(content)) return '🔒 Зашифрованное сообщение'
  const trimmed = content.trim()
  return trimmed ? trimmed.slice(0, 240) : 'Новое сообщение'
}
