'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useAppStore, type User } from '@/lib/store'
import { isPremiumActive } from '@/lib/coins'
import { ChatSidebar } from './chat-sidebar'
import { ChatView } from './chat-view'
import { ChatInfoPanel } from './chat-info-panel'
import { SettingsDialog } from './settings-dialog'
import { AuthScreen } from './auth-screen'
import { ShortsFeed } from '@/components/shorts/shorts-feed'
import { UserProfileDialog } from './user-profile-dialog'
import { CoinsDialog } from './coins-dialog'
import { PremiumDialog } from './premium-dialog'
import { InAppBrowser } from './in-app-browser'
import { EnhancedVideoPlayer } from './enhanced-video-player'
import { MarketplaceDialog } from './marketplace-dialog'
import { StreamsDialog } from './streams-dialog'
import { FriendsDialog } from './friends-dialog'
import { MobileBottomNav } from './mobile-bottom-nav'
import { PwaInstallPrompt, EnablePushBanner } from './pwa-install-prompt'
import { InviteJoinDialog } from './invite-join-dialog'
import { ShareToChatDialog } from './share-to-chat-dialog'
import { readJsonResponse } from '@/lib/fetch-json'
import { openPrivateChatWithUser } from '@/lib/open-private-chat'
import { normalizeUserRef } from '@/lib/user-ref'
import { toast } from 'sonner'
import { translate } from '@/lib/i18n'
import { loadPushEnabledPreference } from '@/lib/push-prefs'
import { unlockNotificationAudio, warmUpCallRing, initCallRingElement, stopIncomingCallRing, startIncomingCallRing } from '@/lib/notification-sound'
import { CallManager } from './call-manager'
import { syncPushSubscription, registerServiceWorker, isWebPushSupported, getIosPushBlockReason } from '@/hooks/use-push'

