import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  api,
  CATEGORY_META,
  Expense,
  formatDay,
  formatMoney,
  Me,
  Stats,
} from './api'

type Tab = 'home' | 'stats'

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

function pluralRecords(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} запись`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${n} записи`
  }
  return `${n} записей`
}

function haptic(success = true) {
  const h = window.Telegram?.WebApp?.HapticFeedback
  if (!h) return
  if (success) h.notificationOccurred('success')
  else h.impactOccurred('light')
}

function initTelegram() {
  const wa = window.Telegram?.WebApp
  if (!wa) return
  wa.ready()
  wa.expand()
  wa.setHeaderColor?.('#ebe2d0')
  wa.setBackgroundColor?.('#f3efe6')
}

function groupByDay(items: Expense[]) {
  const map = new Map<string, Expense[]>()
  for (const item of items) {
    const key = new Date(item.spent_at).toDateString()
    const list = map.get(key) ?? []
    list.push(item)
    map.set(key, list)
  }
  return [...map.entries()]
}

function last7Series(stats: Stats | null) {
  const result: Array<{ day: string; label: string; total: number }> = []
  const map = new Map((stats?.last7 ?? []).map((d) => [d.day, d.total]))
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setHours(12, 0, 0, 0)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    result.push({
      day: key,
      label: WEEKDAYS[d.getDay()],
      total: map.get(key) ?? 0,
    })
  }
  return result
}

