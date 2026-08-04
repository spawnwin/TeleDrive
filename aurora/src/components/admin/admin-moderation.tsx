'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AdminPageHeader, adminCardClass } from '@/components/admin/admin-ui'
import { cn } from '@/lib/utils'

type FlaggedMessage = {
  id: string
  reason: string
  createdAt: string
  reporter: { username: string }
  message: {
    content: string
    senderId?: string
    sender: { id?: string; username: string }
  } | null
}

type PendingShort = {
  id: string
  title: string
  description: string | null
  reviewStatus: string
  createdAt: string
  creator: { username: string; name: string }
}

export function AdminModerationPage() {
  const [flagged, setFlagged] = useState<FlaggedMessage[]>([])
  const [shorts, setShorts] = useState<PendingShort[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/admin/moderation')
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) {
          setFlagged([])
          setShorts([])
          setError(d.error || 'Не удалось загрузить данные')
          return
        }
        setFlagged(d.flaggedMessages ?? [])
        setShorts(d.pendingShorts ?? [])
      })
      .catch(() => {
        setFlagged([])
        setShorts([])
        setError('Не удалось загрузить данные')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const reviewShort = async (shortId: string, reviewStatus: 'approved' | 'rejected') => {
    const res = await fetch('/api/admin/moderation', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shortId, reviewStatus }),
    })
    if (!res.ok) {
      toast.error('Ошибка')
      return
    }
    toast.success(reviewStatus === 'approved' ? 'Одобрено' : 'Отклонено')
    load()
  }

  const resolveReport = async (reportId: string, reportStatus: 'reviewed' | 'dismissed') => {
    const res = await fetch('/api/admin/moderation', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId, reportStatus }),
    })
    if (!res.ok) {
      toast.error('Ошибка')
      return
    }
    toast.success(reportStatus === 'reviewed' ? 'Рассмотрено' : 'Отклонено')
    load()
  }

  const banSender = async (userId: string | undefined, reportId: string) => {
    if (!userId) {
      toast.error('Автор сообщения недоступен')
      return
    }
    if (!confirm('Забанить автора сообщения?')) return
    const banRes = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ban' }),
    })
    if (!banRes.ok) {
      const data = await banRes.json().catch(() => ({}))
      toast.error(data.error || 'Не удалось забанить')
      return
    }
    await resolveReport(reportId, 'reviewed')
    toast.success('Автор забанен, жалоба закрыта')
  }

  return (
    <div>
      <AdminPageHeader title="Модерация" description="Жалобы на сообщения и проверка шортов" />
      {error && (
        <p className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}
      <Tabs defaultValue="messages">
        <TabsList className="rounded-2xl border border-white/10 bg-white/[0.04]">
          <TabsTrigger value="messages">Жалобы на сообщения ({flagged.length})</TabsTrigger>
          <TabsTrigger value="shorts">Шорты на проверке ({shorts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="messages" className="mt-4 space-y-3">
          {loading ? (
            <p className="text-zinc-500">Загрузка…</p>
          ) : flagged.length === 0 ? (
            <p className="text-zinc-500">Нет жалоб</p>
          ) : (
            flagged.map((r) => (
              <Card key={r.id} className={cn(adminCardClass)}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    @{r.message?.sender.username ?? '?'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="rounded-2xl bg-black/30 p-3">{r.message?.content ?? 'Удалено'}</p>
                  <p className="text-zinc-400">Причина: {r.reason}</p>
                  <p className="text-zinc-500">
                    От @{r.reporter.username} ·{' '}
                    {format(new Date(r.createdAt), 'dd MMM yyyy HH:mm', { locale: ru })}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button size="sm" onClick={() => resolveReport(r.id, 'reviewed')}>
                      Рассмотрено
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => resolveReport(r.id, 'dismissed')}>
                      Отклонить
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        banSender(r.message?.sender?.id || r.message?.senderId, r.id)
                      }
                    >
                      Забанить автора
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="shorts" className="mt-4 space-y-3">
          {loading ? (
            <p className="text-zinc-500">Загрузка…</p>
          ) : shorts.length === 0 ? (
            <p className="text-zinc-500">Нет шортов на проверке</p>
          ) : (
            shorts.map((s) => (
              <Card key={s.id} className={cn(adminCardClass)}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{s.title}</CardTitle>
                    <Badge className="bg-amber-500/20 text-amber-300">ожидает</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-zinc-400">{s.description}</p>
                  <p className="text-zinc-500">
                    Автор: @{s.creator.username} ·{' '}
                    {format(new Date(s.createdAt), 'dd MMM yyyy', { locale: ru })}
                  </p>
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" onClick={() => reviewShort(s.id, 'approved')}>
                      Одобрить
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => reviewShort(s.id, 'rejected')}>
                      Отклонить
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
