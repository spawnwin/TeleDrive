/**
 * Password helpers for Aurora.
 * Canonical format matches login/register: scrypt via `@/lib/auth`.
 * bcrypt hashes (from an earlier password-change bug) still verify.
 */

import { hash as hashAuth, verifyPassword as verifyAuthPassword } from '@/lib/auth'

type BcryptLike = {
  compare: (data: string, encrypted: string) => Promise<boolean>
}

let cachedBcrypt: BcryptLike | null = null

async function getBcrypt(): Promise<BcryptLike> {
  if (cachedBcrypt) return cachedBcrypt
  const mod = (await import('bcryptjs')) as unknown as BcryptLike & {
    default?: BcryptLike
  }
  cachedBcrypt = (mod.default || mod) as BcryptLike
  return cachedBcrypt
}

export async function hashPassword(plain: string): Promise<string> {
  return hashAuth(plain)
}

export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  if (!hashed) return false
  // bcrypt leftover from earlier password-change path
  if (hashed.startsWith('$2a$') || hashed.startsWith('$2b$') || hashed.startsWith('$2y$')) {
    try {
      const bcrypt = await getBcrypt()
      return bcrypt.compare(plain, hashed)
    } catch {
      return false
    }
  }
  return verifyAuthPassword(plain, hashed)
}

export function validatePasswordStrength(plain: string): string | null {
  if (plain.length < 6) return 'Пароль слишком короткий (минимум 6 символов)'
  if (plain.length > 128) return 'Пароль слишком длинный'
  return null
}
