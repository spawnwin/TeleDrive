'use client'

import { Clapperboard, MessageCircle, Search, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { UnreadBadge } from './unread-indicator'
import { Avatar } from './avatar'

type MobileTab = 'chats' | 'shorts' | 'contacts'

interface MobileBottomNavProps {
  activeTab: MobileTab
  unreadCount: number
  labels: Record<MobileTab, string>
  settingsLabel?: string
  searchLabel?: string
  userName?: string | null
  userAvatarColor?: string | null
  userAvatarUrl?: string | null
  onChats: () => void
  onShorts: () => void
  onContacts: () => void
  onSettings?: () => void
  onSearch?: () => void
}

export function MobileBottomNav({
  activeTab,
  unreadCount,
  labels,
  settingsLabel = 'Настройки',
  searchLabel = 'Поиск',
  userName,
  userAvatarColor,
  userAvatarUrl,
  onChats,
  onShorts,
  onContacts,
  onSettings,
  onSearch,
}: MobileBottomNavProps) {
  const items = [
    { id: 'contacts' as const, icon: Users, onClick: onContacts, label: labels.contacts },
    { id: 'shorts' as const, icon: Clapperboard, onClick: onShorts, label: labels.shorts },
    { id: 'chats' as const, icon: MessageCircle, onClick: onChats, label: labels.chats },
  ]

  const glass =
    'border border-white/10 bg-[#1c1c1e]/72 shadow-[0_8px_28px_rgba(0,0,0,0.35)] backdrop-blur-2xl dark:bg-[#2c2c2e]/75'

  return (
    <nav
      aria-label="Мобильная навигация"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[200] xl:hidden"
    >
      <div className="pointer-events-none mx-auto flex max-w-lg items-end gap-2 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1">
        {/* Floating pill — Telegram style */}
        <div
          className={cn(
            'pointer-events-auto flex min-w-0 flex-1 items-stretch justify-between rounded-full px-1.5 py-1',
            glass,
          )}
        >
          {items.map(({ id, icon: Icon, onClick, label }) => {
            const active = activeTab === id
            return (
              <button
                key={id}
                type="button"
                onClick={onClick}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className="relative flex min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-full px-1 py-0.5 transition-opacity active:opacity-60"
              >
                <span className="relative flex h-[22px] w-[22px] items-center justify-center">
                  <Icon
                    strokeWidth={active ? 2.15 : 1.55}
                    absoluteStrokeWidth
                    className={cn(
                      'h-[22px] w-[22px] transition-colors duration-150',
                      active ? 'text-white' : 'text-white/55',
                    )}
                  />
                  {id === 'chats' && unreadCount > 0 && (
                    <UnreadBadge
                      count={unreadCount}
                      className="absolute -right-2.5 -top-1.5 h-[15px] min-w-[15px] border-[1.5px] border-[#1c1c1e] bg-red-500 px-0.5 text-[8px] leading-none shadow-none"
                    />
                  )}
                </span>
                <span
                  className={cn(
                    'max-w-full truncate text-[9px] leading-none tracking-tight',
                    active ? 'font-medium text-white' : 'font-normal text-white/50',
                  )}
                >
                  {label}
                </span>
              </button>
            )
          })}

          {onSettings && (
            <button
              type="button"
              onClick={onSettings}
              aria-label={settingsLabel}
              className="relative flex min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-full px-1 py-0.5 transition-opacity active:opacity-60"
            >
              <span className="flex h-[22px] w-[22px] items-center justify-center overflow-hidden rounded-full">
                <Avatar
                  name={userName || 'U'}
                  color={userAvatarColor || '#7c3aed'}
                  imageUrl={userAvatarUrl}
                  size="sm"
                  className="h-[22px] w-[22px] overflow-hidden rounded-full [&>div]:!h-[22px] [&>div]:!w-[22px] [&>div]:!rounded-full [&>div]:text-[8px] [&>div]:ring-1 [&>div]:ring-white/20 [&>div]:shadow-none"
                />
              </span>
              <span className="max-w-full truncate text-[9px] font-normal leading-none tracking-tight text-white/50">
                {settingsLabel}
              </span>
            </button>
          )}
        </div>

        {/* Separate search island — own hit target (not blocked by list under nav) */}
        {onSearch && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onSearch()
            }}
            aria-label={searchLabel}
            className={cn(
              'pointer-events-auto relative z-[1] flex h-[52px] w-[52px] shrink-0 touch-manipulation items-center justify-center rounded-full transition-opacity active:opacity-60',
              glass,
            )}
          >
            <Search strokeWidth={1.75} absoluteStrokeWidth className="pointer-events-none h-[22px] w-[22px] text-white" />
          </button>
        )}
      </div>
    </nav>
  )
}
