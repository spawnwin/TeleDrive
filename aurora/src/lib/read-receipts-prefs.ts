const KEY_PREFIX = 'aurora-hide-read-receipts:'

export function loadHideReadReceipts(chatId: string): boolean {
  if (typeof window === 'undefined' || !chatId) return false
  try {
    return localStorage.getItem(`${KEY_PREFIX}${chatId}`) === '1'
  } catch {
    return false
  }
}

export function saveHideReadReceipts(chatId: string, hide: boolean) {
  if (typeof window === 'undefined' || !chatId) return
  try {
    if (hide) localStorage.setItem(`${KEY_PREFIX}${chatId}`, '1')
    else localStorage.removeItem(`${KEY_PREFIX}${chatId}`)
  } catch {
    /* ignore */
  }
}
