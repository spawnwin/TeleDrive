'use client'

import { useEffect, useState } from 'react'
import { UserPlus, UserCheck, Clock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useI18n } from '@/hooks/use-i18n'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { FriendshipStatus } from '@/lib/friends'

export interface FriendshipState {
  id: string | null
  status: FriendshipStatus
}

interface FriendButtonProps {
  userId: string
  friendship: FriendshipState | null | undefined
  onUpdate?: (friendship: FriendshipState) => void
  variant?: 'default' | 'outline' | 'compact'
  className?: string
}

export function FriendButton({
  userId,
  friendship,
  onUpdate,
  variant = 'default',
  className,
}: FriendButtonProps) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [local, setLocal] = useState<FriendshipState | null>(friendship ?? null)

  useEffect(() => {
    setLocal(friendship ?? null)
  }, [userId, friendship?.id, friendship?.status])

  const state = local ?? friendship ?? { id: null, status: 'none' as FriendshipStatus }

  const applyState = (next: FriendshipState) => {
    setLocal(next)
    onUpdate?.(next)
  }

  const sendRequest = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.friendship) applyState(data.friendship)
        throw new Error(data.error || t('friends.errorSend'))
      }
      applyState(data.friendship)
      if (data.autoAccepted) {
        toast.success(t('friends.requestAccepted'))
      } else if (state.status === 'none' || state.status === 'declined') {
        toast.success(t('friends.requestSent'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('friends.errorSend'))
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

  if (state.status === 'accepted') {
    return (
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
              <UserCheck className="h-4 w-4 shrink-0 text-[#3390ec]" />
            )}
            {variant !== 'compact' && <span className="truncate">{t('friends.inFriends')}</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => patchAction('remove')}
          >
            {t('friends.remove')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  if (state.status === 'pending_outgoing') {
    return (
      <Button
        variant={variant === 'compact' ? 'ghost' : 'outline'}
        size={variant === 'compact' ? 'sm' : 'default'}
        disabled={loading}
        onClick={() => patchAction('remove')}
        className={cn(
          variant === 'default' && 'w-full rounded-xl',
          variant === 'compact' && 'h-8 gap-1 px-2 text-xs text-muted-foreground',
          className,
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Clock className="h-4 w-4 text-[#3390ec]" />
        )}
        {variant !== 'compact' ? t('friends.requestSent') : t('friends.cancelRequest')}
      </Button>
    )
  }

  if (state.status === 'pending_incoming') {
    return (
      <div className={cn('flex gap-2', variant === 'default' && 'w-full', className)}>
        <Button
          disabled={loading}
          onClick={() => patchAction('accept')}
          className={cn(
            'flex-1 rounded-xl bg-[#3390ec] text-white hover:bg-[#2b82d9]',
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
    <Button
      disabled={loading}
      onClick={sendRequest}
      className={cn(
        variant === 'default' &&
          'w-full rounded-xl bg-[#3390ec] text-white shadow-md hover:bg-[#2b82d9]',
        variant === 'outline' && 'w-full rounded-xl border-[#3390ec]/30',
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
  )
}
