/**
 * Полная настройка профиля бота через Bot API.
 * Вызывается при старте — имя, описания, команды, меню, аватар.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Bot } from 'grammy'
import { InputFile } from 'grammy'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const BOT_PROFILE = {
  name: 'Златник',
  shortDescription: 'Учёт расходов · золотая монета Древней Руси',
  description: [
    'Златник — мини-приложение для учёта расходов.',
    '',
    'Имя от первой золотой монеты Древней Руси.',
    '',
    '• Быстрые траты по категориям',
    '• Ипотеки: платёж и напоминание в день оплаты',
    '• Вклады: банк, %, сумма к выплате, напоминание об окончании',
    '• Сводка за день, неделю и месяц',
    '• Свои категории',
    '• Тёмный Liquid Glass-интерфейс',
    '',
    'Нажми «Открыть Златник» или кнопку меню.',
  ].join('\n'),
  commands: [
    { command: 'start', description: 'Запустить и открыть Златник' },
    { command: 'app', description: 'Открыть мини-приложение' },
    { command: 'finance', description: 'Ипотеки и вклады' },
    { command: 'categories', description: 'Управление категориями' },
    { command: 'today', description: 'Сводка за сегодня' },
    { command: 'month', description: 'Сводка за месяц' },
    { command: 'help', description: 'Как пользоваться' },
  ],
  menuText: 'Златник',
} as const

function avatarPath(): string | null {
  const jpg = path.resolve(__dirname, '../../assets/zlatnik-avatar.jpg')
  const png = path.resolve(__dirname, '../../assets/zlatnik-avatar.png')
  if (fs.existsSync(jpg)) return jpg
  if (fs.existsSync(png)) return png
  return null
}

export async function setupBotProfile(bot: Bot, webAppUrl: string) {
  const url = webAppUrl.replace(/\/$/, '')

  await bot.api.setMyName(BOT_PROFILE.name)
  await bot.api.setMyShortDescription(BOT_PROFILE.shortDescription)
  await bot.api.setMyDescription(BOT_PROFILE.description)
  await bot.api.setMyCommands([...BOT_PROFILE.commands])

  await bot.api.setChatMenuButton({
    menu_button: {
      type: 'web_app',
      text: BOT_PROFILE.menuText,
      web_app: { url },
    },
  })

  const photo = avatarPath()
  if (photo) {
    try {
      await bot.api.setMyProfilePhoto({
        type: 'static',
        photo: new InputFile(photo),
      // grammy InputProfilePhoto typing varies by version
      } as Parameters<Bot['api']['setMyProfilePhoto']>[0])
      console.log('[zlatnik] аватарка обновлена')
    } catch (err) {
      console.warn('[zlatnik] не удалось обновить аватарку:', err)
    }
  }

  console.log('[zlatnik] профиль бота настроен')
  console.log(`[zlatnik] меню Mini App → ${url}`)
}
