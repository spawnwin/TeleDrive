import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import { getBaseState } from './economy.js';

const MAX_CLAN_SIZE = 30;
const MAX_MOTTO = 80;
const MAX_MSG = 240;

function nowIso() {
  return new Date().toISOString();
}

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function weekKey(d = new Date()) {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getUser(userId: string) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  if (!user) throw Object.assign(new Error('Пользователь не найден'), { statusCode: 404 });
  return user;
}

function sanitizeName(raw: string, fallback: string) {
  const cleaned = (raw || '')
    .replace(/[^\p{L}\p{N}\s\-_.]/gu, '')
    .trim()
    .slice(0, 24);
  return cleaned || fallback;
}

function ensureWeek(clan: any) {
  const key = weekKey();
  if (clan.week_key !== key) {
    db.prepare(`UPDATE clans SET week_key = ?, weekly_progress = 0, weekly_goal = ? WHERE id = ?`).run(
      key,
      150 + clan.level * 50,
      clan.id,
    );
    clan.week_key = key;
    clan.weekly_progress = 0;
    clan.weekly_goal = 150 + clan.level * 50;
  }
}

function memberOf(userId: string) {
  return db.prepare('SELECT * FROM clan_members WHERE user_id = ?').get(userId) as any;
}

function requireMember(userId: string) {
  const m = memberOf(userId);
  if (!m) throw Object.assign(new Error('Вы не состоите в объединении'), { statusCode: 400 });
  return m;
}

function clanById(clanId: string) {
  const clan = db.prepare('SELECT * FROM clans WHERE id = ?').get(clanId) as any;
  if (!clan) throw Object.assign(new Error('Объединение не найдено'), { statusCode: 404 });
  ensureWeek(clan);
  return db.prepare('SELECT * FROM clans WHERE id = ?').get(clanId) as any;
}

function serializeClan(clanId: string, viewerId: string) {
  const clan = clanById(clanId);
  const members = db
    .prepare(
      `SELECT cm.*, u.callsign, u.level as player_level, COALESCE(ps.requests_total, 0) as requests_total
       FROM clan_members cm
       JOIN users u ON u.id = cm.user_id
       LEFT JOIN player_stats ps ON ps.user_id = cm.user_id
       WHERE cm.clan_id = ?
       ORDER BY
         CASE cm.role WHEN 'commander' THEN 0 WHEN 'deputy' THEN 1 WHEN 'officer' THEN 2 ELSE 3 END,
         cm.contribution DESC`,
    )
    .all(clanId) as any[];

  const messages = db
    .prepare(
      `SELECT id, user_id, callsign, body, created_at
       FROM clan_messages WHERE clan_id = ? ORDER BY created_at DESC LIMIT 40`,
    )
    .all(clanId)
    .reverse();

  const my = members.find((m) => m.user_id === viewerId);
  const helpTargets = members
    .filter((m) => m.user_id !== viewerId)
    .map((m) => {
      const upgrading = db
        .prepare(
          `SELECT id, type, upgrade_ends_at FROM buildings
           WHERE user_id = ? AND state = 'upgrading' AND upgrade_ends_at IS NOT NULL
           ORDER BY upgrade_ends_at ASC LIMIT 1`,
        )
        .get(m.user_id) as any;
      const helpedToday = db
        .prepare(`SELECT id FROM clan_helps WHERE from_user_id = ? AND to_user_id = ? AND day_key = ?`)
        .get(viewerId, m.user_id, dayKey());
      return {
        userId: m.user_id,
        callsign: m.callsign,
        role: m.role,
        canHelp: !!upgrading && !helpedToday,
        upgradingBuilding: upgrading
          ? { id: upgrading.id, type: upgrading.type, endsAt: upgrading.upgrade_ends_at }
          : null,
      };
    });

  return {
    id: clan.id,
    name: clan.name,
    tag: clan.tag,
    motto: clan.motto,
    level: clan.level,
    xp: clan.xp,
    xpToNext: clan.level * 100,
    memberCount: members.length,
    maxMembers: MAX_CLAN_SIZE,
    weeklyGoal: clan.weekly_goal,
    weeklyProgress: clan.weekly_progress,
    weekKey: clan.week_key,
    myRole: my?.role || null,
    members: members.map((m) => ({
      userId: m.user_id,
      callsign: m.callsign,
      role: m.role,
      contribution: m.contribution,
      level: m.player_level,
      requestsTotal: m.requests_total,
      joinedAt: m.joined_at,
    })),
    messages,
    helpTargets,
  };
}

