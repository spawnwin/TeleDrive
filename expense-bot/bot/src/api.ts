import { Router } from 'express'
import { z } from 'zod'
import { validateInitData } from './auth.js'
import {
  createCategory,
  createExpense,
  deleteCategory,
  deleteExpense,
  getCategoryByName,
  getStats,
  listCategories,
  listExpenses,
  updateCategory,
  upsertUser,
  GLYPHS,
  TONES,
} from './db.js'
import {
  createDeposit,
  createMortgage,
  deleteDeposit,
  deleteMortgage,
  getFinanceSummary,
  listDeposits,
  listMortgages,
  updateDeposit,
  updateMortgage,
} from './finance.js'

function getBotToken() {
  return process.env.BOT_TOKEN ?? ''
}

function isDevBypass() {
  return process.env.ALLOW_DEV_AUTH === '1'
}

function resolveUser(req: { headers: Record<string, unknown> }) {
  const initData = String(req.headers['x-telegram-init-data'] ?? '')
  const validated = validateInitData(initData, getBotToken())
  if (validated) {
    return {
      id: String(validated.user.id),
      username: validated.user.username,
      first_name: validated.user.first_name,
      last_name: validated.user.last_name,
    }
  }

  if (isDevBypass()) {
    return {
      id: 'dev-user',
      username: 'dev',
      first_name: 'Демо',
      last_name: 'Пользователь',
    }
  }

  return null
}

