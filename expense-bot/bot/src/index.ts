import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Bot, InlineKeyboard, Keyboard, webhookCallback } from 'grammy'
import { createApiRouter } from './api.js'
import { setupBotProfile } from './setupProfile.js'
import { startNotificationScheduler } from './notify.js'

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
  return new InlineKeyboard().webApp('Открыть Златник', WEBAPP_URL)
}

function buildReplyKeyboard() {
  return new Keyboard()
    .webApp('Открыть Златник', WEBAPP_URL)
    .row()
    .text('Справка')
    .resized()
    .persistent()
}

async function attachMenuButton(bot: Bot, chatId: number) {
  try {
    await bot.api.setChatMenuButton({
      chat_id: chatId,
      menu_button: {
        type: 'web_app',
        text: 'Златник',
        web_app: { url: WEBAPP_URL },
      },
    })
  } catch (err) {
    console.warn('[zlatnik] setChatMenuButton failed:', err)
  }
}

function welcomeText(name: string) {
  return [
    `Привет, ${name}!`,
    '',
    'Я *Златник* — учёт расходов в Telegram.',
    'Имя от золотой монеты Древней Руси.',
    '',
    'Что умею:',
    '• записывать траты за пару секунд',
    '• ипотеки и вклады с напоминаниями',
    '• категории — свои, с редактированием',
    '• сводка за день, неделю и месяц',
    '• тёмный Liquid Glass и светлая тема',
    '',
    'Нажми кнопку — откроется приложение.',
  ].join('\n')
}

const HELP_TEXT = [
  '*Как пользоваться Златником*',
  '',
  '1. Нажми «Открыть Златник»',
  '2. Добавь расход: сумма → категория → сохранить',
  '3. «Управление» — свои категории',
  '4. «Финансы» — ипотеки и вклады',
  '5. «Сводка» — неделя и топ категорий',
  '6. ☀ / ☾ — переключение темы',
  '',
  'Напоминания:',
  '• ипотека — в день платежа',
  '• вклад — за N дней и в день окончания',
  '',
  'Команды:',
  '/app — открыть приложение',
  '/finance — ипотеки и вклады',
  '/categories — про категории',
  '/today — траты за сегодня',
  '/month — траты за месяц',
  '/help — эта справка',
].join('\n')

async function start() {
  if (!BOT_TOKEN || BOT_TOKEN.includes('ABC-DEF')) {
    console.warn(
      '[zlatnik] BOT_TOKEN не задан — API и статика работают, бот отключён. Укажите токен в .env',
    )
    app.listen(PORT, () => {
      console.log(`[zlatnik] http://localhost:${PORT} (без бота)`)
      console.log(`[zlatnik] Mini App: ${WEBAPP_URL}`)
    })
    return
  }

  const bot = new Bot(BOT_TOKEN)

  bot.command('start', async (ctx) => {
    const name = ctx.from?.first_name ?? 'друг'
    if (ctx.chat) await attachMenuButton(bot, ctx.chat.id)
    await ctx.reply(welcomeText(name), {
      parse_mode: 'Markdown',
      reply_markup: buildOpenKeyboard(),
    })
    await ctx.reply('Быстрый доступ снизу:', {
      reply_markup: buildReplyKeyboard(),
    })
  })

  bot.command('app', async (ctx) => {
    if (ctx.chat) await attachMenuButton(bot, ctx.chat.id)
    await ctx.reply('Открой приложение и добавь трату:', {
      reply_markup: buildOpenKeyboard(),
    })
  })

  bot.command('categories', async (ctx) => {
    await ctx.reply(
      [
        '*Категории*',
        '',
        'В приложении: Главная → *Управление*.',
        'Можно добавлять, переименовывать и удалять.',
        'При удалении траты переносятся в другую категорию.',
      ].join('\n'),
      { parse_mode: 'Markdown', reply_markup: buildOpenKeyboard() },
    )
  })

  bot.command('help', async (ctx) => {
    await ctx.reply(HELP_TEXT, {
      parse_mode: 'Markdown',
      reply_markup: buildOpenKeyboard(),
    })
  })

  bot.command('today', async (ctx) => {
    await ctx.reply('Сводка за сегодня — в приложении на главном экране.', {
      reply_markup: buildOpenKeyboard(),
    })
  })

  bot.command('month', async (ctx) => {
    await ctx.reply('Месяц, неделя и топ категорий — во вкладке «Сводка».', {
      reply_markup: buildOpenKeyboard(),
    })
  })

  bot.command('finance', async (ctx) => {
    await ctx.reply(
      [
        '*Ипотеки и вклады*',
        '',
        'В приложении открой вкладку *Финансы*.',
        '• Ипотека — платёж, ставка, день оплаты, кто платит',
        '• Вклад — банк, %, срок, сумма к выплате',
        '',
        'Напомню в день платежа по ипотеке',
        'и перед окончанием / в день окончания вклада.',
      ].join('\n'),
      { parse_mode: 'Markdown', reply_markup: buildOpenKeyboard() },
    )
  })

  bot.hears('Справка', async (ctx) => {
    await ctx.reply(HELP_TEXT, {
      parse_mode: 'Markdown',
      reply_markup: buildOpenKeyboard(),
    })
  })

  bot.on('message', async (ctx) => {
    await ctx.reply('Открой *Златник*, чтобы вести расходы:', {
      parse_mode: 'Markdown',
      reply_markup: buildOpenKeyboard(),
    })
  })

  // Профиль: имя, описания, команды, меню, аватар
  try {
    await setupBotProfile(bot, WEBAPP_URL)
  } catch (err) {
    console.warn('[zlatnik] setupBotProfile:', err)
  }

  startNotificationScheduler(bot)

  const useWebhook = process.env.USE_WEBHOOK === '1'
  if (useWebhook) {
    app.post('/bot/webhook', webhookCallback(bot, 'express'))
    app.listen(PORT, async () => {
      const webhookUrl = `${WEBAPP_URL}/bot/webhook`
      await bot.api.setWebhook(webhookUrl)
      console.log(`[zlatnik] webhook → ${webhookUrl}`)
      console.log(`[zlatnik] listening on :${PORT}`)
    })
  } else {
    app.listen(PORT, () => {
      console.log(`[zlatnik] http://localhost:${PORT}`)
      console.log(`[zlatnik] Mini App URL: ${WEBAPP_URL}`)
    })
    bot.start({
      onStart: (info) =>
        console.log(`[zlatnik] бот @${info.username} готов · https://t.me/${info.username}`),
    })
  }
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
