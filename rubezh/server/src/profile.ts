import { xpToLevel } from './config/balance.js';
import { db } from './db.js';

function nowIso() {
  return new Date().toISOString();
}

function getUser(userId: string) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  if (!user) throw Object.assign(new Error('Игрок не найден'), { statusCode: 404 });
  return user;
}

function sanitizeCallsign(raw: string): string {
  const value = (raw || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  if (value.length < 2) {
    throw Object.assign(new Error('Позывной слишком короткий'), { statusCode: 400 });
  }
  return value;
}

export function getPlayerProfile(viewerId: string, targetUserId: string) {
  getUser(viewerId);
  const user = getUser(targetUserId);
  const isSelf = viewerId === targetUserId;

  const stats = db.prepare('SELECT * FROM player_stats WHERE user_id = ?').get(targetUserId) as any;
  const membership = db.prepare('SELECT * FROM clan_members WHERE user_id = ?').get(targetUserId) as any;
  let clan: { id: string; name: string; tag: string; motto: string; role: string; level: number } | null = null;
  if (membership) {
    const c = db.prepare('SELECT * FROM clans WHERE id = ?').get(membership.clan_id) as any;
    if (c) {
      clan = {
        id: c.id,
        name: c.name,
        tag: c.tag,
        motto: c.motto,
        role: membership.role,
        level: c.level,
      };
    }
  }

  const buildings = db.prepare('SELECT type, level FROM buildings WHERE user_id = ?').all(targetUserId) as any[];
  const command = buildings.find((b) => b.type === 'command');
  const unlockedBuildings = buildings.filter((b) => b.level > 0).length;
  const vehicles = db.prepare('SELECT COUNT(*) as c FROM vehicles WHERE user_id = ?').get(targetUserId) as { c: number };
  const specialists = db.prepare('SELECT COUNT(*) as c FROM specialists WHERE user_id = ?').get(targetUserId) as {
    c: number;
  };
  const achievements = db
    .prepare('SELECT COUNT(*) as c FROM achievements WHERE user_id = ? AND unlocked = 1')
    .get(targetUserId) as { c: number };
  const story = db.prepare('SELECT chapter FROM story_progress WHERE user_id = ?').get(targetUserId) as any;
  const region = db.prepare('SELECT stability FROM region_state WHERE user_id = ?').get(targetUserId) as any;
  const raceDay = nowIso().slice(0, 10);
  const race = db
    .prepare('SELECT requests FROM race_scores WHERE user_id = ? AND day_key = ?')
    .get(targetUserId, raceDay) as any;

  const profile: Record<string, unknown> = {
    id: user.id,
    callsign: user.callsign,
    nickname: user.nickname,
    level: user.level,
    createdAt: user.created_at,
    lastSeenAt: user.last_seen_at,
    isSelf,
    clan,
    stats: {
      requestsTotal: stats?.requests_total ?? 0,
      collectsTotal: stats?.collects_total ?? 0,
      operationsTotal: stats?.operations_total ?? 0,
      helpsSent: stats?.helps_sent ?? 0,
      repairsTotal: stats?.repairs_total ?? 0,
      raceToday: race?.requests ?? 0,
    },
    progress: {
      commandLevel: command?.level ?? 1,
      buildingsUnlocked: unlockedBuildings,
      vehiclesCount: vehicles?.c ?? 0,
      specialistsCount: specialists?.c ?? 0,
      storyChapter: story?.chapter ?? 1,
      achievementsUnlocked: achievements?.c ?? 0,
      regionStability: region?.stability ?? 62,
    },
  };

  if (isSelf) {
    profile.experience = user.experience;
    profile.xpToNext = xpToLevel(user.level);
    profile.tutorialDone = !!user.tutorial_done;
  }

  return profile;
}

export function getSelfProfile(userId: string) {
  return getPlayerProfile(userId, userId);
}

export function updateSelfProfile(userId: string, opts: { callsign?: string }) {
  getUser(userId);
  if (opts.callsign !== undefined) {
    const callsign = sanitizeCallsign(opts.callsign);
    const taken = db
      .prepare('SELECT id FROM users WHERE lower(callsign) = lower(?) AND id != ?')
      .get(callsign, userId);
    if (taken) throw Object.assign(new Error('Такой позывной уже занят'), { statusCode: 400 });
    db.prepare('UPDATE users SET callsign = ?, nickname = ?, last_seen_at = ? WHERE id = ?').run(
      callsign,
      callsign,
      nowIso(),
      userId,
    );
  }
  return getSelfProfile(userId);
}
