'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import { isE2EEPayload } from '@/lib/e2ee-payload'

// End-to-end encryption using WebCrypto (RSA-OAEP + AES-GCM hybrid).
// Private chats only — group E2EE would need per-member wrapped keys.

const RSA_KEY_CONFIG: RsaHashedKeyGenParams = {
  name: 'RSA-OAEP',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
}

const AES_KEY_CONFIG: AesKeyGenParams = {
  name: 'AES-GCM',
  length: 256,
}

function bufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/** Copy into a fresh ArrayBuffer — required by WebKit/Safari subtle crypto. */
function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

async function importPublicKey(spkiBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', base64ToArrayBuffer(spkiBase64), RSA_KEY_CONFIG, false, [
    'encrypt',
  ])
}

async function importPrivateKey(pkcs8Base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    base64ToArrayBuffer(pkcs8Base64),
    RSA_KEY_CONFIG,
    false,
    ['decrypt'],
  )
}

interface E2EEPayload {
  wk: string
  wkSelf?: string
  iv: string
  ct: string
}

const DB_NAME = 'aurora-e2ee'
const DB_STORE = 'keys'
const DB_PRIVATE = 'private-key'
const DB_PUBLIC = 'public-key'

let cachedDb: IDBDatabase | null = null
function openDB(): Promise<IDBDatabase> {
  if (cachedDb) return Promise.resolve(cachedDb)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(DB_STORE)
    }
    req.onsuccess = () => {
      cachedDb = req.result
      resolve(req.result)
    }
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(key: string): Promise<string | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly')
      const req = tx.objectStore(DB_STORE).get(key)
      req.onsuccess = () => resolve((req.result as string) || null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function keysMatch(privateKey: CryptoKey, publicKeyB64: string): Promise<boolean> {
  try {
    const pub = await importPublicKey(publicKeyB64)
    const data = crypto.getRandomValues(new Uint8Array(32))
    const enc = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, data)
    const dec = new Uint8Array(await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, enc))
    if (dec.length !== data.length) return false
    for (let i = 0; i < data.length; i++) {
      if (dec[i] !== data[i]) return false
    }
    return true
  } catch {
    return false
  }
}

export type E2EEKeyStatus = 'loading' | 'ready' | 'missing' | 'mismatch'

