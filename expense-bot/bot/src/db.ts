import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '../../data')

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const db = new Database(path.join(dataDir, 'expenses.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    glyph TEXT NOT NULL DEFAULT '○',
    tone TEXT NOT NULL DEFAULT 'tone-other',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, name),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    spent_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_expenses_user_spent
    ON expenses(user_id, spent_at DESC);

  CREATE INDEX IF NOT EXISTS idx_categories_user
    ON categories(user_id, sort_order, id);
`)

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

const DEFAULT_CATEGORIES: Array<{ name: string; glyph: string; tone: string }> = [
  { name: 'Еда', glyph: '◉', tone: 'tone-food' },
  { name: 'Транспорт', glyph: '◈', tone: 'tone-transport' },
  { name: 'Дом', glyph: '▣', tone: 'tone-home' },
  { name: 'Покупки', glyph: '◇', tone: 'tone-shop' },
  { name: 'Здоровье', glyph: '✚', tone: 'tone-health' },
  { name: 'Развлечения', glyph: '✦', tone: 'tone-fun' },
  { name: 'Связь', glyph: '◎', tone: 'tone-comm' },
  { name: 'Другое', glyph: '○', tone: 'tone-other' },
]

const TONES = [
  'tone-food',
  'tone-transport',
  'tone-home',
  'tone-shop',
  'tone-health',
  'tone-fun',
  'tone-comm',
  'tone-other',
]

const GLYPHS = ['◉', '◈', '▣', '◇', '✚', '✦', '◎', '○', '△', '▽', '⬡', '⬢']

export function upsertUser(user: {
  id: string
  username?: string
  first_name?: string
  last_name?: string
}) {
  db.prepare(`
    INSERT INTO users (id, username, first_name, last_name)
    VALUES (@id, @username, @first_name, @last_name)
    ON CONFLICT(id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name,
      last_name = excluded.last_name
  `).run({
    id: user.id,
    username: user.username ?? null,
    first_name: user.first_name ?? null,
    last_name: user.last_name ?? null,
  })
  ensureDefaultCategories(user.id)
}

export function ensureDefaultCategories(userId: string) {
  migrateLegacyCategoryNames(userId)

  const count = (
    db.prepare('SELECT COUNT(*) AS c FROM categories WHERE user_id = ?').get(userId) as {
      c: number
    }
  ).c
  if (count > 0) return

  const insert = db.prepare(`
    INSERT INTO categories (user_id, name, glyph, tone, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `)
  const tx = db.transaction(() => {
    DEFAULT_CATEGORIES.forEach((cat, i) => {
      insert.run(userId, cat.name, cat.glyph, cat.tone, i)
    })
  })
  tx()
}

const LEGACY_NAMES: Record<string, string> = {
  еда: 'Еда',
  транспорт: 'Транспорт',
  дом: 'Дом',
  покупки: 'Покупки',
  здоровье: 'Здоровье',
  развлечения: 'Развлечения',
  связь: 'Связь',
  другое: 'Другое',
}

function migrateLegacyCategoryNames(userId: string) {
  const update = db.prepare(`
    UPDATE expenses SET category = ? WHERE user_id = ? AND category = ?
  `)
  const tx = db.transaction(() => {
    for (const [from, to] of Object.entries(LEGACY_NAMES)) {
      update.run(to, userId, from)
    }
  })
  tx()
}

export function listCategories(userId: string): Category[] {
  ensureDefaultCategories(userId)
  return db.prepare(`
    SELECT * FROM categories
    WHERE user_id = ?
    ORDER BY sort_order ASC, id ASC
  `).all(userId) as Category[]
}

export function createCategory(input: {
  userId: string
  name: string
  glyph?: string
  tone?: string
}): Category {
  const name = input.name.trim()
  if (!name) throw new Error('empty_name')

  const existing = listCategories(input.userId)
  if (existing.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
    throw new Error('duplicate_name')
  }

  const sortOrder = existing.length
  const tone = input.tone ?? TONES[sortOrder % TONES.length]
  const glyph = input.glyph ?? GLYPHS[sortOrder % GLYPHS.length]

  const result = db.prepare(`
    INSERT INTO categories (user_id, name, glyph, tone, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `).run(input.userId, name, glyph, tone, sortOrder)

  return db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid) as Category
}

export function updateCategory(input: {
  userId: string
  id: number
  name?: string
  glyph?: string
  tone?: string
}): Category | null {
  const current = db.prepare(`
    SELECT * FROM categories WHERE id = ? AND user_id = ?
  `).get(input.id, input.userId) as Category | undefined
  if (!current) return null

  const name = input.name?.trim() ?? current.name
  if (!name) throw new Error('empty_name')

  const clash = db.prepare(`
    SELECT id FROM categories
    WHERE user_id = ? AND lower(name) = lower(?) AND id != ?
  `).get(input.userId, name, input.id) as { id: number } | undefined
  if (clash) throw new Error('duplicate_name')

  const glyph = input.glyph ?? current.glyph
  const tone = input.tone ?? current.tone

  const tx = db.transaction(() => {
    if (name !== current.name) {
      db.prepare(`
        UPDATE expenses SET category = ?
        WHERE user_id = ? AND category = ?
      `).run(name, input.userId, current.name)
    }
    db.prepare(`
      UPDATE categories
      SET name = ?, glyph = ?, tone = ?
      WHERE id = ? AND user_id = ?
    `).run(name, glyph, tone, input.id, input.userId)
  })
  tx()

  return db.prepare('SELECT * FROM categories WHERE id = ?').get(input.id) as Category
}

export function deleteCategory(userId: string, id: number): boolean {
  const current = db.prepare(`
    SELECT * FROM categories WHERE id = ? AND user_id = ?
  `).get(id, userId) as Category | undefined
  if (!current) return false

  const all = listCategories(userId)
  if (all.length <= 1) throw new Error('last_category')

  const fallback = all.find((c) => c.id !== id)!

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE expenses SET category = ?
      WHERE user_id = ? AND category = ?
    `).run(fallback.name, userId, current.name)
    db.prepare(`
      DELETE FROM categories WHERE id = ? AND user_id = ?
    `).run(id, userId)
  })
  tx()
  return true
}