export function getSocialState(userId: string) {
  getUser(userId);
  const membership = memberOf(userId);
  const clan = membership ? serializeClan(membership.clan_id, userId) : null;

  const openClans = db
    .prepare(
      `SELECT c.id, c.name, c.tag, c.motto, c.level, c.weekly_progress, c.weekly_goal,
              (SELECT COUNT(*) FROM clan_members cm WHERE cm.clan_id = c.id) as member_count
       FROM clans c
       ORDER BY c.level DESC, member_count DESC
       LIMIT 20`,
    )
    .all()
    .filter((c: any) => c.member_count < MAX_CLAN_SIZE);

  const leaderboard = db
    .prepare(
      `SELECT u.id, u.callsign, u.level, COALESCE(ps.requests_total, 0) as requests_total,
              COALESCE(ps.operations_total, 0) as operations_total,
              COALESCE(ps.helps_sent, 0) as helps_sent,
              c.tag as clan_tag
       FROM users u
       LEFT JOIN player_stats ps ON ps.user_id = u.id
       LEFT JOIN clan_members cm ON cm.user_id = u.id
       LEFT JOIN clans c ON c.id = cm.clan_id
       ORDER BY requests_total DESC, operations_total DESC
       LIMIT 20`,
    )
    .all();

  const raceKey = dayKey();
  const race = db
    .prepare(
      `SELECT rs.user_id, rs.requests, u.callsign, c.tag as clan_tag
       FROM race_scores rs
       JOIN users u ON u.id = rs.user_id
       LEFT JOIN clan_members cm ON cm.user_id = u.id
       LEFT JOIN clans c ON c.id = cm.clan_id
       WHERE rs.day_key = ?
       ORDER BY rs.requests DESC
       LIMIT 20`,
    )
    .all(raceKey);

  const myRace = db.prepare(`SELECT requests FROM race_scores WHERE user_id = ? AND day_key = ?`).get(userId, raceKey) as any;

  return {
    clan,
    openClans,
    leaderboard,
    race: {
      dayKey: raceKey,
      myScore: myRace?.requests || 0,
      top: race,
      title: 'Логистическая гонка дня',
      description: 'Кто быстрее выполнит больше заявок за сутки. Без атак на базы других игроков.',
    },
  };
}

export function createClan(userId: string, nameRaw: string, tagRaw: string, mottoRaw = '') {
  getUser(userId);
  if (memberOf(userId)) throw Object.assign(new Error('Сначала покиньте текущее объединение'), { statusCode: 400 });

  const name = sanitizeName(nameRaw, 'Объединение');
  const tag = sanitizeName(tagRaw, 'РБЖ').toUpperCase().replace(/\s+/g, '').slice(0, 5);
  const motto = (mottoRaw || 'Надёжный тыл').slice(0, MAX_MOTTO);
  if (tag.length < 2) throw Object.assign(new Error('Тег слишком короткий'), { statusCode: 400 });

  const exists = db.prepare(`SELECT id FROM clans WHERE name = ? OR tag = ?`).get(name, tag);
  if (exists) throw Object.assign(new Error('Имя или тег уже заняты'), { statusCode: 400 });

  const id = randomUUID();
  const created = nowIso();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO clans (id, name, tag, motto, commander_id, level, xp, weekly_goal, weekly_progress, week_key, created_at)
       VALUES (?, ?, ?, ?, ?, 1, 0, 200, 0, ?, ?)`,
    ).run(id, name, tag, motto, userId, weekKey(), created);
    db.prepare(
      `INSERT INTO clan_members (clan_id, user_id, role, contribution, joined_at) VALUES (?, ?, 'commander', 0, ?)`,
    ).run(id, userId, created);
    db.prepare(`UPDATE users SET clan_id = ? WHERE id = ?`).run(id, userId);
    db.prepare(
      `INSERT INTO clan_messages (id, clan_id, user_id, callsign, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), id, userId, getUser(userId).callsign, 'Объединение сформировано. Держим снабжение.', created);
  });
  tx();

  return { ...getBaseState(userId), social: getSocialState(userId) };
}

