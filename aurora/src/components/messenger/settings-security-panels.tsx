'use client'

import { useEffect, useState } from 'react'
import { Ban, KeyRound, Loader2, MonitorSmartphone, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/hooks/use-i18n'
import { Avatar } from './avatar'
import { toast } from 'sonner'
import type { Visibility } from '@/lib/privacy'

function VisibilitySelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: Visibility
  onChange: (v: Visibility) => void
}) {
  const { t } = useI18n()
  const options: { value: Visibility; label: string }[] = [
    { value: 'everyone', label: t('privacy.everyone') },
    { value: 'contacts', label: t('privacy.contacts') },
    { value: 'nobody', label: t('privacy.nobody') },
  ]
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={
              value === o.value
                ? 'rounded-lg bg-[#3390ec] px-2.5 py-1 text-xs font-medium text-white'
                : 'rounded-lg bg-background px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted'
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function PrivacyVisibilityPanel() {
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastSeenVisibility, setLastSeen] = useState<Visibility>('everyone')
  const [whoCanMessage, setWhoCanMessage] = useState<Visibility>('everyone')
  const [whoCanCall, setWhoCanCall] = useState<Visibility>('everyone')

  useEffect(() => {
    fetch('/api/privacy')
      .then((r) => r.json().catch(() => ({})))
      .then((d) => {
        if (d.lastSeenVisibility) setLastSeen(d.lastSeenVisibility)
        if (d.whoCanMessage) setWhoCanMessage(d.whoCanMessage)
        if (d.whoCanCall) setWhoCanCall(d.whoCanCall)
      })
      .finally(() => setLoading(false))
  }, [])

  const save = async (patch: Record<string, Visibility>) => {
    setSaving(true)
    try {
      const res = await fetch('/api/privacy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'fail')
      if (data.lastSeenVisibility) setLastSeen(data.lastSeenVisibility)
      if (data.whoCanMessage) setWhoCanMessage(data.whoCanMessage)
      if (data.whoCanCall) setWhoCanCall(data.whoCanCall)
      toast.success(t('privacy.saved'))
    } catch {
      toast.error(t('misc.error'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className={`mt-3 space-y-2 ${saving ? 'opacity-70' : ''}`}>
      <VisibilitySelect
        label={t('privacy.lastSeen')}
        value={lastSeenVisibility}
        onChange={(v) => {
          setLastSeen(v)
          void save({ lastSeenVisibility: v })
        }}
      />
      <VisibilitySelect
        label={t('privacy.whoCanMessage')}
        value={whoCanMessage}
        onChange={(v) => {
          setWhoCanMessage(v)
          void save({ whoCanMessage: v })
        }}
      />
      <VisibilitySelect
        label={t('privacy.whoCanCall')}
        value={whoCanCall}
        onChange={(v) => {
          setWhoCanCall(v)
          void save({ whoCanCall: v })
        }}
      />
    </div>
  )
}

export function SessionsPanel() {
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<
    Array<{
      id: string
      current: boolean
      label: string
      ip: string | null
      createdAt: string
      lastActiveAt: string
    }>
  >([])

  const load = () => {
    setLoading(true)
    fetch('/api/sessions')
      .then((r) => r.json().catch(() => ({})))
      .then((d) => setSessions(Array.isArray(d.sessions) ? d.sessions : []))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const revoke = async (sessionId: string) => {
    const res = await fetch('/api/sessions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error || t('misc.error'))
      return
    }
    toast.success(t('sessions.revoked'))
    load()
  }

  const revokeOthers = async () => {
    if (!window.confirm(t('sessions.revokeOthersConfirm'))) return
    const res = await fetch('/api/sessions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ others: true }),
    })
    if (!res.ok) {
      toast.error(t('misc.error'))
      return
    }
    toast.success(t('sessions.revokedOthers'))
    load()
  }

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted-foreground">{t('sessions.hint')}</p>
      <div className="space-y-2">
        {sessions.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5"
          >
            <MonitorSmartphone className="h-5 w-5 shrink-0 text-[#3390ec]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {s.label}
                {s.current ? (
                  <span className="ml-2 text-[11px] font-normal text-emerald-500">
                    {t('sessions.current')}
                  </span>
                ) : null}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {s.ip || '—'} · {new Date(s.lastActiveAt || s.createdAt).toLocaleString()}
              </p>
            </div>
            {!s.current && (
              <button
                type="button"
                onClick={() => revoke(s.id)}
                className="text-xs font-medium text-red-500 hover:underline"
              >
                {t('sessions.revoke')}
              </button>
            )}
          </div>
        ))}
        {sessions.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">{t('sessions.empty')}</p>
        )}
      </div>
      {sessions.some((s) => !s.current) && (
        <Button variant="outline" className="w-full" onClick={revokeOthers}>
          {t('sessions.revokeOthers')}
        </Button>
      )}
    </div>
  )
}

export function BlocksPanel() {
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<
    Array<{
      id: string
      name: string
      username: string
      avatarColor: string
      avatarUrl?: string | null
    }>
  >([])

  const load = () => {
    setLoading(true)
    fetch('/api/blocks')
      .then((r) => r.json().catch(() => ({})))
      .then((d) => setUsers(Array.isArray(d.users) ? d.users : []))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const unblock = async (id: string) => {
    const res = await fetch(`/api/users/${encodeURIComponent(id)}/block`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error(t('misc.error'))
      return
    }
    toast.success(t('blocks.unblocked'))
    load()
  }

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted-foreground">{t('blocks.hint')}</p>
      {users.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t('blocks.empty')}</p>
      ) : (
        users.map((u) => (
          <div key={u.id} className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
            <Avatar name={u.name} color={u.avatarColor} imageUrl={u.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{u.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">@{u.username}</p>
            </div>
            <button
              type="button"
              onClick={() => unblock(u.id)}
              className="text-xs font-medium text-[#3390ec] hover:underline"
            >
              {t('blocks.unblock')}
            </button>
          </div>
        ))
      )}
    </div>
  )
}

export function PasswordPanel() {
  const { t } = useI18n()
  const [currentPassword, setCurrent] = useState('')
  const [newPassword, setNew] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (newPassword !== confirm) {
      toast.error(t('password.mismatch'))
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      toast.success(t('password.changed'))
      setCurrent('')
      setNew('')
      setConfirm('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('misc.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-[13px] text-muted-foreground">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
        {t('password.hint')}
      </div>
      <div>
        <Label className="text-xs">{t('password.current')}</Label>
        <Input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
          className="mt-1"
          autoComplete="current-password"
        />
      </div>
      <div>
        <Label className="text-xs">{t('password.new')}</Label>
        <Input
          type="password"
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          className="mt-1"
          autoComplete="new-password"
        />
      </div>
      <div>
        <Label className="text-xs">{t('password.confirm')}</Label>
        <Input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="mt-1"
          autoComplete="new-password"
        />
      </div>
      <Button
        className="w-full"
        disabled={busy || !currentPassword || !newPassword}
        onClick={submit}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('password.submit')}
      </Button>
    </div>
  )
}

export function DeleteAccountPanel() {
  const { t } = useI18n()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!window.confirm(t('deleteAccount.confirmDialog'))) return
    setBusy(true)
    try {
      const res = await fetch('/api/auth/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, confirm }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      window.location.href = '/'
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('misc.error'))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[13px] text-red-600 dark:text-red-300">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <Trash2 className="h-4 w-4" />
          {t('deleteAccount.title')}
        </div>
        {t('deleteAccount.hint')}
      </div>
      <div>
        <Label className="text-xs">{t('password.current')}</Label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1"
        />
      </div>
      <div>
        <Label className="text-xs">{t('deleteAccount.typeDelete')}</Label>
        <Input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="mt-1"
          placeholder="УДАЛИТЬ"
        />
      </div>
      <Button
        variant="destructive"
        className="w-full gap-2"
        disabled={busy || !password || (confirm !== 'УДАЛИТЬ' && confirm !== 'DELETE')}
        onClick={submit}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
        {t('deleteAccount.submit')}
      </Button>
    </div>
  )
}
