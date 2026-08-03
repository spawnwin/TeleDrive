import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const PREFIX = 'enc:v1:'

function getKey(): Buffer | null {
  const raw =
    process.env.TOKEN_ENCRYPTION_KEY ||
    process.env.YANDEX_TOKEN_KEY ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SESSION_SECRET ||
    ''
  if (!raw.trim()) return null
  return createHash('sha256').update(raw.trim()).digest()
}

/** AES-256-GCM encrypt. Returns plaintext unchanged if no key is configured. */
export function sealSecret(plaintext: string): string {
  const key = getKey()
  if (!key || !plaintext) return plaintext
  if (plaintext.startsWith(PREFIX)) return plaintext
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`
}

/** Decrypt sealed value; passes through legacy plaintext tokens. */
export function openSecret(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.startsWith(PREFIX)) return value
  const key = getKey()
  if (!key) {
    throw new Error('TOKEN_ENCRYPTION_KEY required to read encrypted secret')
  }
  const body = value.slice(PREFIX.length)
  const [ivB64, tagB64, dataB64] = body.split('.')
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Invalid sealed secret')
  const iv = Buffer.from(ivB64, 'base64url')
  const tag = Buffer.from(tagB64, 'base64url')
  const data = Buffer.from(dataB64, 'base64url')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

export function isSecretSealed(value: string | null | undefined): boolean {
  return !!value && value.startsWith(PREFIX)
}
