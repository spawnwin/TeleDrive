// P2P marketplace — constants and shared helpers.

export const MARKETPLACE_CATEGORIES = [
  'electronics',
  'clothing',
  'services',
  'digital',
  'other',
] as const
export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number]

export const MARKETPLACE_CATEGORY_LABELS_RU: Record<MarketplaceCategory, string> = {
  electronics: 'Электроника',
  clothing: 'Одежда',
  services: 'Услуги',
  digital: 'Цифровые товары',
  other: 'Другое',
}

export const MARKETPLACE_CATEGORY_LABELS_EN: Record<MarketplaceCategory, string> = {
  electronics: 'Electronics',
  clothing: 'Clothing',
  services: 'Services',
  digital: 'Digital goods',
  other: 'Other',
}

export const MAX_LISTING_IMAGES = 5
export const MIN_LISTING_PRICE_COINS = 1
export const MAX_LISTING_PRICE_COINS = 1_000_000

export function serializeListingImages(images: string | null): string[] {
  return images ? images.split(',').map((s) => s.trim()).filter(Boolean) : []
}
