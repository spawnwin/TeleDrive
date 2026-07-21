import { db } from '@/lib/db'

export function normalizeChannelSlug(slug: string): string {
  return slug.replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_]/g, '')
}

export function canPostInChat(chatType: string, role: string): boolean {
  if (chatType === 'channel') {
    return role === 'owner' || role === 'admin'
  }
  return true
}

export async function getChannelSubscriberCount(chatId: string): Promise<number> {
  return db.chatMember.count({ where: { chatId, role: 'subscriber' } })
}

export async function isUserBanned(chatId: string, userId: string): Promise<boolean> {
  const ban = await db.chatBan.findUnique({
    where: { chatId_userId: { chatId, userId } },
  })
  return !!ban
}

export async function checkSlowMode(
  slowModeSeconds: number,
  membership: { role: string; lastMessageAt: Date | null },
): Promise<{ ok: boolean; waitSeconds?: number }> {
  if (slowModeSeconds <= 0) return { ok: true }
  if (membership.role === 'owner' || membership.role === 'admin') return { ok: true }
  if (!membership.lastMessageAt) return { ok: true }

  const elapsed = (Date.now() - membership.lastMessageAt.getTime()) / 1000
  if (elapsed < slowModeSeconds) {
    return { ok: false, waitSeconds: Math.ceil(slowModeSeconds - elapsed) }
  }
  return { ok: true }
}
