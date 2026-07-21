'use client'

import { useEffect, useState } from 'react'
import { Loader2, UserRoundPen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/hooks/use-i18n'
import { cn } from '@/lib/utils'

export type ContactNameValue = {
  firstName: string
  lastName: string
}

interface ContactNameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  /** Shown under fields — usually @username or original name */
  subtitle?: string
  initialFirstName?: string
  initialLastName?: string
  confirmLabel?: string
  onConfirm: (value: ContactNameValue) => void | Promise<void>
}

export function ContactNameDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  initialFirstName = '',
  initialLastName = '',
  confirmLabel,
  onConfirm,
}: ContactNameDialogProps) {
  const { t } = useI18n()
  const [firstName, setFirstName] = useState(initialFirstName)
  const [lastName, setLastName] = useState(initialLastName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setFirstName(initialFirstName)
    setLastName(initialLastName)
    setError('')
    setSaving(false)
  }, [open, initialFirstName, initialLastName])

  const submit = async () => {
    const first = firstName.trim()
    if (!first) {
      setError(t('contacts.nameRequired'))
      return
    }
    setSaving(true)
    setError('')
    try {
      await onConfirm({ firstName: first, lastName: lastName.trim() })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('contacts.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRoundPen className="h-4 w-4 text-primary" />
            {title || t('contacts.editName')}
          </DialogTitle>
          {subtitle ? (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t('contacts.firstName')}
            </label>
            <Input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder={t('contacts.firstName')}
              autoFocus
              maxLength={64}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit()
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t('contacts.lastName')}
            </label>
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder={t('contacts.lastNameOptional')}
              maxLength={64}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit()
              }}
            />
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            {t('misc.cancel')}
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className={cn('gap-2')}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel || t('contacts.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
