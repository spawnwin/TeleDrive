'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Flag,
  Megaphone,
  Bot,
  Gift,
  Shield,
  Settings,
  ArrowLeft,
  Menu,
  X,
  Clapperboard,
  Youtube,
  Sparkles,
  Landmark,
  Store,
  Radio,
  Sticker,
  Send,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const nav = [
  { href: '/admin', label: 'Дашборд', icon: LayoutDashboard, exact: true },
  { href: '/admin/users', label: 'Пользователи', icon: Users },
  { href: '/admin/reports', label: 'Жалобы', icon: Flag },
  { href: '/admin/ads', label: 'Реклама', icon: Megaphone },
  { href: '/admin/shorts', label: 'Шорты', icon: Clapperboard },
  { href: '/admin/shorts-parser', label: 'Авто-парсер', icon: Youtube },
  { href: '/admin/gifts', label: 'Подарки', icon: Gift },
  { href: '/admin/emoji-statuses', label: 'Эмодзи-статусы', icon: Sparkles },
  { href: '/admin/bots', label: 'Боты', icon: Bot },
  { href: '/admin/moderation', label: 'Модерация', icon: Shield },
  { href: '/admin/marketplace', label: 'Маркетплейс', icon: Store },
  { href: '/admin/streams', label: 'Стримы', icon: Radio },
  { href: '/admin/stickers', label: 'Стикерпаки', icon: Sticker },
  { href: '/admin/transfers', label: 'Переводы', icon: Send },
  { href: '/admin/payments', label: 'Выплаты', icon: Landmark },
  { href: '/admin/system', label: 'Система', icon: Settings },
]

export function AdminSidebar({ adminName }: { adminName: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const content = (
    <>
      <div className="px-4 pb-4 pt-5">
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-sky-400/15 via-white/[0.04] to-transparent px-4 py-4 shadow-inner">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-300/90">
            Aurora Admin
          </p>
          <p className="mt-1.5 truncate text-sm font-medium text-zinc-100">{adminName}</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {nav.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + '/')
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                'group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                active
                  ? 'bg-sky-400/15 text-sky-100 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.25)]'
                  : 'text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100',
              )}
            >
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-xl transition',
                  active
                    ? 'bg-sky-400/20 text-sky-200'
                    : 'bg-white/[0.04] text-zinc-500 group-hover:text-zinc-300',
                )}
              >
                <Icon className="size-4 shrink-0" />
              </span>
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="p-3 pt-0">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start rounded-2xl border border-white/8 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
          asChild
        >
          <Link href="/">
            <ArrowLeft className="size-4" />
            В мессенджер
          </Link>
        </Button>
      </div>
    </>
  )

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        className="fixed left-4 top-[max(1rem,env(safe-area-inset-top))] z-50 rounded-2xl border-white/10 bg-zinc-900/90 shadow-lg backdrop-blur lg:hidden"
        onClick={() => setOpen(!open)}
        aria-label="Меню"
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
      </Button>

      {open && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Закрыть меню"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[17.5rem] flex-col border-r border-white/8 bg-zinc-950/80 backdrop-blur-xl transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {content}
      </aside>
    </>
  )
}
