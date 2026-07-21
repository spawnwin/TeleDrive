'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ChevronLeft, ChevronRight, MoreHorizontal, Search } from 'lucide-react'

type UserRow = {
  id: string
  username: string
  name: string
  isPremium: boolean
  isBot: boolean
  isAdmin: boolean
  isBanned: boolean
  coins: number
  online: boolean
  createdAt: string
}

export function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [coinsDialog, setCoinsDialog] = useState<{
    id: string
    username: string
    mode: 'add' | 'subtract'
  } | null>(null)
  const [coinsAmount, setCoinsAmount] = useState('100')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 50

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    })
    if (query.trim()) params.set('q', query.trim())
    fetch(`/api/admin/users?${params}`)
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) {
          setUsers([])
          setError(d.error || 'Не удалось загрузить пользователей')
          return
        }
        setUsers(d.users ?? [])
        setTotal(d.total ?? 0)
        setPages(d.pages ?? 1)
      })
      .catch(() => {
        setUsers([])
        setError('Не удалось загрузить пользователей')
      })
      .finally(() => setLoading(false))
  }, [page, query])

  useEffect(() => {
    load()
  }, [load])

  const action = async (id: string, actionName: string, amount?: number) => {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: actionName, amount }),
    })
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error || 'Ошибка')
      return
    }
    toast.success('Готово')
    load()
  }

  const deleteUser = async (id: string) => {
    if (!confirm('Удалить пользователя безвозвратно?')) return
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error || 'Ошибка')
      return
    }
    toast.success('Пользователь удалён')
    load()
  }

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    setQuery(q)
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Пользователи</h1>
          <p className="mt-1 text-sm text-zinc-500">Всего: {total.toLocaleString('ru-RU')}</p>
        </div>
        <form onSubmit={submitSearch} className="flex w-full max-w-md gap-2 sm:w-auto">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск: @username, имя или id"
              className="border-zinc-700 bg-zinc-950 pl-9"
            />
          </div>
          <Button type="submit" variant="outline">
            Найти
          </Button>
        </form>
      </div>
      {error && (
        <p className="mb-4 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead>Логин</TableHead>
              <TableHead>Имя</TableHead>
              <TableHead>Premium</TableHead>
              <TableHead>Бот</TableHead>
              <TableHead>Админ</TableHead>
              <TableHead>Баланс, ₽</TableHead>
              <TableHead>Создан</TableHead>
              <TableHead>Онлайн</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-zinc-500">
                  Загрузка…
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-zinc-500">
                  Нет пользователей
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id} className="border-zinc-800">
                  <TableCell className="font-mono text-sm">
                    @{u.username}
                    {u.isBanned && (
                      <Badge variant="destructive" className="ml-2 text-xs">
                        бан
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{u.name}</TableCell>
                  <TableCell>{u.isPremium ? '✓' : '—'}</TableCell>
                  <TableCell>{u.isBot ? '✓' : '—'}</TableCell>
                  <TableCell>{u.isAdmin ? '✓' : '—'}</TableCell>
                  <TableCell>{u.coins}</TableCell>
                  <TableCell className="text-sm text-zinc-400">
                    {format(new Date(u.createdAt), 'dd MMM yyyy', { locale: ru })}
                  </TableCell>
                  <TableCell>
                    {u.online ? (
                      <span className="text-emerald-400">●</span>
                    ) : (
                      <span className="text-zinc-600">○</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="border-zinc-700 bg-zinc-900">
                        {u.isBanned ? (
                          <DropdownMenuItem onClick={() => action(u.id, 'unban')}>
                            Разбанить
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => action(u.id, 'ban')}>
                            Забанить
                          </DropdownMenuItem>
                        )}
                        {u.isAdmin ? (
                          <DropdownMenuItem onClick={() => action(u.id, 'demote')}>
                            Снять админа
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => action(u.id, 'promote')}>
                            Сделать админом
                          </DropdownMenuItem>
                        )}
                        {u.isPremium ? (
                          <DropdownMenuItem onClick={() => action(u.id, 'revoke_premium')}>
                            Отозвать Premium
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => action(u.id, 'grant_premium')}>
                            Выдать Premium
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() =>
                            setCoinsDialog({ id: u.id, username: u.username, mode: 'add' })
                          }
                        >
                          Начислить баланс
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            setCoinsDialog({ id: u.id, username: u.username, mode: 'subtract' })
                          }
                        >
                          Списать баланс
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => deleteUser(u.id)}
                        >
                          Удалить
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          Страница {page} из {pages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="mr-1 size-4" />
            Назад
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Далее
            <ChevronRight className="ml-1 size-4" />
          </Button>
        </div>
      </div>

      <Dialog open={!!coinsDialog} onOpenChange={() => setCoinsDialog(null)}>
        <DialogContent className="border-zinc-700 bg-zinc-900">
          <DialogHeader>
            <DialogTitle>
              {coinsDialog?.mode === 'subtract' ? 'Списать' : 'Начислить'} баланс, ₽ — @
              {coinsDialog?.username}
            </DialogTitle>
          </DialogHeader>
          <Input
            type="number"
            min={1}
            value={coinsAmount}
            onChange={(e) => setCoinsAmount(e.target.value)}
            className="border-zinc-700 bg-zinc-950"
          />
          <DialogFooter>
            <Button
              variant={coinsDialog?.mode === 'subtract' ? 'destructive' : 'default'}
              onClick={() => {
                if (coinsDialog) {
                  action(
                    coinsDialog.id,
                    coinsDialog.mode === 'subtract' ? 'subtract_coins' : 'add_coins',
                    Number(coinsAmount),
                  )
                  setCoinsDialog(null)
                }
              }}
            >
              {coinsDialog?.mode === 'subtract' ? 'Списать' : 'Начислить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
