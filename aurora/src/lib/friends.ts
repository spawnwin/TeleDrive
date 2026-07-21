import { db } from '@/lib/db'

export type FriendshipStatus =
  | 'none'
  | 'pending_outgoing'
  | 'pending_incoming'
  | 'accepted'
  | 'declined'

export interface FriendUser {
  id: string
  username: string
  name: string
  avatarColor: string
  avatarUrl: string | null
  online: boolean
  lastSeen: Date
}

export interface FriendshipRecord {
  id: string
  status: string
  requesterId: string
  addresseeId: string
  createdAt: Date
  updatedAt: Date
}

const userSelect = {
  id: true,
  username: true,
  name: true,
  avatarColor: true,
  avatarUrl: true,
  online: true,
  lastSeen: true,
} as const

export async function findFriendshipBetween(
  userA: string,
  userB: string,
): Promise<(FriendshipRecord & { requester: FriendUser; addressee: FriendUser }) | null> {
  return db.friendship.findFirst({
    where: {
      OR: [
        { requesterId: userA, addresseeId: userB },
        { requesterId: userB, addresseeId: userA },
      ],
    },
    include: {
      requester: { select: userSelect },
      addressee: { select: userSelect },
    },
  })
}

export function getFriendshipView(
  friendship: FriendshipRecord | null,
  meId: string,
): { id: string | null; status: FriendshipStatus } {
  if (!friendship) return { id: null, status: 'none' }
  if (friendship.status === 'accepted') return { id: friendship.id, status: 'accepted' }
  if (friendship.status === 'declined') return { id: friendship.id, status: 'declined' }
  if (friendship.status === 'pending') {
    if (friendship.requesterId === meId) {
      return { id: friendship.id, status: 'pending_outgoing' }
    }
    return { id: friendship.id, status: 'pending_incoming' }
  }
  return { id: friendship.id, status: 'none' }
}

export function getFriendFromFriendship(
  friendship: FriendshipRecord & { requester: FriendUser; addressee: FriendUser },
  meId: string,
): FriendUser {
  return friendship.requesterId === meId ? friendship.addressee : friendship.requester
}

export async function isBlockedEitherWay(userA: string, userB: string): Promise<boolean> {
  const block = await db.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userA, blockedId: userB },
        { blockerId: userB, blockedId: userA },
      ],
    },
  })
  return !!block
}