export function joinClan(userId: string, clanId: string) {
  getUser(userId);
  if (memberOf(userId)) throw Object.assign(new Error('Уже в объединении'), { statusCode: 400 });
  const clan = clanById(clanId);
  const count = (db.prepare(`SELECT COUNT(*) as c FROM clan_members WHERE clan_id = ?`).get(clanId) as any).c;
  if (count >= MAX_CLAN_SIZE) throw Object.assign(new Error('Объединение заполнено'), { statusCode: 400 });

  const created = nowIso();
  db.prepare(
    `INSERT INTO clan_members (clan_id, user_id, role, contribution, joined_at) VALUES (?, ?, 'recruit', 0, ?)`,
  ).run(clanId, userId, created);
  db.prepare(`UPDATE users SET clan_id = ? WHERE id = ?`).run(clanId, userId);
  db.prepare(
    `INSERT INTO clan_messages (id, clan_id, user_id, callsign, body, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), clanId, userId, getUser(userId).callsign, 'Присоединился к объединению.', created);

  return { ...getBaseState(userId), social: getSocialState(userId) };
}

export function leaveClan(userId: string) {
  const m = requireMember(userId);
  const clan = clanById(m.clan_id);
  if (m.role === 'commander') {
    const next = db
      .prepare(
        `SELECT user_id FROM clan_members WHERE clan_id = ? AND user_id != ? ORDER BY
         CASE role WHEN 'deputy' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END, contribution DESC LIMIT 1`,
      )
      .get(clan.id, userId) as any;
    if (next) {
      db.prepare(`UPDATE clan_members SET role = 'commander' WHERE user_id = ?`).run(next.user_id);
      db.prepare(`UPDATE clans SET commander_id = ? WHERE id = ?`).run(next.user_id, clan.id);
    } else {
      db.prepare(`DELETE FROM clans WHERE id = ?`).run(clan.id);
      db.prepare(`UPDATE users SET clan_id = NULL WHERE id = ?`).run(userId);
      db.prepare(`DELETE FROM clan_members WHERE user_id = ?`).run(userId);
      return { ...getBaseState(userId), social: getSocialState(userId) };
    }
  }
  db.prepare(`DELETE FROM clan_members WHERE user_id = ?`).run(userId);
  db.prepare(`UPDATE users SET clan_id = NULL WHERE id = ?`).run(userId);
  return { ...getBaseState(userId), social: getSocialState(userId) };
}

export function postClanMessage(userId: string, bodyRaw: string) {
  const m = requireMember(userId);
  const body = (bodyRaw || '').trim().slice(0, MAX_MSG);
  if (body.length < 1) throw Object.assign(new Error('Пустое сообщение'), { statusCode: 400 });
  // Soft filter: block obvious coordinate-looking patterns
  if (/\b\d{1,3}\.\d{4,}.+\d{1,3}\.\d{4,}\b/.test(body)) {
    throw Object.assign(new Error('Сообщение отклонено фильтром безопасности'), { statusCode: 400 });
  }
  const user = getUser(userId);
  db.prepare(
    `INSERT INTO clan_messages (id, clan_id, user_id, callsign, body, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), m.clan_id, userId, user.callsign, body, nowIso());
  return getSocialState(userId);
}

