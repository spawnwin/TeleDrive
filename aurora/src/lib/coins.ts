// Aurora Coins — the app's internal balance, denominated 1:1 in Russian
// rubles (no exchange rate anywhere): topping up 10₽ credits exactly 10 to
// the balance, and every spend (donations, marketplace, gifts, Premium)
// debits the same ruble amount, minus platform fee percentages where those
// apply. The ★ symbol in the UI is purely cosmetic — it always means ₽.

export const COIN_REWARDS = {
  DAILY_BONUS: 10,
  SHORT_VIEW: 2,
  WELCOME: 50,
} as const

export const PREMIUM_PRICE = 100
export const PREMIUM_DURATION_DAYS = 30

// Quick-select amounts (₽) shown in the top-up dialog; the user can also
// enter any custom amount within TOPUP_MIN_RUB..TOPUP_MAX_RUB.
export const TOPUP_PRESETS_RUB = [100, 300, 500, 1000, 3000] as const
export const TOPUP_MIN_RUB = 10
export const TOPUP_MAX_RUB = 100_000

/** Telegram-inspired Premium themes (CSS class = premium-<id>). */
export const PREMIUM_THEMES = [
  'classic',
  'night',
  'graphite',
  'arctic',
  'mint',
  'cherry',
  'ocean',
  'golden',
  'lavender',
  'coffee',
  'emerald',
  'rose',
  'steel',
  'aurora',
  'galaxy',
  'sunset',
] as const
export type PremiumTheme = (typeof PREMIUM_THEMES)[number]

export function isPremiumActive(user: {
  isPremium?: boolean
  premiumUntil?: string | Date | null
}): boolean {
  if (!user.isPremium) return false
  if (!user.premiumUntil) return true
  return new Date(user.premiumUntil) > new Date()
}

export function getUploadLimitMb(isPremium: boolean): number {
  return isPremium ? 100 : 50
}

export function getComposerLimitMb(isPremium: boolean): number {
  return isPremium ? 20 : 10
}
