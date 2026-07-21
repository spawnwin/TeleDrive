'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Users,
  MessageSquare,
  Radio,
  Film,
  Flag,
  MessagesSquare,
  Wallet,
  Store,
  Send,
  Sticker,
} from 'lucide-react'
import {
  AdminPageHeader,
  adminCardClass,
  adminCardHoverClass,
  adminSectionLabelClass,
} from '@/components/admin/admin-ui'
import { cn } from '@/lib/utils'

type Stats = {
  totalUsers: number
  onlineUsers: number
  totalChats: number
  messagesToday: number
  storiesActive: number
  shortsCount: number
  reportsPending: number
  revenueTodayRub: number
  marketplaceActiveListings: number
  marketplaceGmvRub: number
  liveStreamsNow: number
  stickerPacksPublished: number
  transfersTodayRub: number
  coinsInCirculation: number
}

const activityCards: { key: keyof Stats; label: string; icon: typeof Users; href?: string }[] = [
  { key: 'totalUsers', label: 'Всего пользователей', icon: Users, href: '/admin/users' },
  { key: 'onlineUsers', label: 'Онлайн', icon: Radio, href: '/admin/users' },
  { key: 'totalChats', label: 'Чатов', icon: MessagesSquare },
  { key: 'messagesToday', label: 'Сообщений сегодня', icon: MessageSquare },
  { key: 'storiesActive', label: 'Активных историй', icon: Film, href: '/admin/system' },
  { key: 'shortsCount', label: 'Шортов', icon: Film, href: '/admin/shorts' },
  { key: 'reportsPending', label: 'Жалоб в ожидании', icon: Flag, href: '/admin/reports' },
]

const economyCards: {
  key: keyof Stats
  label: string
  icon: typeof Users
  href?: string
  suffix?: string
}[] = [
  { key: 'revenueTodayRub', label: 'Пополнено сегодня', icon: Wallet, suffix: ' ₽', href: '/admin/payments' },
  { key: 'coinsInCirculation', label: 'Всего на балансах', icon: Wallet, suffix: ' ₽', href: '/admin/payments' },
  { key: 'transfersTodayRub', label: 'Переводов сегодня', icon: Send, suffix: ' ₽', href: '/admin/transfers' },
  { key: 'marketplaceActiveListings', label: 'Активных объявлений', icon: Store, href: '/admin/marketplace' },
  { key: 'marketplaceGmvRub', label: 'Оборот маркетплейса', icon: Store, suffix: ' ₽', href: '/admin/marketplace' },
  { key: 'liveStreamsNow', label: 'Стримов в эфире', icon: Radio, href: '/admin/streams' },
  { key: 'stickerPacksPublished', label: 'Опубликовано стикерпаков', icon: Sticker, href: '/admin/stickers' },
]

export function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/stats')
      .then(async (r) => {
        const json = await r.json()
        if (!r.ok) {
          setStats(null)
          setError(json.error || 'Не удалось загрузить статистику')
          return
        }
        setStats(json)
      })
      .catch(() => setError('Не удалось загрузить статистику'))
      .finally(() => setLoading(false))
  }, [])

  const renderCard = ({
    key,
    label,
    icon: Icon,
    href,
    suffix,
  }: {
    key: keyof Stats
    label: string
    icon: typeof Users
    href?: string
    suffix?: string
  }) => {
    const value = loading
      ? '—'
      : `${(stats?.[key] ?? 0).toLocaleString('ru-RU')}${!loading && suffix ? suffix : ''}`
    const card = (
      <Card className={cn(adminCardClass, 'gap-4 py-5', href && adminCardHoverClass)}>
        <CardHeader className="flex flex-row items-center justify-between px-5 pb-0">
          <CardTitle className="text-sm font-medium text-zinc-400">{label}</CardTitle>
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-400/10 text-sky-300">
            <Icon className="size-4" />
          </span>
        </CardHeader>
        <CardContent className="px-5">
          <p className="text-3xl font-semibold tracking-tight text-zinc-50">{value}</p>
        </CardContent>
      </Card>
    )
    return href ? (
      <Link key={key} href={href} className="block">
        {card}
      </Link>
    ) : (
      <div key={key}>{card}</div>
    )
  }

  return (
    <div>
      <AdminPageHeader
        title="Дашборд"
        description="Обзор активности и экономики Aurora"
      />
      {error && (
        <p className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      <p className={adminSectionLabelClass}>Активность</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {activityCards.map(renderCard)}
      </div>

      <p className={cn(adminSectionLabelClass, 'mt-9')}>Экономика</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {economyCards.map(renderCard)}
      </div>
    </div>
  )
}
