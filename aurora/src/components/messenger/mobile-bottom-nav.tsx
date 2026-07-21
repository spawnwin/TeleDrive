'use client'

import { Clapperboard, MessageCircle, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { UnreadBadge } from './unread-indicator'

type MobileTab = 'chats' | 'shorts' | 'contacts'

interface MobileBottomNavProps {
  activeTab: MobileTab
  unreadCount: number
  labels: Record<MobileTab, string>
  onChats: () => void
  onShorts: () => void
  onContacts: () => void
}

export function MobileBottomNav({
  activeTab,
  unreadCount,
  labels,
  onChats,
  onShorts,
  onContacts,
}: MobileBottomNavProps) {
  const items = [
    { id: 'chats' as const, icon: MessageCircle, onClick: onChats },
    { id: 'shorts' as const, icon: Clapperboard, onClick: onShorts },
    { id: 'contacts' as const, icon: Users, onClick: onContacts },
  ]

  return (
    <nav
      aria-label="Мобильная навигация"
      className="safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-border/50 bg-background xl:hidden"
    >
      {/* Compact Telegram/Max-style tab strip — ~40px content, then safe-area only */}
      <div className="mx-auto grid h-10 max-w-lg grid-cols-3">
        {items.map(({ id, icon: Icon, onClick }) => {
          const active = activeTab === id
          return (
            <button
              key={id}
              type="button"
              onClick={onClick}
              aria-label={labels[id]}
              aria-current={active ? 'page' : undefined}
              className="relative flex min-w-0 touch-manipulation flex-col items-center justify-center gap-px px-1 pt-0.5 transition-opacity active:opacity-60"
            >
              <span className="relative flex h-5 w-5 items-center justify-center">
                <Icon
                  strokeWidth={active ? 2.1 : 1.6}
                  absoluteStrokeWidth
                  className={cn(
                    'h-5 w-5 transition-colors duration-150',
                    active ? 'text-primary' : 'text-muted-foreground/80',
                  )}
                />
                {id === 'chats' && unreadCount > 0 && (
                  <UnreadBadge
                    count={unreadCount}
                    className="absolute -right-2.5 -top-1 h-[14px] min-w-[14px] border border-background px-0.5 text-[8px] leading-none shadow-none"
                  />
                )}
              </span>
              <span
                className={cn(
                  'max-w-full truncate text-[9px] leading-none transition-colors duration-150',
                  active ? 'font-semibold text-primary' : 'font-normal text-muted-foreground/80',
                )}
              >
                {labels[id]}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
