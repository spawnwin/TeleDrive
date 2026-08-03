import { db } from '@/lib/db'

// Admin-configurable platform economy — withdrawal limits, creator earning
// rates, and Premium pricing. Always read fresh from the DB (no caching):
// these values gate real money, so a stale cache could over/undercharge.

export interface EconomySettings {
  minWithdrawalRub: number
  maxWithdrawalRub: number | null
  viewRateRub: number
  adShareRub: number
  coinsPerView: number
  premiumPriceCoins: number
  premiumDurationDays: number
  marketplaceFeePercent: number
  donationFeePercent: number
}

export const ECONOMY_DEFAULTS: EconomySettings = {
  minWithdrawalRub: 100,
  maxWithdrawalRub: null,
  viewRateRub: 0.05,
  adShareRub: 0.02,
  coinsPerView: 2,
  premiumPriceCoins: 100,
  premiumDurationDays: 30,
  marketplaceFeePercent: 5,
  donationFeePercent: 10,
}

export async function getEconomySettings(): Promise<EconomySettings> {
  const row = await db.platformEconomySettings.findFirst({ orderBy: { updatedAt: 'desc' } })
  if (!row) return ECONOMY_DEFAULTS
  return {
    minWithdrawalRub: row.minWithdrawalRub,
    maxWithdrawalRub: row.maxWithdrawalRub,
    viewRateRub: row.viewRateRub,
    adShareRub: row.adShareRub,
    coinsPerView: row.coinsPerView,
    premiumPriceCoins: row.premiumPriceCoins,
    premiumDurationDays: row.premiumDurationDays,
    marketplaceFeePercent: row.marketplaceFeePercent,
    donationFeePercent: row.donationFeePercent,
  }
}
