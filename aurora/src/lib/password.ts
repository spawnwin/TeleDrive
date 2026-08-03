/**
 * Password helpers for Aurora. Prefer bcryptjs (deployed on VPS); fall back to bcrypt.
 * Overlay builds may not typecheck these packages — resolve at runtime.
 */

type BcryptLike = {
  hash: (data: string, rounds: number) => Promise<string>
  compare: (data: string, encrypted: string) => Promise<boolean>
}

let cached: BcryptLike | null = null

async function getBcrypt(): Promise<BcryptLike> {
  if (cached) return cached
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('bcryptjs') as BcryptLike
    cached = mod
    return mod
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('bcrypt') as BcryptLike
    cached = mod
    return mod
  }
}

export async function hashPassword(plain: string): Promise<string> {
  const bcrypt = await getBcrypt()
  return bcrypt.hash(plain, 10)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  const bcrypt = await getBcrypt()
  return bcrypt.compare(plain, hash)
}

export function validatePasswordStrength(plain: string): string | null {
  if (plain.length < 6) return 'Пароль слишком короткий (минимум 6 символов)'
  if (plain.length > 128) return 'Пароль слишком длинный'
  return null
}
