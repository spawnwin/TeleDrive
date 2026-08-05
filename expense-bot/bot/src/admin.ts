import db from './db.js'
import {
  calcDepositPayout,
  listDeposits,
  listMortgages,
} from './finance.js'
import { listExpenses, getStats } from './db.js'

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

function parseAdminIds(): Set<string> {
  const raw = process.env.ADMIN_IDS ?? ''
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  // In dev mode, treat demo user as admin if no IDs configured
  if (ids.length === 0 && process.env.ALLOW_DEV_AUTH === '1') {
    return new Set(['dev-user'])
  }
  return new Set(ids)
}

export function isAdminUserId(userId: string): boolean {
  return parseAdminIds().has(userId)
}

function monthStartIso(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

function todayStartIso(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export function getAdminOverview(): AdminOverview {
  const users = (
    db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }
  ).n

  const expenseTotal = (
    db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM expenses`).get() as {
      s: number
    }
  ).s

  const expenseMonth = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS s FROM expenses WHERE spent_at >= ?`,
      )
      .get(monthStartIso()) as { s: number }
  ).s

  const expenseToday = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS s FROM expenses WHERE spent_at >= ?`,
      )
      .get(todayStartIso()) as { s: number }
  ).s

  const mortgage = db
    .prepare(
      `SELECT COALESCE(SUM(principal), 0) AS debt,
              COALESCE(SUM(monthly_payment), 0) AS monthly
       FROM mortgages`,
    )
    .get() as { debt: number; monthly: number }

  const deposits = db.prepare(`SELECT amount, rate, start_date, end_date, capitalization FROM deposits`).all() as Array<{
    amount: number
    rate: number
    start_date: string
    end_date: string
    capitalization: string
  }>

  let depositTotal = 0
  let depositPayout = 0
  for (const d of deposits) {
    depositTotal += d.amount
    depositPayout += calcDepositPayout(d).payout
  }

  return {
    users,
    expenseTotal: Math.round(expenseTotal * 100) / 100,
    expenseMonth: Math.round(expenseMonth * 100) / 100,
    expenseToday: Math.round(expenseToday * 100) / 100,
    mortgageDebt: Math.round(mortgage.debt * 100) / 100,
    mortgageMonthly: Math.round(mortgage.monthly * 100) / 100,
    depositTotal: Math.round(depositTotal * 100) / 100,
    depositPayout: Math.round(depositPayout * 100) / 100,
  }
}

export function listAdminUsers(): AdminUserRow[] {
  const users = db
    .prepare(
      `SELECT id, username, first_name, last_name, created_at
       FROM users
       ORDER BY created_at DESC`,
    )
    .all() as Array<{
    id: string
    username: string | null
    first_name: string | null
    last_name: string | null
    created_at: string
  }>

  const monthStart = monthStartIso()
  const todayStart = todayStartIso()

  return users.map((u) => {
    const exp = db
      .prepare(
        `SELECT
           COUNT(*) AS cnt,
           COALESCE(SUM(amount), 0) AS total,
           COALESCE(SUM(CASE WHEN spent_at >= ? THEN amount ELSE 0 END), 0) AS month,
           COALESCE(SUM(CASE WHEN spent_at >= ? THEN amount ELSE 0 END), 0) AS today
         FROM expenses WHERE user_id = ?`,
      )
      .get(monthStart, todayStart, u.id) as {
      cnt: number
      total: number
      month: number
      today: number
    }

    const mort = db
      .prepare(
        `SELECT COUNT(*) AS cnt,
                COALESCE(SUM(principal), 0) AS debt,
                COALESCE(SUM(monthly_payment), 0) AS monthly
         FROM mortgages WHERE user_id = ?`,
      )
      .get(u.id) as { cnt: number; debt: number; monthly: number }

    const deps = db
      .prepare(
        `SELECT amount, rate, start_date, end_date, capitalization
         FROM deposits WHERE user_id = ?`,
      )
      .all(u.id) as Array<{
      amount: number
      rate: number
      start_date: string
      end_date: string
      capitalization: string
    }>

    let depositTotal = 0
    let depositPayout = 0
    let depositProfit = 0
    for (const d of deps) {
      depositTotal += d.amount
      const { payout, profit } = calcDepositPayout(d)
      depositPayout += payout
      depositProfit += profit
    }

    return {
      id: u.id,
      username: u.username,
      firstName: u.first_name,
      lastName: u.last_name,
      createdAt: u.created_at,
      expenseCount: exp.cnt,
      expenseTotal: Math.round(exp.total * 100) / 100,
      expenseMonth: Math.round(exp.month * 100) / 100,
      expenseToday: Math.round(exp.today * 100) / 100,
      mortgageCount: mort.cnt,
      mortgageDebt: Math.round(mort.debt * 100) / 100,
      mortgageMonthly: Math.round(mort.monthly * 100) / 100,
      depositCount: deps.length,
      depositTotal: Math.round(depositTotal * 100) / 100,
      depositPayout: Math.round(depositPayout * 100) / 100,
      depositProfit: Math.round(depositProfit * 100) / 100,
    }
  })
}

export function getAdminUserDetail(userId: string) {
  const user = db
    .prepare(
      `SELECT id, username, first_name, last_name, created_at
       FROM users WHERE id = ?`,
    )
    .get(userId) as
    | {
        id: string
        username: string | null
        first_name: string | null
        last_name: string | null
        created_at: string
      }
    | undefined

  if (!user) return null

  const stats = getStats(userId)
  const expenses = listExpenses(userId, 40)
  const mortgages = listMortgages(userId)
  const deposits = listDeposits(userId)

  const byCategoryAll = db
    .prepare(
      `SELECT category, SUM(amount) AS total, COUNT(*) AS count
       FROM expenses WHERE user_id = ?
       GROUP BY category ORDER BY total DESC`,
    )
    .all(userId) as Array<{ category: string; total: number; count: number }>

  return {
    user: {
      id: user.id,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      createdAt: user.created_at,
    },
    stats,
    byCategoryAll,
    expenses,
    mortgages,
    deposits,
  }
}
