/** Clear the current user's profile photo on the server. */
export async function removeProfileAvatar(): Promise<void> {
  const res = await fetch('/api/auth/avatar', { method: 'DELETE' })
  if (res.ok) return

  // Fallback: some clients / caches mishandle DELETE — clear via profile PATCH.
  const patch = await fetch('/api/auth/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ avatarUrl: null }),
  })
  if (!patch.ok) {
    const data = await res.json().catch(() => ({}))
    const patchData = await patch.json().catch(() => ({}))
    throw new Error(data.error || patchData.error || 'Не удалось удалить фото')
  }
}
