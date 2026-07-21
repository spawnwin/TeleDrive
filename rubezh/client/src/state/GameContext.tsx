import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api, clearSession, getApiBase, restoreSession, saveApiUrl } from '../api';
import type { GameState } from '../types';

interface GameContextValue {
  state: GameState | null;
  loading: boolean;
  needsAuth: boolean;
  error: string | null;
  apiUrl: string;
  syncing: boolean;
  lastSyncedAt: number | null;
  online: boolean;
  refresh: () => Promise<void>;
  setApiUrl: (url: string) => Promise<void>;
  act: <T extends GameState>(fn: () => Promise<T>) => Promise<T | null>;
  login: (callsign: string, password: string) => Promise<void>;
  register: (callsign: string, password: string) => Promise<void>;
  guestLogin: (callsign?: string) => Promise<void>;
  logout: () => Promise<void>;
  toast: string | null;
  clearToast: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

const POLL_MS = 3000;

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [apiUrl, setApiUrlState] = useState(getApiBase());
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  const syncingRef = useRef(false);

  const applyState = useCallback((next: GameState) => {
    setState(next);
    setNeedsAuth(false);
    setError(null);
    setOnline(true);
    setLastSyncedAt(Date.now());
  }, []);

  const refresh = useCallback(async () => {
    if (syncingRef.current || needsAuth) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const next = await api.base();
      applyState(next);
    } catch (err: any) {
      setOnline(false);
      setError(err.message || 'Ошибка сети');
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [applyState, needsAuth]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await restoreSession();
        if (cancelled) return;
        if (s) {
          applyState(s);
          setApiUrlState(getApiBase());
        } else {
          setNeedsAuth(true);
          setState(null);
        }
      } catch (err: any) {
        if (cancelled) return;
        // Saved session exists but server unreachable — keep cached if restore threw after cache miss
        setOnline(false);
        setError(err.message || 'Не удалось подключиться к серверу');
        setNeedsAuth(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyState]);

  const hasStateRef = useRef(false);
  hasStateRef.current = !!state;

  useEffect(() => {
    const tick = async () => {
      if (!hasStateRef.current || needsAuth) return;
      await refresh();
    };
    const t = setInterval(() => {
      tick().catch(() => undefined);
    }, POLL_MS);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') tick().catch(() => undefined);
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [refresh, needsAuth]);

  const act = useCallback(async <T extends GameState>(fn: () => Promise<T>) => {
    try {
      const next = await fn();
      applyState(next);
      if (next.lastQuality) setToast(next.lastQuality);
      if ((next as any).helpResult) setToast((next as any).helpResult);
      if ((next as any).raceReward?.claimed) {
        setToast(`Награда гонки: ${(next as any).raceReward.place}-е место`);
      }
      if (next.offlineGained) setToast('Офлайн-доход получен');
      return next;
    } catch (err: any) {
      setToast(err.message || 'Ошибка');
      setError(err.message || 'Ошибка');
      return null;
    }
  }, [applyState]);

  const setApiUrl = useCallback(async (url: string) => {
    await saveApiUrl(url);
    setApiUrlState(getApiBase());
  }, []);

  const login = useCallback(
    async (callsign: string, password: string) => {
      const next = await api.login(callsign, password);
      applyState(next);
      setToast(`Добро пожаловать, ${next.user.callsign}`);
    },
    [applyState],
  );

  const register = useCallback(
    async (callsign: string, password: string) => {
      const next = await api.register(callsign, password);
      applyState(next);
      setToast(`Командир ${next.user.callsign} зарегистрирован`);
    },
    [applyState],
  );

  const guestLogin = useCallback(
    async (callsign?: string) => {
      const next = await api.guest(callsign);
      applyState(next);
      setToast(`Гостевой вход: ${next.user.callsign}`);
    },
    [applyState],
  );

  const logout = useCallback(async () => {
    await clearSession();
    setState(null);
    setNeedsAuth(true);
    setError(null);
    setToast('Вы вышли из штаба');
  }, []);

  const value = useMemo(
    () => ({
      state,
      loading,
      needsAuth,
      error,
      apiUrl,
      syncing,
      lastSyncedAt,
      online,
      refresh,
      setApiUrl,
      act,
      login,
      register,
      guestLogin,
      logout,
      toast,
      clearToast: () => setToast(null),
    }),
    [
      state,
      loading,
      needsAuth,
      error,
      apiUrl,
      syncing,
      lastSyncedAt,
      online,
      refresh,
      setApiUrl,
      act,
      login,
      register,
      guestLogin,
      logout,
      toast,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame outside provider');
  return ctx;
}