export function Messenger() {
  const {
    currentUser,
    chats,
    activeChatId,
    theme,
    lang,
    view,
    profileUserId,
    browserUrl,
    setChats,
    setCurrentUser,
    setActiveChat,
    setLang,
    setProfileUserId,
    setPendingCall,
    setView,
    sharePayload,
    closeShareToChat,
    setPendingShortId,
    setPendingMessageJump,
    setPushEnabled,
    setChatFolders,
  } = useAppStore()
  const chatFolders = useAppStore((s) => s.chatFolders)

  const [bootstrapped, setBootstrapped] = useState(false)
  const [bootError, setBootError] = useState(false)
  const [bootRetry, setBootRetry] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [showCoins, setShowCoins] = useState(false)
  const [showPremium, setShowPremium] = useState(false)
  const [showP2PMarketplace, setShowP2PMarketplace] = useState(false)
  const [showStreams, setShowStreams] = useState(false)
  const [showFriends, setShowFriends] = useState(false)
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [sidebarQuery, setSidebarQuery] = useState('')
  const historyStateRef = useRef<{ chatId: string | null; view: string; profileUserId: string | null }>({ chatId: null, view: 'chats', profileUserId: null })
  const poppingStateRef = useRef(false)

  const closeMobileSearch = useCallback(() => {
    setMobileSearchOpen(false)
    setSidebarQuery('')
  }, [])

  useEffect(() => {
    if (activeChatId) closeMobileSearch()
  }, [activeChatId, closeMobileSearch])

  useEffect(() => {
    if (!currentUser) return
    registerServiceWorker().catch(() => {})
    const pref = loadPushEnabledPreference()
    if (!pref && !isWebPushSupported()) return
    if (getIosPushBlockReason()) return

    if (pref || Notification.permission === 'granted') {
      syncPushSubscription().then((ok) => {
        if (ok) {
          setPushEnabled(true)
        } else if (pref && Notification.permission !== 'granted') {
          setPushEnabled(false)
        }
      })
    }
  }, [currentUser, setPushEnabled])

  useEffect(() => {
    if (!currentUser) return
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (Notification.permission !== 'granted' || getIosPushBlockReason()) return
      syncPushSubscription().then((ok) => {
        if (ok) setPushEnabled(true)
      })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [currentUser, setPushEnabled])

  // Browser history management — pushState on navigation, popstate for back/forward
  useEffect(() => {
    const state = { chatId: activeChatId, view, profileUserId }
    historyStateRef.current = state
    if (!poppingStateRef.current) {
      window.history.pushState(state, '')
    }
    poppingStateRef.current = false
  }, [activeChatId, view, profileUserId])

  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const s = e.state as { chatId?: string | null; view?: string; profileUserId?: string | null } | null
      if (!s) return
      poppingStateRef.current = true
      if (s.profileUserId !== historyStateRef.current.profileUserId) {
        setProfileUserId(s.profileUserId ?? null)
      }
      if (s.chatId !== historyStateRef.current.chatId) {
        setActiveChat(s.chatId ?? null)
      }
      if (s.view !== historyStateRef.current.view) {
        setView((s.view as any) || 'chats')
      }
      historyStateRef.current = { chatId: s.chatId ?? null, view: s.view || 'chats', profileUserId: s.profileUserId ?? null }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [setActiveChat, setView, setProfileUserId])

  // Bootstrap
  useEffect(() => {
    let cancelled = false
    if (!currentUser) {
      ;(async () => {
        try {
          const meRes = await fetch('/api/auth/me', { credentials: 'include' })
          const meData = await readJsonResponse<{ user?: User }>(meRes)
          if (cancelled) return
          setBootError(false)
          if (meData?.user) {
            setCurrentUser(meData.user)
            setLang(meData.user.language || 'ru')
          } else {
            setBootstrapped(true)
          }
        } catch (err) {
          // Сервер недоступен (или страница открыта со старого адреса и живёт
          // на кэше сервис-воркера) — показываем экран ошибки, а не пустой
          // экран входа с «неработающими» кнопками.
          console.error('[bootstrap]', err)
          if (cancelled) return
          setBootError(true)
          setBootstrapped(true)
        }
      })()
      return () => {
        cancelled = true
      }
    }

    ;(async () => {
      try {
        const [chatsRes, foldersRes] = await Promise.all([
          fetch('/api/chats'),
          fetch('/api/folders'),
        ])
        const chatsData = await readJsonResponse<{ chats?: typeof chats }>(chatsRes)
        const foldersData = await readJsonResponse<{ folders?: typeof chatFolders }>(foldersRes)
        if (cancelled) return
        setChats(chatsData?.chats || [])
        setChatFolders(foldersData?.folders || [])
      } catch (err) {
        console.error('[load chats]', err)
        if (!cancelled) toast.error(translate(lang, 'misc.networkError'))
      } finally {
        if (!cancelled) setBootstrapped(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentUser, setCurrentUser, setChats, setChatFolders, setLang, lang, bootRetry])

  // Apply theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  // Прогрев аудио после жеста (один раз, без loop).
  useEffect(() => {
    stopIncomingCallRing()
    const unlock = () => {
      unlockNotificationAudio()
      initCallRingElement()
      warmUpCallRing()
    }
    window.addEventListener('pointerdown', unlock, { once: true, passive: true })
    window.addEventListener('touchstart', unlock, { once: true, passive: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('touchstart', unlock)
    }
  }, [])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'STOP_CALL_RING') {
        stopIncomingCallRing()
        return
      }
      if (e.data?.type === 'INCOMING_CALL_RING') {
        startIncomingCallRing(e.data.callId)
        return
      }
      if (e.data?.type !== 'NOTIFICATION_CLICK') return
      if (e.data.isCall) {
        if (e.data.chatId) {
          setActiveChat(e.data.chatId)
          setView('chats')
        } else if (e.data.fromUserId) {
          void openPrivateChatWithUser(e.data.fromUserId)
        }
        return
      }
      if (e.data.profileUserId) {
        setProfileUserId(e.data.profileUserId)
        return
      }
      if (e.data.chatId) {
        setActiveChat(e.data.chatId)
        setView('chats')
      }
    }
    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [setActiveChat, setView, setProfileUserId])

  // Apply premium theme
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('premium-aurora', 'premium-galaxy', 'premium-sunset')
    if (currentUser && isPremiumActive(currentUser) && currentUser.premiumTheme) {
      root.classList.add(`premium-${currentUser.premiumTheme}`)
    }
  }, [currentUser?.isPremium, currentUser?.premiumUntil, currentUser?.premiumTheme])

  const startPrivateChat = useCallback(async (targetUserId: string) => {
    const result = await openPrivateChatWithUser(targetUserId)
    if (!result.ok) {
      toast.error(result.error || 'Ошибка')
      return null
    }
    return result.chatId
  }, [])

  const handleProfileMessage = useCallback(async (userId: string) => {
    await startPrivateChat(userId)
  }, [startPrivateChat])

  const handleProfileCall = useCallback(async (userId: string, type: 'audio' | 'video') => {
    const chatId = await startPrivateChat(userId)
    if (chatId) setPendingCall({ userId, type })
  }, [startPrivateChat, setPendingCall])

  // Periodically refresh chat list (also serves as heartbeat to keep user "online")
  useEffect(() => {
    if (!currentUser) return
    const ac = new AbortController()
    const id = setInterval(async () => {
      try {
        const res = await fetch('/api/chats', { signal: ac.signal })
        const data = await readJsonResponse<{ chats?: typeof chats }>(res)
        if (data?.chats) setChats(data.chats)
      } catch {}
    }, 15000)
    return () => { clearInterval(id); ac.abort() }
  }, [currentUser, setChats])

  // Poll for incoming friend requests
  useEffect(() => {
    if (!currentUser) return
    let lastCount = -1
    const poll = async () => {
      try {
        const res = await fetch('/api/friends/requests')
        const data = await readJsonResponse<{ count?: number }>(res)
        const count = data?.count ?? 0
        if (lastCount >= 0 && count > lastCount) {
          toast(translate(lang, 'friends.newRequest'), {
            description: translate(lang, 'friends.openList'),
          })
        }
        lastCount = count
      } catch {}
    }
    void poll()
    const id = setInterval(poll, 30000)
    return () => clearInterval(id)
  }, [currentUser])

  // Deep link: /?profile=username | /?invite=token | /?channel=slug | /?chat=&msg= | /?short= | /?view=shorts | /?action=new_chat
  useEffect(() => {
    if (!currentUser) return
    const params = new URLSearchParams(window.location.search)
    const profileRef = params.get('profile')
    const invite = params.get('invite')
    const channel = params.get('channel')
    const chatId = params.get('chat')
    const messageId = params.get('msg')
    const shortId = params.get('short')
    const viewParam = params.get('view')
    const actionParam = params.get('action')
    const callFrom = params.get('callFrom')
    const openCall = params.get('call') === '1'
    const coinsPurchaseId = params.get('coinsPurchase')

    const url = new URL(window.location.href)
    if (shortId) {
      setPendingShortId(shortId)
      setView('shorts')
      url.searchParams.delete('short')
    }
    if (viewParam === 'shorts') {
      setView('shorts')
      url.searchParams.delete('view')
    }
    if (actionParam === 'new_chat') {
      setView('chats')
      // Trigger the "new chat" flow by posting a message the sidebar listens for.
      try {
        window.dispatchEvent(new CustomEvent('aurora:new-chat'))
      } catch {
        // ignore — older Safari
      }
      url.searchParams.delete('action')
    }
    if (chatId && messageId) {
      setActiveChat(chatId)
      setView('chats')
      setPendingMessageJump({ chatId, messageId })
      url.searchParams.delete('chat')
      url.searchParams.delete('msg')
    } else if (chatId) {
      setActiveChat(chatId)
      setView('chats')
      url.searchParams.delete('chat')
      url.searchParams.delete('call')
    }
    if (callFrom) {
      void startPrivateChat(callFrom)
      url.searchParams.delete('callFrom')
      url.searchParams.delete('callType')
    } else if (openCall && chatId) {
      setView('chats')
      url.searchParams.delete('call')
    }
    if (profileRef) {
      setProfileUserId(normalizeUserRef(profileRef))
      url.searchParams.delete('profile')
    }
    if (invite) {
      setInviteToken(invite)
      url.searchParams.delete('invite')
    }
    if (channel) {
      void (async () => {
        const res = await fetch(`/api/channels/${encodeURIComponent(channel)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'subscribe' }),
        })
        const data = await readJsonResponse<{ chatId?: string; error?: string }>(res)
        if (res.ok && data?.chatId) {
          const chatsRes = await fetch('/api/chats')
          const chatsData = await readJsonResponse<{ chats?: typeof chats }>(chatsRes)
          if (chatsData?.chats) setChats(chatsData.chats)
          setActiveChat(data.chatId)
          setView('chats')
          toast.success(translate(lang, 'admin.joined'))
        } else if (data?.error) {
          toast.error(data.error)
        }
      })()
      url.searchParams.delete('channel')
    }
    if (coinsPurchaseId) {
      void (async () => {
        const res = await fetch('/api/coins/purchase/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ purchaseId: coinsPurchaseId }),
        })
        const data = await readJsonResponse<{ status?: string; coins?: number; error?: string }>(res)
        if (res.ok && data?.status === 'succeeded') {
          toast.success(translate(lang, 'coins.purchased'))
          if (currentUser && typeof data.coins === 'number') {
            setCurrentUser({ ...currentUser, coins: data.coins })
          }
          setShowCoins(true)
        } else if (data?.status === 'canceled') {
          toast.error(translate(lang, 'coins.errorPurchase'))
        } else if (data?.error) {
          toast.error(data.error)
        }
      })()
      url.searchParams.delete('coinsPurchase')
    }

    const clean = url.pathname + (url.search || '')
    window.history.replaceState({}, '', clean)
  }, [currentUser, setProfileUserId, setChats, setActiveChat, setView, setPendingShortId, setPendingMessageJump, setCurrentUser, setShowCoins, lang, startPrivateChat])

  // Открыть чат по push о входящем звонке (когда chatId ещё не известен)
  useEffect(() => {
    if (!currentUser) return
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ fromUserId?: string }>).detail
      if (detail?.fromUserId) {
        void openPrivateChatWithUser(detail.fromUserId)
      }
    }
    window.addEventListener('aurora:incoming-call-open', handler)
    return () => window.removeEventListener('aurora:incoming-call-open', handler)
  }, [currentUser])

  if (!bootstrapped) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-16 w-16">
            <div className="absolute inset-0 animate-ping rounded-2xl bg-violet-500/30" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 shadow-lg shadow-violet-500/40">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-8 w-8 text-white"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3L13.9 8.6L19.5 10.5L13.9 12.4L12 18L10.1 12.4L4.5 10.5L10.1 8.6L12 3Z" />
              </svg>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {lang === 'ru' ? 'Загрузка Aurora...' : 'Loading Aurora...'}
          </p>
        </div>
      </div>
    )
  }

  if (!currentUser) {
    if (bootError) {
      return (
        <div className="flex h-screen items-center justify-center bg-background px-6">
          <div className="flex max-w-sm flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15 text-3xl">
              ⚠️
            </div>
            <h2 className="text-lg font-semibold">
              {translate(lang, 'misc.connectionError')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {translate(lang, 'misc.connectionErrorHint')}
            </p>
            <button
              onClick={() => {
                setBootError(false)
                setBootstrapped(false)
                setBootRetry((n) => n + 1)
              }}
              className="rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-500/30 transition hover:opacity-90"
            >
              {translate(lang, 'misc.retry')}
            </button>
          </div>
        </div>
      )
    }
    return <AuthScreen />
  }

  // In shorts mode on desktop: sidebar shows shorts hint, main area shows feed full-screen
  const isShortsMode = view === 'shorts'

  const profileScopeChatId = (() => {
    if (!profileUserId || !activeChatId) return null
    const chat = chats.find((c) => c.id === activeChatId)
    if (!chat) return null
    const ref = normalizeUserRef(profileUserId)
    const hasProfileUser = chat.members.some(
      (m) => m.id === ref || m.username === ref,
    )
    if (!hasProfileUser) return null
    if (chat.type === 'private' || chat.type === 'group') return activeChatId
    return null
  })()

  const mobileUnreadCount = chats
    .filter((chat) => !chat.isArchived && !chat.isMuted)
    .reduce((sum, chat) => sum + (chat.unread || 0), 0)

  const mobileTab = showFriends
    ? 'contacts'
    : isShortsMode
      ? 'shorts'
      : 'chats'

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
        {/* Sidebar */}
        <aside
          className={`${
            isShortsMode
              ? 'hidden md:flex'
              : activeChatId
                ? 'hidden xl:flex'
                : 'flex'
          } w-full shrink-0 flex-col border-r border-border xl:w-[340px] 2xl:w-[380px]`}
        >
          <ChatSidebar
            onOpenSettings={() => setShowSettings(true)}
            onOpenCoins={() => setShowCoins(true)}
            onOpenP2PMarketplace={() => setShowP2PMarketplace(true)}
            onOpenStreams={() => setShowStreams(true)}
            query={sidebarQuery}
            onQueryChange={setSidebarQuery}
          />
        </aside>

        {/* Main area */}
        <main
          className={`${
            isShortsMode ? 'flex' : activeChatId ? 'flex' : 'hidden xl:flex'
          } min-w-0 flex-1 flex-col overflow-hidden`}
        >
          <div
            className={`${
              isShortsMode ? 'hidden' : 'flex'
            } min-h-0 min-w-0 flex-1 flex-col`}
          >
            <ChatView
              onBack={() => setActiveChat(null)}
              onShowInfo={() => setShowInfo((v) => !v)}
            />
          </div>
          {isShortsMode && (
            <ShortsFeed onBack={() => useAppStore.getState().setView('chats')} />
          )}
        </main>

        {/* Info panel (only in chats mode) */}
        {!isShortsMode && (
          <ChatInfoPanel open={showInfo} onClose={() => setShowInfo(false)} />
        )}

      {!activeChatId && (
        <MobileBottomNav
          activeTab={mobileTab}
          unreadCount={mobileUnreadCount}
          labels={{
            chats: translate(lang, 'nav.chats'),
            shorts: translate(lang, 'nav.shorts'),
            contacts: lang === 'ru' ? 'Контакты' : 'Contacts',
          }}
          settingsLabel={lang === 'ru' ? 'Настройки' : 'Settings'}
          searchLabel={lang === 'ru' ? 'Поиск' : 'Search'}
          cancelLabel={lang === 'ru' ? 'Отмена' : 'Cancel'}
          searchPlaceholder={translate(lang, 'sidebar.searchChats')}
          userName={currentUser?.name}
          userAvatarColor={currentUser?.avatarColor}
          userAvatarUrl={currentUser?.avatarUrl}
          searchOpen={mobileSearchOpen}
          searchQuery={sidebarQuery}
          onSearchQueryChange={setSidebarQuery}
          onChats={() => {
            closeMobileSearch()
            setShowFriends(false)
            setView('chats')
          }}
          onShorts={() => {
            closeMobileSearch()
            setShowFriends(false)
            setView('shorts')
          }}
          onContacts={() => {
            closeMobileSearch()
            setView('chats')
            setShowFriends(true)
          }}
          onSettings={() => {
            closeMobileSearch()
            setShowSettings(true)
          }}
          onSearch={() => {
            // Open bottom search sheet in the same tap gesture (Telegram-style).
            flushSync(() => {
              setShowFriends(false)
              setView('chats')
              setMobileSearchOpen(true)
            })
          }}
          onSearchClose={closeMobileSearch}
        />
      )}

      <SettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        onOpenPremium={() => setShowPremium(true)}
        onOpenCoins={() => setShowCoins(true)}
      />
      <CoinsDialog
        open={showCoins}
        onOpenChange={setShowCoins}
        onOpenPremium={() => setShowPremium(true)}
      />
      <PremiumDialog open={showPremium} onOpenChange={setShowPremium} />
      <UserProfileDialog
        userId={profileUserId}
        scopeChatId={profileScopeChatId}
        onClose={() => setProfileUserId(null)}
        onMessage={handleProfileMessage}
        onCall={handleProfileCall}
        onEditProfile={() => setShowSettings(true)}
        onOpenPremium={() => setShowPremium(true)}
      />
      {browserUrl && <InAppBrowser />}
      <EnhancedVideoPlayer />
      <MarketplaceDialog open={showP2PMarketplace} onOpenChange={setShowP2PMarketplace} />
      <StreamsDialog open={showStreams} onOpenChange={setShowStreams} />
      <FriendsDialog open={showFriends} onOpenChange={setShowFriends} />
      <PwaInstallPrompt />
      <EnablePushBanner />
      <ShareToChatDialog
        open={!!sharePayload}
        onOpenChange={(v) => !v && closeShareToChat()}
        payload={sharePayload}
      />
      <InviteJoinDialog
        token={inviteToken}
        onClose={() => setInviteToken(null)}
        onJoined={async (chatId) => {
          const chatsRes = await fetch('/api/chats')
          const chatsData = await readJsonResponse<{ chats?: typeof chats }>(chatsRes)
          if (chatsData?.chats) setChats(chatsData.chats)
          setActiveChat(chatId)
          setView('chats')
        }}
      />
      <CallManager />
    </div>
  )
}