export function createApiRouter() {
  const router = Router()

  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'zlatnik' })
  })

  router.get('/me', (req, res) => {
    const user = resolveUser(req)
    if (!user) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    upsertUser(user)
    const categories = listCategories(user.id)
    res.json({
      id: user.id,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      categories,
      tones: TONES,
      glyphs: GLYPHS,
    })
  })

  router.get('/categories', (req, res) => {
    const user = resolveUser(req)
    if (!user) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    upsertUser(user)
    res.json({ items: listCategories(user.id), tones: TONES, glyphs: GLYPHS })
  })

  router.post('/categories', (req, res) => {
    const user = resolveUser(req)
    if (!user) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    upsertUser(user)

    const schema = z.object({
      name: z.string().trim().min(1).max(40),
      glyph: z.string().min(1).max(4).optional(),
      tone: z.enum(TONES as [string, ...string[]]).optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() })
      return
    }

    try {
      const item = createCategory({
        userId: user.id,
        name: parsed.data.name,
        glyph: parsed.data.glyph,
        tone: parsed.data.tone,
      })
      res.status(201).json({ item })
    } catch (err) {
      const code = err instanceof Error ? err.message : 'error'
      if (code === 'duplicate_name') {
        res.status(409).json({ error: 'duplicate_name' })
        return
      }
      res.status(400).json({ error: code })
    }
  })

  router.patch('/categories/:id', (req, res) => {
    const user = resolveUser(req)
    if (!user) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    upsertUser(user)

    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'invalid_id' })
      return
    }

    const schema = z.object({
      name: z.string().trim().min(1).max(40).optional(),
      glyph: z.string().min(1).max(4).optional(),
      tone: z.enum(TONES as [string, ...string[]]).optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() })
      return
    }

    try {
      const item = updateCategory({
        userId: user.id,
        id,
        name: parsed.data.name,
        glyph: parsed.data.glyph,
        tone: parsed.data.tone,
      })
      if (!item) {
        res.status(404).json({ error: 'not_found' })
        return
      }
      res.json({ item })
    } catch (err) {
      const code = err instanceof Error ? err.message : 'error'
      if (code === 'duplicate_name') {
        res.status(409).json({ error: 'duplicate_name' })
        return
      }
      res.status(400).json({ error: code })
    }
  })

  router.delete('/categories/:id', (req, res) => {
    const user = resolveUser(req)
    if (!user) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    upsertUser(user)

    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'invalid_id' })
      return
    }

    try {
      const ok = deleteCategory(user.id, id)
      if (!ok) {
        res.status(404).json({ error: 'not_found' })
        return
      }
      res.json({ ok: true })
    } catch (err) {
      const code = err instanceof Error ? err.message : 'error'
      if (code === 'last_category') {
        res.status(400).json({ error: 'last_category' })
        return
      }
      res.status(400).json({ error: code })
    }
  })

  router.get('/expenses', (req, res) => {
    const user = resolveUser(req)
    if (!user) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    upsertUser(user)
    res.json({ items: listExpenses(user.id) })
  })

  router.get('/stats', (req, res) => {
    const user = resolveUser(req)
    if (!user) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    upsertUser(user)
    res.json(getStats(user.id))
  })

  router.post('/expenses', (req, res) => {
    const user = resolveUser(req)
    if (!user) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }

    const schema = z.object({
      amount: z.number().positive().max(1_000_000_000),
      category: z.string().trim().min(1).max(40),
      note: z.string().max(200).optional().default(''),
      spentAt: z.string().datetime().optional(),
    })

    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() })
      return
    }

    upsertUser(user)
    const cat = getCategoryByName(user.id, parsed.data.category)
    if (!cat) {
      res.status(400).json({ error: 'unknown_category' })
      return
    }

    const expense = createExpense({
      userId: user.id,
      amount: parsed.data.amount,
      category: cat.name,
      note: parsed.data.note,
      spentAt: parsed.data.spentAt,
    })
    res.status(201).json({ item: expense })
  })

  router.delete('/expenses/:id', (req, res) => {
    const user = resolveUser(req)
    if (!user) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }

    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'invalid_id' })
      return
    }

    const ok = deleteExpense(user.id, id)
    if (!ok) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    res.json({ ok: true })
  })

  // ——— Ипотеки ———

  router.get('/mortgages', (req, res) => {
    const user = resolveUser(req)
    if (!user) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    upsertUser(user)
    res.json({ items: listMortgages(user.id) })
  })

  router.post('/mortgages', (req, res) => {
    const user = resolveUser(req)
    if (!user) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    upsertUser(user)

    const schema = z.object({
      person: z.string().max(80).optional().default(''),
      bank: z.string().max(80).optional().default(''),
      title: z.string().max(80).optional().default('Ипотека'),
      principal: z.number().nonnegative().max(1e12),
      rate: z.number().min(0).max(100).optional().default(0),
      monthlyPayment: z.number().positive().max(1e10),
      paymentDay: z.number().int().min(1).max(31),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      note: z.string().max(300).optional().default(''),
      notifyEnabled: z.boolean().optional().default(true),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() })
      return
    }

    const item = createMortgage({
      userId: user.id,
      ...parsed.data,
    })
    res.status(201).json({ item })
  })

  router.patch('/mortgages/:id', (req, res) => {
    const user = resolveUser(req)
    if (!user) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    upsertUser(user)
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'invalid_id' })
      return
    }

    const schema = z.object({
      person: z.string().max(80).optional(),
      bank: z.string().max(80).optional(),
      title: z.string().max(80).optional(),
      principal: z.number().nonnegative().max(1e12).optional(),
      rate: z.number().min(0).max(100).optional(),
      monthlyPayment: z.number().positive().max(1e10).optional(),
      paymentDay: z.number().int().min(1).max(31).optional(),
      startDate: z.string().nullable().optional(),
      endDate: z.string().nullable().optional(),
      note: z.string().max(300).optional(),
      notifyEnabled: z.boolean().optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() })
      return
    }

    const item = updateMortgage(user.id, id, parsed.data)
    if (!item) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    res.json({ item })
  })

  router.delete('/mortgages/:id', (req, res) => {
    const user = resolveUser(req)
    if (!user) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'invalid_id' })
      return
    }
    if (!deleteMortgage(user.id, id)) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    res.json({ ok: true })
  })

  // ——— Вклады ———

  router.get('/deposits', (req, res) => {
    const user = resolveUser(req)
    if (!user) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    upsertUser(user)
    res.json({ items: listDeposits(user.id) })
  })

  router.post('/deposits', (req, res) => {
    const user = resolveUser(req)
    if (!user) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    upsertUser(user)

    const schema = z.object({
      person: z.string().max(80).optional().default(''),
      bank: z.string().trim().min(1).max(80),
      amount: z.number().positive().max(1e12),
      rate: z.number().min(0).max(100),
      startDate: z.string().min(4),
      endDate: z.string().min(4),
      capitalization: z.enum(['none', 'monthly', 'daily']).optional().default('none'),
      note: z.string().max(300).optional().default(''),
      notifyEnabled: z.boolean().optional().default(true),
      notifyDaysBefore: z.number().int().min(0).max(90).optional().default(3),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() })
      return
    }

    const item = createDeposit({
      userId: user.id,
      ...parsed.data,
    })
    res.status(201).json({ item })
  })

  router.patch('/deposits/:id', (req, res) => {
    const user = resolveUser(req)
    if (!user) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    upsertUser(user)
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'invalid_id' })
      return
    }

    const schema = z.object({
      person: z.string().max(80).optional(),
      bank: z.string().trim().min(1).max(80).optional(),
      amount: z.number().positive().max(1e12).optional(),
      rate: z.number().min(0).max(100).optional(),
      startDate: z.string().min(4).optional(),
      endDate: z.string().min(4).optional(),
      capitalization: z.enum(['none', 'monthly', 'daily']).optional(),
      note: z.string().max(300).optional(),
      notifyEnabled: z.boolean().optional(),
      notifyDaysBefore: z.number().int().min(0).max(90).optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() })
      return
    }

    const item = updateDeposit(user.id, id, parsed.data)
    if (!item) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    res.json({ item })
  })

  router.delete('/deposits/:id', (req, res) => {
    const user = resolveUser(req)
    if (!user) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'invalid_id' })
      return
    }
    if (!deleteDeposit(user.id, id)) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    res.json({ ok: true })
  })

  router.get('/finance', (req, res) => {
    const user = resolveUser(req)
    if (!user) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    upsertUser(user)
    res.json(getFinanceSummary(user.id))
  })

  return router
}
