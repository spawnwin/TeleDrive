'use client'

import { Clapperboard, MessageSquare, Users } from 'lucide-react'
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
    { id: 'chats' as const, icon: MessageSquare, onClick: onChats },
    { id: 'shorts' as const, icon: Clapperboard, onClick: onShorts },
    { id: 'contacts' as const, icon: Users, onClick: onContacts },
  ]

  return (
    <nav
      aria-label="Мобильная навигация"
      className="safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background xl:hidden"
    >
      <div className="mx-auto grid h-14 max-w-lg grid-cols-3">
        {items.map(({ id, icon: Icon, onClick }) => {
          const active = activeTab === id
          return (
            <button
              key={id}
              type="button"
              onClick={onClick}
              aria-label={labels[id]}
              aria-current={active ? 'page' : undefined}
              className="group relative flex min-w-0 touch-manipulation flex-col items-center justify-center gap-0.5 px-1 transition-opacity active:opacity-70"
            >
              <span className="relative flex h-6 w-6 items-center justify-center">
                <Icon
                  strokeWidth={active ? 2.25 : 1.75}
                  className={cn(
                    'h-[22px] w-[22px] transition-colors duration-150',
                    active ? 'text-primary' : 'text-muted-foreground',
                  )}
                />
                {id === 'chats' && unreadCount > 0 && (
                  <UnreadBadge
                    count={unreadCount}
                    className="absolute -right-3 -top-1.5 h-[16px] min-w-[16px] border-2 border-background px-0.5 text-[9px] shadow-none"
                  />
                )}
              </span>
              <span
                className={cn(
                  'max-w-full truncate text-[10px] leading-none tracking-tight transition-colors duration-150',
                  active ? 'font-medium text-primary' : 'font-normal text-muted-foreground',
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