export default function App() {
  const [me, setMe] = useState<Me | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [tab, setTab] = useState<Tab>('home')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('еда')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [synced, setSynced] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const categories = me?.categories ?? Object.keys(CATEGORY_META)
  const week = useMemo(() => last7Series(stats), [stats])
  const maxWeek = Math.max(...week.map((d) => d.total), 1)
  const maxCat = Math.max(...(stats?.byCategory.map((c) => c.total) ?? [1]), 1)
  const grouped = useMemo(() => groupByDay(expenses), [expenses])

  async function refresh() {
    const [meRes, statsRes, expensesRes] = await Promise.all([
      api.me(),
      api.stats(),
      api.expenses(),
    ])
    setMe(meRes)
    setStats(statsRes)
    setExpenses(expensesRes.items)
    setSynced(true)
  }

  useEffect(() => {
    initTelegram()
    refresh()
      .catch((err: Error) => {
        setError(
          err.message === 'unauthorized'
            ? 'Откройте Златник из Telegram-бота'
            : err.message,
        )
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 1800)
    return () => window.clearTimeout(t)
  }, [toast])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const value = Number(amount.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) {
      setToast('Введите сумму')
      haptic(false)
      return
    }

    setSaving(true)
    try {
      await api.createExpense({
        amount: value,
        category,
        note: note.trim(),
      })
      await refresh()
      setAmount('')
      setNote('')
      setSheetOpen(false)
      setToast('Сохранено на сервере')
      haptic(true)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Ошибка')
      haptic(false)
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(id: number) {
    try {
      await api.deleteExpense(id)
      await refresh()
      setToast('Удалено на сервере')
      haptic(true)
    } catch {
      setToast('Не удалось удалить')
      haptic(false)
    }
  }

  const initial =
    (me?.firstName?.[0] ?? me?.username?.[0] ?? 'З').toUpperCase()

  if (loading) {
    return (
      <div className="app">
        <div className="liquid-bg" />
        <div className="status">Загружаем Златник…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="app">
        <div className="liquid-bg" />
        <div className="status error">
          <p>{error}</p>
          <p style={{ marginTop: 12, color: 'var(--muted)', fontSize: '0.9rem' }}>
            Для локального демо задайте <code>ALLOW_DEV_AUTH=1</code>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="liquid-bg">
        <div className="blob blob-a" />
        <div className="blob blob-b" />
        <div className="blob blob-c" />
      </div>

      {toast && <div className="toast glass-strong">{toast}</div>}

      <div className="shell">
        <header className="brand-row rise">
          <div className="brand">
            <div className="brand-mark">Златник</div>
            <div className="brand-sub">
              {me?.firstName ? `Привет, ${me.firstName}` : 'Расходы под контролем'}
            </div>
            {synced && (
              <div className="sync-pill" title="Данные хранятся на сервере">
                <span className="sync-dot" />
                На сервере
              </div>
            )}
          </div>
          <div className="avatar" aria-hidden>
            {initial}
          </div>
        </header>

        <section className="hero rise rise-delay-1">
          <div className="hero-fill" />
          <div className="hero-glass" />
          <div className="hero-sheen" />
          <div className="hero-label">Этот месяц</div>
          <div className="hero-amount">{formatMoney(stats?.monthTotal ?? 0)}</div>
          <div className="hero-meta">
            <div className="meta-chip">
              <span>Сегодня</span>
              <strong>{formatMoney(stats?.todayTotal ?? 0)}</strong>
            </div>
            <div className="meta-chip">
              <span>Записей</span>
              <strong>{expenses.length}</strong>
            </div>
          </div>
        </section>

        {tab === 'home' ? (
          <>
            <section className="section rise rise-delay-2">
              <div className="section-head">
                <h2>Категории</h2>
                <span>месяц</span>
              </div>
              <div className="cats">
                {categories.map((cat) => {
                  const meta = CATEGORY_META[cat] ?? CATEGORY_META.другое
                  const row = stats?.byCategory.find((c) => c.category === cat)
                  const total = row?.total ?? 0
                  return (
                    <button
                      key={cat}
                      type="button"
                      className={`cat glass${category === cat ? ' active' : ''}`}
                      onClick={() => {
                        setCategory(cat)
                        setSheetOpen(true)
                        haptic(false)
                      }}
                    >
                      <div className="cat-top">
                        <span className={`cat-glyph ${meta.tone}`}>{meta.glyph}</span>
                        <span className="cat-name">{meta.label}</span>
                      </div>
                      <div className="cat-sum">{formatMoney(total)}</div>
                      <div className="bar">
                        <i style={{ width: `${(total / maxCat) * 100}%` }} />
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="section rise rise-delay-3">
              <div className="section-head">
                <h2>Недавние</h2>
                <span>{expenses.length ? 'история' : 'пока пусто'}</span>
              </div>
              {expenses.length === 0 ? (
                <div className="empty glass">
                  Нажмите «+», чтобы добавить первую трату
                </div>
              ) : (
                <div className="list">
                  {grouped.map(([day, items]) => (
                    <div key={day}>
                      <div className="section-head" style={{ marginTop: 8 }}>
                        <h2 style={{ fontSize: '1rem' }}>{formatDay(items[0].spent_at)}</h2>
                      </div>
                      {items.map((item) => {
                        const meta =
                          CATEGORY_META[item.category] ?? CATEGORY_META.другое
                        return (
                          <div className="item glass" key={item.id}>
                            <div className={`item-icon ${meta.tone}`}>{meta.glyph}</div>
                            <div className="item-body">
                              <div className="item-title">
                                {item.note || meta.label}
                              </div>
                              <div className="item-sub">{meta.label}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <div className="item-amount">
                                −{formatMoney(item.amount)}
                              </div>
                              <button
                                type="button"
                                className="item-del"
                                aria-label="Удалить"
                                onClick={() => onDelete(item.id)}
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="section rise rise-delay-2">
            <div className="section-head">
              <h2>Неделя</h2>
              <span>7 дней</span>
            </div>
            <div className="week glass">
              {week.map((d) => (
                <div className="day-col" key={d.day}>
                  <div
                    className="day-bar"
                    style={{ height: `${Math.max(8, (d.total / maxWeek) * 72)}px` }}
                    title={formatMoney(d.total)}
                  />
                  <div className="day-label">{d.label}</div>
                </div>
              ))}
            </div>

            <div className="section-head" style={{ marginTop: 22 }}>
              <h2>Топ категорий</h2>
            </div>
            {stats?.byCategory.length ? (
              <div className="list">
                {stats.byCategory.map((row) => {
                  const meta = CATEGORY_META[row.category] ?? CATEGORY_META.другое
                  return (
                    <div className="item glass" key={row.category}>
                      <div className={`item-icon ${meta.tone}`}>{meta.glyph}</div>
                      <div className="item-body">
                        <div className="item-title">{meta.label}</div>
                        <div className="item-sub">{pluralRecords(row.count)}</div>
                      </div>
                      <div className="item-amount">{formatMoney(row.total)}</div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="empty glass">Пока нет данных за месяц</div>
            )}
          </section>
        )}
      </div>

      <nav className="dock glass-strong" aria-label="Навигация">
        <button
          type="button"
          className={tab === 'home' ? 'active' : ''}
          onClick={() => setTab('home')}
        >
          Главная
        </button>
        <button
          type="button"
          className="fab"
          aria-label="Добавить расход"
          onClick={() => {
            setSheetOpen(true)
            haptic(false)
          }}
        >
          +
        </button>
        <button
          type="button"
          className={tab === 'stats' ? 'active' : ''}
          onClick={() => setTab('stats')}
        >
          Сводка
        </button>
      </nav>

      {sheetOpen && (
        <>
          <div
            className="sheet-backdrop"
            onClick={() => setSheetOpen(false)}
            aria-hidden
          />
          <form className="sheet glass-strong" onSubmit={onSubmit}>
            <div className="sheet-handle" />
            <h3>Новый расход</h3>
            <label className="amount-field glass">
              <span>₽</span>
              <input
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </label>
            <div className="chip-row">
              {categories.map((cat) => {
                const meta = CATEGORY_META[cat] ?? CATEGORY_META.другое
                return (
                  <button
                    key={cat}
                    type="button"
                    className={`chip glass${category === cat ? ' active' : ''}`}
                    onClick={() => setCategory(cat)}
                  >
                    {meta.label}
                  </button>
                )
              })}
            </div>
            <input
              className="note-field glass"
              placeholder="Комментарий (необязательно)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
            />
            <button className="submit" type="submit" disabled={saving}>
              {saving ? 'Сохраняем на сервер…' : 'Сохранить на сервер'}
            </button>
          </form>
        </>
      )}
    </div>
  )
}
