import db from './db.js'

db.exec(`
  CREATE TABLE IF NOT EXISTS mortgages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    person TEXT NOT NULL DEFAULT '',
    bank TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT 'Ипотека',
    principal REAL NOT NULL,
    rate REAL NOT NULL DEFAULT 0,
    monthly_payment REAL NOT NULL,
    payment_day INTEGER NOT NULL CHECK(payment_day >= 1 AND payment_day <= 31),
    start_date TEXT,
    end_date TEXT,
    note TEXT NOT NULL DEFAULT '',
    notify_enabled INTEGER NOT NULL DEFAULT 1,
    last_payment_notify TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    person TEXT NOT NULL DEFAULT '',
    bank TEXT NOT NULL,
    amount REAL NOT NULL,
    rate REAL NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    capitalization TEXT NOT NULL DEFAULT 'none',
    note TEXT NOT NULL DEFAULT '',
    notify_enabled INTEGER NOT NULL DEFAULT 1,
    notify_days_before INTEGER NOT NULL DEFAULT 3,
    last_maturity_notify TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_mortgages_user ON mortgages(user_id);
  CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_id);
`)

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
  last_payment_notify: string | null
  created_at: string
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
  last_maturity_notify: string | null
  created_at: string
}

export type MortgageView = Mortgage & {
  next_payment_date: string
  months_left: number | null
  remaining_total: number | null
}

export type DepositView = Deposit & {
  payout: number
  profit: number
  days_left: number
  matured: boolean
}

function clampDay(year: number, month: number, day: number) {
  const last = new Date(year, month + 1, 0).getDate()
  return Math.min(day, last)
}

/** Следующая дата платежа по дню месяца */
export function nextPaymentDate(paymentDay: number, from = new Date()): Date {
  const y = from.getFullYear()
  const m = from.getMonth()
  const d = from.getDate()
  const thisMonthDay = clampDay(y, m, paymentDay)
  if (d <= thisMonthDay) {
    return new Date(y, m, thisMonthDay)
  }
  const nm = m + 1
  const ny = nm > 11 ? y + 1 : y
  const realM = nm % 12
  return new Date(ny, realM, clampDay(ny, realM, paymentDay))
}

export function monthsBetween(from: Date, to: Date): number {
  let months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  if (to.getDate() < from.getDate()) months -= 1
  return Math.max(0, months)
}

export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((b - a) / 86400000)
}

/** Выплата по вкладу на дату окончания */
export function calcDepositPayout(dep: {
  amount: number
  rate: number
  start_date: string
  end_date: string
  capitalization: string
}): { payout: number; profit: number } {
  const start = new Date(dep.start_date)
  const end = new Date(dep.end_date)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { payout: dep.amount, profit: 0 }
  }

  const days = daysBetween(start, end)
  const rate = dep.rate / 100

  let payout = dep.amount
  if (dep.capitalization === 'monthly') {
    const months = Math.max(1, Math.round(days / 30.4375))
    payout = dep.amount * Math.pow(1 + rate / 12, months)
  } else if (dep.capitalization === 'daily') {
    payout = dep.amount * Math.pow(1 + rate / 365, days)
  } else {
    // простые проценты
    payout = dep.amount * (1 + rate * (days / 365))
  }

  payout = Math.round(payout * 100) / 100
  const profit = Math.round((payout - dep.amount) * 100) / 100
  return { payout, profit }
}

function enrichMortgage(m: Mortgage): MortgageView {
  const next = nextPaymentDate(m.payment_day)
  const nextIso = next.toISOString().slice(0, 10)
  let monthsLeft: number | null = null
  let remainingTotal: number | null = null
  if (m.end_date) {
    const end = new Date(m.end_date)
    if (!Number.isNaN(end.getTime())) {
      monthsLeft = monthsBetween(new Date(), end)
      remainingTotal = Math.round(m.monthly_payment * Math.max(monthsLeft, 0) * 100) / 100
    }
  }
  return {
    ...m,
    next_payment_date: nextIso,
    months_left: monthsLeft,
    remaining_total: remainingTotal,
  }
}

