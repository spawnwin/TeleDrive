export type Expense = {
  id: number
  user_id: string
  amount: number
  category: string
  note: string
  spent_at: string
  created_at: string
}

export type Stats = {
  monthTotal: number
  todayTotal: number
  byCategory: Array<{ category: string; total: number; count: number }>
  last7: Array<{ day: string; total: number }>
}

export type Me = {
  id: string
  username?: string
  firstName?: string
  lastName?: string
  categories: string[]
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void
        expand: () => void
        close: () => void
        HapticFeedback?: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void
        }
        themeParams?: Record<string, string>
        colorScheme?: 'light' | 'dark'
        initData?: string
        initDataUnsafe?: {
          user?: {
            id: number
            first_name?: string
            last_name?: string
            username?: string
          }
        }
        MainButton?: {
          setText: (text: string) => void
          show: () => void
          hide: () => void
          onClick: (cb: () => void) => void
          offClick: (cb: () => void) => void
        }
        setHeaderColor?: (color: string) => void
        setBackgroundColor?: (color: string) => void
      }
    }
  }
}

function getInitData(): string {
  return window.Telegram?.WebApp?.initData ?? ''
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': getInitData(),
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  me: () => request<Me>('/api/me'),
  expenses: () => request<{ items: Expense[] }>('/api/expenses'),
  stats: () => request<Stats>('/api/stats'),
  createExpense: (body: {
    amount: number
    category: string
    note?: string
    spentAt?: string
  }) =>
    request<{ item: Expense }>('/api/expenses', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteExpense: (id: number) =>
    request<{ ok: boolean }>(`/api/expenses/${id}`, { method: 'DELETE' }),
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value)
}

export function formatDay(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return 'Сегодня'
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера'

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(d)
}

export const CATEGORY_META: Record<
  string,
  { label: string; tone: string; glyph: string }
> = {
  еда: { label: 'Еда', tone: 'tone-food', glyph: '◉' },
  транспорт: { label: 'Транспорт', tone: 'tone-transport', glyph: '◈' },
  дом: { label: 'Дом', tone: 'tone-home', glyph: '▣' },
  покупки: { label: 'Покупки', tone: 'tone-shop', glyph: '◇' },
  здоровье: { label: 'Здоровье', tone: 'tone-health', glyph: '✚' },
  развлечения: { label: 'Развлечения', tone: 'tone-fun', glyph: '✦' },
  связь: { label: 'Связь', tone: 'tone-comm', glyph: '◎' },
  другое: { label: 'Другое', tone: 'tone-other', glyph: '○' },
}