export function getCategoryByName(userId: string, name: string): Category | undefined {
  return db.prepare(`
    SELECT * FROM categories
    WHERE user_id = ? AND lower(name) = lower(?)
  `).get(userId, name.trim()) as Category | undefined
}

export function listExpenses(userId: string, limit = 100): Expense[] {
  return db.prepare(`
    SELECT * FROM expenses
    WHERE user_id = ?
    ORDER BY spent_at DESC, id DESC
    LIMIT ?
  `).all(userId, limit) as Expense[]
}

export function createExpense(input: {
  userId: string
  amount: number
  category: string
  note?: string
  spentAt?: string
}): Expense {
  const spentAt = input.spentAt ?? new Date().toISOString()
  const result = db.prepare(`
    INSERT INTO expenses (user_id, amount, category, note, spent_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    input.userId,
    input.amount,
    input.category,
    input.note?.trim() ?? '',
    spentAt,
  )

  return db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid) as Expense
}

export function deleteExpense(userId: string, expenseId: number): boolean {
  const result = db.prepare(`
    DELETE FROM expenses WHERE id = ? AND user_id = ?
  `).run(expenseId, userId)
  return result.changes > 0
}

export function getStats(userId: string) {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

  const monthTotal = (db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
    WHERE user_id = ? AND spent_at >= ?
  `).get(userId, monthStart) as { total: number }).total

  const todayTotal = (db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
    WHERE user_id = ? AND spent_at >= ?
  `).get(userId, todayStart) as { total: number }).total

  const byCategory = db.prepare(`
    SELECT category, SUM(amount) AS total, COUNT(*) AS count
    FROM expenses
    WHERE user_id = ? AND spent_at >= ?
    GROUP BY category
    ORDER BY total DESC
  `).all(userId, monthStart) as Array<{ category: string; total: number; count: number }>

  const last7 = db.prepare(`
    SELECT date(spent_at) AS day, SUM(amount) AS total
    FROM expenses
    WHERE user_id = ? AND spent_at >= datetime('now', '-6 days')
    GROUP BY date(spent_at)
    ORDER BY day ASC
  `).all(userId) as Array<{ day: string; total: number }>

  return {
    monthTotal,
    todayTotal,
    byCategory,
    last7,
  }
}

export { TONES, GLYPHS }
export default db
