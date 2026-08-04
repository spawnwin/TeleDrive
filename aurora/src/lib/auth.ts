import { db } from '@/lib/db'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto'

// Session management using database-backed sessions.
// Sessions persist across server restarts and HMR updates.

const SESSION_COOKIE = 'messenger_session'
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const PRESENCE_WRITE_INTERVAL_MS = 60 * 1000
const SCRYPT_KEY_LEN = 64
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const

function hashPasswordLegacy(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

function hashPasswordScrypt(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(password, salt, SCRYPT_KEY_LEN, SCRYPT_OPTIONS).toString('hex')
  return `scrypt:${salt}:${derived}`
}

export function verifyPassword(password: string, hashed: string): boolean {
  if (hashed.startsWith('scrypt:')) {
    const [, salt, expectedHex] = hashed.split(':')
    if (!salt || !expectedHex) return false
    const derived = scryptSync(password, salt, SCRYPT_KEY_LEN, SCRYPT_OPTIONS)
    const expected = Buffer.from(expectedHex, 'hex')
    if (derived.length !== expected.length) return false
    return timingSafeEqual(derived, expected)
  }
  // Legacy (pre-scrypt) accounts — plain === leaks timing info about how
  // many leading hex characters matched, letting an attacker recover the
  // hash byte-by-byte. Same fixed-length hex digest either way, so a
  // constant-time compare is a straight swap with no format change.
  const derived = Buffer.from(hashPasswordLegacy(password), 'hex')
  const expected = Buffer.from(hashed, 'hex')
  if (derived.length !== expected.length) return false
  return timingSafeEqual(derived, expected)
}

export function hash(password: string): string {
  return hashPasswordScrypt(password)
}

export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

export async function createUserSession(
  userId: string,
  meta?: { userAgent?: string | null; ip?: string | null },
) {
  const token = generateToken()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS)

  // Save session to database (device meta for Settings → Devices)
  await db.session.create({
    data: {
      token,
      userId,
      createdAt: now,
      expiresAt,
      userAgent: meta?.userAgent ? String(meta.userAgent).slice(0, 512) : null,
      ip: meta?.ip ? String(meta.ip).slice(0, 64) : null,
      lastActiveAt: now,
    },
  })

  const c = await cookies()
  c.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })
}

export async function getCurrentUser() {
  // Probabilistically clean up expired sessions (~1 in 1000 requests)
  if (Math.random() < 0.001) {
    void cleanupExpiredSessions()
  }

  const c = await cookies()
  const token = c.get(SESSION_COOKIE)?.value
  if (!token) return null

  // Look up session in database
  const session = await db.session.findUnique({
    where: { token },
    select: { userId: true, expiresAt: true, lastActiveAt: true },
  })

  if (!session) return null

  // Check if session has expired
  if (new Date() > session.expiresAt) {
    // Clean up expired session
    await db.session.delete({ where: { token } }).catch(() => {})
    return null
  }

  // Throttle lastActiveAt writes (~1/min)
  const lastActiveMs = session.lastActiveAt ? new Date(session.lastActiveAt).getTime() : 0
  if (Date.now() - lastActiveMs > PRESENCE_WRITE_INTERVAL_MS) {
    void db.session.update({
      where: { token },
      data: { lastActiveAt: new Date() },
    }).catch(() => {})
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      username: true,
      name: true,
      avatarColor: true,
      avatarUrl: true,
      bio: true,
      online: true,
      lastSeen: true,
      language: true,
      balance: true,
      coins: true,
      isPremium: true,
      isAdmin: true,
      isBanned: true,
      premiumUntil: true,
      premiumTheme: true,
      chatWallpaper: true,
      emojiStatus: true,
      lastDailyBonus: true,
      publicKey: true,
      twoFactorEnabled: true,
      isBot: true,
      storageUsed: true,
      storageQuota: true,
      createdAt: true,
    },
  })

  // Mark user as online whenever they make an authenticated request
  if (user && user.isBanned) return null

  if (user) {
    // Throttle the presence write: one DB update per PRESENCE_WRITE_INTERVAL_MS
    // per user, otherwise every authenticated request costs a write.
    const lastSeenMs = user.lastSeen ? new Date(user.lastSeen).getTime() : 0
    const stale = Date.now() - lastSeenMs > PRESENCE_WRITE_INTERVAL_MS
    if (!user.online || stale) {
      await db.user.update({
        where: { id: user.id },
        data: { online: true, lastSeen: new Date() },
      }).catch(() => {})
    }
  }

  // Return a copy with presence fields updated (avoid mutating the Prisma result)
  return user ? { ...user, online: true, lastSeen: new Date() } : user
}

export async function logout() {
  const c = await cookies()
  const token = c.get(SESSION_COOKIE)?.value
  if (token) {
    // Find and delete the session from database
    const session = await db.session.findUnique({
      where: { token },
      select: { userId: true },
    })
    if (session) {
      // Mark user as offline
      await db.user.update({
        where: { id: session.userId },
        data: { online: false, lastSeen: new Date() },
      }).catch(() => {})
    }
    // Delete session from database
    await db.session.delete({ where: { token } }).catch(() => {})
  }
  c.delete({ name: SESSION_COOKIE, path: '/' })
}

// Clean up expired sessions (can be called periodically)
export async function cleanupExpiredSessions() {
  await db.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  }).catch(() => {})
}

let adminsEnsured = false

/** Promote users listed in ADMIN_USERNAMES env to admin (idempotent, once per process). */
export async function ensureAdminsFromEnv() {
  if (adminsEnsured) return
  adminsEnsured = true
  const names = process.env.ADMIN_USERNAMES?.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (!names?.length) return
  await db.user.updateMany({
    where: { username: { in: names } },
    data: { isAdmin: true },
  }).catch(() => {})
}

/** Returns current user if admin, otherwise null. Ensures env admins on first call. */
export async function requireAdmin() {
  await ensureAdminsFromEnv()
  const user = await getCurrentUser()
  if (!user?.isAdmin) return null
  return user
}

/** Server-side guard for admin pages — redirects non-admins to home. */
export async function requireAdminPage() {
  const user = await requireAdmin()
  if (!user) redirect('/')
  return user
}
