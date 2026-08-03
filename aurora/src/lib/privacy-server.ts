import { db } from '@/lib/db'
import { areUsersBlocked } from '@/lib/user-blocks'
import {
  canCallUser,
  canMessageUser,
  canSeeLastSeen,
  parseVisibility,
  redactPresenceFields,
  type Visibility,
} from '@/lib/privacy'

/** True if `ownerId` has saved `peerId` in their contacts. */
export async function isSavedContact(ownerId: string, peerId: string): Promise<boolean> {
  const row = await db.contact.findFirst({
    where: { ownerId, peerId },
    select: { id: true },
  })
  return !!row
}

export async function getUserPrivacy(userId: string): Promise<{
  lastSeenVisibility: Visibility
  whoCanMessage: Visibility
  whoCanCall: Visibility
}> {
  const row = await db.user.findUnique({
    where: { id: userId },
    select: {
      lastSeenVisibility: true,
      whoCanMessage: true,
      whoCanCall: true,
    },
  })
  return {
    lastSeenVisibility: parseVisibility(row?.lastSeenVisibility),
    whoCanMessage: parseVisibility(row?.whoCanMessage),
    whoCanCall: parseVisibility(row?.whoCanCall),
  }
}

/** Can `fromUserId` message `toUserId` (private DMs). */
export async function assertCanMessage(
  fromUserId: string,
  toUserId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (fromUserId === toUserId) return { ok: true }
  if (await areUsersBlocked(fromUserId, toUserId)) {
    return { ok: false, error: 'Невозможно отправить сообщение', status: 403 }
  }
  const privacy = await getUserPrivacy(toUserId)
  const isContact = await isSavedContact(toUserId, fromUserId)
  if (
    !canMessageUser({
      whoCanMessage: privacy.whoCanMessage,
      isSelf: false,
      isContact,
    })
  ) {
    return {
      ok: false,
      error: 'Пользователь ограничил личные сообщения',
      status: 403,
    }
  }
  return { ok: true }
}

/** Can `fromUserId` call `toUserId`. */
export async function assertCanCall(
  fromUserId: string,
  toUserId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (fromUserId === toUserId) {
    return { ok: false, error: 'Нельзя позвонить себе', status: 400 }
  }
  if (await areUsersBlocked(fromUserId, toUserId)) {
    return { ok: false, error: 'Пользователь заблокирован', status: 403 }
  }
  const privacy = await getUserPrivacy(toUserId)
  const isContact = await isSavedContact(toUserId, fromUserId)
  if (
    !canCallUser({
      whoCanCall: privacy.whoCanCall,
      isSelf: false,
      isContact,
    })
  ) {
    return {
      ok: false,
      error: 'Пользователь ограничил звонки',
      status: 403,
    }
  }
  return { ok: true }
}

/** Apply last-seen privacy for a list of users as seen by viewerId. */
export async function applyLastSeenPrivacy<
  T extends { id: string; online?: boolean | null; lastSeen?: Date | string | null },
>(viewerId: string, users: T[]): Promise<T[]> {
  if (!users.length) return users
  const ids = users.map((u) => u.id).filter((id) => id !== viewerId)
  if (!ids.length) return users

  const [privacyRows, contactRows, blockRows] = await Promise.all([
    db.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, lastSeenVisibility: true },
    }),
    db.contact.findMany({
      where: { ownerId: { in: ids }, peerId: viewerId },
      select: { ownerId: true },
    }),
    db.userBlock.findMany({
      where: {
        OR: [
          { blockerId: viewerId, blockedId: { in: ids } },
          { blockerId: { in: ids }, blockedId: viewerId },
        ],
      },
      select: { blockerId: true, blockedId: true },
    }),
  ])

  const visibility = new Map(
    privacyRows.map((r) => [r.id, parseVisibility(r.lastSeenVisibility)] as const),
  )
  const contactOwners = new Set(contactRows.map((c) => c.ownerId))
  const blockedIds = new Set<string>()
  for (const b of blockRows) {
    blockedIds.add(b.blockerId === viewerId ? b.blockedId : b.blockerId)
  }

  return users.map((u) => {
    if (u.id === viewerId) return u
    if (blockedIds.has(u.id)) return redactPresenceFields(u, false)
    const allowed = canSeeLastSeen({
      visibility: visibility.get(u.id) || 'everyone',
      isSelf: false,
      isContact: contactOwners.has(u.id),
    })
    return redactPresenceFields(u, allowed)
  })
}
