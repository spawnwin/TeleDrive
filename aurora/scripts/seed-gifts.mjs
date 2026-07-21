#!/usr/bin/env node
/**
 * Seed Telegram-style gift catalog with placeholder PNG assets.
 * Safe to run multiple times — upserts by slug, preserves admin-uploaded images.
 */
import { PrismaClient } from '@prisma/client'
import sharp from 'sharp'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const GIFTS_DIR = path.join(ROOT, 'public', 'uploads', 'gifts')

/** Public Telegram-style catalog (names + star prices only — no proprietary assets). */
const GIFTS = [
  { slug: 'bear', title: 'Мишка', titleEn: 'Bear', emoji: '🧸', color: '#D4A574', starPrice: 15, sortOrder: 1 },
  { slug: 'heart', title: 'Сердечко', titleEn: 'Heart', emoji: '💝', color: '#FF6B8A', starPrice: 15, sortOrder: 2 },
  { slug: 'gift-box', title: 'Подарок', titleEn: 'Gift Box', emoji: '🎁', color: '#9B59B6', starPrice: 25, sortOrder: 3 },
  { slug: 'rose', title: 'Роза', titleEn: 'Rose', emoji: '🌹', color: '#E74C3C', starPrice: 25, sortOrder: 4 },
  { slug: 'star', title: 'Звезда', titleEn: 'Star', emoji: '⭐', color: '#F1C40F', starPrice: 25, sortOrder: 5 },
  { slug: 'cake', title: 'Торт', titleEn: 'Cake', emoji: '🎂', color: '#FF9FF3', starPrice: 50, sortOrder: 6 },
  { slug: 'flowers', title: 'Букет', titleEn: 'Bouquet', emoji: '💐', color: '#FF6B9D', starPrice: 50, sortOrder: 7 },
  { slug: 'champagne', title: 'Шампанское', titleEn: 'Champagne', emoji: '🍾', color: '#2ECC71', starPrice: 50, sortOrder: 8 },
  { slug: 'rocket', title: 'Ракета', titleEn: 'Rocket', emoji: '🚀', color: '#3498DB', starPrice: 50, sortOrder: 9 },
  { slug: 'trophy', title: 'Кубок', titleEn: 'Trophy', emoji: '🏆', color: '#F39C12', starPrice: 100, sortOrder: 10 },
  { slug: 'ring', title: 'Кольцо', titleEn: 'Ring', emoji: '💍', color: '#A29BFE', starPrice: 100, sortOrder: 11 },
  { slug: 'diamond', title: 'Бриллиант', titleEn: 'Diamond', emoji: '💎', color: '#74B9FF', starPrice: 100, sortOrder: 12 },
  { slug: 'crown', title: 'Корона', titleEn: 'Crown', emoji: '👑', color: '#FDCE6B', starPrice: 250, sortOrder: 13 },
  { slug: 'swag-bag', title: 'Сумочка', titleEn: 'Swag Bag', emoji: '👜', color: '#E17055', starPrice: 500, sortOrder: 14 },
  { slug: 'scared-cat', title: 'Котёнок', titleEn: 'Scared Cat', emoji: '🐱', color: '#B2BEC3', starPrice: 500, sortOrder: 15 },
  { slug: 'sleigh-bell', title: 'Колокольчик', titleEn: 'Sleigh Bell', emoji: '🔔', color: '#D4AF37', starPrice: 500, sortOrder: 16, isLimited: true },
  { slug: 'peach', title: 'Персик', titleEn: 'Precious Peach', emoji: '🍑', color: '#FFB347', starPrice: 1000, sortOrder: 17, isLimited: true },
  { slug: 'durov-cap', title: 'Кепка', titleEn: "Durov's Cap", emoji: '🧢', color: '#2D3436', starPrice: 2500, sortOrder: 18, isLimited: true, isPremium: true },
  { slug: 'electric-sheep', title: 'Барашек', titleEn: 'Electric Sheep', emoji: '🐑', color: '#81ECEC', starPrice: 5000, sortOrder: 19, isLimited: true },
  // Extended Telegram-style collection (2026): more tiers, more limited drops.
  { slug: 'lollipop', title: 'Леденец', titleEn: 'Lollipop', emoji: '🍭', color: '#FF7EB9', starPrice: 15, sortOrder: 20 },
  { slug: 'balloon', title: 'Шарик', titleEn: 'Balloon', emoji: '🎈', color: '#FF5252', starPrice: 15, sortOrder: 21 },
  { slug: 'coffee', title: 'Кофе', titleEn: 'Coffee', emoji: '☕', color: '#8D6E63', starPrice: 15, sortOrder: 22 },
  { slug: 'cupcake', title: 'Капкейк', titleEn: 'Cupcake', emoji: '🧁', color: '#F8BBD0', starPrice: 25, sortOrder: 23 },
  { slug: 'clover', title: 'Клевер', titleEn: 'Lucky Clover', emoji: '🍀', color: '#4CAF50', starPrice: 25, sortOrder: 24 },
  { slug: 'love-letter', title: 'Письмо', titleEn: 'Love Letter', emoji: '💌', color: '#F48FB1', starPrice: 25, sortOrder: 25 },
  { slug: 'sunflower', title: 'Подсолнух', titleEn: 'Sunflower', emoji: '🌻', color: '#FBC02D', starPrice: 25, sortOrder: 26 },
  { slug: 'candle', title: 'Свеча', titleEn: 'Candle', emoji: '🕯️', color: '#FFE082', starPrice: 50, sortOrder: 27 },
  { slug: 'potion', title: 'Зелье', titleEn: 'Magic Potion', emoji: '🧪', color: '#7C4DFF', starPrice: 50, sortOrder: 28 },
  { slug: 'ice-cream', title: 'Мороженое', titleEn: 'Ice Cream', emoji: '🍨', color: '#B3E5FC', starPrice: 50, sortOrder: 29 },
  { slug: 'guitar', title: 'Гитара', titleEn: 'Guitar', emoji: '🎸', color: '#FF7043', starPrice: 100, sortOrder: 30 },
  { slug: 'telescope', title: 'Телескоп', titleEn: 'Telescope', emoji: '🔭', color: '#5C6BC0', starPrice: 100, sortOrder: 31 },
  { slug: 'fireworks', title: 'Салют', titleEn: 'Fireworks', emoji: '🎆', color: '#283593', starPrice: 100, sortOrder: 32 },
  { slug: 'golden-key', title: 'Ключик', titleEn: 'Golden Key', emoji: '🗝️', color: '#D4AF37', starPrice: 100, sortOrder: 33 },
  { slug: 'crystal-ball', title: 'Хрустальный шар', titleEn: 'Crystal Ball', emoji: '🔮', color: '#9575CD', starPrice: 250, sortOrder: 34 },
  { slug: 'gold-watch', title: 'Часы', titleEn: 'Gold Watch', emoji: '⌚', color: '#FFD54F', starPrice: 250, sortOrder: 35 },
  { slug: 'money-bag', title: 'Мешок монет', titleEn: 'Money Bag', emoji: '💰', color: '#F9A825', starPrice: 250, sortOrder: 36 },
  { slug: 'santa-hat', title: 'Новогодний колпак', titleEn: 'Santa Hat', emoji: '🎅', color: '#C62828', starPrice: 500, sortOrder: 37, isLimited: true },
  { slug: 'unicorn', title: 'Единорог', titleEn: 'Unicorn', emoji: '🦄', color: '#F06292', starPrice: 500, sortOrder: 38, isLimited: true },
  { slug: 'phoenix', title: 'Феникс', titleEn: 'Phoenix', emoji: '🐦‍🔥', color: '#FF6F00', starPrice: 1000, sortOrder: 39, isLimited: true },
  { slug: 'galaxy', title: 'Галактика', titleEn: 'Galaxy', emoji: '🌌', color: '#311B92', starPrice: 1000, sortOrder: 40, isLimited: true },
  { slug: 'dragon', title: 'Дракон', titleEn: 'Dragon', emoji: '🐉', color: '#00695C', starPrice: 2500, sortOrder: 41, isLimited: true, isPremium: true },
  { slug: 'comet', title: 'Комета', titleEn: 'Comet', emoji: '☄️', color: '#37474F', starPrice: 5000, sortOrder: 42, isLimited: true },
  { slug: 'aurora-star', title: 'Аврора', titleEn: 'Aurora', emoji: '🌠', color: '#00BCD4', starPrice: 10000, sortOrder: 43, isLimited: true, isPremium: true },
  // 2026 winter drop: more everyday-tier gifts plus a few new limited/premium ones.
  { slug: 'chocolate-bar', title: 'Шоколадка', titleEn: 'Chocolate Bar', emoji: '🍫', color: '#6D4C41', starPrice: 15, sortOrder: 44 },
  { slug: 'turtle', title: 'Черепашка', titleEn: 'Turtle', emoji: '🐢', color: '#66BB6A', starPrice: 15, sortOrder: 45 },
  { slug: 'ribbon', title: 'Лента', titleEn: 'Ribbon', emoji: '🎗️', color: '#EC407A', starPrice: 25, sortOrder: 46 },
  { slug: 'penguin', title: 'Пингвин', titleEn: 'Penguin', emoji: '🐧', color: '#37474F', starPrice: 25, sortOrder: 47 },
  { slug: 'pumpkin', title: 'Тыква', titleEn: 'Pumpkin', emoji: '🎃', color: '#FB8C00', starPrice: 25, sortOrder: 48 },
  { slug: 'toast-glasses', title: 'Бокалы', titleEn: 'Toast', emoji: '🥂', color: '#FFCA28', starPrice: 50, sortOrder: 49 },
  { slug: 'butterfly-wings', title: 'Крылья бабочки', titleEn: 'Butterfly Wings', emoji: '🦋', color: '#7E57C2', starPrice: 50, sortOrder: 50 },
  { slug: 'piano', title: 'Пианино', titleEn: 'Piano', emoji: '🎹', color: '#263238', starPrice: 100, sortOrder: 51 },
  { slug: 'red-envelope', title: 'Конверт удачи', titleEn: 'Red Envelope', emoji: '🧧', color: '#D32F2F', starPrice: 100, sortOrder: 52 },
  { slug: 'castle', title: 'Замок', titleEn: 'Castle', emoji: '🏰', color: '#8E24AA', starPrice: 250, sortOrder: 53 },
  { slug: 'peacock', title: 'Павлин', titleEn: 'Peacock', emoji: '🦚', color: '#00897B', starPrice: 250, sortOrder: 54 },
  { slug: 'swan', title: 'Лебедь', titleEn: 'Swan', emoji: '🦢', color: '#B0BEC5', starPrice: 250, sortOrder: 55, isLimited: true },
  { slug: 'moai', title: 'Моаи', titleEn: 'Moai', emoji: '🗿', color: '#5D4037', starPrice: 500, sortOrder: 56, isLimited: true },
  { slug: 'rainbow-prism', title: 'Призма', titleEn: 'Rainbow Prism', emoji: '🌈', color: '#673AB7', starPrice: 1000, sortOrder: 57, isLimited: true },
  { slug: 'violin', title: 'Скрипка', titleEn: 'Violin', emoji: '🎻', color: '#4E342E', starPrice: 2500, sortOrder: 58, isLimited: true, isPremium: true },
  // Elite collectibles drop — rarer supply, premium flair (Telegram NFT-like).
  { slug: 'neon-fox', title: 'Неоновая лиса', titleEn: 'Neon Fox', emoji: '🦊', color: '#FF6D00', starPrice: 1500, sortOrder: 59, isLimited: true, totalSupply: 500 },
  { slug: 'crystal-heart', title: 'Кристальное сердце', titleEn: 'Crystal Heart', emoji: '💖', color: '#E040FB', starPrice: 750, sortOrder: 60, isLimited: true, totalSupply: 777 },
  { slug: 'black-lotus', title: 'Чёрный лотос', titleEn: 'Black Lotus', emoji: '🖤', color: '#212121', starPrice: 3000, sortOrder: 61, isLimited: true, isPremium: true, totalSupply: 333 },
  { slug: 'ice-phoenix', title: 'Ледяной феникс', titleEn: 'Ice Phoenix', emoji: '🧊', color: '#4FC3F7', starPrice: 4000, sortOrder: 62, isLimited: true, isPremium: true, totalSupply: 250 },
  { slug: 'royal-scepter', title: 'Скипетр', titleEn: 'Royal Scepter', emoji: '🪄', color: '#FFD54F', starPrice: 3500, sortOrder: 63, isLimited: true, isPremium: true, totalSupply: 200 },
  { slug: 'void-orb', title: 'Сфера пустоты', titleEn: 'Void Orb', emoji: '🌑', color: '#311B92', starPrice: 2000, sortOrder: 64, isLimited: true, totalSupply: 444 },
  { slug: 'golden-owl', title: 'Золотая сова', titleEn: 'Golden Owl', emoji: '🦉', color: '#FFB300', starPrice: 1800, sortOrder: 65, isLimited: true, totalSupply: 600 },
  { slug: 'emerald-serpent', title: 'Изумрудный змей', titleEn: 'Emerald Serpent', emoji: '🐍', color: '#00C853', starPrice: 2200, sortOrder: 66, isLimited: true, isPremium: true, totalSupply: 365 },
  { slug: 'starlight-lantern', title: 'Фонарь звёзд', titleEn: 'Starlight Lantern', emoji: '🏮', color: '#FF7043', starPrice: 1200, sortOrder: 67, isLimited: true, totalSupply: 888 },
  { slug: 'titan-helmet', title: 'Шлем титана', titleEn: 'Titan Helmet', emoji: '🪖', color: '#546E7A', starPrice: 5000, sortOrder: 68, isLimited: true, isPremium: true, totalSupply: 100 },
  { slug: 'moon-rabbit', title: 'Лунный кролик', titleEn: 'Moon Rabbit', emoji: '🐰', color: '#ECEFF1', starPrice: 900, sortOrder: 69, isLimited: true, totalSupply: 999 },
  { slug: 'platinum-rose', title: 'Платиновая роза', titleEn: 'Platinum Rose', emoji: '🥀', color: '#B0BEC5', starPrice: 1600, sortOrder: 70, isLimited: true, isPremium: true, totalSupply: 420 },
  { slug: 'cyber-cat', title: 'Киберкот', titleEn: 'Cyber Cat', emoji: '😺', color: '#00E5FF', starPrice: 1100, sortOrder: 71, isLimited: true, totalSupply: 700 },
  { slug: 'ancient-scroll', title: 'Древний свиток', titleEn: 'Ancient Scroll', emoji: '📜', color: '#A1887F', starPrice: 2800, sortOrder: 72, isLimited: true, isPremium: true, totalSupply: 180 },
  { slug: 'fire-opal', title: 'Огненный опал', titleEn: 'Fire Opal', emoji: '🔥', color: '#FF3D00', starPrice: 3200, sortOrder: 73, isLimited: true, isPremium: true, totalSupply: 150 },
  { slug: 'obsidian-blade', title: 'Обсидиановый клинок', titleEn: 'Obsidian Blade', emoji: '🗡️', color: '#263238', starPrice: 4500, sortOrder: 74, isLimited: true, isPremium: true, totalSupply: 120 },
  { slug: 'aurora-wolf', title: 'Волк Авроры', titleEn: 'Aurora Wolf', emoji: '🐺', color: '#26C6DA', starPrice: 6000, sortOrder: 75, isLimited: true, isPremium: true, totalSupply: 99 },
  { slug: 'sapphire-crown', title: 'Сапфировая корона', titleEn: 'Sapphire Crown', emoji: '👑', color: '#1565C0', starPrice: 5500, sortOrder: 76, isLimited: true, isPremium: true, totalSupply: 88 },
  { slug: 'plasma-dragon', title: 'Плазменный дракон', titleEn: 'Plasma Dragon', emoji: '🐲', color: '#D500F9', starPrice: 7000, sortOrder: 77, isLimited: true, isPremium: true, totalSupply: 66 },
  { slug: 'mystic-mirror', title: 'Мистическое зеркало', titleEn: 'Mystic Mirror', emoji: '🪞', color: '#78909C', starPrice: 2400, sortOrder: 78, isLimited: true, totalSupply: 350 },
  { slug: 'quantum-cube', title: 'Квантовый куб', titleEn: 'Quantum Cube', emoji: '🧊', color: '#00E5FF', starPrice: 3800, sortOrder: 79, isLimited: true, isPremium: true, totalSupply: 222 },
  { slug: 'celestial-harp', title: 'Небесная арфа', titleEn: 'Celestial Harp', emoji: '🎵', color: '#FFD54F', starPrice: 4200, sortOrder: 80, isLimited: true, isPremium: true, totalSupply: 175 },
  { slug: 'blood-ruby', title: 'Кровавый рубин', titleEn: 'Blood Ruby', emoji: '♦️', color: '#B71C1C', starPrice: 3300, sortOrder: 81, isLimited: true, isPremium: true, totalSupply: 256 },
  { slug: 'frost-dragon', title: 'Ледяной дракон', titleEn: 'Frost Dragon', emoji: '❄️', color: '#81D4FA', starPrice: 6500, sortOrder: 82, isLimited: true, isPremium: true, totalSupply: 77 },
  { slug: 'chronos-watch', title: 'Часы Хроноса', titleEn: 'Chronos Watch', emoji: '⏱️', color: '#FF8F00', starPrice: 4800, sortOrder: 83, isLimited: true, isPremium: true, totalSupply: 140 },
  { slug: 'nebula-cat', title: 'Кот туманности', titleEn: 'Nebula Cat', emoji: '🐈‍⬛', color: '#7C4DFF', starPrice: 1900, sortOrder: 84, isLimited: true, totalSupply: 555 },
  { slug: 'phoenix-egg', title: 'Яйцо феникса', titleEn: 'Phoenix Egg', emoji: '🥚', color: '#FF6D00', starPrice: 8000, sortOrder: 85, isLimited: true, isPremium: true, totalSupply: 50 },
  { slug: 'shadow-panther', title: 'Теневая пантера', titleEn: 'Shadow Panther', emoji: '🐆', color: '#263238', starPrice: 3600, sortOrder: 86, isLimited: true, isPremium: true, totalSupply: 190 },
  { slug: 'solar-flare', title: 'Солнечная вспышка', titleEn: 'Solar Flare', emoji: '☀️', color: '#FFEA00', starPrice: 5200, sortOrder: 87, isLimited: true, isPremium: true, totalSupply: 111 },
  { slug: 'crystal-unicorn', title: 'Кристальный единорог', titleEn: 'Crystal Unicorn', emoji: '🦄', color: '#E1BEE7', starPrice: 2700, sortOrder: 88, isLimited: true, totalSupply: 480 },
  { slug: 'void-kraken', title: 'Кракен пустоты', titleEn: 'Void Kraken', emoji: '🦑', color: '#1A237E', starPrice: 7500, sortOrder: 89, isLimited: true, isPremium: true, totalSupply: 45 },
  { slug: 'aurora-lyre', title: 'Лира Авроры', titleEn: 'Aurora Lyre', emoji: '🎶', color: '#18FFFF', starPrice: 9000, sortOrder: 90, isLimited: true, isPremium: true, totalSupply: 33 },
]