export function useE2EE() {
  const { currentUser, setCurrentUser } = useAppStore()
  const [generating, setGenerating] = useState(false)
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null)
  const [localPublicKey, setLocalPublicKey] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [keyStatus, setKeyStatus] = useState<E2EEKeyStatus>('loading')
  const publicKeyCacheRef = useRef<Map<string, CryptoKey>>(new Map())

  const publishPublicKey = useCallback(
    async (spkiB64: string | null) => {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ publicKey: spkiB64 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to publish public key')
      setCurrentUser(data.user)
      return data.user as { publicKey?: string | null }
    },
    [setCurrentUser],
  )

  // Load private key from IndexedDB — decrypt must work even if server flag is off.
  useEffect(() => {
    if (!currentUser) {
      setPrivateKey(null)
      setLocalPublicKey(null)
      setKeyStatus('loading')
      setReady(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setKeyStatus('loading')
      const pkcs8 = await idbGet(`${DB_PRIVATE}:${currentUser.id}`)
      const savedPub = await idbGet(`${DB_PUBLIC}:${currentUser.id}`)
      if (cancelled) return

      if (!pkcs8) {
        setPrivateKey(null)
        setLocalPublicKey(null)
        setKeyStatus(currentUser.publicKey ? 'missing' : 'ready')
        setReady(true)
        return
      }

      try {
        const key = await importPrivateKey(pkcs8)
        if (cancelled) return
        setPrivateKey(key)

        let pub = savedPub
        // Prefer verifying against server key when present.
        if (currentUser.publicKey) {
          const match = await keysMatch(key, currentUser.publicKey)
          if (cancelled) return
          if (match) {
            pub = currentUser.publicKey
            if (savedPub !== pub) {
              await idbSet(`${DB_PUBLIC}:${currentUser.id}`, pub).catch(() => {})
            }
            setLocalPublicKey(pub)
            setKeyStatus('ready')
          } else if (savedPub) {
            // Local keypair is healthy but server was rotated elsewhere — restore ours
            // so peers encrypt to a key we can still decrypt.
            const localMatch = await keysMatch(key, savedPub)
            if (cancelled) return
            if (localMatch) {
              try {
                await publishPublicKey(savedPub)
                if (cancelled) return
                setLocalPublicKey(savedPub)
                setKeyStatus('ready')
              } catch (e) {
                console.error('[e2ee] failed to restore public key', e)
                setLocalPublicKey(savedPub)
                setKeyStatus('mismatch')
              }
            } else {
              setLocalPublicKey(savedPub)
              setKeyStatus('mismatch')
            }
          } else {
            // Private key present but does not match server and we have no saved public —
            // can still try decrypting old ciphertext; encryption is unsafe.
            setLocalPublicKey(null)
            setKeyStatus('mismatch')
          }
        } else {
          setLocalPublicKey(pub)
          setKeyStatus('ready')
        }
      } catch (e) {
        console.error('[e2ee] failed to import private key', e)
        if (!cancelled) {
          setPrivateKey(null)
          setLocalPublicKey(null)
          setKeyStatus('missing')
        }
      }
      if (!cancelled) setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [currentUser?.id, currentUser?.publicKey, publishPublicKey])

  const enableE2EE = useCallback(async () => {
    if (!currentUser) return
    setGenerating(true)
    try {
      // Reuse existing local keypair instead of rotating (rotation breaks history).
      const existingPkcs8 = await idbGet(`${DB_PRIVATE}:${currentUser.id}`)
      const existingPub = await idbGet(`${DB_PUBLIC}:${currentUser.id}`)
      if (existingPkcs8 && existingPub) {
        const key = await importPrivateKey(existingPkcs8)
        const match = await keysMatch(key, existingPub)
        if (match) {
          setPrivateKey(key)
          setLocalPublicKey(existingPub)
          await publishPublicKey(existingPub)
          setKeyStatus('ready')
          return
        }
      }

      const keyPair = await crypto.subtle.generateKey(RSA_KEY_CONFIG, true, [
        'encrypt',
        'decrypt',
      ])
      const spki = await crypto.subtle.exportKey('spki', keyPair.publicKey)
      const spkiB64 = bufferToBase64(spki)
      const pkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
      const pkcs8B64 = bufferToBase64(pkcs8)
      await idbSet(`${DB_PRIVATE}:${currentUser.id}`, pkcs8B64)
      await idbSet(`${DB_PUBLIC}:${currentUser.id}`, spkiB64)
      setPrivateKey(keyPair.privateKey)
      setLocalPublicKey(spkiB64)
      await publishPublicKey(spkiB64)
      setKeyStatus('ready')
    } catch (e) {
      console.error('[e2ee] enable failed', e)
      throw e
    } finally {
      setGenerating(false)
    }
  }, [currentUser, publishPublicKey])

  const disableE2EE = useCallback(async () => {
    if (!currentUser) return
    // Clear server public key; keep local keys so old messages stay readable.
    try {
      await publishPublicKey(null)
      setKeyStatus(privateKey ? 'ready' : 'missing')
      publicKeyCacheRef.current.clear()
    } catch (e) {
      console.error('[e2ee] disable failed', e)
      throw e
    }
  }, [currentUser, publishPublicKey, privateKey])

  const toggleE2EE = useCallback(
    async (enabled: boolean) => {
      if (enabled) await enableE2EE()
      else await disableE2EE()
    },
    [enableE2EE, disableE2EE],
  )

  const getPublicKey = useCallback(async (userId: string, publicKeyB64: string): Promise<CryptoKey | null> => {
    const cacheKey = `${userId}:${publicKeyB64}`
    const cached = publicKeyCacheRef.current.get(cacheKey)
    if (cached) return cached
    // Drop stale entries for this user (key rotation).
    for (const key of publicKeyCacheRef.current.keys()) {
      if (key.startsWith(`${userId}:`) && key !== cacheKey) {
        publicKeyCacheRef.current.delete(key)
      }
    }
    try {
      const imported = await importPublicKey(publicKeyB64)
      publicKeyCacheRef.current.set(cacheKey, imported)
      return imported
    } catch (e) {
      console.error('[e2ee] failed to import public key', e)
      return null
    }
  }, [])

  const encryptMessage = useCallback(
    async (
      plaintext: string,
      recipientPublicKeyB64: string,
      recipientId: string,
      senderPublicKeyB64?: string,
      senderId?: string,
    ): Promise<string> => {
      const aesKey = await crypto.subtle.generateKey(AES_KEY_CONFIG, true, ['encrypt', 'decrypt'])
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const encoded = new TextEncoder().encode(plaintext)
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encoded)
      const rawAesKey = await crypto.subtle.exportKey('raw', aesKey)
      const publicKey = await getPublicKey(recipientId, recipientPublicKeyB64)
      if (!publicKey) throw new Error('No recipient public key')
      const wrappedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, rawAesKey)
      const payload: E2EEPayload = {
        wk: bufferToBase64(wrappedKey),
        iv: bufferToBase64(iv),
        ct: bufferToBase64(ciphertext),
      }
      if (senderPublicKeyB64 && senderId) {
        const senderKey = await getPublicKey(senderId, senderPublicKeyB64)
        if (!senderKey) throw new Error('No sender public key')
        const wrappedSelf = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, senderKey, rawAesKey)
        payload.wkSelf = bufferToBase64(wrappedSelf)
      }
      return JSON.stringify(payload)
    },
    [getPublicKey],
  )

  const unwrapAesKey = useCallback(async (key: CryptoKey, wrappedB64: string): Promise<ArrayBuffer> => {
    return crypto.subtle.decrypt({ name: 'RSA-OAEP' }, key, base64ToArrayBuffer(wrappedB64))
  }, [])

  const decryptMessage = useCallback(
    async (encrypted: string): Promise<string> => {
      if (!privateKey) throw new Error('No private key')
      if (!isE2EEPayload(encrypted)) return encrypted
      const payload: E2EEPayload = JSON.parse(encrypted)

      // Try both wraps: recipients use `wk`, senders use `wkSelf` after reload.
      // Order does not matter — wrong wrap throws and we fall through.
      const wraps = [payload.wk, payload.wkSelf].filter(Boolean) as string[]
      let rawAesKey: ArrayBuffer | null = null
      let lastErr: unknown = null
      for (const wrapped of wraps) {
        try {
          rawAesKey = await unwrapAesKey(privateKey, wrapped)
          break
        } catch (e) {
          lastErr = e
        }
      }
      if (!rawAesKey) {
        throw lastErr instanceof Error ? lastErr : new Error('Cannot decrypt message')
      }

      const aesKey = await crypto.subtle.importKey('raw', rawAesKey, AES_KEY_CONFIG, false, [
        'decrypt',
      ])
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToArrayBuffer(payload.iv) },
        aesKey,
        base64ToArrayBuffer(payload.ct),
      )
      return new TextDecoder().decode(plaintext)
    },
    [privateKey, unwrapAesKey],
  )

  const isEncrypted = useCallback((s: string): boolean => isE2EEPayload(s), [])

  /** Local private key is available — decrypt old/incoming ciphertext. */
  const canDecrypt = !!privateKey
  /** Healthy keypair published on server — safe to encrypt new messages. */
  const e2eeEnabled =
    !!currentUser?.publicKey &&
    !!privateKey &&
    keyStatus === 'ready' &&
    (!localPublicKey || localPublicKey === currentUser.publicKey)

  return {
    e2eeEnabled,
    canDecrypt,
    keyStatus,
    ready,
    generating,
    toggleE2EE,
    enableE2EE,
    encryptMessage,
    decryptMessage,
    isEncrypted,
  }
}
