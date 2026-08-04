const INTERNAL_API_URL = process.env.INTERNAL_API_URL || 'http://localhost:3000'
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || ''

export interface VerifiedUser {
  userId: string
  username: string
  name: string
  avatarColor: string
}

export async function verifySessionToken(token: string): Promise<VerifiedUser | null> {
  if (!token || !INTERNAL_API_SECRET) return null
  try {
    const res = await fetch(`${INTERNAL_API_URL}/api/internal/verify-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_API_SECRET,
      },
      body: JSON.stringify({ token }),
    })
    if (!res.ok) return null
    return (await res.json()) as VerifiedUser
  } catch (err) {
    console.error('[ws-auth] verifySessionToken failed:', err)
    return null
  }
}

export async function setUserPresence(userId: string, online: boolean): Promise<void> {
  if (!userId || !INTERNAL_API_SECRET) return
  try {
    await fetch(`${INTERNAL_API_URL}/api/internal/set-presence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_API_SECRET,
      },
      body: JSON.stringify({ userId, online }),
    })
  } catch (err) {
    console.error('[ws-auth] setUserPresence failed:', err)
  }
}

export async function isChatMember(userId: string, chatId: string): Promise<boolean> {
  if (!userId || !chatId || !INTERNAL_API_SECRET) return false
  try {
    const res = await fetch(`${INTERNAL_API_URL}/api/internal/check-chat-member`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_API_SECRET,
      },
      body: JSON.stringify({ userId, chatId }),
    })
    if (!res.ok) return false
    const data = (await res.json()) as { isMember?: boolean }
    return !!data.isMember
  } catch (err) {
    console.error('[ws-auth] isChatMember failed:', err)
    return false
  }
}

export interface MessageInfo {
  exists: boolean
  senderId?: string
  chatId?: string
  content?: string
  type?: string
  editedAt?: string | null
  threadRootId?: string | null
  replyToId?: string | null
}

/** Look up a message in the DB to verify authorship/content before relaying socket events. */
export async function getMessageInfo(messageId: string): Promise<MessageInfo | null> {
  if (!messageId || !INTERNAL_API_SECRET) return null
  try {
    const res = await fetch(`${INTERNAL_API_URL}/api/internal/check-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_API_SECRET,
      },
      body: JSON.stringify({ messageId }),
    })
    if (!res.ok) return null
    return (await res.json()) as MessageInfo
  } catch (err) {
    console.error('[ws-auth] getMessageInfo failed:', err)
    return null
  }
}

export interface CommentReactionRow {
  id: string
  emoji: string
  userId: string
  userName: string
}

/** Admin-controlled feature kill-switches — checked before relaying a call invite. */
export async function isCallsEnabled(): Promise<boolean> {
  if (!INTERNAL_API_SECRET) return false
  try {
    const res = await fetch(`${INTERNAL_API_URL}/api/internal/platform-flags`, {
      method: 'POST',
      headers: { 'x-internal-secret': INTERNAL_API_SECRET },
    })
    if (!res.ok) return false
    const data = (await res.json()) as { callsEnabled?: boolean; maintenanceMode?: boolean }
    return data.callsEnabled !== false && !data.maintenanceMode
  } catch (err) {
    console.error('[ws-auth] isCallsEnabled failed:', err)
    return false
  }
}

/** Authoritative reactions for a message — never trust a client-supplied reactions array before relaying. */
export async function getMessageReactions(messageId: string): Promise<CommentReactionRow[] | null> {
  if (!messageId || !INTERNAL_API_SECRET) return null
  try {
    const res = await fetch(`${INTERNAL_API_URL}/api/internal/get-message-reactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_API_SECRET,
      },
      body: JSON.stringify({ messageId }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { reactions?: CommentReactionRow[] }
    return data.reactions ?? []
  } catch (err) {
    console.error('[ws-auth] getMessageReactions failed:', err)
    return null
  }
}


/** Can user join a live stream signaling room? */
export async function canJoinStreamRoom(
  userId: string,
  roomId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!userId || !roomId || !INTERNAL_API_SECRET) return { ok: false, error: 'unavailable' }
  try {
    const res = await fetch(`${INTERNAL_API_URL}/api/internal/check-stream-access`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_API_SECRET,
      },
      body: JSON.stringify({ userId, roomId }),
    })
    if (!res.ok) return { ok: false, error: 'check_failed' }
    const data = (await res.json()) as { allowed?: boolean; error?: string }
    if (!data.allowed) return { ok: false, error: data.error || 'forbidden' }
    return { ok: true }
  } catch (err) {
    console.error('[ws-auth] canJoinStreamRoom failed:', err)
    return { ok: false, error: 'check_failed' }
  }
}

/** Privacy + block gate before delivering a call invite. */
export async function canCallUser(fromUserId: string, toUserId: string): Promise<{ ok: boolean; error?: string }> {
  if (!fromUserId || !toUserId || !INTERNAL_API_SECRET) return { ok: false, error: 'unavailable' }
  try {
    const res = await fetch(`${INTERNAL_API_URL}/api/internal/can-call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_API_SECRET,
      },
      body: JSON.stringify({ fromUserId, toUserId }),
    })
    if (!res.ok) return { ok: false, error: 'check_failed' }
    const data = (await res.json()) as { canCall?: boolean; error?: string }
    if (!data.canCall) return { ok: false, error: data.error || 'forbidden' }
    return { ok: true }
  } catch (err) {
    console.error('[ws-auth] canCallUser failed:', err)
    return { ok: false, error: 'check_failed' }
  }
}
