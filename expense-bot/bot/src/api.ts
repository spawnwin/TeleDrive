import { Router } from 'express'
import { z } from 'zod'
import { validateInitData } from './auth.js'
import {
  createExpense,
  deleteExpense,
  getStats,
  listExpenses,
  upsertUser,
} from './db.js'

const CATEGORIES = [
  'еда',
  'транспорт',
  'дом',
  'покупки',
  'здоровье',
  'развлечения',
  'связь',
  'другое',
] as const

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
    res.json({ ok: true, service: 'expense-bot' })
  })

  router.get('/me', (req, res) => {
    const user = resolveUser(req)
    if (!user) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    upsertUser(user)
    res.json({
      id: user.id,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      categories: CATEGORIES,
    })
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
      category: z.enum(CATEGORIES),
      note: z.string().max(200).optional().default(''),
      spentAt: z.string().datetime().optional(),
    })

    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() })
      return
    }

    upsertUser(user)
    const expense = createExpense({
      userId: user.id,
      amount: parsed.data.amount,
      category: parsed.data.category,
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

  return router
}

export { CATEGORIES }
