import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GameState } from './types';

const DEFAULT_API = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8787';

let apiBase = DEFAULT_API;
let userId: string | null = null;

export function setApiBase(url: string) {
  apiBase = url.replace(/\/$/, '');
}

export function getApiBase() {
  return apiBase;
}

export function getUserId() {
  return userId;
}

export function setUserId(id: string | null) {
  userId = id;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (userId) headers['X-User-Id'] = userId;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${apiBase}${path}`, { ...options, headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data as T;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export type AuthResult = { userId: string; token: string; callsign?: string; state: GameState };

async function persistSession(result: AuthResult) {
  userId = result.userId;
  await AsyncStorage.setItem('rubezh_user_id', result.userId);
  await AsyncStorage.setItem('rubezh_cache', JSON.stringify(result.state));
  return result.state;
}

/** Restore saved session if any. Does NOT create a guest automatically. */
export async function restoreSession(): Promise<GameState | null> {
  const savedApi = await AsyncStorage.getItem('rubezh_api_url');
  if (savedApi) apiBase = savedApi;

  const savedId = await AsyncStorage.getItem('rubezh_user_id');
  if (!savedId) return null;

  userId = savedId;
  try {
    const state = await request<GameState>('/v1/base');
    await AsyncStorage.setItem('rubezh_cache', JSON.stringify(state));
    return state;
  } catch (err) {
    const cached = await AsyncStorage.getItem('rubezh_cache');
    if (cached) {
      try {
        return JSON.parse(cached) as GameState;
      } catch {
        /* ignore */
      }
    }
    throw err instanceof Error ? err : new Error('Не удалось восстановить сессию');
  }
}

export async function clearSession() {
  userId = null;
  await AsyncStorage.removeItem('rubezh_user_id');
  await AsyncStorage.removeItem('rubezh_cache');
}

export async function saveApiUrl(url: string) {
  setApiBase(url);
  await AsyncStorage.setItem('rubezh_api_url', apiBase);
}

export const api = {
  register: async (callsign: string, password: string) => {
    const result = await request<AuthResult>('/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ callsign, password }),
    });
    return persistSession(result);
  },
  login: async (callsign: string, password: string) => {
    const result = await request<AuthResult>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ callsign, password }),
    });
    return persistSession(result);
  },
  guest: async (callsign?: string) => {
    const result = await request<AuthResult>('/v1/auth/guest', {
      method: 'POST',
      body: JSON.stringify({ callsign, nickname: callsign }),
    });
    return persistSession(result);
  },
  setPassword: (password: string) =>
    request<{ ok: boolean; callsign: string }>('/v1/auth/set-password', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  base: () => request<GameState>('/v1/base'),
  upgrade: (id: string) => request<GameState>(`/v1/buildings/${id}/upgrade`, { method: 'POST', body: '{}' }),
  collect: (id: string) => request<GameState>(`/v1/buildings/${id}/collect`, { method: 'POST', body: '{}' }),
  collectAll: () => request<GameState>('/v1/buildings/collect-all', { method: 'POST', body: '{}' }),
  startRequest: (id: string, vehicleId?: string) =>
    request<GameState>(`/v1/requests/${id}/start`, {
      method: 'POST',
      body: JSON.stringify({ vehicleId }),
    }),
  claimRequest: (id: string) => request<GameState>(`/v1/requests/${id}/claim`, { method: 'POST', body: '{}' }),
  claimOffline: () => request<GameState>('/v1/offline/claim', { method: 'POST', body: '{}' }),
  assign: (specialistId: string, buildingId: string | null) =>
    request<GameState>(`/v1/specialists/${specialistId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ buildingId }),
    }),
  claimQuest: (id: string) => request<GameState>(`/v1/quests/${id}/claim`, { method: 'POST', body: '{}' }),
  advanceTutorial: (step: number) =>
    request<GameState>('/v1/tutorial/advance', { method: 'POST', body: JSON.stringify({ step }) }),
  startOperation: (defId: string) =>
    request<GameState>(`/v1/operations/${defId}/start`, { method: 'POST', body: '{}' }),
  claimOperation: (id: string) => request<GameState>(`/v1/operations/${id}/claim`, { method: 'POST', body: '{}' }),
  setAutomation: (opts: { autoCollect?: boolean; autoSimpleRequests?: boolean }) =>
    request<GameState>('/v1/automation', { method: 'POST', body: JSON.stringify(opts) }),
  claimAchievement: (id: string) =>
    request<GameState>(`/v1/achievements/${id}/claim`, { method: 'POST', body: '{}' }),
  buyShop: (id: string) => request<GameState>(`/v1/shop/${id}/buy`, { method: 'POST', body: '{}' }),
  advanceStory: () => request<GameState>('/v1/story/advance', { method: 'POST', body: '{}' }),
  repairVehicle: (id: string) => request<GameState>(`/v1/vehicles/${id}/repair`, { method: 'POST', body: '{}' }),
  upgradeVehicle: (id: string) => request<GameState>(`/v1/vehicles/${id}/upgrade`, { method: 'POST', body: '{}' }),
  trainSpecialist: (id: string) => request<GameState>(`/v1/specialists/${id}/train`, { method: 'POST', body: '{}' }),
  profile: () => request<import('./types').PlayerProfile>('/v1/profile'),
  player: (id: string) => request<import('./types').PlayerProfile>(`/v1/players/${id}`),
  updateProfile: (opts: { callsign: string }) =>
    request<import('./types').PlayerProfile>('/v1/profile', {
      method: 'PATCH',
      body: JSON.stringify(opts),
    }),
  social: () => request<import('./types').SocialState>('/v1/social'),
  createClan: (name: string, tag: string, motto?: string) =>
    request<GameState>('/v1/clans', { method: 'POST', body: JSON.stringify({ name, tag, motto }) }),
  joinClan: (id: string) => request<GameState>(`/v1/clans/${id}/join`, { method: 'POST', body: '{}' }),
  leaveClan: () => request<GameState>('/v1/clans/leave', { method: 'POST', body: '{}' }),
  clanChat: (message: string) =>
    request<{ social: import('./types').SocialState }>('/v1/clans/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  clanHelp: (targetUserId: string) =>
    request<GameState>(`/v1/clans/help/${targetUserId}`, { method: 'POST', body: '{}' }),
  clanWeeklyClaim: () => request<GameState>('/v1/clans/weekly-claim', { method: 'POST', body: '{}' }),
};
