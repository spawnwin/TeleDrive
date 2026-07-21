/** Telegram-style gift asset specifications (Aurora Stars). */

export const GIFT_ASSET_SPECS = {
  /** Catalog grid / picker tile */
  thumbnail: {
    width: 128,
    height: 128,
    maxSizeBytes: 3 * 1024 * 1024,
    formats: ['image/png', 'image/webp'] as const,
    label: '128×128 px, PNG или WebP, до 3 МБ',
  },
  /** Main gift sticker shown in chat & profile */
  sticker: {
    width: 512,
    height: 512,
    maxSizeBytes: 3 * 1024 * 1024,
    formats: ['image/png', 'image/webp', 'image/gif'] as const,
    label: '512×512 px, PNG/WebP/GIF, до 3 МБ',
  },
  /** Optional full animation (Telegram TGS/WebM equivalent) */
  animation: {
    maxSizeBytes: 3 * 1024 * 1024,
    formats: ['video/webm', 'image/gif', 'image/webp'] as const,
    label: 'WebM/GIF/WebP, до 3 МБ (опционально)',
  },
} as const

export type GiftAssetKind = keyof typeof GIFT_ASSET_SPECS

export const GIFT_COIN_REASONS = {
  SEND: 'gift_send',
  CONVERT: 'gift_convert',
} as const

export const DEFAULT_LIMITED_SUPPLY = 999

export interface GiftMetadata {
  giftId: string
  giftSentId: string
  giftTitle: string
  giftThumbnailUrl: string
  giftStickerUrl: string
  giftAnimationUrl?: string | null
  starsSpent: number
  isPrivate?: boolean
  note?: string | null
  isLimited?: boolean
  serialNumber?: number | null
  totalSupply?: number | null
}

export function formatGiftSerial(serial: number | null | undefined): string | null {
  if (serial == null || !Number.isFinite(serial) || serial <= 0) return null
  return `#${String(Math.floor(serial)).padStart(3, '0')}`
}

export function parseGiftMetadata(raw: string | null | undefined): GiftMetadata | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as GiftMetadata
    if (!data.giftId || !data.giftStickerUrl) return null
    return data
  } catch {
    return null
  }
}

export function serializeGiftMetadata(data: GiftMetadata): string {
  return JSON.stringify(data)
}
