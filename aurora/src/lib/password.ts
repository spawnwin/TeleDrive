/**
 * Password helpers for Aurora. Uses bcryptjs (available on VPS).
 */

type BcryptLike = {
  hash: (data: string, rounds: number) => Promise<string>
  compare: (data: string, encrypted: string) => Promise<boolean>
}

let cached: BcryptLike | null = null

async function getBcrypt(): Promise<BcryptLike> {
  if (cached) return cached
  // Dynamic import keeps the dependency explicit for bundlers.
  const mod = (await import('bcryptjs')) as unknown as BcryptLike & {
    default?: BcryptLike
  }
  cached = (mod.default || mod) as BcryptLike
  return cached
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
