import { db } from '@/lib/db'

export type ContactNameFields = {
  firstName: string
  lastName: string | null
}

export function formatContactDisplayName(
  contact: ContactNameFields | null | undefined,
  fallbackName?: string | null,
): string {
  if (contact?.firstName?.trim()) {
    const first = contact.firstName.trim()
    const last = contact.lastName?.trim()
    return last ? `${first} ${last}` : first
  }
  return (fallbackName || '').trim() || '—'
}

export function normalizeContactNameInput(input: {
  firstName?: unknown
  lastName?: unknown
}): { firstName: string; lastName: string | null } | { error: string } {
  const firstName = typeof input.firstName === 'string' ? input.firstName.trim() : ''
  const lastRaw = typeof input.lastName === 'string' ? input.lastName.trim() : ''
  if (!firstName) return { error: 'Укажите имя' }
  if (firstName.length > 64) return { error: 'Имя слишком длинное' }
  if (lastRaw.length > 64) return { error: 'Фамилия слишком длинная' }
  return { firstName, lastName: lastRaw || null }
}

export async function getContactForPeer(
  ownerId: string,
  peerId: string,
): Promise<ContactNameFields | null> {
  const row = await db.contact.findUnique({
    where: { ownerId_peerId: { ownerId, peerId } },
    select: { firstName: true, lastName: true },
  })
  return row
}

/** Map peerId → display name override for the given owner. */
export async function getContactDisplayNameMap(
  ownerId: string,
  peerIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(peerIds.filter(Boolean))]
  const map = new Map<string, string>()
  if (unique.length === 0) return map

  const rows = await db.contact.findMany({
    where: { ownerId, peerId: { in: unique } },
    select: { peerId: true, firstName: true, lastName: true },
  })
  for (const row of rows) {
    map.set(row.peerId, formatContactDisplayName(row))
  }
  return map
}

export async function upsertContactName(
  ownerId: string,
  peerId: string,
  firstName: string,
  lastName: string | null,
) {
  return db.contact.upsert({
    where: { ownerId_peerId: { ownerId, peerId } },
    create: { ownerId, peerId, firstName, lastName },
    update: { firstName, lastName },
    select: { id: true, peerId: true, firstName: true, lastName: true },
  })
}
