import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Bot, InlineKeyboard, webhookCallback } from 'grammy'
import { createApiRouter } from './api.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT ?? 3000)
const BOT_TOKEN = process.env.BOT_TOKEN ?? ''
const WEBAPP_URL = (process.env.WEBAPP_URL ?? `http://localhost:${PORT}`).replace(/\/$/, '')

const app = express()
app.use(cors())
app.use(express.json())
app.use('/api', createApiRouter())

const webDist = path.resolve(__dirname, '../../web/dist')
app.use(express.static(webDist))
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/bot')) {
    next()
    return
  }
  res.sendFile(path.join(webDist, 'index.html'), (err) => {
    if (err) next()
  })
})

function buildOpenKeyboard() {
  return new InlineKeyboard().webApp('Открыть Ауру', WEBAPP_URL)
}

async function start() {
  if (!BOT_TOKEN || BOT_TOKEN.includes('ABC-DEF')) {
    console.warn(
      '[aura] BOT_TOKEN не задан — API и статика работают, бот отключён. Укажите токен в .env',
    )
    app.listen(PORT, () => {
      console.log(`[aura] http://localhost:${PORT} (без бота)`)
      console.log(`[aura] Mini App: ${WEBAPP_URL}`)
      console.log('[aura] Для локальной разработки: ALLOW_DEV_AUTH=1')
    })
    return
  }

  const bot = new Bot(BOT_TOKEN)

  bot.command('start', async (ctx) => {
    const name = ctx.from?.first_name ?? 'друг'
    await ctx.reply(
      [
        `Привет, ${name}!`,
        '',
        'Я *Аура* — мини-приложение для учёта расходов.',
        'Все данные хранятся на сервере и доступны с любого устройства.',
        '',
        'Нажми кнопку ниже — приложение откроется прямо в Telegram.',
        '',
        'Команды:',
        '/app — открыть Ауру',
        '/today — траты за сегодня',
        '/month — траты за месяц',
        '/help — справка',
      ].join('\n'),
      {
        parse_mode: 'Markdown',
        reply_markup: buildOpenKeyboard(),
      },
    )
  })

  bot.command('app', async (ctx) => {
    await ctx.reply('Открой Ауру и добавь трату за пару секунд.', {
      reply_markup: buildOpenKeyboard(),
    })
  })

  bot.command('help', async (ctx) => {
    await ctx.reply(
      [
        '*Аура* — учёт расходов в Telegram Mini App.',
        '',
        '1. Нажми «Открыть Ауру»',
        '2. Выбери категорию и сумму',
        '3. Смотри сводку за день и месяц',
        '',
        'Данные сохраняются на сервере и привязаны к твоему Telegram-аккаунту.',
      ].join('\n'),
      { parse_mode: 'Markdown', reply_markup: buildOpenKeyboard() },
    )
  })

  bot.command('today', async (ctx) => {
    await ctx.reply('Открой Ауру — там актуальная сводка за сегодня.', {
      reply_markup: buildOpenKeyboard(),
    })
  })

  bot.command('month', async (ctx) => {
    await ctx.reply('Месячная статистика и категории — в Ауре.', {
      reply_markup: buildOpenKeyboard(),
    })
  })

  bot.on('message', async (ctx) => {
    await ctx.reply('Открой *Ауру*, чтобы вести расходы:', {
      parse_mode: 'Markdown',
      reply_markup: buildOpenKeyboard(),
    })
  })

  const useWebhook = process.env.USE_WEBHOOK === '1'
  if (useWebhook) {
    app.post('/bot/webhook', webhookCallback(bot, 'express'))
    app.listen(PORT, async () => {
      const webhookUrl = `${WEBAPP_URL}/bot/webhook`
      await bot.api.setWebhook(webhookUrl)
      console.log(`[aura] webhook → ${webhookUrl}`)
      console.log(`[aura] listening on :${PORT}`)
    })
  } else {
    app.listen(PORT, () => {
      console.log(`[aura] http://localhost:${PORT}`)
      console.log(`[aura] Mini App URL: ${WEBAPP_URL}`)
    })
    bot.start({
      onStart: (info) => console.log(`[aura] бот @${info.username} запущен (long polling)`),
    })
  }
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
