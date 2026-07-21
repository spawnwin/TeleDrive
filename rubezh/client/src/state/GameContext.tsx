import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, bootstrap, getApiBase, saveApiUrl } from '../api';
import type { GameState } from '../types';

interface GameContextValue {
  state: GameState | null;
  loading: boolean;
  error: string | null;
  apiUrl: string;
  refresh: () => Promise<void>;
  setApiUrl: (url: string) => Promise<void>;
  act: <T extends GameState>(fn: () => Promise<T>) => Promise<T | null>;
  toast: string | null;
  clearToast: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [apiUrl, setApiUrlState] = useState(getApiBase());

  const refresh = useCallback(async () => {
    try {
      const next = await api.base();
      setState(next);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Ошибка сети');
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const s = await bootstrap();
        setState(s);
        setApiUrlState(getApiBase());
      } catch (err: any) {
        setError(err.message || 'Не удалось подключиться к серверу');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!state) return;
    const t = setInterval(() => {
      refresh().catch(() => undefined);
    }, 4000);
    return () => clearInterval(t);
  }, [state?.user.id, refresh]);

  const act = useCallback(async <T extends GameState>(fn: () => Promise<T>) => {
    try {
      const next = await fn();
      setState(next);
      setError(null);
      if (next.lastQuality) setToast(next.lastQuality);
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
  }, []);

  const value = useMemo(
    () => ({
      state,
      loading,
      error,
      apiUrl,
      refresh,
      setApiUrl,
      act,
      toast,
      clearToast: () => setToast(null),
    }),
    [state, loading, error, apiUrl, refresh, setApiUrl, act, toast],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame outside provider');
  return ctx;
}
