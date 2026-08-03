'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Music2 } from 'lucide-react'

/**
 * Captures Yandex OAuth implicit-flow token from the URL hash and saves it.
 * Redirect URI should be https://aurro.ru/yandex-oauth
 */
export default function YandexOAuthPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'working' | 'ok' | 'error'>('working')
  const [message, setMessage] = useState('Подключаем Яндекс Музыку…')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : ''
        const params = new URLSearchParams(hash)
        const token =
          params.get('access_token') ||
          new URLSearchParams(window.location.search).get('access_token')
        if (!token) {
          setStatus('error')
          setMessage('Токен не найден. Откройте авторизацию из настроек ещё раз.')
          return
        }
        const res = await fetch('/api/yandex-music/connect', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(typeof data.error === 'string' ? data.error : 'Ошибка подключения')
        }
        if (cancelled) return
        setStatus('ok')
        setMessage('Готово! Яндекс Музыка подключена.')
        // Clean token from address bar
        window.history.replaceState(null, '', '/yandex-oauth')
        setTimeout(() => router.replace('/'), 1200)
      } catch (e) {
        if (cancelled) return
        setStatus('error')
        setMessage(e instanceof Error ? e.message : 'Не удалось подключить')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#0f1115] px-6 text-center text-white">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ffdb4d]/20">
        {status === 'working' ? (
          <Loader2 className="h-7 w-7 animate-spin text-[#ffdb4d]" />
        ) : (
          <Music2 className="h-7 w-7 text-[#ffdb4d]" />
        )}
      </div>
      <p className="text-lg font-semibold">Aurora × Яндекс Музыка</p>
      <p className={`max-w-sm text-sm ${status === 'error' ? 'text-rose-400' : 'text-white/70'}`}>
        {message}
      </p>
      {status === 'error' && (
        <button
          type="button"
          onClick={() => router.replace('/')}
          className="mt-2 rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
        >
          Вернуться в Aurora
        </button>
      )}
    </div>
  )
}
