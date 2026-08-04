// Shared ICE server config for all WebRTC features (1:1 calls, group calls,
// live streams). STUN alone only helps peers discover their public address —
// it does nothing when both sides are behind NAT types that can't punch
// through to each other (very common: home Wi-Fi + mobile carrier data),
// which is exactly when a TURN relay is required.
//
// TURN credentials are fetched from /api/turn-credentials (server-side, auth
// required) instead of being bundled in client code via NEXT_PUBLIC_* env vars.
// This prevents unauthenticated users from obtaining and abusing the static
// TURN server credentials.

const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

// Cached TURN credentials (fetched once per session)
let turnCache: RTCIceServer[] | null = null
let turnFetchPromise: Promise<RTCIceServer[]> | null = null

async function fetchTurnCredentials(): Promise<RTCIceServer[]> {
  try {
    const res = await fetch('/api/turn-credentials', { credentials: 'include' })
    if (!res.ok) return []
    const data = await res.json()
    if (!data.urls?.length) return []
    return [{
      urls: data.urls,
      username: data.username || 'aurora',
      credential: data.credential || '',
    }]
  } catch {
    return []
  }
}

/**
 * Returns ICE servers with cached TURN credentials.
 * First call fetches credentials from the server; subsequent calls return
 * the cached result. Falls back to STUN-only if the fetch fails.
 * Empty TURN responses are not cached forever so a later successful
 * provisioning (or login) can pick them up without a full reload.
 */
export async function getIceServersAsync(): Promise<RTCIceServer[]> {
  if (turnCache?.length) return [...STUN_SERVERS, ...turnCache]
  if (!turnFetchPromise) {
    turnFetchPromise = fetchTurnCredentials().then((turn) => {
      if (turn.length) {
        turnCache = turn
      } else {
        // Allow a later retry instead of locking in STUN-only for the session.
        turnFetchPromise = null
      }
      return turn
    }).catch(() => {
      turnFetchPromise = null
      return [] as RTCIceServer[]
    })
  }
  const turn = await turnFetchPromise
  return [...STUN_SERVERS, ...turn]
}

/**
 * Synchronous fallback — returns STUN-only servers.
 * Prefer getIceServersAsync() in async contexts (startCall, acceptCall, etc.)
 * to include TURN relay servers for cross-network connectivity.
 */
export function getIceServers(): RTCIceServer[] {
  return [...STUN_SERVERS]
}
