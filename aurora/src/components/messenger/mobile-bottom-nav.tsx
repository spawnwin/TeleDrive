'use client'

import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Clapperboard, MessageCircle, Newspaper, Search, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { UnreadBadge } from './unread-indicator'
import { Avatar } from './avatar'

type MobileTab = 'chats' | 'feed' | 'shorts' | 'contacts'

interface MobileBottomNavProps {
  activeTab: MobileTab
  unreadCount: number
  labels: Record<MobileTab, string>
  settingsLabel?: string
  profileLabel?: string
  searchLabel?: string
  cancelLabel?: string
  searchPlaceholder?: string
  userName?: string | null
  userAvatarColor?: string | null
  userAvatarUrl?: string | null
  /** Hide while chat multi-select is active (Telegram replaces tab bar). */
  hidden?: boolean
  searchOpen?: boolean
  searchQuery?: string
  onSearchQueryChange?: (query: string) => void
  onChats: () => void
  onFeed: () => void
  onShorts: () => void
  onContacts: () => void
  onSettings?: () => void
  /** Opens the current user's profile wall (Telegram-style). */
  onProfile?: () => void
  onSearch?: () => void
  onSearchClose?: () => void
}

export function MobileBottomNav({
  activeTab,
  unreadCount,
  labels,
  settingsLabel = 'Настройки',
  profileLabel = 'Профиль',
  searchLabel = 'Поиск',
  cancelLabel = 'Отмена',
  searchPlaceholder = 'Поиск',
  userName,
  userAvatarColor,
  userAvatarUrl,
  hidden = false,
  searchOpen = false,
  searchQuery = '',
  onSearchQueryChange,
  onChats,
  onFeed,
  onShorts,
  onContacts,
  onSettings,
  onProfile,
  onSearch,
  onSearchClose,
}: MobileBottomNavProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const items = [
    { id: 'contacts' as const, icon: Users, onClick: onContacts, label: labels.contacts },
    { id: 'feed' as const, icon: Newspaper, onClick: onFeed, label: labels.feed },
    { id: 'shorts' as const, icon: Clapperboard, onClick: onShorts, label: labels.shorts },
    { id: 'chats' as const, icon: MessageCircle, onClick: onChats, label: labels.chats },
  ]

  // High-contrast floating glass — must stay above list/stories and remain tappable
  const glass = 'aurora-chats-mobile-glass'

  useEffect(() => {
    if (!searchOpen) return
    const id = window.setTimeout(() => inputRef.current?.focus(), 40)
    return () => window.clearTimeout(id)
  }, [searchOpen])

  if (hidden) return null

  return (
    <nav
      data-aurora-fixed
      aria-label="Мобильная навигация"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[300] xl:hidden"
    >
      <div className="pointer-events-none mx-auto w-full max-w-lg px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1">
        <AnimatePresence mode="wait" initial={false}>
          {searchOpen ? (
            <motion.div
              key="search-bar"
              initial={{ y: 72, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 72, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.85 }}
              className="pointer-events-auto flex items-center gap-2"
            >
              <div className={cn('flex h-[52px] min-w-0 flex-1 items-center gap-2 rounded-full px-3.5', glass)}>
                <Search
                  strokeWidth={1.75}
                  absoluteStrokeWidth
                  className="h-[20px] w-[20px] shrink-0 text-white/70"
                />
                <input
                  ref={inputRef}
                  id="aurora-mobile-search"
                  type="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={searchQuery}
                  onChange={(e) => onSearchQueryChange?.(e.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchLabel}
                  className="min-w-0 flex-1 bg-transparent text-[16px] text-white outline-none placeholder:text-white/40"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    aria-label="Clear"
                    onClick={() => {
                      onSearchQueryChange?.('')
                      inputRef.current?.focus()
                    }}
                    className="flex h-7 w-7 shrink-0 touch-manipulation items-center justify-center rounded-full bg-white/15 text-white/80 active:opacity-70"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onSearchClose}
                className={cn(
                  'h-[52px] shrink-0 touch-manipulation rounded-full px-4 text-[15px] font-medium text-[#3aa0ff] active:opacity-70',
                  glass,
                )}
              >
                {cancelLabel}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="tab-bar"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.85 }}
              className="pointer-events-auto flex items-end gap-2"
            >
              <div
                className={cn(
                  'flex min-w-0 flex-1 items-stretch justify-between rounded-full px-1 py-1',
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
                      className="relative flex min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-full px-0.5 py-0.5 transition-opacity active:opacity-60"
                    >
                      <span className="relative flex h-[22px] w-[22px] items-center justify-center">
                        <Icon
                          strokeWidth={active ? 2.25 : 1.55}
                          absoluteStrokeWidth
                          className={cn(
                            'h-[22px] w-[22px] transition-colors duration-150',
                            active ? 'aurora-chats-mobile-active' : 'text-white/55',
                          )}
                        />
                        {id === 'chats' && unreadCount > 0 && (
                          <UnreadBadge
                            count={unreadCount}
                            className="absolute -right-2.5 -top-1.5 h-[15px] min-w-[15px] border-[1.5px] border-[#0e1621] bg-[linear-gradient(145deg,#3aa0ff,#2dd4bf)] px-0.5 text-[8px] leading-none text-[#041018] shadow-none"
                          />
                        )}
                      </span>
                      <span
                        className={cn(
                          'max-w-full truncate text-[9px] leading-none tracking-tight',
                          active ? 'aurora-chats-mobile-active font-semibold' : 'font-normal text-white/50',
                        )}
                      >
                        {label}
                      </span>
                    </button>
                  )
                })}

                {(onProfile || onSettings) && (
                  <button
                    type="button"
                    onClick={onProfile || onSettings}
                    aria-label={onProfile ? profileLabel : settingsLabel}
                    aria-current={undefined}
                    className="relative flex min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-full px-0.5 py-0.5 transition-opacity active:opacity-60"
                  >
                    <span className="flex h-[22px] w-[22px] items-center justify-center overflow-hidden rounded-full ring-2 ring-[#3aa0ff]/45">
                      <Avatar
                        name={userName || 'U'}
                        color={userAvatarColor || 'var(--primary)'}
                        imageUrl={userAvatarUrl}
                        size="sm"
                        className="h-[22px] w-[22px] overflow-hidden rounded-full [&>div]:!h-[22px] [&>div]:!w-[22px] [&>div]:!rounded-full [&>div]:text-[8px] [&>div]:shadow-none"
                      />
                    </span>
                    <span className="max-w-full truncate text-[9px] font-normal leading-none tracking-tight text-white/50">
                      {onProfile ? profileLabel : settingsLabel}
                    </span>
                  </button>
                )}
              </div>

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
                    'relative z-[1] flex h-[52px] w-[52px] shrink-0 touch-manipulation items-center justify-center rounded-full transition-opacity active:opacity-60',
                    glass,
                  )}
                >
                  <Search
                    strokeWidth={1.75}
                    absoluteStrokeWidth
                    className="pointer-events-none h-[22px] w-[22px] text-white"
                  />
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  )
}
