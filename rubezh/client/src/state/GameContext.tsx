import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api, bootstrap, getApiBase, saveApiUrl } from '../api';
import type { GameState } from '../types';

interface GameContextValue {
  state: GameState | null;
  loading: boolean;
  error: string | null;
  apiUrl: string;
  syncing: boolean;
  lastSyncedAt: number | null;
  online: boolean;
  refresh: () => Promise<void>;
  setApiUrl: (url: string) => Promise<void>;
  act: <T extends GameState>(fn: () => Promise<T>) => Promise<T | null>;
  toast: string | null;
  clearToast: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

const POLL_MS = 3000;

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [apiUrl, setApiUrlState] = useState(getApiBase());
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  const syncingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const next = await api.base();
      setState(next);
      setError(null);
      setOnline(true);
      setLastSyncedAt(Date.now());
    } catch (err: any) {
      setOnline(false);
      setError(err.message || 'Ошибка сети');
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await bootstrap();
        if (cancelled) return;
        setState(s);
        setApiUrlState(getApiBase());
        setOnline(true);
        setLastSyncedAt(Date.now());
        setError(null);
      } catch (err: any) {
        if (cancelled) return;
        setOnline(false);
        setError(err.message || 'Не удалось подключиться к серверу');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasStateRef = useRef(false);
  hasStateRef.current = !!state;

  useEffect(() => {
    const tick = async () => {
      if (!hasStateRef.current) {
        try {
          const s = await bootstrap();
          setState(s);
          setApiUrlState(getApiBase());
          setOnline(true);
          setLastSyncedAt(Date.now());
          setError(null);
          setLoading(false);
        } catch (err: any) {
          setOnline(false);
          setError(err.message || 'Нет связи с сервером');
          setLoading(false);
        }
        return;
      }
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
  }, [refresh]);

  const act = useCallback(async <T extends GameState>(fn: () => Promise<T>) => {
    try {
      const next = await fn();
      setState(next);
      setError(null);
      setOnline(true);
      setLastSyncedAt(Date.now());
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
  }, []);

  const setApiUrl = useCallback(async (url: string) => {
    await saveApiUrl(url);
    setApiUrlState(getApiBase());
    await refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      state,
      loading,
      error,
      apiUrl,
      syncing,
      lastSyncedAt,
      online,
      refresh,
      setApiUrl,
      act,
      toast,
      clearToast: () => setToast(null),
    }),
    [state, loading, error, apiUrl, syncing, lastSyncedAt, online, refresh, setApiUrl, act, toast],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame outside provider');
  return ctx;
}