export function helpClanMember(userId: string, targetUserId: string) {
  const me = requireMember(userId);
  const target = memberOf(targetUserId);
  if (!target || target.clan_id !== me.clan_id) {
    throw Object.assign(new Error('Игрок не из вашего объединения'), { statusCode: 400 });
  }
  if (targetUserId === userId) throw Object.assign(new Error('Нельзя помочь самому себе'), { statusCode: 400 });

  const key = dayKey();
  const already = db
    .prepare(`SELECT id FROM clan_helps WHERE from_user_id = ? AND to_user_id = ? AND day_key = ?`)
    .get(userId, targetUserId, key);
  if (already) throw Object.assign(new Error('Вы уже помогали этому игроку сегодня'), { statusCode: 400 });

  const building = db
    .prepare(
      `SELECT * FROM buildings WHERE user_id = ? AND state = 'upgrading' AND upgrade_ends_at IS NOT NULL
       ORDER BY upgrade_ends_at ASC LIMIT 1`,
    )
    .get(targetUserId) as any;
  if (!building) throw Object.assign(new Error('У союзника нет активного строительства'), { statusCode: 400 });

  const ends = new Date(building.upgrade_ends_at).getTime();
  const now = Date.now();
  const remain = Math.max(0, ends - now);
  const reduced = Math.max(5000, Math.floor(remain * 0.7)); // -30% remaining time
  const newEnds = new Date(now + reduced).toISOString();
  db.prepare(`UPDATE buildings SET upgrade_ends_at = ? WHERE id = ?`).run(newEnds, building.id);

  db.prepare(
    `INSERT INTO clan_helps (id, from_user_id, to_user_id, building_id, day_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), userId, targetUserId, building.id, key, nowIso());

  db.prepare(
    `INSERT INTO player_stats (user_id, requests_total, collects_total, operations_total, helps_sent)
     VALUES (?, 0, 0, 0, 1)
     ON CONFLICT(user_id) DO UPDATE SET helps_sent = helps_sent + 1`,
  ).run(userId);

  // small reward for helper
  const badges = db.prepare(`SELECT amount FROM resources WHERE user_id = ? AND resource_type = 'badges'`).get(userId) as any;
  const materials = db.prepare(`SELECT amount FROM resources WHERE user_id = ? AND resource_type = 'materials'`).get(userId) as any;
  db.prepare(
    `INSERT INTO resources (user_id, resource_type, amount) VALUES (?, 'badges', ?)
     ON CONFLICT(user_id, resource_type) DO UPDATE SET amount = amount + 5`,
  ).run(userId, (badges?.amount || 0) + 5);
  db.prepare(
    `INSERT INTO resources (user_id, resource_type, amount) VALUES (?, 'materials', ?)
     ON CONFLICT(user_id, resource_type) DO UPDATE SET amount = amount + 15`,
  ).run(userId, (materials?.amount || 0) + 15);

  db.prepare(
    `INSERT INTO clan_messages (id, clan_id, user_id, callsign, body, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    me.clan_id,
    userId,
    getUser(userId).callsign,
    `Помог ускорить строительство командира ${getUser(targetUserId).callsign}.`,
    nowIso(),
  );

  return { ...getBaseState(userId), social: getSocialState(userId), helpResult: 'Строительство ускорено на 30%' };
}

export function claimWeeklyClanReward(userId: string) {
  const m = requireMember(userId);
  const clan = clanById(m.clan_id);
  if (clan.weekly_progress < clan.weekly_goal) {
    throw Object.assign(new Error('Недельный план ещё не выполнен'), { statusCode: 400 });
  }
  const claimKey = `clan_week_${clan.id}_${clan.week_key}`;
  const already = db
    .prepare(`SELECT id FROM resource_transactions WHERE user_id = ? AND reason = ? LIMIT 1`)
    .get(userId, claimKey);
  if (already) throw Object.assign(new Error('Награда за эту неделю уже получена'), { statusCode: 400 });

  db.prepare(
    `INSERT INTO resources (user_id, resource_type, amount) VALUES (?, 'badges', 40)
     ON CONFLICT(user_id, resource_type) DO UPDATE SET amount = amount + 40`,
  ).run(userId);
  db.prepare(
    `INSERT INTO resources (user_id, resource_type, amount) VALUES (?, 'materials', 120)
     ON CONFLICT(user_id, resource_type) DO UPDATE SET amount = amount + 120`,
  ).run(userId);
  db.prepare(
    `INSERT INTO resource_transactions
      (id, user_id, resource_type, amount_before, delta, amount_after, reason, source_id, created_at)
     VALUES (?, ?, 'badges', 0, 40, 40, ?, ?, ?)`,
  ).run(randomUUID(), userId, claimKey, clan.id, nowIso());

  return { ...getBaseState(userId), social: getSocialState(userId) };
}
