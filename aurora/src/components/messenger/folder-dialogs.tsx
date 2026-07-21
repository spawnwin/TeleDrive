'use client'

import { useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar } from './avatar'
import { useAppStore, type ChatListItem } from '@/lib/store'
import { useI18n } from '@/hooks/use-i18n'
import { cn } from '@/lib/utils'
import { readJsonResponse } from '@/lib/fetch-json'
import { toast } from 'sonner'
import { getChatAvatarImageUrl } from '@/lib/chat-avatar'
import {
  Plus,
  Search,
  Trash2,
  Pencil,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Check,
} from 'lucide-react'
import type { ChatFolder, FolderFilterType } from '@/lib/chat-folders'

const SUGGESTED_EMOJIS = [
  '⭐',
  '💼',
  '❤️',
  '🏠',
  '🎓',
  '📰',
  '🎮',
  '🎵',
  '✈️',
  '🍔',
  '⚽',
  '🐶',
  '🐱',
  '📚',
  '💡',
  '🔥',
  '👍',
  '🎉',
  '💰',
  '🛒',
]

interface EditFoldersDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
}

/**
 * "Edit Folders" overview dialog — lists all folders with reorder controls and
 * an "Add Folder" button. Clicking a folder opens the per-folder editor.
 */
export function EditFoldersDialog({ open, onOpenChange }: EditFoldersDialogProps) {
  const { t } = useI18n()
  const { chatFolders, setChatFolders, upsertChatFolder, removeChatFolder } = useAppStore()
  const [editing, setEditing] = useState<ChatFolder | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ChatFolder | null>(null)
  const [busy, setBusy] = useState(false)

  const move = async (folder: ChatFolder, dir: 'up' | 'down') => {
    const sorted = [...chatFolders].sort((a, b) => a.position - b.position)
    const idx = sorted.findIndex((f) => f.id === folder.id)
    if (idx === -1) return
    const swapWith = dir === 'up' ? idx - 1 : idx + 1
    if (swapWith < 0 || swapWith >= sorted.length) return
    const a = sorted[idx]
    const b = sorted[swapWith]
    const newPosA = b.position
    const newPosB = a.position
    const originalFolders = chatFolders
    // Optimistic local swap
    setChatFolders(
      chatFolders.map((f) =>
        f.id === a.id ? { ...f, position: newPosA } : f.id === b.id ? { ...f, position: newPosB } : f,
      ),
    )
    // Persist both positions in parallel; rollback on error
    try {
      await Promise.all([
        fetch(`/api/folders/${a.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ position: newPosA }),
        }),
        fetch(`/api/folders/${b.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ position: newPosB }),
        }),
      ])
    } catch {
      setChatFolders(originalFolders)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setBusy(true)
    try {
      const res = await fetch(`/api/folders/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error(t('folders.errorDelete'))
        return
      }
      removeChatFolder(deleteTarget.id)
      toast.success(t('folders.deleted'))
      setDeleteTarget(null)
    } catch {
      toast.error(t('folders.errorDelete'))
    } finally {
      setBusy(false)
    }
  }

  const sortedFolders = useMemo(
    () => [...chatFolders].sort((a, b) => a.position - b.position),
    [chatFolders],
  )

  return (
    <>
      <Dialog open={open && !creating && editing === null} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle>{t('folders.edit')}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto px-3 py-3">
            {sortedFolders.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                {t('folders.empty')}
              </p>
            ) : (
              <ul className="space-y-1">
                {sortedFolders.map((folder, idx) => (
                  <li
                    key={folder.id}
                    className="flex items-center gap-2 rounded-xl px-2 py-2 transition hover:bg-muted"
                  >
                    <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                    <span className="w-6 shrink-0 text-center text-base">
                      {folder.emoji || '📁'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditing(folder)}
                      className="min-w-0 flex-1 truncate text-left text-sm font-medium"
                    >
                      {folder.name}
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={idx === 0}
                        onClick={() => move(folder, 'up')}
                        title={t('folders.reorder')}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={idx === sortedFolders.length - 1}
                        onClick={() => move(folder, 'down')}
                        title={t('folders.reorder')}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setEditing(folder)}
                        title={t('folders.editFolder')}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(folder)}
                        title={t('folders.delete')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter className="border-t border-border px-5 py-3">
            <Button
              onClick={() => setCreating(true)}
              className="w-full gap-2 bg-[#3390ec] text-white hover:bg-[#2b82d9]"
            >
              <Plus className="h-4 w-4" />
              {t('folders.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {creating && (
        <EditFolderDialog
          key="create"
          folder={null}
          open={creating}
          onOpenChange={(v) => {
            if (!v) setCreating(false)
          }}
          onSaved={(folder) => {
            upsertChatFolder(folder)
            setCreating(false)
          }}
        />
      )}

      {editing && (
        <EditFolderDialog
          key={`edit-${editing.id}`}
          folder={editing}
          open={editing !== null}
          onOpenChange={(v) => {
            if (!v) setEditing(null)
          }}
          onSaved={(folder) => {
            upsertChatFolder(folder)
            setEditing(null)
          }}
          onDeleted={(id) => {
            removeChatFolder(id)
            setEditing(null)
          }}
        />
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('folders.delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('folders.deleteConfirm').replace('{name}', deleteTarget?.name ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('folders.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('folders.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

interface EditFolderDialogProps {
  folder: ChatFolder | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved: (folder: ChatFolder) => void
  onDeleted?: (id: string) => void
}

const FILTER_CHIPS: { value: FolderFilterType; key: string }[] = [
  { value: 'custom', key: 'folders.filterAll' },
  { value: 'channels', key: 'folders.filterChannels' },
  { value: 'groups', key: 'folders.filterGroups' },
  { value: 'private', key: 'folders.filterPrivate' },
  { value: 'bots', key: 'folders.filterBots' },
]

/**
 * "Edit Folder" dialog — name, emoji, filter type, included & excluded chats.
 * Creates a new folder when `folder` is null.
 */
function EditFolderDialog({ folder, open, onOpenChange, onSaved, onDeleted }: EditFolderDialogProps) {
  const { t } = useI18n()
  const { chats, currentUser } = useAppStore()
  // Initial state is derived from `folder` directly. The parent remounts this
  // component via a `key` when switching between create / edit targets, so we
  // never need to resync state via an effect (which would trigger cascading
  // renders and the react-hooks/set-state-in-effect lint rule).
  const [name, setName] = useState(() => folder?.name ?? '')
  const [emoji, setEmoji] = useState<string | null>(() => folder?.emoji ?? null)
  const [filterType, setFilterType] = useState<FolderFilterType>(
    () => folder?.filterType ?? 'custom',
  )
  const [includedIds, setIncludedIds] = useState<string[]>(
    () => folder?.includedChatIds ?? [],
  )
  const [excludedIds, setExcludedIds] = useState<string[]>(
    () => folder?.excludedChatIds ?? [],
  )
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Candidates that can be added to "included" / "excluded" pickers —
  // exclude Saved Messages (it has its own row, never belongs in a folder).
  const candidateChats = useMemo(
    () => chats.filter((c) => c.type !== 'saved'),
    [chats],
  )

  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return candidateChats
    return candidateChats.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.lastMessage?.content.toLowerCase().includes(q),
    )
  }, [candidateChats, search])

  // "Recommended" chats = chats that match the current filter type but aren't
  // yet included. Telegram suggests these at the top of the picker.
  const recommended = useMemo(() => {
    if (filterType === 'custom') return []
    return candidateChats.filter((c) => {
      if (includedIds.includes(c.id)) return false
      if (filterType === 'channels') return c.type === 'channel'
      if (filterType === 'groups') return c.type === 'group'
      if (filterType === 'private') return c.type === 'private'
      if (filterType === 'bots') {
        return (
          c.type === 'private' &&
          c.members.some((m) => m.id !== currentUser?.id && (m as { isBot?: boolean }).isBot)
        )
      }
      return false
    })
  }, [candidateChats, filterType, includedIds, currentUser?.id])

  const toggle = (list: string[], setList: (ids: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  }

  const save = async () => {
    if (!name.trim()) {
      toast.error(t('folders.name'))
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        emoji: emoji ?? null,
        filterType: filterType === 'custom' ? null : filterType,
        includedChatIds: includedIds,
        excludedChatIds: excludedIds,
      }
      const res = folder
        ? await fetch(`/api/folders/${folder.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      const data = await readJsonResponse<{ folder?: ChatFolder; error?: string }>(res)
      if (!res.ok || !data?.folder) {
        toast.error(data?.error || t('folders.errorSave'))
        return
      }
      toast.success(folder ? t('folders.saved') : t('folders.created'))
      onSaved(data.folder)
    } catch {
      toast.error(t('folders.errorSave'))
    } finally {
      setSaving(false)
    }
  }

  const doDelete = async () => {
    if (!folder) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/folders/${folder.id}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error(t('folders.errorDelete'))
        return
      }
      toast.success(t('folders.deleted'))
      onDeleted?.(folder.id)
    } catch {
      toast.error(t('folders.errorDelete'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Dialog open={open && !confirmDelete} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle>{folder ? t('folders.editFolder') : t('folders.create')}</DialogTitle>
          </DialogHeader>

          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
            {/* Name + emoji */}
            <div className="flex items-center gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('folders.namePlaceholder')}
                className="flex-1"
                autoFocus
              />
              <div className="flex h-10 w-12 items-center justify-center rounded-lg border border-input bg-muted text-lg">
                {emoji || '📁'}
              </div>
            </div>

            {/* Emoji picker */}
            <Label className="mt-4 block text-xs text-muted-foreground">
              {t('folders.emoji')}
            </Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTED_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(emoji === e ? null : e)}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg text-lg transition hover:bg-muted',
                    emoji === e && 'bg-[#3390ec]/15 ring-1 ring-[#3390ec]',
                  )}
                >
                  {e}
                </button>
              ))}
            </div>

            {/* Filter type chips */}
            <Label className="mt-4 block text-xs text-muted-foreground">
              {t('folders.filter')}
            </Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FILTER_CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => setFilterType(chip.value)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition',
                    filterType === chip.value
                      ? 'bg-[#3390ec] text-white'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80',
                  )}
                >
                  {t(chip.key)}
                </button>
              ))}
            </div>

            {/* Included chats picker */}
            <Label className="mt-4 block text-xs text-muted-foreground">
              {t('folders.included')}
            </Label>
            <p className="mt-0.5 text-[11px] text-muted-foreground/80">
              {t('folders.includedHint')}
            </p>
            <ChatMultiSelect
              chats={filteredCandidates}
              recommended={recommended}
              selectedIds={includedIds}
              onToggle={(id) => toggle(includedIds, setIncludedIds, id)}
              search={search}
              onSearch={setSearch}
              emptyKey="folders.emptyChats"
            />

            {/* Excluded chats picker */}
            <Label className="mt-4 block text-xs text-muted-foreground">
              {t('folders.excluded')}
            </Label>
            <p className="mt-0.5 text-[11px] text-muted-foreground/80">
              {t('folders.excludedHint')}
            </p>
            <ChatMultiSelect
              chats={filteredCandidates}
              recommended={[]}
              selectedIds={excludedIds}
              onToggle={(id) => toggle(excludedIds, setExcludedIds, id)}
              search={search}
              onSearch={setSearch}
              emptyKey="folders.emptyChats"
            />
          </div>

          <DialogFooter className="flex gap-2 border-t border-border px-5 py-3">
            {folder && (
              <Button
                variant="ghost"
                className="mr-auto text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
                disabled={deleting || saving}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                {t('folders.delete')}
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || deleting}>
              {t('folders.cancel')}
            </Button>
            <Button
              onClick={() => void save()}
              disabled={saving || deleting || !name.trim()}
              className="bg-[#3390ec] text-white hover:bg-[#2b82d9]"
            >
              {saving ? '…' : t('folders.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!open && !deleting) setConfirmDelete(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('folders.delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('folders.deleteConfirm').replace('{name}', name || '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('folders.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void doDelete()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? '…' : t('folders.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function ChatMultiSelect({
  chats,
  recommended,
  selectedIds,
  onToggle,
  search,
  onSearch,
  emptyKey,
}: {
  chats: ChatListItem[]
  recommended: ChatListItem[]
  selectedIds: string[]
  onToggle: (id: string) => void
  search: string
  onSearch: (q: string) => void
  emptyKey: string
}) {
  const { t } = useI18n()
  const { currentUser } = useAppStore()
  const selected = new Set(selectedIds)
  const recommendedIds = new Set(recommended.map((c) => c.id))

  // Show recommended first (only when not searching), then the rest.
  const ordered = useMemo(() => {
    if (search.trim()) return chats
    const recs = chats.filter((c) => recommendedIds.has(c.id))
    const rest = chats.filter((c) => !recommendedIds.has(c.id))
    return [...recs, ...rest]
  }, [chats, recommendedIds, search])

  return (
    <div className="mt-2 rounded-xl border border-border">
      <div className="relative border-b border-border">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={t('folders.searchChats')}
          className="h-9 rounded-none border-none pl-9 text-sm focus-visible:ring-0"
        />
      </div>
      <div className="max-h-44 overflow-y-auto py-1">
        {!search.trim() && recommended.length > 0 && (
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('folders.recommended')}
          </p>
        )}
        {ordered.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">{t(emptyKey)}</p>
        ) : (
          ordered.map((chat) => {
            const checked = selected.has(chat.id)
            const isRec = recommendedIds.has(chat.id) && !search.trim()
            return (
              <button
                key={chat.id}
                type="button"
                onClick={() => onToggle(chat.id)}
                className={cn(
                  'flex w-full items-center gap-2 px-2 py-1.5 text-left transition hover:bg-muted',
                  checked && 'bg-[#3390ec]/10',
                )}
              >
                <Avatar
                  name={chat.title}
                  color={chat.avatarColor}
                  imageUrl={getChatAvatarImageUrl(chat, currentUser?.id)}
                  size="sm"
                />
                <span className="min-w-0 flex-1 truncate text-sm">{chat.title}</span>
                {isRec && !checked && (
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                    {t('folders.recommended')}
                  </span>
                )}
                {checked && <Check className="h-4 w-4 shrink-0 text-[#3390ec]" />}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
