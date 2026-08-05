import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  api,
  Category,
  Expense,
  findCategory,
  formatDay,
  formatMoney,
  Me,
  Stats,
} from './api'
import FinancePanel from './Finance'
import SettingsPanel from './Settings'
import Sheet, { useSheetScrollLock } from './Sheet'
import TabBar, { type Tab } from './TabBar'

type Theme = 'dark' | 'light'
type SheetMode = 'expense' | 'categories' | 'category-form' | null

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const THEME_KEY = 'zlatnik-theme'

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

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  const wa = window.Telegram?.WebApp
  if (!wa) return
  const dark = theme === 'dark'
  wa.setHeaderColor?.(dark ? '#0a0c12' : '#ebe2d0')
  wa.setBackgroundColor?.(dark ? '#0a0c12' : '#f3efe6')
}

function initTelegram(theme: Theme) {
  const wa = window.Telegram?.WebApp
  if (!wa) return
  wa.ready()
  wa.expand()
  applyTheme(theme)
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

function loadTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return 'dark'
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => loadTheme())
  const [me, setMe] = useState<Me | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [tab, setTab] = useState<Tab>('home')
  const [sheet, setSheet] = useState<SheetMode>(null)
  const [amount, setAmount] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [editCat, setEditCat] = useState<Category | null>(null)
  const [catName, setCatName] = useState('')
  const [catGlyph, setCatGlyph] = useState('○')
  const [catTone, setCatTone] = useState('tone-other')

  const tones = me?.tones ?? []
  const glyphs = me?.glyphs ?? []
  const week = useMemo(() => last7Series(stats), [stats])
  const maxWeek = Math.max(...week.map((d) => d.total), 1)
  const maxCat = Math.max(...(stats?.byCategory.map((c) => c.total) ?? [1]), 1)
  const grouped = useMemo(() => groupByDay(expenses), [expenses])

  useSheetScrollLock(sheet !== null)

  async function refresh() {
    const [meRes, statsRes, expensesRes] = await Promise.all([
      api.me(),
      api.stats(),
      api.expenses(),
    ])
    setMe(meRes)
    setStats(statsRes)
    setExpenses(expensesRes.items)
    setCategories(meRes.categories)
    if (!categoryName && meRes.categories[0]) {
      setCategoryName(meRes.categories[0].name)
    } else if (
      categoryName &&
      !meRes.categories.some((c) => c.name === categoryName)
    ) {
      setCategoryName(meRes.categories[0]?.name ?? '')
    }
  }

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    initTelegram(theme)
    refresh()
      .catch((err: Error) => {
        setError(
          err.message === 'unauthorized'
            ? 'Откройте Златник из Telegram-бота'
            : err.message,
        )
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 1800)
    return () => window.clearTimeout(t)
  }, [toast])

  function toggleTheme() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
    haptic(false)
  }

  function openExpense(cat?: string) {
    if (cat) setCategoryName(cat)
    else if (!categoryName && categories[0]) setCategoryName(categories[0].name)
    setSheet('expense')
    haptic(false)
  }

  function openCategories() {
    setSheet('categories')
    haptic(false)
  }

  function openCategoryForm(cat?: Category) {
    if (cat) {
      setEditCat(cat)
      setCatName(cat.name)
      setCatGlyph(cat.glyph)
      setCatTone(cat.tone)
    } else {
      setEditCat(null)
      setCatName('')
      setCatGlyph(glyphs[categories.length % Math.max(glyphs.length, 1)] ?? '○')
      setCatTone(tones[categories.length % Math.max(tones.length, 1)] ?? 'tone-other')
    }
    setSheet('category-form')
    haptic(false)
  }

  async function onSubmitExpense(e: FormEvent) {
    e.preventDefault()
    const value = Number(amount.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) {
      setToast('Введите сумму')
      haptic(false)
      return
    }
    if (!categoryName) {
      setToast('Выберите категорию')
      haptic(false)
      return
    }

    setSaving(true)
    try {
      await api.createExpense({
        amount: value,
        category: categoryName,
        note: note.trim(),
      })
      await refresh()
      setAmount('')
      setNote('')
      setSheet(null)
      setToast('Сохранено')
      haptic(true)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Ошибка')
      haptic(false)
    } finally {
      setSaving(false)
    }
  }

  async function onDeleteExpense(id: number) {
    try {
      await api.deleteExpense(id)
      await refresh()
      setToast('Удалено')
      haptic(true)
    } catch {
      setToast('Не удалось удалить')
      haptic(false)
    }
  }

  async function onSubmitCategory(e: FormEvent) {
    e.preventDefault()
    const name = catName.trim()
    if (!name) {
      setToast('Введите название')
      haptic(false)
      return
    }

    setSaving(true)
    try {
      if (editCat) {
        await api.updateCategory(editCat.id, {
          name,
          glyph: catGlyph,
          tone: catTone,
        })
        setToast('Категория обновлена')
      } else {
        await api.createCategory({ name, glyph: catGlyph, tone: catTone })
        setToast('Категория добавлена')
      }
      await refresh()
      setSheet('categories')
      haptic(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка'
      setToast(
        msg === 'duplicate_name'
          ? 'Такая категория уже есть'
          : msg === 'last_category'
            ? 'Нельзя удалить последнюю'
            : msg,
      )
      haptic(false)
    } finally {
      setSaving(false)
    }
  }

  async function onDeleteCategory(cat: Category) {
    if (categories.length <= 1) {
      setToast('Нужна хотя бы одна категория')
      haptic(false)
      return
    }
    try {
      await api.deleteCategory(cat.id)
      await refresh()
      setToast('Категория удалена')
      if (editCat?.id === cat.id) setSheet('categories')
      haptic(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка'
      setToast(msg === 'last_category' ? 'Нужна хотя бы одна категория' : msg)
      haptic(false)
    }
  }

  const initial =
    (me?.firstName?.[0] ?? me?.username?.[0] ?? 'З').toUpperCase()

  if (loading) {
    return (
      <div className="app" data-theme={theme}>
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
              {me?.firstName ? `Привет, ${me.firstName}` : 'Учёт расходов'}
            </div>
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
                <button type="button" className="section-link" onClick={openCategories}>
                  Управление
                </button>
              </div>
              <div className="cats">
                {categories.map((cat) => {
                  const row = stats?.byCategory.find((c) => c.category === cat.name)
                  const total = row?.total ?? 0
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={`cat glass${categoryName === cat.name ? ' active' : ''}`}
                      onClick={() => openExpense(cat.name)}
                    >
                      <div className="cat-top">
                        <span className={`cat-glyph ${cat.tone}`}>{cat.glyph}</span>
                        <span className="cat-name">{cat.name}</span>
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
                        const cat =
                          findCategory(categories, item.category) ??
                          ({
                            name: item.category,
                            glyph: '○',
                            tone: 'tone-other',
                          } as Category)
                        return (
                          <div className="item glass" key={item.id}>
                            <div className={`item-icon ${cat.tone}`}>{cat.glyph}</div>
                            <div className="item-body">
                              <div className="item-title">
                                {item.note || cat.name}
                              </div>
                              <div className="item-sub">{cat.name}</div>
                            </div>
                            <div className="item-actions">
                              <div className="item-amount">
                                −{formatMoney(item.amount)}
                              </div>
                              <button
                                type="button"
                                className="item-del"
                                aria-label="Удалить"
                                onClick={() => onDeleteExpense(item.id)}
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
        ) : tab === 'finance' ? (
          <FinancePanel onToast={setToast} haptic={haptic} />
        ) : tab === 'settings' ? (
          <SettingsPanel
            theme={theme}
            onToggleTheme={toggleTheme}
            firstName={me?.firstName}
            categoriesCount={categories.length}
            categories={categories}
            onOpenCategories={openCategories}
          />
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
                    style={{ height: `${Math.max(6, (d.total / maxWeek) * 48)}px` }}
                    title={formatMoney(d.total)}
                  />
                  <div className="day-label">{d.label}</div>
                </div>
              ))}
            </div>

            <div className="section-head" style={{ marginTop: 14 }}>
              <h2>Топ категорий</h2>
            </div>
            {stats?.byCategory.length ? (
              <div className="list">
                {stats.byCategory.map((row) => {
                  const cat =
                    findCategory(categories, row.category) ??
                    ({
                      name: row.category,
                      glyph: '○',
                      tone: 'tone-other',
                    } as Category)
                  return (
                    <div className="item glass" key={row.category}>
                      <div className={`item-icon ${cat.tone}`}>{cat.glyph}</div>
                      <div className="item-body">
                        <div className="item-title">{cat.name}</div>
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

      <TabBar tab={tab} onChange={setTab} onAdd={() => openExpense()} />

      {sheet === 'expense' && (
        <Sheet
          asForm
          title="Новый расход"
          onClose={() => setSheet(null)}
          onSubmit={onSubmitExpense}
          footer={
            <button className="submit" type="submit" disabled={saving}>
              {saving ? 'Сохраняем…' : 'Сохранить'}
            </button>
          }
        >
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
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`chip glass${categoryName === cat.name ? ' active' : ''}`}
                onClick={() => setCategoryName(cat.name)}
              >
                {cat.name}
              </button>
            ))}
          </div>
          <input
            className="note-field glass"
            placeholder="Комментарий (необязательно)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
          />
        </Sheet>
      )}

      {sheet === 'categories' && (
        <Sheet
          tall
          title="Категории"
          onClose={() => setSheet(null)}
          footer={
            <button
              type="button"
              className="submit"
              onClick={() => openCategoryForm()}
            >
              + Добавить категорию
            </button>
          }
        >
          <div className="list">
            {categories.map((cat) => (
              <div className="item glass" key={cat.id}>
                <div className={`item-icon ${cat.tone}`}>{cat.glyph}</div>
                <div className="item-body">
                  <div className="item-title">{cat.name}</div>
                  <div className="item-sub">нажмите ✎ чтобы изменить</div>
                </div>
                <div className="item-actions">
                  <button
                    type="button"
                    className="item-edit"
                    aria-label="Изменить"
                    onClick={() => openCategoryForm(cat)}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="item-del"
                    aria-label="Удалить"
                    onClick={() => onDeleteCategory(cat)}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Sheet>
      )}

      {sheet === 'category-form' && (
        <Sheet
          tall
          asForm
          title={editCat ? 'Изменить категорию' : 'Новая категория'}
          onClose={() => setSheet('categories')}
          onSubmit={onSubmitCategory}
          footer={
            editCat ? (
              <div className="row-actions">
                <button
                  type="button"
                  className="submit danger"
                  disabled={saving}
                  onClick={() => onDeleteCategory(editCat)}
                >
                  Удалить
                </button>
                <button className="submit" type="submit" disabled={saving}>
                  {saving ? '…' : 'Сохранить'}
                </button>
              </div>
            ) : (
              <button className="submit" type="submit" disabled={saving}>
                {saving ? 'Сохраняем…' : 'Добавить'}
              </button>
            )
          }
        >
          <label className="text-field glass">
            <input
              placeholder="Название"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              maxLength={40}
              autoFocus
            />
          </label>
          <div className="section-head">
            <h2 style={{ fontSize: '0.95rem' }}>Значок</h2>
          </div>
          <div className="glyph-grid">
            {glyphs.map((g) => (
              <button
                key={g}
                type="button"
                className={`glyph-pick glass${catGlyph === g ? ' active' : ''}`}
                onClick={() => setCatGlyph(g)}
              >
                {g}
              </button>
            ))}
          </div>
          <div className="section-head">
            <h2 style={{ fontSize: '0.95rem' }}>Цвет</h2>
          </div>
          <div className="tone-grid">
            {tones.map((t) => (
              <button
                key={t}
                type="button"
                className={`tone-pick ${t}${catTone === t ? ' active' : ''}`}
                onClick={() => setCatTone(t)}
                aria-label={t}
              />
            ))}
          </div>
        </Sheet>
      )}
    </div>
  )
}
