import fs from 'fs'
import path from 'path'

export type ApnsRuntimeConfig = {
  keyId: string
  teamId: string
  bundleId: string
  production: boolean
  keyPath: string
}

const CERTS_DIR = path.join(process.cwd(), 'certs')
const CONFIG_PATH = path.join(CERTS_DIR, 'apns.json')
const DEFAULT_KEY_PATH = path.join(CERTS_DIR, 'AuthKey.p8')

type StoredApnsConfig = {
  keyId: string
  teamId: string
  bundleId: string
  production: boolean
  keyPath?: string
}

function readStoredConfig(): StoredApnsConfig | null {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as StoredApnsConfig
    if (!raw?.keyId || !raw?.teamId) return null
    return raw
  } catch {
    return null
  }
}

export function getApnsRuntimeConfig(): ApnsRuntimeConfig | null {
  const stored = readStoredConfig()
  const keyId = (process.env.APNS_KEY_ID || stored?.keyId || '').trim()
  const teamId = (process.env.APNS_TEAM_ID || stored?.teamId || '').trim()
  const bundleId = (
    process.env.APNS_BUNDLE_ID ||
    stored?.bundleId ||
    'com.aurora.messenger'
  ).trim()
  const keyPath = (
    process.env.APNS_KEY_PATH ||
    stored?.keyPath ||
    DEFAULT_KEY_PATH
  ).trim()
  const production =
    process.env.APNS_PRODUCTION === 'true' ||
    (process.env.APNS_PRODUCTION == null && stored?.production === true)

  if (!keyId || !teamId || !keyPath) return null
  if (!fs.existsSync(keyPath)) return null

  try {
    const key = fs.readFileSync(keyPath, 'utf8')
    if (!key.includes('BEGIN PRIVATE KEY')) return null
  } catch {
    return null
  }

  return { keyId, teamId, bundleId, production, keyPath }
}

export function getApnsStatus() {
  const stored = readStoredConfig()
  const envKeyId = (process.env.APNS_KEY_ID || '').trim()
  const envTeamId = (process.env.APNS_TEAM_ID || '').trim()
  const envKeyPath = (process.env.APNS_KEY_PATH || '').trim()
  const config = getApnsRuntimeConfig()

  return {
    configured: !!config,
    keyId: config?.keyId || envKeyId || stored?.keyId || null,
    teamId: config?.teamId || envTeamId || stored?.teamId || null,
    bundleId: config?.bundleId || process.env.APNS_BUNDLE_ID || stored?.bundleId || 'com.aurora.messenger',
    production: config?.production ?? process.env.APNS_PRODUCTION === 'true',
    keyPath: config?.keyPath || envKeyPath || stored?.keyPath || DEFAULT_KEY_PATH,
    keyFileExists: config ? true : fs.existsSync(envKeyPath || stored?.keyPath || DEFAULT_KEY_PATH),
    source: config
      ? envKeyId && envTeamId && envKeyPath && fs.existsSync(envKeyPath)
        ? 'env'
        : 'file'
      : null,
  }
}

export function saveApnsConfig(input: {
  keyId: string
  teamId: string
  bundleId?: string
  production?: boolean
  keyPem: string
}): ApnsRuntimeConfig {
  const keyId = input.keyId.trim()
  const teamId = input.teamId.trim()
  const bundleId = (input.bundleId || 'com.aurora.messenger').trim()
  const production = !!input.production
  const keyPem = input.keyPem.trim().replace(/\\n/g, '\n')

  if (!/^[A-Z0-9]{10}$/i.test(keyId)) {
    throw new Error('APNS_KEY_ID должен быть 10 символов (Key ID из Apple Developer)')
  }
  if (!/^[A-Z0-9]{10}$/i.test(teamId)) {
    throw new Error('APNS_TEAM_ID должен быть 10 символов (Team ID)')
  }
  if (!keyPem.includes('BEGIN PRIVATE KEY')) {
    throw new Error('Некорректный .p8 ключ (ожидается BEGIN PRIVATE KEY)')
  }

  fs.mkdirSync(CERTS_DIR, { recursive: true })
  fs.writeFileSync(DEFAULT_KEY_PATH, keyPem.endsWith('\n') ? keyPem : `${keyPem}\n`, {
    mode: 0o600,
  })

  const stored: StoredApnsConfig = {
    keyId,
    teamId,
    bundleId,
    production,
    keyPath: DEFAULT_KEY_PATH,
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(stored, null, 2) + '\n', { mode: 0o600 })

  // Keep process.env in sync for the current Node process / PM2 worker.
  process.env.APNS_KEY_ID = keyId
  process.env.APNS_TEAM_ID = teamId
  process.env.APNS_BUNDLE_ID = bundleId
  process.env.APNS_KEY_PATH = DEFAULT_KEY_PATH
  process.env.APNS_PRODUCTION = production ? 'true' : 'false'

  // Best-effort: mirror into .env so restarts keep the values.
  try {
    const envPath = path.join(process.cwd(), '.env')
    let envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
    const upsert = (key: string, value: string) => {
      const re = new RegExp(`^${key}=.*$`, 'm')
      if (re.test(envText)) envText = envText.replace(re, `${key}=${value}`)
      else envText += `${envText.endsWith('\n') || !envText ? '' : '\n'}${key}=${value}\n`
    }
    upsert('APNS_KEY_ID', keyId)
    upsert('APNS_TEAM_ID', teamId)
    upsert('APNS_BUNDLE_ID', bundleId)
    upsert('APNS_KEY_PATH', DEFAULT_KEY_PATH)
    upsert('APNS_PRODUCTION', production ? 'true' : 'false')
    fs.writeFileSync(envPath, envText)
  } catch (err) {
    console.warn('[apns] failed to update .env:', err)
  }

  return {
    keyId,
    teamId,
    bundleId,
    production,
    keyPath: DEFAULT_KEY_PATH,
  }
}
