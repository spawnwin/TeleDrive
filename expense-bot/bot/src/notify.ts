import type { Bot } from 'grammy'
import {
  calcDepositPayout,
  listAllDepositsForNotify,
  listAllMortgagesForNotify,
  markDepositNotified,
  markMortgageNotified,
} from './finance.js'

function todayKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatRub(n: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(n)
}

function formatDateRu(iso: string) {
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`)
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

function daysUntil(isoDate: string, from = new Date()) {
  const end = new Date(isoDate.includes('T') ? isoDate : `${isoDate}T12:00:00`)
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const b = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
  return Math.round((b - a) / 86400000)
}

/**
 * Ипотека — уведомление в день платежа.
 * Вклад — за N дней до окончания и в день окончания.
 */
export async function runFinanceNotifications(bot: Bot) {
  const today = new Date()
  const key = todayKey(today)
  const dayOfMonth = today.getDate()
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()

  for (const m of listAllMortgagesForNotify()) {
    const effectiveDay = Math.min(m.payment_day, lastDay)
    if (dayOfMonth !== effectiveDay) continue
    if (m.last_payment_notify === key) continue

    // numeric telegram id only
    if (!/^\d+$/.test(m.user_id)) continue

    const who = m.person ? ` (${m.person})` : ''
    const bank = m.bank ? ` · ${m.bank}` : ''
    const text = [
      `🏦 *Платёж по ипотеке сегодня*`,
      '',
      `*${m.title}*${who}${bank}`,
      `К оплате: *${formatRub(m.monthly_payment)}*`,
      m.principal ? `Остаток долга: ${formatRub(m.principal)}` : null,
      m.rate ? `Ставка: ${m.rate}%` : null,
      '',
      'Не забудьте внести платёж.',
    ]
      .filter(Boolean)
      .join('\n')

    try {
      await bot.api.sendMessage(Number(m.user_id), text, { parse_mode: 'Markdown' })
      markMortgageNotified(m.id, key)
      console.log(`[notify] mortgage #${m.id} → ${m.user_id}`)
    } catch (err) {
      console.warn(`[notify] mortgage #${m.id} failed:`, err)
    }
  }

  for (const d of listAllDepositsForNotify()) {
    if (!/^\d+$/.test(d.user_id)) continue

    const left = daysUntil(d.end_date, today)
    const before = d.notify_days_before ?? 3
    const event =
      left === 0 ? 'mature' : left === before ? 'soon' : left === 1 && before !== 1 ? 'tomorrow' : null
    if (!event) continue

    const notifyKey = `${key}:${event}`
    if (d.last_maturity_notify === notifyKey) continue

    const { payout, profit } = calcDepositPayout(d)
    const who = d.person ? ` (${d.person})` : ''
    const headline =
      event === 'mature'
        ? '💰 *Вклад истёк сегодня*'
        : event === 'tomorrow'
          ? '💰 *Вклад истекает завтра*'
          : `💰 *Вклад истекает через ${before} дн.*`

    const text = [
      headline,
      '',
      `*${d.bank}*${who}`,
      `Сумма: ${formatRub(d.amount)} · ${d.rate}% годовых`,
      `Окончание: ${formatDateRu(d.end_date)}`,
      `К выплате ≈ *${formatRub(payout)}* (доход ${formatRub(profit)})`,
      '',
      event === 'mature'
        ? 'Срок истёк — заберите средства или продлите вклад.'
        : 'Подготовьтесь к закрытию или пролонгации.',
    ].join('\n')

    try {
      await bot.api.sendMessage(Number(d.user_id), text, { parse_mode: 'Markdown' })
      markDepositNotified(d.id, notifyKey)
      console.log(`[notify] deposit #${d.id} → ${d.user_id} (${event})`)
    } catch (err) {
      console.warn(`[notify] deposit #${d.id} failed:`, err)
    }
  }
}

export function startNotificationScheduler(bot: Bot, intervalMs = 15 * 60 * 1000) {
  const tick = () => {
    runFinanceNotifications(bot).catch((err) => console.warn('[notify] tick failed:', err))
  }
  setTimeout(tick, 8_000)
  setInterval(tick, intervalMs)
  console.log(`[notify] планировщик каждые ${Math.round(intervalMs / 60000)} мин`)
}
