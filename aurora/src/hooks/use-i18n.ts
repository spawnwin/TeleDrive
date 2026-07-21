'use client'

import { useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { translate, type Lang } from '@/lib/i18n'

export function useI18n() {
  const lang = useAppStore((s) => s.lang)
  const setLang = useAppStore((s) => s.setLang)

  const t = useCallback(
    (key: string, fallback?: string) => translate(lang, key, fallback),
    [lang],
  )

  return { t, lang, setLang }
}

export type { Lang }