function enrichDeposit(d: Deposit): DepositView {
  const { payout, profit } = calcDepositPayout(d)
  const end = new Date(d.end_date)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)
  const left = daysBetween(today, end)
  return {
    ...d,
    capitalization: d.capitalization as Deposit['capitalization'],
    payout,
    profit,
    days_left: left,
    matured: left <= 0,
  }
}

// ——— Mortgages ———

export function listMortgages(userId: string): MortgageView[] {
  const rows = db.prepare(`
    SELECT * FROM mortgages WHERE user_id = ?
    ORDER BY payment_day ASC, id ASC
  `).all(userId) as Mortgage[]
  return rows.map(enrichMortgage)
}

export function createMortgage(input: {
  userId: string
  person?: string
  bank?: string
  title?: string
  principal: number
  rate?: number
  monthlyPayment: number
  paymentDay: number
  startDate?: string
  endDate?: string
  note?: string
  notifyEnabled?: boolean
}): MortgageView {
  const result = db.prepare(`
    INSERT INTO mortgages (
      user_id, person, bank, title, principal, rate, monthly_payment,
      payment_day, start_date, end_date, note, notify_enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.userId,
    input.person?.trim() ?? '',
    input.bank?.trim() ?? '',
    input.title?.trim() || 'Ипотека',
    input.principal,
    input.rate ?? 0,
    input.monthlyPayment,
    input.paymentDay,
    input.startDate ?? null,
    input.endDate ?? null,
    input.note?.trim() ?? '',
    input.notifyEnabled === false ? 0 : 1,
  )
  const row = db.prepare('SELECT * FROM mortgages WHERE id = ?').get(result.lastInsertRowid) as Mortgage
  return enrichMortgage(row)
}

export function updateMortgage(
  userId: string,
  id: number,
  patch: Partial<{
    person: string
    bank: string
    title: string
    principal: number
    rate: number
    monthlyPayment: number
    paymentDay: number
    startDate: string | null
    endDate: string | null
    note: string
    notifyEnabled: boolean
  }>,
): MortgageView | null {
  const current = db.prepare(`
    SELECT * FROM mortgages WHERE id = ? AND user_id = ?
  `).get(id, userId) as Mortgage | undefined
  if (!current) return null

  db.prepare(`
    UPDATE mortgages SET
      person = ?, bank = ?, title = ?, principal = ?, rate = ?,
      monthly_payment = ?, payment_day = ?, start_date = ?, end_date = ?,
      note = ?, notify_enabled = ?
    WHERE id = ? AND user_id = ?
  `).run(
    patch.person !== undefined ? patch.person.trim() : current.person,
    patch.bank !== undefined ? patch.bank.trim() : current.bank,
    patch.title !== undefined ? patch.title.trim() || 'Ипотека' : current.title,
    patch.principal ?? current.principal,
    patch.rate ?? current.rate,
    patch.monthlyPayment ?? current.monthly_payment,
    patch.paymentDay ?? current.payment_day,
    patch.startDate !== undefined ? patch.startDate : current.start_date,
    patch.endDate !== undefined ? patch.endDate : current.end_date,
    patch.note !== undefined ? patch.note.trim() : current.note,
    patch.notifyEnabled !== undefined
      ? patch.notifyEnabled
        ? 1
        : 0
      : current.notify_enabled,
    id,
    userId,
  )

  const row = db.prepare('SELECT * FROM mortgages WHERE id = ?').get(id) as Mortgage
  return enrichMortgage(row)
}

export function deleteMortgage(userId: string, id: number): boolean {
  return (
    db.prepare('DELETE FROM mortgages WHERE id = ? AND user_id = ?').run(id, userId).changes > 0
  )
}

export function markMortgageNotified(id: number, dateKey: string) {
  db.prepare('UPDATE mortgages SET last_payment_notify = ? WHERE id = ?').run(dateKey, id)
}

// ——— Deposits ———

export function listDeposits(userId: string): DepositView[] {
  const rows = db.prepare(`
    SELECT * FROM deposits WHERE user_id = ?
    ORDER BY end_date ASC, id ASC
  `).all(userId) as Deposit[]
  return rows.map(enrichDeposit)
}

export function createDeposit(input: {
  userId: string
  person?: string
  bank: string
  amount: number
  rate: number
  startDate: string
  endDate: string
  capitalization?: 'none' | 'monthly' | 'daily'
  note?: string
  notifyEnabled?: boolean
  notifyDaysBefore?: number
}): DepositView {
  const result = db.prepare(`
    INSERT INTO deposits (
      user_id, person, bank, amount, rate, start_date, end_date,
      capitalization, note, notify_enabled, notify_days_before
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.userId,
    input.person?.trim() ?? '',
    input.bank.trim(),
    input.amount,
    input.rate,
    input.startDate,
    input.endDate,
    input.capitalization ?? 'none',
    input.note?.trim() ?? '',
    input.notifyEnabled === false ? 0 : 1,
    input.notifyDaysBefore ?? 3,
  )
  const row = db.prepare('SELECT * FROM deposits WHERE id = ?').get(result.lastInsertRowid) as Deposit
  return enrichDeposit(row)
}

export function updateDeposit(
  userId: string,
  id: number,
  patch: Partial<{
    person: string
    bank: string
    amount: number
    rate: number
    startDate: string
    endDate: string
    capitalization: 'none' | 'monthly' | 'daily'
    note: string
    notifyEnabled: boolean
    notifyDaysBefore: number
  }>,
): DepositView | null {
  const current = db.prepare(`
    SELECT * FROM deposits WHERE id = ? AND user_id = ?
  `).get(id, userId) as Deposit | undefined
  if (!current) return null

  db.prepare(`
    UPDATE deposits SET
      person = ?, bank = ?, amount = ?, rate = ?, start_date = ?, end_date = ?,
      capitalization = ?, note = ?, notify_enabled = ?, notify_days_before = ?
    WHERE id = ? AND user_id = ?
  `).run(
    patch.person !== undefined ? patch.person.trim() : current.person,
    patch.bank !== undefined ? patch.bank.trim() : current.bank,
    patch.amount ?? current.amount,
    patch.rate ?? current.rate,
    patch.startDate ?? current.start_date,
    patch.endDate ?? current.end_date,
    patch.capitalization ?? current.capitalization,
    patch.note !== undefined ? patch.note.trim() : current.note,
    patch.notifyEnabled !== undefined
      ? patch.notifyEnabled
        ? 1
        : 0
      : current.notify_enabled,
    patch.notifyDaysBefore ?? current.notify_days_before,
    id,
    userId,
  )

  const row = db.prepare('SELECT * FROM deposits WHERE id = ?').get(id) as Deposit
  return enrichDeposit(row)
}

export function deleteDeposit(userId: string, id: number): boolean {
  return db.prepare('DELETE FROM deposits WHERE id = ? AND user_id = ?').run(id, userId).changes > 0
}

export function markDepositNotified(id: number, dateKey: string) {
  db.prepare('UPDATE deposits SET last_maturity_notify = ? WHERE id = ?').run(dateKey, id)
}

export function listAllMortgagesForNotify(): Mortgage[] {
  return db.prepare(`
    SELECT * FROM mortgages WHERE notify_enabled = 1
  `).all() as Mortgage[]
}

export function listAllDepositsForNotify(): Deposit[] {
  return db.prepare(`
    SELECT * FROM deposits WHERE notify_enabled = 1
  `).all() as Deposit[]
}

export function getFinanceSummary(userId: string) {
  const mortgages = listMortgages(userId)
  const deposits = listDeposits(userId)
  const mortgageMonthly = mortgages.reduce((s, m) => s + m.monthly_payment, 0)
  const mortgageDebt = mortgages.reduce((s, m) => s + m.principal, 0)
  const depositTotal = deposits.reduce((s, d) => s + d.amount, 0)
  const depositPayout = deposits.reduce((s, d) => s + d.payout, 0)
  return {
    mortgages,
    deposits,
    mortgageMonthly,
    mortgageDebt,
    depositTotal,
    depositPayout,
    depositProfit: Math.round((depositPayout - depositTotal) * 100) / 100,
  }
}
