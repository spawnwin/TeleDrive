import { useAppStore, type ChatListItem } from '@/lib/store'
import { readJsonResponse } from '@/lib/fetch-json'

/** Открыть или создать личный чат с пользователем и показать его в UI. */
export async function openPrivateChatWithUser(
  targetUserId: string,
): Promise<{ ok: true; chatId: string } | { ok: false; error?: string }> {
  const { setChats, setActiveChat, setView } = useAppStore.getState()

  const res = await fetch('/api/chats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'private', targetUserId }),
  })
  const data = await readJsonResponse<{ error?: string; chat?: { id: string } }>(res)
  if (!res.ok || !data?.chat?.id) {
    return { ok: false, error: data?.error }
  }

  const chatsRes = await fetch('/api/chats')
  const chatsData = await readJsonResponse<{ chats?: ChatListItem[] }>(chatsRes)
  if (chatsData?.chats) setChats(chatsData.chats)

  setActiveChat(data.chat.id)
  setView('chats')
  return { ok: true, chatId: data.chat.id }
}

/** Подписаться / вступить в публичный канал или группу по @slug и открыть чат. */
export async function joinPublicChatBySlug(
  slug: string,
): Promise<{ ok: true; chatId: string } | { ok: false; error?: string }> {
  const { setChats, setActiveChat, setView } = useAppStore.getState()

  const res = await fetch(`/api/channels/${encodeURIComponent(slug)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'subscribe' }),
  })
  const data = await readJsonResponse<{ error?: string; chatId?: string }>(res)
  if (!res.ok || !data?.chatId) {
    return { ok: false, error: data?.error }
  }

  const chatsRes = await fetch('/api/chats')
  const chatsData = await readJsonResponse<{ chats?: ChatListItem[] }>(chatsRes)
  if (chatsData?.chats) setChats(chatsData.chats)

  setActiveChat(data.chatId)
  setView('chats')
  return { ok: true, chatId: data.chatId }
}
