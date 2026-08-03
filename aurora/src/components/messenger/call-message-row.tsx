'use client'

import { Phone, PhoneMissed, PhoneOff, PhoneIncoming, PhoneOutgoing, Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getCallMessageLabel, parseCallMetadata } from '@/lib/call-message'
import type { ChatMessage } from '@/hooks/use-socket'

interface CallMessageRowProps {
  msg: ChatMessage
  viewerId: string
  t: (key: string) => string
}

function CallIcon({
  meta,
  mine,
}: {
  meta: NonNullable<ReturnType<typeof parseCallMetadata>>
  mine: boolean
}) {
  const missed = meta.status === 'missed' || meta.status === 'cancelled'
  const declined = meta.status === 'declined'
  const Icon =
    meta.callType === 'video'
      ? Video
      : missed
        ? PhoneMissed
        : declined
          ? PhoneOff
          : mine
            ? PhoneOutgoing
            : PhoneIncoming

  return (
    <Icon
      className={cn(
        'h-4 w-4 shrink-0',
        missed || declined ? 'text-rose-500' : 'text-emerald-500',
      )}
    />
  )
}

export function CallMessageRow({ msg, viewerId, t }: CallMessageRowProps) {
  const meta = parseCallMetadata(msg.metadata)
  if (!meta) return null

  const mine = msg.senderId === viewerId
  const label = getCallMessageLabel(meta, viewerId, msg.senderId, t)
  const missed = meta.status === 'missed' || meta.status === 'cancelled' || meta.status === 'declined'

  return (
    <div className="my-1 flex justify-center px-2">
      <div
        className={cn(
          'inline-flex max-w-[90%] items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium shadow-sm',
          missed
            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
            : 'bg-muted/80 text-muted-foreground',
        )}
      >
        <CallIcon meta={meta} mine={mine} />
        <span className="truncate">{label.replace(/^📞 |^📹 /, '')}</span>
        {meta.callType === 'audio' && meta.status === 'answered' && (
          <Phone className="h-3 w-3 opacity-40" aria-hidden />
        )}
      </div>
    </div>
  )
}
