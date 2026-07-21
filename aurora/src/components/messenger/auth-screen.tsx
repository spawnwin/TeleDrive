'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, Users, Zap, Lock, User as UserIcon, Globe, Download, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { useAppStore } from '@/lib/store'
import { useI18n } from '@/hooks/use-i18n'
import { languages, type Lang } from '@/lib/i18n'

export function AuthScreen() {
  const { t, lang, setLang } = useI18n()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ username: '', name: '', password: '' })
  const [requires2FA, setRequires2FA] = useState(false)
  const [totpCode, setTotpCode] = useState('')
  const setCurrentUser = useAppStore((s) => s.setCurrentUser)

  const completeLogin = (data: Record<string, unknown>) => {
    setCurrentUser(data as unknown as Parameters<typeof setCurrentUser>[0])
    setLang((data.language as Lang) || 'ru')
    setRequires2FA(false)
    setTotpCode('')
    toast.success(`${t('auth.welcomeBack')}, ${data.name}!`, { duration: 2200 })
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'register') {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ...form, language: lang }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || t('auth.errorServer'))
        setCurrentUser(data)
        setLang(data.language || 'ru')
        toast.success(`${t('auth.hello')}, ${data.name}!`, { duration: 2200 })
      } else if (requires2FA) {
        const res = await fetch('/api/auth/2fa/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username: form.username, password: form.password, code: totpCode }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || t('auth.errorServer'))
        completeLogin(data)
      } else {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username: form.username, password: form.password }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || t('auth.errorServer'))
        if (data.requires2FA) {
          setRequires2FA(true)
          toast.info(t('twofa.enterCode'))
          return
        }
        completeLogin(data)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.networkError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b0b1a] text-white">
      {/* Animated gradient background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-32 h-[32rem] w-[32rem] rounded-full bg-violet-600/30 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-[32rem] w-[32rem] rounded-full bg-cyan-500/30 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 h-[24rem] w-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-500/20 blur-3xl" />
      </div>

      {/* Language switcher (top-right) */}
      <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-20">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur transition hover:bg-white/10">
              <Globe className="h-3.5 w-3.5" />
              {languages.find((l) => l.code === lang)?.flag}
              <span className="uppercase">{lang}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {languages.map((l) => (
              <DropdownMenuItem
                key={l.code}
                onClick={() => setLang(l.code as Lang)}
                className={l.code === lang ? 'bg-violet-500/15' : ''}
              >
                <span className="mr-2 text-base">{l.flag}</span>
                {l.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 items-center gap-12 px-6 pt-[max(3rem,calc(env(safe-area-inset-top)+1.5rem))] pb-12 lg:grid-cols-2">
        {/* Left: brand & features */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="hidden flex-col gap-8 lg:flex"
        >
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Aurora"
              className="h-12 w-12 rounded-2xl shadow-lg shadow-violet-500/40"
            />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t('app.name')}</h1>
              <p className="text-sm text-white/60">{t('app.tagline')}</p>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-4xl font-bold leading-tight">
              {t('auth.heroLine1')}{' '}
              <span className="bg-gradient-to-r from-violet-400 to-cyan-300 bg-clip-text text-transparent">
                {t('auth.heroWord1')}
              </span>{' '}
              {t('auth.heroAnd')}{' '}
              <span className="bg-gradient-to-r from-fuchsia-400 to-orange-300 bg-clip-text text-transparent">
                {t('auth.heroWord2')}
              </span>
            </h2>
            <p className="text-white/70">{t('auth.heroDesc')}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FeatureCard icon={<Zap className="h-5 w-5" />} title={t('auth.titleFast')} text={t('auth.titleFastDesc')} />
            <FeatureCard icon={<Users className="h-5 w-5" />} title={t('auth.titleGroups')} text={t('auth.titleGroupsDesc')} />
            <FeatureCard icon={<MessageCircle className="h-5 w-5" />} title={t('auth.titleConvenient')} text={t('auth.titleConvenientDesc')} />
          </div>
        </motion.div>

        {/* Right: auth form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mx-auto w-full max-w-md"
        >
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl backdrop-blur-xl">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <img src="/logo.png" alt="Aurora" className="h-10 w-10 rounded-xl shadow-md shadow-violet-500/30" />
              <div>
                <h1 className="text-xl font-bold">{t('app.name')}</h1>
                <p className="text-xs text-white/60">{t('app.tagline')}</p>
              </div>
            </div>

            <div className="mb-6 flex rounded-2xl bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition-all ${
                  mode === 'login'
                    ? 'bg-white text-slate-900 shadow'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {t('auth.signIn')}
              </button>
              <button
                type="button"
                onClick={() => setMode('register')}
                className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition-all ${
                  mode === 'register'
                    ? 'bg-white text-slate-900 shadow'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {t('auth.signUp')}
              </button>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <AnimatePresence mode="popLayout">
                {mode === 'register' && (
                  <motion.div
                    key="name"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2"
                  >
                    <Label htmlFor="name" className="text-white/80">{t('auth.name')}</Label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                      <Input
                        id="name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder={t('auth.namePlaceholder')}
                        required
                        className="border-white/10 bg-white/5 pl-10 text-white placeholder:text-white/30 focus:border-violet-400"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-2">
                <Label htmlFor="username" className="text-white/80">{t('auth.username')}</Label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                  <Input
                    id="username"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder={t('auth.usernamePlaceholder')}
                    required
                    className="border-white/10 bg-white/5 pl-10 text-white placeholder:text-white/30 focus:border-violet-400"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-white/80">{t('auth.password')}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                  <Input
                    id="password"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={t('auth.passwordPlaceholder')}
                    required
                    className="border-white/10 bg-white/5 pl-10 text-white placeholder:text-white/30 focus:border-violet-400"
                  />
                </div>
              </div>

              {requires2FA && mode === 'login' && (
                <div className="space-y-2">
                  <Label className="text-white/80">{t('twofa.title')}</Label>
                  <Input
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    className="border-white/10 bg-white/5 text-center text-lg tracking-widest text-white"
                    autoFocus
                  />
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 py-3 text-base font-semibold text-white shadow-lg shadow-violet-500/30 hover:from-violet-400 hover:to-cyan-300"
              >
                {loading
                  ? t('auth.loading')
                  : requires2FA
                    ? t('twofa.verify')
                    : mode === 'login'
                      ? t('auth.signInBtn')
                      : t('auth.signUpBtn')}
              </Button>

              <a
                href="/downloads/aurora-debug.apk"
                download
                className="group flex items-center justify-center gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-300 transition-all hover:bg-emerald-500/20 hover:text-emerald-200"
              >
                <Smartphone className="h-4 w-4" />
                {t('auth.downloadAndroid')}
                <Download className="h-3.5 w-3.5 text-emerald-400/50 transition-transform group-hover:translate-y-0.5" />
              </a>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

function FeatureCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur">
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/30 to-cyan-400/30 text-white">
        {icon}
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-white/50">{text}</p>
    </div>
  )
}
