export type Expense = {
  id: number
  user_id: string
  amount: number
  category: string
  note: string
  spent_at: string
  created_at: string
}

export type Category = {
  id: number
  user_id: string
  name: string
  glyph: string
  tone: string
  sort_order: number
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
  isAdmin?: boolean
  categories: Category[]
  tones: string[]
  glyphs: string[]
}

export type AdminOverview = {
  users: number
  expenseTotal: number
  expenseMonth: number
  expenseToday: number
  mortgageDebt: number
  mortgageMonthly: number
  depositTotal: number
  depositPayout: number
}

export type AdminUserRow = {
  id: string
  username: string | null
  firstName: string | null
  lastName: string | null
  createdAt: string
  expenseCount: number
  expenseTotal: number
  expenseMonth: number
  expenseToday: number
  mortgageCount: number
  mortgageDebt: number
  mortgageMonthly: number
  depositCount: number
  depositTotal: number
  depositPayout: number
  depositProfit: number
}

export type AdminUserDetail = {
  user: {
    id: string
    username: string | null
    firstName: string | null
    lastName: string | null
    createdAt: string
  }
  stats: Stats
  byCategoryAll: Array<{ category: string; total: number; count: number }>
  expenses: Expense[]
  mortgages: Mortgage[]
  deposits: Deposit[]
}

export type Mortgage = {
  id: number
  user_id: string
  person: string
  bank: string
  title: string
  principal: number
  rate: number
  monthly_payment: number
  payment_day: number
  start_date: string | null
  end_date: string | null
  note: string
  notify_enabled: number
  next_payment_date: string
  months_left: number | null
  remaining_total: number | null
}

export type Deposit = {
  id: number
  user_id: string
  person: string
  bank: string
  amount: number
  rate: number
  start_date: string
  end_date: string
  capitalization: 'none' | 'monthly' | 'daily'
  note: string
  notify_enabled: number
  notify_days_before: number
  payout: number
  profit: number
  days_left: number
  matured: boolean
}

export type FinanceSummary = {
  mortgages: Mortgage[]
  deposits: Deposit[]
  mortgageMonthly: number
  mortgageDebt: number
  depositTotal: number
  depositPayout: number
  depositProfit: number
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
  createCategory: (body: { name: string; glyph?: string; tone?: string }) =>
    request<{ item: Category }>('/api/categories', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateCategory: (
    id: number,
    body: { name?: string; glyph?: string; tone?: string },
  ) =>
    request<{ item: Category }>(`/api/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteCategory: (id: number) =>
    request<{ ok: boolean }>(`/api/categories/${id}`, { method: 'DELETE' }),
  finance: () => request<FinanceSummary>('/api/finance'),
  createMortgage: (body: Record<string, unknown>) =>
    request<{ item: Mortgage }>('/api/mortgages', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateMortgage: (id: number, body: Record<string, unknown>) =>
    request<{ item: Mortgage }>(`/api/mortgages/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteMortgage: (id: number) =>
    request<{ ok: boolean }>(`/api/mortgages/${id}`, { method: 'DELETE' }),
  createDeposit: (body: Record<string, unknown>) =>
    request<{ item: Deposit }>('/api/deposits', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateDeposit: (id: number, body: Record<string, unknown>) =>
    request<{ item: Deposit }>(`/api/deposits/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteDeposit: (id: number) =>
    request<{ ok: boolean }>(`/api/deposits/${id}`, { method: 'DELETE' }),
  adminOverview: () => request<AdminOverview>('/api/admin/overview'),
  adminUsers: () => request<{ items: AdminUserRow[] }>('/api/admin/users'),
  adminUser: (id: string) =>
    request<AdminUserDetail>(`/api/admin/users/${encodeURIComponent(id)}`),
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

export function findCategory(
  categories: Category[],
  name: string,
): Category | undefined {
  return categories.find((c) => c.name.toLowerCase() === name.toLowerCase())
}
