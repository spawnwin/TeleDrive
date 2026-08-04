'use client'

import { useEffect, useState } from 'react'
import { UserPlus, UserCheck, Clock, Loader2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useI18n } from '@/hooks/use-i18n'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { FriendshipStatus } from '@/lib/friends'
import { ContactNameDialog, type ContactNameValue } from './contact-name-dialog'

export interface FriendshipState {
  id: string | null
  status: FriendshipStatus
}

interface FriendButtonProps {
  userId: string
  /** Current profile/user display or original name — used to prefill contact form */
  peerName?: string
  peerUsername?: string
  contactFirstName?: string | null
  contactLastName?: string | null
  friendship: FriendshipState | null | undefined
  onUpdate?: (friendship: FriendshipState) => void
  onContactNameChange?: (displayName: string, parts: ContactNameValue) => void
  variant?: 'default' | 'outline' | 'compact'
  className?: string
}

async function refreshChats() {
  try {
    const res = await fetch('/api/chats')
    const data = await res.json().catch(() => ({}))
    if (res.ok && data?.chats) useAppStore.getState().setChats(data.chats)
  } catch {
    /* ignore */
  }
}

export function FriendButton({
  userId,
  peerName = '',
  peerUsername,
  contactFirstName,
  contactLastName,
  friendship,
  onUpdate,
  onContactNameChange,
  variant = 'default',
  className,
}: FriendButtonProps) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [local, setLocal] = useState<FriendshipState | null>(friendship ?? null)
  const [nameDialog, setNameDialog] = useState<'add' | 'edit' | null>(null)

  useEffect(() => {
    setLocal(friendship ?? null)
  }, [userId, friendship?.id, friendship?.status])

  const state = local ?? friendship ?? { id: null, status: 'none' as FriendshipStatus }

  const applyState = (next: FriendshipState) => {
    setLocal(next)
    onUpdate?.(next)
  }

  const splitPrefill = (): ContactNameValue => {
    if (contactFirstName?.trim()) {
      return {
        firstName: contactFirstName.trim(),
        lastName: (contactLastName || '').trim(),
      }
    }
    const parts = peerName.trim().split(/\s+/)
    return {
      firstName: parts[0] || peerName || '',
      lastName: parts.slice(1).join(' '),
    }
  }

  const saveContactOnly = async (value: ContactNameValue) => {
    const res = await fetch(`/api/contacts/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || t('contacts.saveError'))
    const displayName =
      data.contact?.displayName ||
      [value.firstName, value.lastName].filter(Boolean).join(' ')
    onContactNameChange?.(displayName, value)
    await refreshChats()
    toast.success(t('contacts.nameUpdated'))
  }

  const sendRequestWithName = async (value: ContactNameValue) => {
    setLoading(true)
    try {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          firstName: value.firstName,
          lastName: value.lastName || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data.friendship) applyState(data.friendship)
        throw new Error(data.error || t('friends.errorSend'))
      }
      applyState(data.friendship)
      const displayName =
        data.contact?.displayName ||
        [value.firstName, value.lastName].filter(Boolean).join(' ')
      onContactNameChange?.(displayName, value)
      await refreshChats()
      if (data.autoAccepted) {
        toast.success(t('friends.requestAccepted'))
      } else {
        toast.success(t('friends.requestSent'))
      }
    } finally {
      setLoading(false)
    }
  }

  const patchAction = async (action: 'accept' | 'decline' | 'remove') => {
    if (!state.id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/friends/${state.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('friends.errorAction'))
      applyState(data.friendship)
      if (action === 'accept') toast.success(t('friends.requestAccepted'))
      else if (action === 'decline') toast.success(t('friends.requestDeclined'))
      else toast.success(t('friends.removed'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('friends.errorAction'))
    } finally {
      setLoading(false)
    }
  }

  const prefill = splitPrefill()
  const subtitle = peerUsername
    ? `@${peerUsername}`
    : peerName
      ? t('contacts.originalName').replace('{name}', peerName)
      : undefined

  const dialog = (
    <ContactNameDialog
      open={!!nameDialog}
      onOpenChange={(open) => {
        if (!open) setNameDialog(null)
      }}
      title={nameDialog === 'add' ? t('contacts.addTitle') : t('contacts.editName')}
      subtitle={subtitle}
      initialFirstName={prefill.firstName}
      initialLastName={prefill.lastName}
      confirmLabel={nameDialog === 'add' ? t('contacts.addAndSave') : t('contacts.save')}
      onConfirm={async (value) => {
        if (nameDialog === 'add') await sendRequestWithName(value)
        else await saveContactOnly(value)
      }}
    />
  )

  if (state.status === 'accepted') {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={variant === 'compact' ? 'ghost' : 'outline'}
              size={variant === 'compact' ? 'sm' : 'default'}
              disabled={loading}
              className={cn(
                variant === 'default' && 'w-full min-w-0 max-w-full rounded-xl border-cyan-500/30 bg-cyan-500/5',
                variant === 'compact' && 'h-8 gap-1 px-2 text-xs',
                className,
              )}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <UserCheck className="h-4 w-4 shrink-0 text-primary" />
              )}
              {variant !== 'compact' && <span className="truncate">{t('friends.inFriends')}</span>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuItem onClick={() => setNameDialog('edit')}>
              <Pencil className="mr-2 h-4 w-4" />
              {t('contacts.editName')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => patchAction('remove')}
            >
              {t('friends.remove')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {dialog}
      </>
    )
  }

  if (state.status === 'pending_outgoing') {
    return (
      <>
        <div className={cn('flex gap-2', variant === 'default' && 'w-full', className)}>
          <Button
            variant={variant === 'compact' ? 'ghost' : 'outline'}
            size={variant === 'compact' ? 'sm' : 'default'}
            disabled={loading}
            onClick={() => patchAction('remove')}
            className={cn(
              'flex-1 rounded-xl',
              variant === 'compact' && 'h-8 gap-1 px-2 text-xs text-muted-foreground',
            )}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Clock className="h-4 w-4 text-primary" />
            )}
            {variant !== 'compact' ? t('friends.requestSent') : t('friends.cancelRequest')}
          </Button>
          {variant !== 'compact' && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-xl"
              title={t('contacts.editName')}
              onClick={() => setNameDialog('edit')}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
        {dialog}
      </>
    )
  }

  if (state.status === 'pending_incoming') {
    return (
      <div className={cn('flex gap-2', variant === 'default' && 'w-full', className)}>
        <Button
          disabled={loading}
          onClick={() => patchAction('accept')}
          className={cn(
            'flex-1 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90',
            variant === 'compact' && 'h-8 px-3 text-xs',
          )}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('friends.accept')}
        </Button>
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => patchAction('decline')}
          className={cn('rounded-xl', variant === 'compact' && 'h-8 px-3 text-xs')}
        >
          {t('friends.decline')}
        </Button>
      </div>
    )
  }

  return (
    <>
      <Button
        disabled={loading}
        onClick={() => setNameDialog('add')}
        className={cn(
          variant === 'default' &&
            'w-full rounded-xl bg-primary text-primary-foreground shadow-md hover:bg-primary/90',
          variant === 'outline' && 'w-full rounded-xl border-primary/30',
          variant === 'compact' && 'h-8 gap-1 px-2 text-xs',
          className,
        )}
        variant={variant === 'outline' ? 'outline' : 'default'}
        size={variant === 'compact' ? 'sm' : 'default'}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <UserPlus className="h-4 w-4" />
        )}
        {variant !== 'compact' && t('friends.add')}
      </Button>
      {dialog}
    </>
  )
}
