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

type UserReport = {
  id: string
  reason: string
  status: string
  createdAt: string
  targetUserId?: string
  reporter: { username: string; name: string }
  targetUser: { id?: string; username: string; name: string } | null
}

type MessageReport = {
  id: string
  reason: string
  status: string
  createdAt: string
  reporter: { username: string; name: string }
  message: {
    content: string
    senderId?: string
    sender: { id?: string; username: string }
  } | null
}

export function AdminReportsPage() {
  const [userReports, setUserReports] = useState<UserReport[]>([])
  const [messageReports, setMessageReports] = useState<MessageReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/admin/reports')
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) {
          setUserReports([])
          setMessageReports([])
          setError(d.error || 'Не удалось загрузить жалобы')
          return
        }
        setUserReports(d.userReports ?? [])
        setMessageReports(d.messageReports ?? [])
      })
      .catch(() => {
        setUserReports([])
        setMessageReports([])
        setError('Не удалось загрузить жалобы')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const resolve = async (type: 'user' | 'message', id: string, status: 'reviewed' | 'dismissed') => {
    const res = await fetch('/api/admin/reports', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, id, status }),
    })
    if (!res.ok) {
      toast.error('Ошибка')
      return
    }
    toast.success(status === 'reviewed' ? 'Рассмотрено' : 'Отклонено')
    load()
  }

  const banUser = async (userId: string | undefined | null, reportId: string, type: 'user' | 'message') => {
    if (!userId) {
      toast.error('Пользователь недоступен')
      return
    }
    if (!confirm('Забанить пользователя?')) return
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
    await resolve(type, reportId, 'reviewed')
    toast.success('Пользователь забанен')
  }

  const statusBadge = (status: string) => (
    <Badge
      variant={status === 'pending' ? 'default' : 'secondary'}
      className={status === 'pending' ? 'bg-amber-500/20 text-amber-300' : ''}
    >
      {status === 'pending' ? 'ожидает' : status === 'reviewed' ? 'рассмотрено' : 'отклонено'}
    </Badge>
  )

  return (
    <div>
      <AdminPageHeader title="Жалобы" description="Жалобы на пользователей и сообщения" />
      {error && (
        <p className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}
      <Tabs defaultValue="users">
        <TabsList className="rounded-2xl border border-white/10 bg-white/[0.04]">
          <TabsTrigger value="users">
            На пользователей ({userReports.filter((r) => r.status === 'pending').length})
          </TabsTrigger>
          <TabsTrigger value="messages">
            На сообщения ({messageReports.filter((r) => r.status === 'pending').length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4 space-y-3">
          {loading ? (
            <p className="text-zinc-500">Загрузка…</p>
          ) : userReports.length === 0 ? (
            <p className="text-zinc-500">Жалоб нет</p>
          ) : (
            userReports.map((r) => (
              <Card key={r.id} className={cn(adminCardClass)}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <CardTitle className="text-base">
                      На @{r.targetUser?.username ?? '?'} — {r.targetUser?.name}
                    </CardTitle>
                    {statusBadge(r.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-zinc-300">{r.reason}</p>
                  <p className="text-zinc-500">
                    От @{r.reporter.username} ·{' '}
                    {format(new Date(r.createdAt), 'dd MMM yyyy HH:mm', { locale: ru })}
                  </p>
                  {r.status === 'pending' && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button size="sm" onClick={() => resolve('user', r.id, 'reviewed')}>
                        Рассмотрено
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => resolve('user', r.id, 'dismissed')}>
                        Отклонить
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => banUser(r.targetUserId || r.targetUser?.id, r.id, 'user')}
                      >
                        Забанить
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="messages" className="mt-4 space-y-3">
          {loading ? (
            <p className="text-zinc-500">Загрузка…</p>
          ) : messageReports.length === 0 ? (
            <p className="text-zinc-500">Жалоб нет</p>
          ) : (
            messageReports.map((r) => (
              <Card key={r.id} className={cn(adminCardClass)}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <CardTitle className="text-base">
                      Сообщение от @{r.message?.sender.username ?? '?'}
                    </CardTitle>
                    {statusBadge(r.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="rounded-2xl bg-black/30 p-3 text-zinc-300">
                    {r.message?.content ?? 'Сообщение удалено'}
                  </p>
                  <p className="text-zinc-300">Причина: {r.reason}</p>
                  <p className="text-zinc-500">
                    От @{r.reporter.username} ·{' '}
                    {format(new Date(r.createdAt), 'dd MMM yyyy HH:mm', { locale: ru })}
                  </p>
                  {r.status === 'pending' && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button size="sm" onClick={() => resolve('message', r.id, 'reviewed')}>
                        Рассмотрено
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => resolve('message', r.id, 'dismissed')}>
                        Отклонить
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          banUser(r.message?.sender?.id || r.message?.senderId, r.id, 'message')
                        }
                      >
                        Забанить автора
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