function convertStars(starPrice) {
  return Math.round(starPrice * 0.85)
}

function lighten(hex, amount = 0.22) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, ((n >> 16) & 0xff) + Math.round(255 * amount))
  const g = Math.min(255, ((n >> 8) & 0xff) + Math.round(255 * amount))
  const b = Math.min(255, (n & 0xff) + Math.round(255 * amount))
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

function darken(hex, amount = 0.3) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, ((n >> 16) & 0xff) - Math.round(255 * amount))
  const g = Math.max(0, ((n >> 8) & 0xff) - Math.round(255 * amount))
  const b = Math.max(0, (n & 0xff) - Math.round(255 * amount))
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

// --- Twemoji vector emoji (CC-BY 4.0, © Twitter/X contributors) -------------
// Embedded as data URIs so both librsvg (PNG raster) and browsers render the
// same crisp color artwork regardless of installed emoji fonts.
const TWEMOJI_CACHE_DIR = path.join(__dirname, '.twemoji-cache')
const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg'

function emojiCodepoints(emoji) {
  const cps = [...emoji].map((c) => c.codePointAt(0))
  const hasZwj = cps.includes(0x200d)
  const filtered = hasZwj ? cps : cps.filter((c) => c !== 0xfe0f)
  return filtered.map((c) => c.toString(16)).join('-')
}

