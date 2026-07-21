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

export async function bootstrap(): Promise<GameState> {
  const savedId = await AsyncStorage.getItem('rubezh_user_id');
  const savedApi = await AsyncStorage.getItem('rubezh_api_url');
  if (savedApi) apiBase = savedApi;

  if (savedId) {
    userId = savedId;
    try {
      const state = await request<GameState>('/v1/base');
      await AsyncStorage.setItem('rubezh_cache', JSON.stringify(state));
      return state;
    } catch {
      // fall through to guest
    }
  }

  const auth = await request<{ userId: string; state: GameState }>('/v1/auth/guest', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  userId = auth.userId;
  await AsyncStorage.setItem('rubezh_user_id', userId);
  await AsyncStorage.setItem('rubezh_cache', JSON.stringify(auth.state));
  return auth.state;
}

export async function saveApiUrl(url: string) {
  setApiBase(url);
  await AsyncStorage.setItem('rubezh_api_url', apiBase);
}

export const api = {
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
