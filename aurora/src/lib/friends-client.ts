export interface FriendWithOnline {
  id: string
  name: string
  online: boolean
  lastSeen?: string | Date | null
}

// A DB `online=true` is only trusted if `lastSeen` is fresher than this.
// Covers ungraceful disconnects (browser crash, beacon lost, laptop closed)
// where the socket never fired `disconnect` and the DB row stayed online.
const ONLINE_STALE_MS = 3 * 60 * 1000

export function isUserOnline(
  userId: string,
  dbOnline: boolean | undefined,
  onlineUserIds: Set<string>,
  presenceSynced = false,
  lastSeen?: string | Date | null,
): boolean {
  if (onlineUserIds.has(userId)) return true
  // Before presence:sync, trust DB (updated on socket connect via setUserPresence).
  // But reject stale `online=true` rows whose lastSeen is older than ONLINE_STALE_MS,
  // otherwise a user who disconnected ungracefully shows "в сети" then flips to
  // "был вчера" once presence:sync arrives — the flicker bug.
  if (!presenceSynced && dbOnline) {
    if (lastSeen == null) return false
    const ts = typeof lastSeen === 'string' ? new Date(lastSeen).getTime() : lastSeen.getTime()
    if (!Number.isFinite(ts) || Date.now() - ts > ONLINE_STALE_MS) return false
    return true
  }
  return false
}

/** @deprecated use isUserOnline */
export const isFriendOnline = isUserOnline

export function sortFriendsByOnline<T extends FriendWithOnline>(
  friends: T[],
  onlineUserIds: Set<string>,
  presenceSynced = false,
): T[] {
  return [...friends].sort((a, b) => {
    const aOnline = isUserOnline(a.id, a.online, onlineUserIds, presenceSynced, a.lastSeen)
    const bOnline = isUserOnline(b.id, b.online, onlineUserIds, presenceSynced, b.lastSeen)
    if (aOnline !== bOnline) return aOnline ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function countOnlineFriends(
  friends: FriendWithOnline[],
  onlineUserIds: Set<string>,
  presenceSynced = false,
): number {
  return friends.filter((f) =>
    isUserOnline(f.id, f.online, onlineUserIds, presenceSynced, f.lastSeen),
  ).length
}
