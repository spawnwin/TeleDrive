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

export type UserRow = {
  id: string
  username: string | null
  first_name: string | null
  last_name: string | null
  created_at: string
}

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

export default db
