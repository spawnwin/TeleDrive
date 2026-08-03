// Date/time formatting helpers tuned for RU/EN locale.

export function formatChatTime(iso: string | Date, lang: 'ru' | 'en' = 'ru'): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' })
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 7) {
    return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { weekday: 'short' })
  }
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { day: '2-digit', month: '2-digit' })
}

export function formatMessageTime(iso: string | Date, lang: 'ru' | 'en' = 'ru'): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' })
}

export function formatDayDivider(iso: string | Date, lang: 'ru' | 'en' = 'ru'): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (lang === 'ru') {
    if (d.toDateString() === now.toDateString()) return 'Сегодня'
    if (d.toDateString() === yesterday.toDateString()) return 'Вчера'
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  }
  if (d.toDateString() === now.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long' })
}

export function formatLastSeen(
  iso: string | Date | undefined | null,
  online: boolean,
  lang: 'ru' | 'en' = 'ru',
): string {
  if (online) return lang === 'ru' ? 'в сети' : 'online'
  if (!iso) return lang === 'ru' ? 'не в сети' : 'offline'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const now = new Date()
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000)
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US'

  // Just now (within last 60 seconds)
  if (diffSec < 60) {
    return lang === 'ru' ? 'был(а) только что' : 'last seen just now'
  }
  // Within last hour
  if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60)
    return lang === 'ru'
      ? `был(а) ${mins} ${mins === 1 ? 'минуту' : mins < 5 ? 'минуты' : 'минут'} назад`
      : `last seen ${mins} min ago`
  }
  // Within today
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    return lang === 'ru' ? `был(а) в ${time}` : `last seen at ${time}`
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) {
    return lang === 'ru' ? 'был(а) вчера' : 'last seen yesterday'
  }
  const date = d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
  return lang === 'ru' ? `был(а) ${date}` : `last seen ${date}`
}
