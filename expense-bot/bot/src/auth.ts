import crypto from 'node:crypto'

export type TelegramWebAppUser = {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
  photo_url?: string
}

export type ValidatedInitData = {
  user: TelegramWebAppUser
  authDate: number
  queryId?: string
}

function parseInitData(initData: string): Map<string, string> {
  const params = new URLSearchParams(initData)
  const map = new Map<string, string>()
  for (const [key, value] of params.entries()) {
    map.set(key, value)
  }
  return map
}

/**
 * Validates Telegram WebApp initData per
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86400,
): ValidatedInitData | null {
  if (!initData || !botToken) return null

  const params = parseInitData(initData)
  const hash = params.get('hash')
  if (!hash) return null
  params.delete('hash')

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest()

  const calculated = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex')

  const hashBuf = Buffer.from(hash, 'hex')
  const calcBuf = Buffer.from(calculated, 'hex')
  if (hashBuf.length !== calcBuf.length || !crypto.timingSafeEqual(hashBuf, calcBuf)) {
    return null
  }

  const authDate = Number(params.get('auth_date') ?? 0)
  if (!authDate) return null
  const age = Math.floor(Date.now() / 1000) - authDate
  if (age > maxAgeSeconds) return null

  const userRaw = params.get('user')
  if (!userRaw) return null

  try {
    const user = JSON.parse(userRaw) as TelegramWebAppUser
    if (!user?.id) return null
    return {
      user,
      authDate,
      queryId: params.get('query_id') ?? undefined,
    }
  } catch {
    return null
  }
}
