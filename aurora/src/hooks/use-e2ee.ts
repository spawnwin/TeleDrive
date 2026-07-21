'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import { isE2EEPayload } from '@/lib/e2ee-payload'

// End-to-end encryption using WebCrypto.
//
// Strategy:
//   - Each user generates an RSA-OAEP key pair (2048-bit) on first enable.
//   - Public key is published to the server (User.publicKey, base64 SPKI).
//   - For each private chat, generate a random AES-GCM 256-bit session key.
//   - Wrap (encrypt) the AES key with the recipient's RSA public key,
//     store the wrapped key on the message (or in a separate key exchange message).
//   - Encrypt message content with AES-GCM, store ciphertext in `content`.
//
// In this implementation, we keep it simple:
//   - Encrypt message content directly with the recipient's RSA public key.
//   - RSA-OAEP can encrypt up to ~190 bytes for a 2048-bit key, which is
//     enough for short messages. For longer messages, we'd need AES+RSA hybrid.
//   - We use the hybrid approach: random AES key per message, wrapped with RSA.
//
// For group chats, E2EE is not enabled (would need a per-member wrapped key).

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

function base64ToBuffer(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function importPublicKey(spkiBase64: string): Promise<CryptoKey> {
  const spki = base64ToBuffer(spkiBase64)
  return crypto.subtle.importKey('spki', spki, RSA_KEY_CONFIG, false, ['encrypt'])
}

async function importPrivateKey(pkcs8Base64: string): Promise<CryptoKey> {
  const pkcs8 = base64ToBuffer(pkcs8Base64)
  return crypto.subtle.importKey('pkcs8', pkcs8, RSA_KEY_CONFIG, false, ['decrypt'])
}

interface E2EEPayload {
  // Base64 AES key wrapped with recipient's RSA public key
  wk: string
  // Same AES key wrapped with sender's RSA public key (so sender can read own msgs after reload)
  wkSelf?: string
  // Base64 IV (12 bytes for AES-GCM)
  iv: string
  // Base64 ciphertext
  ct: string
}

function isE2EEPayloadLocal(s: string): boolean {
  return isE2EEPayload(s)
}

// IndexedDB for storing the private key (browser-only persistent storage).
const DB_NAME = 'aurora-e2ee'
const DB_STORE = 'keys'
const DB_KEY = 'private-key'

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
      req.onsuccess = () => resolve(req.result || null)
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

export function useE2EE() {
  const { currentUser, setCurrentUser } = useAppStore()
  const [generating, setGenerating] = useState(false)
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null)
  const [ready, setReady] = useState(false)
  // Cache of imported public keys (userId -> CryptoKey)
  const publicKeyCacheRef = useRef<Map<string, CryptoKey>>(new Map())

  // Load private key from IndexedDB on mount
  useEffect(() => {
    if (!currentUser) return
    let cancelled = false
    ;(async () => {
      // Only load private key if user has a public key (E2EE enabled)
      if (!currentUser.publicKey) {
        setReady(true)
        return
      }
      const pkcs8 = await idbGet(`${DB_KEY}:${currentUser.id}`)
      if (cancelled) return
      if (pkcs8) {
        try {
          const key = await importPrivateKey(pkcs8)
          setPrivateKey(key)
        } catch (e) {
          console.error('[e2ee] failed to import private key', e)
        }
      }
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [currentUser?.id, currentUser?.publicKey])

  const enableE2EE = useCallback(async () => {
    if (!currentUser) return
    setGenerating(true)
    try {
      // Generate RSA key pair
      const keyPair = await crypto.subtle.generateKey(RSA_KEY_CONFIG, true, [
        'encrypt',
        'decrypt',
      ])
      // Export public key as SPKI base64
      const spki = await crypto.subtle.exportKey('spki', keyPair.publicKey)
      const spkiB64 = bufferToBase64(spki)
      // Export private key as PKCS8 base64
      const pkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
      const pkcs8B64 = bufferToBase64(pkcs8)
      // Save private key to IndexedDB
      await idbSet(`${DB_KEY}:${currentUser.id}`, pkcs8B64)
      setPrivateKey(keyPair.privateKey)
      // Publish public key to server
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ publicKey: spkiB64 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to publish public key')
      setCurrentUser(data.user)
    } catch (e) {
      console.error('[e2ee] enable failed', e)
      throw e
    } finally {
      setGenerating(false)
    }
  }, [currentUser, setCurrentUser])

  const disableE2EE = useCallback(async () => {
    if (!currentUser) return
    // Just clear the public key on the server; we keep the private key locally
    // in case the user re-enables later.
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ publicKey: null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setCurrentUser(data.user)
      setPrivateKey(null)
      publicKeyCacheRef.current.clear()
    } catch (e) {
      console.error('[e2ee] disable failed', e)
      throw e
    }
  }, [currentUser, setCurrentUser])

  const toggleE2EE = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        await enableE2EE()
      } else {
        await disableE2EE()
      }
    },
    [enableE2EE, disableE2EE],
  )

  // Get the cached public key for a user, or import and cache it
  const getPublicKey = useCallback(async (userId: string, publicKeyB64: string): Promise<CryptoKey | null> => {
    const cached = publicKeyCacheRef.current.get(userId)
    if (cached) return cached
    try {
      const key = await importPublicKey(publicKeyB64)
      publicKeyCacheRef.current.set(userId, key)
      return key
    } catch (e) {
      console.error('[e2ee] failed to import public key', e)
      return null
    }
  }, [])

  // Encrypt a plaintext message for a recipient
  const encryptMessage = useCallback(
    async (
      plaintext: string,
      recipientPublicKeyB64: string,
      recipientId: string,
      senderPublicKeyB64?: string,
      senderId?: string,
    ): Promise<string> => {
      // Generate random AES-GCM key
      const aesKey = await crypto.subtle.generateKey(AES_KEY_CONFIG, true, [
        'encrypt',
        'decrypt',
      ])
      // Generate random IV (12 bytes)
      const iv = crypto.getRandomValues(new Uint8Array(12))
      // Encrypt plaintext with AES-GCM
      const encoded = new TextEncoder().encode(plaintext)
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        encoded,
      )
      // Export AES key, then wrap it with recipient's RSA public key
      const rawAesKey = await crypto.subtle.exportKey('raw', aesKey)
      const publicKey = await getPublicKey(recipientId, recipientPublicKeyB64)
      if (!publicKey) throw new Error('No recipient public key')
      const wrappedKey = await crypto.subtle.encrypt(
        { name: 'RSA-OAEP' },
        publicKey,
        rawAesKey,
      )
      const payload: E2EEPayload = {
        wk: bufferToBase64(wrappedKey),
        iv: bufferToBase64(iv),
        ct: bufferToBase64(ciphertext),
      }
      if (senderPublicKeyB64 && senderId) {
        const senderKey = await getPublicKey(senderId, senderPublicKeyB64)
        if (!senderKey) throw new Error('No sender public key')
        const wrappedSelf = await crypto.subtle.encrypt(
          { name: 'RSA-OAEP' },
          senderKey,
          rawAesKey,
        )
        payload.wkSelf = bufferToBase64(wrappedSelf)
      }
      return JSON.stringify(payload)
    },
    [getPublicKey],
  )

  const unwrapAesKey = useCallback(
    async (privateKey: CryptoKey, wrappedB64: string): Promise<ArrayBuffer> => {
      return crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        privateKey,
        base64ToBuffer(wrappedB64),
      )
    },
    [],
  )

  // Decrypt an incoming message
  const decryptMessage = useCallback(
    async (encrypted: string): Promise<string> => {
      if (!privateKey) throw new Error('No private key')
      if (!isE2EEPayloadLocal(encrypted)) return encrypted // not encrypted
      const payload: E2EEPayload = JSON.parse(encrypted)
      let rawAesKey: ArrayBuffer
      try {
        rawAesKey = await unwrapAesKey(privateKey, payload.wk)
      } catch {
        if (!payload.wkSelf) throw new Error('Cannot decrypt message')
        rawAesKey = await unwrapAesKey(privateKey, payload.wkSelf)
      }
      // Import the raw AES key
      const aesKey = await crypto.subtle.importKey('raw', rawAesKey, AES_KEY_CONFIG, false, [
        'decrypt',
      ])
      // Decrypt the ciphertext
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBuffer(payload.iv) },
        aesKey,
        base64ToBuffer(payload.ct),
      )
      return new TextDecoder().decode(plaintext)
    },
    [privateKey, unwrapAesKey],
  )

  const isEncrypted = useCallback((s: string): boolean => isE2EEPayloadLocal(s), [])

  const e2eeEnabled = !!currentUser?.publicKey && !!privateKey

  return {
    e2eeEnabled,
    generating,
    ready,
    toggleE2EE,
    encryptMessage,
    decryptMessage,
    isEncrypted,
  }
}
