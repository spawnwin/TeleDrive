import { db } from '@/lib/db'

/** True if either user has blocked the other. */
export async function areUsersBlocked(userId1: string, userId2: string): Promise<boolean> {
  const block = await db.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userId1, blockedId: userId2 },
        { blockerId: userId2, blockedId: userId1 },
      ],
    },
    select: { id: true },
  })
  return !!block
}
