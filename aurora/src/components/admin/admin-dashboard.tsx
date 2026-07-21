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

const economyCards: { key: keyof Stats; label: string; icon: typeof Users; href?: string; suffix?: string }[] = [
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
    const value = loading ? '—' : `${(stats?.[key] ?? 0).toLocaleString('ru-RU')}${!loading && suffix ? suffix : ''}`
    const card = (
      <Card
        className={
          'border-zinc-800 bg-zinc-900/50' + (href ? ' transition hover:border-amber-500/40' : '')
        }
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-zinc-400">{label}</CardTitle>
          <Icon className="size-4 text-amber-500/70" />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-zinc-100">{value}</p>
        </CardContent>
      </Card>
    )
    return href ? (
      <Link key={key} href={href}>
        {card}
      </Link>
    ) : (
      <div key={key}>{card}</div>
    )
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-zinc-100">Дашборд</h1>
      {error && (
        <p className="mb-4 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Активность</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {activityCards.map(renderCard)}
      </div>

      <p className="mb-3 mt-8 text-xs font-semibold uppercase tracking-wide text-zinc-500">Экономика</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {economyCards.map(renderCard)}
      </div>
    </div>
  )
}