async function fetchTwemojiDataUri(emoji) {
  const code = emojiCodepoints(emoji)
  const cacheFile = path.join(TWEMOJI_CACHE_DIR, `${code}.svg`)
  let svg = null
  try {
    svg = await (await import('fs/promises')).readFile(cacheFile, 'utf8')
  } catch {
    try {
      const res = await fetch(`${TWEMOJI_BASE}/${code}.svg`)
      if (!res.ok) throw new Error(`twemoji ${code}: HTTP ${res.status}`)
      svg = await res.text()
      await mkdir(TWEMOJI_CACHE_DIR, { recursive: true })
      await writeFile(cacheFile, svg)
    } catch (err) {
      console.warn(`  ! twemoji fallback to text for ${emoji} (${err.message})`)
      return null
    }
  }
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

// Deterministic PRNG from slug so each gift gets a stable, unique composition.
function hashSeed(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Layered gift art (original, generated): radial background with vignette,
 * light rays, twinkling sparkles, glossy highlight, glow and the emoji hero.
 * With `animated: true` the SVG carries CSS keyframes (float, twinkle,
 * rotating rays, pulsing glow) — animated SVG plays inside plain <img>.
 * Limited gifts get golden rays/sparkles, premium ones an orbiting ring.
 */
function giftArtSvg(gift, { animated, emojiImage }) {
  const C = 256
  const rnd = mulberry32(hashSeed(gift.slug))
  const accent = gift.isLimited ? '#ffd76b' : '#ffffff'

  let sparkles = ''
  for (let i = 0; i < 8; i++) {
    const ang = rnd() * Math.PI * 2
    const dist = 150 + rnd() * 82
    const x = (C + Math.cos(ang) * dist).toFixed(0)
    const y = (C + Math.sin(ang) * dist * 0.92).toFixed(0)
    const s = (7 + rnd() * 10).toFixed(1)
    const delay = (rnd() * 2.8).toFixed(2)
    const k = (s * 0.3).toFixed(1)
    sparkles += `<g transform="translate(${x},${y})"><path class="sp" style="animation-delay:${delay}s" opacity="0.75" d="M0 -${s} L ${k} -${k} L ${s} 0 L ${k} ${k} L 0 ${s} L -${k} ${k} L -${s} 0 L -${k} -${k} Z" fill="${accent}"/></g>`
  }

  let rays = ''
  for (let i = 0; i < 12; i++) {
    rays += `<path d="M0 0 L -24 -250 A 250 250 0 0 1 24 -250 Z" transform="rotate(${i * 30})" fill="url(#ray)"/>`
  }
  const rayTilt = Math.round(rnd() * 30)

  const styles = animated
    ? `<style>
      .float { animation: float 3.4s ease-in-out infinite; }
      .glow { animation: glow 3.4s ease-in-out infinite; }
      .sp { animation: tw 2.8s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
      .rays { animation: spin 18s linear infinite; }
      .ring { animation: spinb 9s linear infinite; }
      @keyframes float { 0%,100% { transform: translateY(10px); } 50% { transform: translateY(-10px); } }
      @keyframes glow { 0%,100% { opacity: .4; } 50% { opacity: .8; } }
      @keyframes tw { 0%,100% { opacity: .12; transform: scale(.55); } 50% { opacity: 1; transform: scale(1.2); } }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes spinb { to { transform: rotate(-360deg); } }
    </style>`
    : ''

  const premiumRing = gift.isPremium
    ? `<g transform="translate(${C},${C})"><g class="ring"><circle r="236" fill="none" stroke="url(#ringg)" stroke-width="7" stroke-dasharray="46 30" stroke-linecap="round" opacity="0.9"/></g></g>`
    : ''

  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  ${styles}
  <defs>
    <radialGradient id="bg" cx="38%" cy="30%" r="80%">
      <stop offset="0%" stop-color="${lighten(gift.color, 0.34)}"/>
      <stop offset="55%" stop-color="${gift.color}"/>
      <stop offset="100%" stop-color="${darken(gift.color, 0.32)}"/>
    </radialGradient>
    <linearGradient id="ray" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0.22"/>
    </linearGradient>
    <linearGradient id="ringg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffd76b"/>
      <stop offset="50%" stop-color="#ff9d6b"/>
      <stop offset="100%" stop-color="#ffd76b"/>
    </linearGradient>
    <filter id="blur" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="34"/>
    </filter>
    <filter id="drop" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="${darken(gift.color, 0.5)}" flood-opacity="0.55"/>
    </filter>
    <clipPath id="clip"><circle cx="${C}" cy="${C}" r="246"/></clipPath>
  </defs>
  <g clip-path="url(#clip)">
    <circle cx="${C}" cy="${C}" r="246" fill="url(#bg)"/>
    <g transform="translate(${C},${C}) rotate(${rayTilt})"><g class="rays">${rays}</g></g>
    <ellipse cx="176" cy="128" rx="150" ry="76" fill="#ffffff" opacity="0.16" transform="rotate(-24 176 128)"/>
    <circle class="glow" cx="${C}" cy="${C}" r="148" fill="${lighten(gift.color, 0.45)}" opacity="0.5" filter="url(#blur)"/>
    ${sparkles}
    <g transform="translate(${C},${C})">
      <g class="float">
        ${emojiImage
          ? `<image x="-124" y="-124" width="248" height="248" href="${emojiImage}" filter="url(#drop)"/>`
          : `<text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-size="216" filter="url(#drop)"
          font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">${gift.emoji}</text>`}
      </g>
    </g>
  </g>
  ${premiumRing}
  <circle cx="${C}" cy="${C}" r="246" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="6"/>
</svg>`
}

async function writeStaticPng(gift, size, emojiImage) {
  const filename = `${gift.slug}-${size}.png`
  const filePath = path.join(GIFTS_DIR, filename)
  const svg = giftArtSvg(gift, { animated: false, emojiImage })
  const buf = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()
  await writeFile(filePath, buf)
  return `/uploads/gifts/${filename}`
}

async function writeAnimatedSvg(gift, emojiImage) {
  const filename = `${gift.slug}-anim.svg`
  const filePath = path.join(GIFTS_DIR, filename)
  await writeFile(filePath, giftArtSvg(gift, { animated: true, emojiImage }))
  return `/uploads/gifts/${filename}`
}

function isSeedAssetUrl(url, slug, suffix) {
  if (!url) return true
  return url.includes(`/uploads/gifts/${slug}-${suffix}`)
}

async function ensurePlaceholders(gift) {
  const emojiImage = await fetchTwemojiDataUri(gift.emoji)
  const thumbnailUrl = await writeStaticPng(gift, 128, emojiImage)
  const stickerUrl = await writeStaticPng(gift, 512, emojiImage)
  const animationUrl = await writeAnimatedSvg(gift, emojiImage)
  return { thumbnailUrl, stickerUrl, animationUrl }
}

const db = new PrismaClient()

async function main() {
  await mkdir(GIFTS_DIR, { recursive: true })

  const seeded = []

  for (const gift of GIFTS) {
    const urls = await ensurePlaceholders(gift)
    const existing = await db.giftCatalogItem.findUnique({ where: { slug: gift.slug } })

    const data = {
      title: gift.title,
      titleEn: gift.titleEn,
      starPrice: gift.starPrice,
      convertStars: convertStars(gift.starPrice),
      thumbnailUrl: existing && !isSeedAssetUrl(existing.thumbnailUrl, gift.slug, 128)
        ? existing.thumbnailUrl
        : urls.thumbnailUrl,
      stickerUrl: existing && !isSeedAssetUrl(existing.stickerUrl, gift.slug, 512)
        ? existing.stickerUrl
        : urls.stickerUrl,
      animationUrl: existing && existing.animationUrl && !isSeedAssetUrl(existing.animationUrl, gift.slug, 'anim')
        ? existing.animationUrl
        : urls.animationUrl,
      isLimited: !!gift.isLimited,
      isPremium: !!gift.isPremium,
      totalSupply: gift.isLimited ? (gift.totalSupply ?? 999) : null,
      sortOrder: gift.sortOrder,
      active: true,
    }

    const row = await db.giftCatalogItem.upsert({
      where: { slug: gift.slug },
      create: { slug: gift.slug, ...data },
      update: data,
    })

    seeded.push({
      slug: row.slug,
      title: row.title,
      starPrice: row.starPrice,
      convertStars: row.convertStars,
    })
  }

  console.log(`seed-gifts: ${seeded.length} catalog items ready`)
  for (const g of seeded) {
    console.log(`  • ${g.slug}: ${g.title} — ${g.starPrice} ⭐ (convert ${g.convertStars})`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
