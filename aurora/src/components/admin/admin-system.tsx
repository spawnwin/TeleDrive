'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type SystemData = {
  db: {
    users: number
    messages: number
    chats: number
    shorts: number
    stories: number
    sessions: number
  }
  storage: { files: number; bytes: number }
  cleanup: { expiredStories: number; expiredSessions: number }
  push?: {
    vapidConfigured: boolean
    apnsConfigured: boolean
    subscriptions: number
  }
}

type PlatformFlags = {
  maintenanceMode: boolean
  maintenanceMessage: string | null
  callsEnabled: boolean
  wallEnabled: boolean
  marketplaceEnabled: boolean
  streamsEnabled: boolean
}

type LogFile = { size: number; modified: string; lines: string[] }

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function AdminSystemPage() {
  const [data, setData] = useState<SystemData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [flags, setFlags] = useState<PlatformFlags | null>(null)
  const [savingFlag, setSavingFlag] = useState<string | null>(null)
  const [maintenanceMessage, setMaintenanceMessage] = useState('')
  const [logService, setLogService] = useState('all')
  const [logLevel, setLogLevel] = useState('all')
  const [logs, setLogs] = useState<Record<string, LogFile>>({})
  const [logsLoading, setLogsLoading] = useState(false)

  const loadFlags = useCallback(() => {
    fetch('/api/admin/settings')
      .then(async (r) => {
        const json = await r.json()
        setFlags(json)
        setMaintenanceMessage(json.maintenanceMessage || '')
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadFlags()
  }, [loadFlags])

  const patchFlags = async (patch: Partial<PlatformFlags>, key: string) => {
    setSavingFlag(key)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error()
      const json = await res.json()
      setFlags(json)
      toast.success('Сохранено')
    } catch {
      toast.error('Ошибка')
    } finally {
      setSavingFlag(null)
    }
  }

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/admin/system')
      .then(async (r) => {
        const json = await r.json()
        if (!r.ok) {
          setData(null)
          setError(json.error || 'Не удалось загрузить данные')
          return
        }
        if (!json.db || !json.storage || !json.cleanup) {
          setData(null)
          setError('Некорректный ответ сервера')
          return
        }
        setData(json)
      })
      .catch(() => {
        setData(null)
        setError('Не удалось загрузить данные')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const loadLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const params = new URLSearchParams({
        service: logService,
        level: logLevel,
        lines: '150',
      })
      const res = await fetch(`/api/admin/logs?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Ошибка')
      setLogs(json.logs || {})
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось загрузить логи')
      setLogs({})
    } finally {
      setLogsLoading(false)
    }
  }, [logService, logLevel])

  useEffect(() => {
    void loadLogs()
  }, [loadLogs])

  const runAction = async (action: string) => {
    setBusy(action)
    const res = await fetch('/api/admin/system', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const result = await res.json()
    setBusy(null)
    if (!res.ok) {
      toast.error(result.error || 'Ошибка')
      return
    }
    toast.success(`Удалено записей: ${result.deleted}`)
    load()
  }

  if (loading) return <p className="text-zinc-500">Загрузка…</p>
  if (error) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Система</h1>
        <p className="text-red-400">{error}</p>
        <Button variant="outline" className="mt-4" onClick={load}>
          Повторить
        </Button>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Система</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <CardTitle className="text-base text-zinc-300">База данных</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Пользователи</span>
              <span>{data?.db?.users ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Сообщения</span>
              <span>{data?.db?.messages ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Чаты</span>
              <span>{data?.db?.chats ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Шорты</span>
              <span>{data?.db?.shorts ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Истории</span>
              <span>{data?.db?.stories ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Сессии</span>
              <span>{data?.db?.sessions ?? 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <CardTitle className="text-base text-zinc-300">Хранилище и Push</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Файлов</span>
              <span>{data?.storage?.files ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Объём</span>
              <span>{formatBytes(data?.storage?.bytes ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">VAPID (Web Push)</span>
              <span className={data?.push?.vapidConfigured ? 'text-emerald-400' : 'text-amber-400'}>
                {data?.push?.vapidConfigured ? 'настроен' : 'не настроен'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">APNs (iOS native)</span>
              <span className={data?.push?.apnsConfigured ? 'text-emerald-400' : 'text-zinc-500'}>
                {data?.push?.apnsConfigured ? 'настроен' : 'нет'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Подписок push</span>
              <span>{data?.push?.subscriptions ?? 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50 md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base text-zinc-300">Очистка</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-zinc-800 p-4">
              <div>
                <p className="font-medium">Просроченные истории</p>
                <p className="text-sm text-zinc-500">{data?.cleanup?.expiredStories ?? 0} записей</p>
              </div>
              <Button
                variant="outline"
                disabled={busy === 'clear_expired_stories'}
                onClick={() => runAction('clear_expired_stories')}
              >
                Очистить
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-zinc-800 p-4">
              <div>
                <p className="font-medium">Просроченные сессии</p>
                <p className="text-sm text-zinc-500">{data?.cleanup?.expiredSessions ?? 0} записей</p>
              </div>
              <Button
                variant="outline"
                disabled={busy === 'cleanup_sessions'}
                onClick={() => runAction('cleanup_sessions')}
              >
                Очистить
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-zinc-800 p-4">
              <div>
                <p className="font-medium">Просроченный Nearby</p>
                <p className="text-sm text-zinc-500">Удалить истёкшие гео-присутствия</p>
              </div>
              <Button
                variant="outline"
                disabled={busy === 'cleanup_nearby'}
                onClick={() => runAction('cleanup_nearby')}
              >
                Очистить
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50 md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base text-zinc-300">Функции и техработы</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <div>
                <p className="font-medium text-amber-300">Режим техобслуживания</p>
                <p className="text-sm text-zinc-500">Сайт становится недоступен всем, кроме админов</p>
              </div>
              <Switch
                checked={!!flags?.maintenanceMode}
                disabled={!flags || savingFlag === 'maintenanceMode'}
                onCheckedChange={(v) => patchFlags({ maintenanceMode: v }, 'maintenanceMode')}
              />
            </div>
            <div>
              <Label className="text-xs">Сообщение при техработах (необязательно)</Label>
              <div className="mt-1 flex gap-2">
                <Textarea
                  value={maintenanceMessage}
                  onChange={(e) => setMaintenanceMessage(e.target.value)}
                  rows={2}
                  className="resize-none"
                  placeholder="Aurora временно недоступна — мы проводим технические работы"
                />
                <Button
                  variant="outline"
                  className="shrink-0"
                  disabled={savingFlag === 'maintenanceMessage'}
                  onClick={() =>
                    patchFlags(
                      { maintenanceMessage: maintenanceMessage.trim() || null },
                      'maintenanceMessage',
                    )
                  }
                >
                  Сохранить
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 p-4">
                <p className="font-medium">Звонки</p>
                <Switch
                  checked={!!flags?.callsEnabled}
                  disabled={!flags || savingFlag === 'callsEnabled'}
                  onCheckedChange={(v) => patchFlags({ callsEnabled: v }, 'callsEnabled')}
                />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 p-4">
                <p className="font-medium">Стена профиля</p>
                <Switch
                  checked={!!flags?.wallEnabled}
                  disabled={!flags || savingFlag === 'wallEnabled'}
                  onCheckedChange={(v) => patchFlags({ wallEnabled: v }, 'wallEnabled')}
                />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 p-4">
                <p className="font-medium">Маркетплейс</p>
                <Switch
                  checked={!!flags?.marketplaceEnabled}
                  disabled={!flags || savingFlag === 'marketplaceEnabled'}
                  onCheckedChange={(v) => patchFlags({ marketplaceEnabled: v }, 'marketplaceEnabled')}
                />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 p-4">
                <p className="font-medium">Стримы</p>
                <Switch
                  checked={!!flags?.streamsEnabled}
                  disabled={!flags || savingFlag === 'streamsEnabled'}
                  onCheckedChange={(v) => patchFlags({ streamsEnabled: v }, 'streamsEnabled')}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50 md:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base text-zinc-300">Логи сервисов</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Select value={logService} onValueChange={setLogService}>
                <SelectTrigger className="w-[130px] border-zinc-700 bg-zinc-950">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-zinc-700 bg-zinc-900">
                  <SelectItem value="all">Все</SelectItem>
                  <SelectItem value="web">Web</SelectItem>
                  <SelectItem value="chat">Chat</SelectItem>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="parser">Parser</SelectItem>
                </SelectContent>
              </Select>
              <Select value={logLevel} onValueChange={setLogLevel}>
                <SelectTrigger className="w-[130px] border-zinc-700 bg-zinc-950">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-zinc-700 bg-zinc-900">
                  <SelectItem value="all">Все уровни</SelectItem>
                  <SelectItem value="error">Errors</SelectItem>
                  <SelectItem value="warn">Warn</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" disabled={logsLoading} onClick={() => void loadLogs()}>
                Обновить
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {logsLoading ? (
              <p className="text-sm text-zinc-500">Загрузка логов…</p>
            ) : Object.keys(logs).length === 0 ? (
              <p className="text-sm text-zinc-500">Логов пока нет (или каталог пуст)</p>
            ) : (
              Object.entries(logs).map(([file, info]) => (
                <div key={file} className="overflow-hidden rounded-lg border border-zinc-800">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
                    <span className="font-mono text-zinc-200">{file}</span>
                    <span>
                      {formatBytes(info.size)} ·{' '}
                      {new Date(info.modified).toLocaleString('ru-RU')}
                    </span>
                  </div>
                  <pre className="max-h-64 overflow-auto bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
                    {info.lines.length ? info.lines.join('\n') : '— пусто —'}
                  </pre>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
