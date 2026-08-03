export type Visibility = 'everyone' | 'contacts' | 'nobody'

export const VISIBILITY_VALUES: Visibility[] = ['everyone', 'contacts', 'nobody']

export function parseVisibility(v: unknown, fallback: Visibility = 'everyone'): Visibility {
  if (v === 'everyone' || v === 'contacts' || v === 'nobody') return v
  return fallback
}

/** Whether viewer may see target's lastSeen / online. */
export function canSeeLastSeen(opts: {
  visibility: Visibility
  isSelf: boolean
  isContact: boolean
}): boolean {
  if (opts.isSelf) return true
  if (opts.visibility === 'nobody') return false
  if (opts.visibility === 'contacts') return opts.isContact
  return true
}

export function canMessageUser(opts: {
  whoCanMessage: Visibility
  isSelf: boolean
  isContact: boolean
}): boolean {
  if (opts.isSelf) return true
  if (opts.whoCanMessage === 'nobody') return false
  if (opts.whoCanMessage === 'contacts') return opts.isContact
  return true
}
