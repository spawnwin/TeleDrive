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
  const [status, setStatus] = useState<'working' | 'ok' | 'error' | 'need-login'>('working')
  const [message, setMessage] = useState('Подключаем Яндекс Музыку…')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : ''
        const params = new URLSearchParams(hash)
        const search = new URLSearchParams(window.location.search)
        const token = params.get('access_token') || search.get('access_token')
        const oauthError = params.get('error') || search.get('error')

        if (oauthError) {
          setStatus('error')
          setMessage(
            oauthError === 'access_denied'
              ? 'Доступ отклонён. Разрешите приложение и попробуйте снова.'
              : `Ошибка OAuth: ${oauthError}`,
          )
          return
        }

        if (!token) {
          setStatus('error')
          setMessage('Токен не найден. Откройте авторизацию из Настройки → Яндекс Музыка.')
          return
        }

        const res = await fetch('/api/yandex-music/connect', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const data = await res.json().catch(() => ({}))

        if (res.status === 401) {
          if (cancelled) return
          setStatus('need-login')
          setMessage('Сначала войдите в Aurora, затем снова откройте авторизацию Яндекс Музыки.')
          // Keep token briefly in sessionStorage so settings can finish after login
          try {
            sessionStorage.setItem('aurora:pendingYandexToken', token)
          } catch {
            /* ignore */
          }
          return
        }

        if (!res.ok) {
          throw new Error(typeof data.error === 'string' ? data.error : 'Ошибка подключения')
        }
        if (cancelled) return
        setStatus('ok')
        setMessage('Готово! Яндекс Музыка подключена.')
        window.history.replaceState(null, '', '/yandex-oauth')
        try {
          sessionStorage.removeItem('aurora:pendingYandexToken')
        } catch {
          /* ignore */
        }
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('aurora:open-settings', { detail: { page: 'yandex' } }),
          )
          router.replace('/')
        }, 900)
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
      <p
        className={`max-w-sm text-sm ${
          status === 'error' || status === 'need-login' ? 'text-rose-400' : 'text-white/70'
        }`}
      >
        {message}
      </p>
      {(status === 'error' || status === 'need-login') && (
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
