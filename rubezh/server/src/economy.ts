import { randomUUID } from 'node:crypto';
import {
  BUILDINGS,
  DAILY_QUESTS,
  OFFLINE_CAP_HOURS,
  REQUEST_DEFS,
  SPECIALIST_TEMPLATES,
  VEHICLE_TEMPLATES,
  capacityFor,
  upgradeCost,
  upgradeDurationSec,
  xpToLevel,
  type BuildingType,
  type ResourceType,
  type RequestType,
} from './config/balance.js';
import { db } from './db.js';

function nowIso(): string {
  return new Date().toISOString();
}

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

function bumpVersion(userId: string): void {
  db.prepare('UPDATE users SET state_version = state_version + 1, last_seen_at = ? WHERE id = ?').run(nowIso(), userId);
}

function getUser(userId: string) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  if (!user) throw Object.assign(new Error('Пользователь не найден'), { statusCode: 404 });
  return user;
}

function getResourcesMap(userId: string): Record<ResourceType, number> {
  const rows = db.prepare('SELECT resource_type, amount FROM resources WHERE user_id = ?').all(userId) as Array<{
    resource_type: ResourceType;
    amount: number;
  }>;
  const map = {
    materials: 0,
    fuel: 0,
    parts: 0,
    food: 0,
    medkits: 0,
    energy: 0,
    badges: 0,
  } as Record<ResourceType, number>;
  for (const row of rows) map[row.resource_type] = row.amount;
  return map;
}

function setResource(userId: string, type: ResourceType, amount: number, reason: string, sourceId?: string): void {
  const before = getResourcesMap(userId)[type] ?? 0;
  const after = Math.max(0, amount);
  db.prepare(
    `INSERT INTO resources (user_id, resource_type, amount) VALUES (?, ?, ?)
     ON CONFLICT(user_id, resource_type) DO UPDATE SET amount = excluded.amount`,
  ).run(userId, type, after);
  db.prepare(
    `INSERT INTO resource_transactions
      (id, user_id, resource_type, amount_before, delta, amount_after, reason, source_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), userId, type, before, after - before, after, reason, sourceId ?? null, nowIso());
}

function addResource(userId: string, type: ResourceType, delta: number, reason: string, sourceId?: string, cap?: number): number {
  const current = getResourcesMap(userId)[type] ?? 0;
  let next = current + delta;
  if (cap !== undefined) next = Math.min(next, cap);
  setResource(userId, type, next, reason, sourceId);
  return next;
}

function spendResources(userId: string, cost: Partial<Record<ResourceType, number>>, reason: string, sourceId?: string): void {
  const resources = getResourcesMap(userId);
  for (const [k, v] of Object.entries(cost)) {
    const type = k as ResourceType;
    const need = v ?? 0;
    if ((resources[type] ?? 0) < need) {
      throw Object.assign(new Error(`Недостаточно ресурса: ${type}`), { statusCode: 400 });
    }
  }
  for (const [k, v] of Object.entries(cost)) {
    const type = k as ResourceType;
    addResource(userId, type, -(v ?? 0), reason, sourceId);
  }
}

function ensureDailyQuests(userId: string): void {
  const key = dayKey();
  const counter = db.prepare('SELECT * FROM quest_counters WHERE user_id = ?').get(userId) as any;
  if (!counter || counter.day_key !== key) {
    db.prepare(
      `INSERT INTO quest_counters (user_id, requests_completed, upgrades, collects, offline_claims, assignments, day_key)
       VALUES (?, 0, 0, 0, 0, 0, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         requests_completed=0, upgrades=0, collects=0, offline_claims=0, assignments=0, day_key=excluded.day_key`,
    ).run(userId, key);
    db.prepare('DELETE FROM quests WHERE user_id = ?').run(userId);
    for (const q of DAILY_QUESTS) {
      db.prepare(
        `INSERT INTO quests (id, user_id, quest_def_id, title, metric, target, progress, claimed, reward_json, day_key)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      ).run(randomUUID(), userId, q.id, q.title, q.metric, q.target, JSON.stringify(q.reward), key);
    }
  }
}

function bumpQuest(userId: string, metric: string, by = 1): void {
  ensureDailyQuests(userId);
  const colMap: Record<string, string> = {
    requestsCompleted: 'requests_completed',
    upgrades: 'upgrades',
    collects: 'collects',
    offlineClaims: 'offline_claims',
    assignments: 'assignments',
  };
  const col = colMap[metric];
  if (!col) return;
  db.prepare(`UPDATE quest_counters SET ${col} = ${col} + ? WHERE user_id = ?`).run(by, userId);
  const counter = db.prepare('SELECT * FROM quest_counters WHERE user_id = ?').get(userId) as any;
  const progress = counter[col] as number;
  db.prepare(
    `UPDATE quests SET progress = MIN(target, ?) WHERE user_id = ? AND metric = ? AND claimed = 0`,
  ).run(progress, userId, metric);
}

function addXp(userId: string, xp: number): void {
  const user = getUser(userId);
  let experience = user.experience + xp;
  let level = user.level;
  while (experience >= xpToLevel(level)) {
    experience -= xpToLevel(level);
    level += 1;
  }
  db.prepare('UPDATE users SET experience = ?, level = ? WHERE id = ?').run(experience, level, userId);
}

function buildingDef(type: BuildingType) {
  const def = BUILDINGS.find((b) => b.type === type);
  if (!def) throw new Error(`Unknown building ${type}`);
  return def;
}

function tickProduction(userId: string): void {
  const buildings = db.prepare('SELECT * FROM buildings WHERE user_id = ?').all(userId) as any[];
  const command = buildings.find((b) => b.type === 'command');
  const warehouse = buildings.find((b) => b.type === 'warehouse');
  const commandLevel = command?.level ?? 1;
  const warehouseLevel = warehouse?.level ?? 1;
  const now = Date.now();

  for (const b of buildings) {
    if (b.state === 'upgrading' && b.upgrade_ends_at && new Date(b.upgrade_ends_at).getTime() <= now) {
      db.prepare(`UPDATE buildings SET level = level + 1, state = 'idle', upgrade_ends_at = NULL WHERE id = ?`).run(b.id);
      b.level += 1;
      b.state = 'idle';
      b.upgrade_ends_at = null;
    }

    const def = buildingDef(b.type as BuildingType);
    if (!def.produces || b.state === 'upgrading') {
      db.prepare('UPDATE buildings SET last_tick_at = ? WHERE id = ?').run(nowIso(), b.id);
      continue;
    }

    const last = new Date(b.last_tick_at).getTime();
    const hours = Math.max(0, (now - last) / 3_600_000);
    if (hours <= 0) continue;

    let bonus = 1;
    if (b.assigned_specialist_id) {
      const spec = db.prepare('SELECT * FROM specialists WHERE id = ?').get(b.assigned_specialist_id) as any;
      if (spec) bonus += spec.speed * 0.01 + spec.management * 0.005;
    }

    const produced = def.ratePerHour * b.level * hours * bonus;
    const cap = capacityFor(def.produces, warehouseLevel, commandLevel);
    const currentRes = getResourcesMap(userId)[def.produces];
    const room = Math.max(0, cap - currentRes);
    const storedRoom = Math.max(0, 100 * b.level - b.stored);
    const toStore = Math.min(produced, storedRoom, room);
    db.prepare('UPDATE buildings SET stored = stored + ?, last_tick_at = ? WHERE id = ?').run(toStore, nowIso(), b.id);
  }
}

function spawnRequests(userId: string, forceTutorial = false): void {
  const open = db
    .prepare(`SELECT COUNT(*) as c FROM requests WHERE user_id = ? AND status IN ('available','in_progress','ready')`)
    .get(userId) as { c: number };
  const user = getUser(userId);
  const maxOpen = Math.min(5, 2 + Math.floor(user.level / 2));

  if (forceTutorial || user.tutorial_done === 0) {
    const hasTutorial = db
      .prepare(`SELECT id FROM requests WHERE user_id = ? AND type = 'tutorial_delivery' AND status != 'claimed'`)
      .get(userId);
    if (!hasTutorial) {
      insertRequest(userId, 'tutorial_delivery');
    }
  }

  while (open.c < maxOpen) {
    const pool = REQUEST_DEFS.filter((r) => r.type !== 'tutorial_delivery');
    const pick = pool[Math.floor(Math.random() * pool.length)];
    insertRequest(userId, pick.type);
    open.c += 1;
  }
}

function insertRequest(userId: string, type: RequestType): void {
  const def = REQUEST_DEFS.find((r) => r.type === type)!;
  db.prepare(
    `INSERT INTO requests
      (id, user_id, type, title, description, status, difficulty, duration_sec, cost_json, reward_json, xp, required_building, created_at)
     VALUES (?, ?, ?, ?, ?, 'available', ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    userId,
    def.type,
    def.title,
    def.description,
    def.difficulty,
    def.durationSec,
    JSON.stringify(def.cost),
    JSON.stringify(def.reward),
    def.xp,
    def.requiredBuilding ?? null,
    nowIso(),
  );
}

function settleRequestTimers(userId: string): void {
  const now = nowIso();
  const rows = db
    .prepare(`SELECT * FROM requests WHERE user_id = ? AND status = 'in_progress' AND ends_at IS NOT NULL AND ends_at <= ?`)
    .all(userId, now) as any[];
  for (const row of rows) {
    db.prepare(`UPDATE requests SET status = 'ready' WHERE id = ?`).run(row.id);
    if (row.vehicle_id) {
      db.prepare(`UPDATE vehicles SET status = 'idle', condition = MAX(40, condition - 5) WHERE id = ?`).run(row.vehicle_id);
    }
  }
}

export function createGuest(nickname?: string) {
  const id = randomUUID();
  const callsign = nickname?.trim() || `Командир-${id.slice(0, 4).toUpperCase()}`;
  const created = nowIso();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO users (id, nickname, callsign, level, experience, tutorial_step, tutorial_done, state_version, last_seen_at, last_offline_claim_at, created_at)
       VALUES (?, ?, ?, 1, 0, 0, 0, 1, ?, ?, ?)`,
    ).run(id, callsign, callsign, created, created, created);

    const starters: Record<ResourceType, number> = {
      materials: 120,
      fuel: 80,
      parts: 40,
      food: 60,
      medkits: 20,
      energy: 10,
      badges: 100,
    };
    for (const [type, amount] of Object.entries(starters)) {
      setResource(id, type as ResourceType, amount, 'start');
    }

    for (const b of BUILDINGS) {
      let level = 0;
      let state = 'locked';
      if (b.type === 'command' || b.type === 'warehouse' || b.type === 'motorpool' || b.type === 'food_hub') {
        level = 1;
        state = 'idle';
      }
      db.prepare(
        `INSERT INTO buildings (id, user_id, type, level, state, stored, last_tick_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
      ).run(randomUUID(), id, b.type, level, state, created);
    }

    for (const s of SPECIALIST_TEMPLATES.slice(0, 2)) {
      db.prepare(
        `INSERT INTO specialists (id, user_id, template_id, name, role, rarity, level, management, speed, reliability)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      ).run(randomUUID(), id, s.templateId, s.name, s.role, s.rarity, s.management, s.speed, s.reliability);
    }

    for (const v of VEHICLE_TEMPLATES.slice(0, 2)) {
      db.prepare(
        `INSERT INTO vehicles (id, user_id, template_id, name, category, level, condition, capacity, speed, reliability, fuel_use, status)
         VALUES (?, ?, ?, ?, ?, 1, 100, ?, ?, ?, ?, 'idle')`,
      ).run(randomUUID(), id, v.templateId, v.name, v.category, v.capacity, v.speed, v.reliability, v.fuelUse);
    }

    ensureDailyQuests(id);
    spawnRequests(id, true);
  });
  tx();
  return getBaseState(id);
}

export function getBaseState(userId: string) {
  getUser(userId);
  tickProduction(userId);
  settleRequestTimers(userId);
  spawnRequests(userId);
  ensureDailyQuests(userId);

  const user = getUser(userId);
  const resources = getResourcesMap(userId);
  const buildings = db.prepare('SELECT * FROM buildings WHERE user_id = ? ORDER BY type').all(userId);
  const specialists = db.prepare('SELECT * FROM specialists WHERE user_id = ?').all(userId);
  const vehicles = db.prepare('SELECT * FROM vehicles WHERE user_id = ?').all(userId);
  const requests = db
    .prepare(`SELECT * FROM requests WHERE user_id = ? AND status != 'claimed' ORDER BY created_at DESC LIMIT 20`)
    .all(userId)
    .map((r: any) => ({
      ...r,
      cost: parseJson(r.cost_json),
      reward: parseJson(r.reward_json),
    }));
  const quests = db
    .prepare('SELECT * FROM quests WHERE user_id = ?')
    .all(userId)
    .map((q: any) => ({
      ...q,
      reward: parseJson(q.reward_json),
      claimed: !!q.claimed,
    }));

  const warehouse = (buildings as any[]).find((b) => b.type === 'warehouse');
  const command = (buildings as any[]).find((b) => b.type === 'command');
  const capacities: Record<string, number> = {};
  for (const t of Object.keys(resources) as ResourceType[]) {
    capacities[t] = capacityFor(t, warehouse?.level ?? 1, command?.level ?? 1);
  }

  const lastClaim = new Date(user.last_offline_claim_at).getTime();
  const offlineHours = Math.min(OFFLINE_CAP_HOURS, Math.max(0, (Date.now() - lastClaim) / 3_600_000));

  return {
    user: {
      id: user.id,
      nickname: user.nickname,
      callsign: user.callsign,
      level: user.level,
      experience: user.experience,
      xpToNext: xpToLevel(user.level),
      tutorialStep: user.tutorial_step,
      tutorialDone: !!user.tutorial_done,
      stateVersion: user.state_version,
      serverNow: nowIso(),
    },
    resources,
    capacities,
    buildings: (buildings as any[]).map((b) => {
      const def = buildingDef(b.type);
      const nextCost = b.level <= 0 ? def.baseCost : upgradeCost(def.baseCost, def.growth, b.level);
      return {
        ...b,
        name: def.name,
        produces: def.produces ?? null,
        ratePerHour: def.ratePerHour * Math.max(b.level, 1),
        nextUpgradeCost: nextCost,
        nextUpgradeDurationSec: upgradeDurationSec(Math.max(b.level, 1)),
        unlocked: b.level > 0,
      };
    }),
    specialists,
    vehicles,
    requests,
    quests,
    offline: {
      hoursAvailable: Number(offlineHours.toFixed(2)),
      capHours: OFFLINE_CAP_HOURS,
      lastClaimAt: user.last_offline_claim_at,
    },
    region: {
      id: 'training',
      name: 'Учебный район',
      stability: 62 + Math.min(30, user.level * 3),
    },
  };
}

export function upgradeBuilding(userId: string, buildingId: string) {
  tickProduction(userId);
  const b = db.prepare('SELECT * FROM buildings WHERE id = ? AND user_id = ?').get(buildingId, userId) as any;
  if (!b) throw Object.assign(new Error('Здание не найдено'), { statusCode: 404 });
  if (b.state === 'upgrading') throw Object.assign(new Error('Уже улучшается'), { statusCode: 400 });

  const command = db.prepare(`SELECT * FROM buildings WHERE user_id = ? AND type = 'command'`).get(userId) as any;
  const def = buildingDef(b.type);
  const targetLevel = b.level <= 0 ? 1 : b.level + 1;

  const commandLevel = command?.level ?? 1;
  // Early game: buildings may exceed HQ by 1 so tutorial upgrade is possible.
  const maxBuildingLevel = commandLevel + (commandLevel < 3 ? 1 : 0);
  if (b.type !== 'command' && targetLevel > maxBuildingLevel) {
    throw Object.assign(new Error('Сначала улучшите командный пункт'), { statusCode: 400 });
  }
  if (b.level <= 0 && def.unlockLevel > commandLevel) {
    throw Object.assign(new Error('Здание ещё не открыто'), { statusCode: 400 });
  }

  const cost = upgradeCost(def.baseCost, def.growth, Math.max(b.level, 1));
  spendResources(userId, { materials: cost }, 'building_upgrade', buildingId);
  const ends = new Date(Date.now() + upgradeDurationSec(Math.max(b.level, 1)) * 1000).toISOString();
  db.prepare(`UPDATE buildings SET state = 'upgrading', upgrade_ends_at = ? WHERE id = ?`).run(ends, buildingId);
  bumpQuest(userId, 'upgrades');
  bumpVersion(userId);

  // Unlock mechanic/medical specialists on repair/medical unlock
  if (b.level <= 0 && b.type === 'repair') {
    const exists = db.prepare(`SELECT id FROM specialists WHERE user_id = ? AND template_id = 'mechanic_petr'`).get(userId);
    if (!exists) {
      const s = SPECIALIST_TEMPLATES.find((x) => x.templateId === 'mechanic_petr')!;
      db.prepare(
        `INSERT INTO specialists (id, user_id, template_id, name, role, rarity, level, management, speed, reliability)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      ).run(randomUUID(), userId, s.templateId, s.name, s.role, s.rarity, s.management, s.speed, s.reliability);
    }
  }
  if (b.level <= 0 && b.type === 'medical') {
    const exists = db.prepare(`SELECT id FROM specialists WHERE user_id = ? AND template_id = 'medic_anna'`).get(userId);
    if (!exists) {
      const s = SPECIALIST_TEMPLATES.find((x) => x.templateId === 'medic_anna')!;
      db.prepare(
        `INSERT INTO specialists (id, user_id, template_id, name, role, rarity, level, management, speed, reliability)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      ).run(randomUUID(), userId, s.templateId, s.name, s.role, s.rarity, s.management, s.speed, s.reliability);
      const v = VEHICLE_TEMPLATES.find((x) => x.templateId === 'ambulance')!;
      const hasV = db.prepare(`SELECT id FROM vehicles WHERE user_id = ? AND template_id = 'ambulance'`).get(userId);
      if (!hasV) {
        db.prepare(
          `INSERT INTO vehicles (id, user_id, template_id, name, category, level, condition, capacity, speed, reliability, fuel_use, status)
           VALUES (?, ?, ?, ?, ?, 1, 100, ?, ?, ?, ?, 'idle')`,
        ).run(randomUUID(), userId, v.templateId, v.name, v.category, v.capacity, v.speed, v.reliability, v.fuelUse);
      }
    }
  }

  return getBaseState(userId);
}

export function collectBuilding(userId: string, buildingId: string) {
  tickProduction(userId);
  const b = db.prepare('SELECT * FROM buildings WHERE id = ? AND user_id = ?').get(buildingId, userId) as any;
  if (!b) throw Object.assign(new Error('Здание не найдено'), { statusCode: 404 });
  const def = buildingDef(b.type);
  if (!def.produces || b.stored <= 0) {
    throw Object.assign(new Error('Нечего собирать'), { statusCode: 400 });
  }
  const warehouse = db.prepare(`SELECT * FROM buildings WHERE user_id = ? AND type = 'warehouse'`).get(userId) as any;
  const command = db.prepare(`SELECT * FROM buildings WHERE user_id = ? AND type = 'command'`).get(userId) as any;
  const cap = capacityFor(def.produces, warehouse?.level ?? 1, command?.level ?? 1);
  const amount = b.stored;
  addResource(userId, def.produces, amount, 'collect', buildingId, cap);
  db.prepare('UPDATE buildings SET stored = 0 WHERE id = ?').run(buildingId);
  bumpQuest(userId, 'collects');
  bumpVersion(userId);
  return getBaseState(userId);
}

export function collectAll(userId: string) {
  tickProduction(userId);
  const buildings = db.prepare(`SELECT * FROM buildings WHERE user_id = ? AND stored > 0`).all(userId) as any[];
  for (const b of buildings) {
    try {
      collectBuilding(userId, b.id);
    } catch {
      /* capacity full */
    }
  }
  return getBaseState(userId);
}

export function startRequest(userId: string, requestId: string, vehicleId?: string) {
  tickProduction(userId);
  settleRequestTimers(userId);
  const req = db.prepare('SELECT * FROM requests WHERE id = ? AND user_id = ?').get(requestId, userId) as any;
  if (!req) throw Object.assign(new Error('Заявка не найдена'), { statusCode: 404 });
  if (req.status !== 'available') throw Object.assign(new Error('Заявка недоступна'), { statusCode: 400 });

  if (req.required_building) {
    const b = db.prepare('SELECT * FROM buildings WHERE user_id = ? AND type = ?').get(userId, req.required_building) as any;
    if (!b || b.level <= 0) {
      throw Object.assign(new Error('Нужное здание не открыто'), { statusCode: 400 });
    }
  }

  const cost = parseJson<Partial<Record<ResourceType, number>>>(req.cost_json);
  spendResources(userId, cost, 'request_start', requestId);

  let vehicle = vehicleId
    ? (db.prepare('SELECT * FROM vehicles WHERE id = ? AND user_id = ?').get(vehicleId, userId) as any)
    : (db.prepare(`SELECT * FROM vehicles WHERE user_id = ? AND status = 'idle' ORDER BY speed DESC`).get(userId) as any);

  if (!vehicle || vehicle.status !== 'idle') {
    throw Object.assign(new Error('Нет свободного транспорта'), { statusCode: 400 });
  }

  // specialist speed bonus shortens duration
  const assigned = db
    .prepare(
      `SELECT s.* FROM specialists s
       JOIN buildings b ON b.assigned_specialist_id = s.id
       WHERE b.user_id = ? AND b.type IN ('motorpool','warehouse','repair','medical')
       LIMIT 1`,
    )
    .get(userId) as any;
  const speedBonus = assigned ? 1 - Math.min(0.35, assigned.speed * 0.02) : 1;
  const duration = Math.max(5, Math.round(req.duration_sec * speedBonus));
  const ends = new Date(Date.now() + duration * 1000).toISOString();

  db.prepare(
    `UPDATE requests SET status = 'in_progress', vehicle_id = ?, started_at = ?, ends_at = ?, duration_sec = ? WHERE id = ?`,
  ).run(vehicle.id, nowIso(), ends, duration, requestId);
  db.prepare(`UPDATE vehicles SET status = 'on_mission' WHERE id = ?`).run(vehicle.id);

  const user = getUser(userId);
  if (user.tutorial_done === 0) {
    db.prepare('UPDATE users SET tutorial_step = MAX(tutorial_step, 5) WHERE id = ?').run(userId);
  }

  bumpVersion(userId);
  return getBaseState(userId);
}

export function claimRequest(userId: string, requestId: string) {
  settleRequestTimers(userId);
  const req = db.prepare('SELECT * FROM requests WHERE id = ? AND user_id = ?').get(requestId, userId) as any;
  if (!req) throw Object.assign(new Error('Заявка не найдена'), { statusCode: 404 });
  if (req.status !== 'ready') throw Object.assign(new Error('Заявка ещё не готова'), { statusCode: 400 });

  const reward = parseJson<Partial<Record<ResourceType, number>>>(req.reward_json);
  const warehouse = db.prepare(`SELECT * FROM buildings WHERE user_id = ? AND type = 'warehouse'`).get(userId) as any;
  const command = db.prepare(`SELECT * FROM buildings WHERE user_id = ? AND type = 'command'`).get(userId) as any;

  for (const [k, v] of Object.entries(reward)) {
    const type = k as ResourceType;
    const cap = capacityFor(type, warehouse?.level ?? 1, command?.level ?? 1);
    addResource(userId, type, v ?? 0, 'request_reward', requestId, type === 'badges' ? undefined : cap);
  }
  addXp(userId, req.xp);

  let quality = 'Штатное выполнение';
  if (req.vehicle_id) {
    const v = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.vehicle_id) as any;
    if (v && v.condition > 80 && v.reliability >= 8) quality = 'Отличное выполнение';
    if (v && v.condition > 90 && v.reliability >= 9) quality = 'Образцовое выполнение';
  }

  db.prepare(`UPDATE requests SET status = 'claimed', quality = ? WHERE id = ?`).run(quality, requestId);
  bumpQuest(userId, 'requestsCompleted');

  const user = getUser(userId);
  if (user.tutorial_done === 0 && req.type === 'tutorial_delivery') {
    db.prepare('UPDATE users SET tutorial_step = 7, tutorial_done = 0 WHERE id = ?').run(userId);
  }

  bumpVersion(userId);
  spawnRequests(userId);
  return { ...getBaseState(userId), lastQuality: quality };
}

export function assignSpecialist(userId: string, specialistId: string, buildingId: string | null) {
  const spec = db.prepare('SELECT * FROM specialists WHERE id = ? AND user_id = ?').get(specialistId, userId) as any;
  if (!spec) throw Object.assign(new Error('Специалист не найден'), { statusCode: 404 });

  if (spec.assigned_building_id) {
    db.prepare('UPDATE buildings SET assigned_specialist_id = NULL WHERE id = ?').run(spec.assigned_building_id);
  }

  if (buildingId) {
    const b = db.prepare('SELECT * FROM buildings WHERE id = ? AND user_id = ?').get(buildingId, userId) as any;
    if (!b || b.level <= 0) throw Object.assign(new Error('Здание недоступно'), { statusCode: 400 });
    if (b.assigned_specialist_id) {
      db.prepare('UPDATE specialists SET assigned_building_id = NULL WHERE id = ?').run(b.assigned_specialist_id);
    }
    db.prepare('UPDATE buildings SET assigned_specialist_id = ? WHERE id = ?').run(specialistId, buildingId);
    db.prepare('UPDATE specialists SET assigned_building_id = ? WHERE id = ?').run(buildingId, specialistId);
  } else {
    db.prepare('UPDATE specialists SET assigned_building_id = NULL WHERE id = ?').run(specialistId);
  }

  bumpQuest(userId, 'assignments');
  bumpVersion(userId);
  return getBaseState(userId);
}

export function claimOffline(userId: string) {
  tickProduction(userId);
  const user = getUser(userId);
  const last = new Date(user.last_offline_claim_at).getTime();
  const hours = Math.min(OFFLINE_CAP_HOURS, Math.max(0, (Date.now() - last) / 3_600_000));
  if (hours < 0.01) {
    throw Object.assign(new Error('Офлайн-доход пока недоступен'), { statusCode: 400 });
  }

  const buildings = db.prepare('SELECT * FROM buildings WHERE user_id = ?').all(userId) as any[];
  const warehouse = buildings.find((b) => b.type === 'warehouse');
  const command = buildings.find((b) => b.type === 'command');
  const gained: Partial<Record<ResourceType, number>> = {};

  for (const b of buildings) {
    const def = buildingDef(b.type);
    if (!def.produces || b.level <= 0) continue;
    let bonus = 1;
    if (b.assigned_specialist_id) {
      const spec = db.prepare('SELECT * FROM specialists WHERE id = ?').get(b.assigned_specialist_id) as any;
      if (spec) bonus += spec.speed * 0.01;
    }
    const amount = def.ratePerHour * b.level * hours * bonus * 0.85;
    const cap = capacityFor(def.produces, warehouse?.level ?? 1, command?.level ?? 1);
    const before = getResourcesMap(userId)[def.produces];
    const room = Math.max(0, cap - before);
    const add = Math.min(amount, room);
    if (add > 0) {
      addResource(userId, def.produces, add, 'offline', undefined, cap);
      gained[def.produces] = (gained[def.produces] ?? 0) + add;
    }
  }

  db.prepare('UPDATE users SET last_offline_claim_at = ? WHERE id = ?').run(nowIso(), userId);
  bumpQuest(userId, 'offlineClaims');
  bumpVersion(userId);
  return { ...getBaseState(userId), offlineGained: gained, offlineHours: Number(hours.toFixed(2)) };
}

export function claimQuest(userId: string, questId: string) {
  ensureDailyQuests(userId);
  const q = db.prepare('SELECT * FROM quests WHERE id = ? AND user_id = ?').get(questId, userId) as any;
  if (!q) throw Object.assign(new Error('Задание не найдено'), { statusCode: 404 });
  if (q.claimed) throw Object.assign(new Error('Уже получено'), { statusCode: 400 });
  if (q.progress < q.target) throw Object.assign(new Error('Задание не выполнено'), { statusCode: 400 });

  const reward = parseJson<Partial<Record<ResourceType, number>>>(q.reward_json);
  for (const [k, v] of Object.entries(reward)) {
    addResource(userId, k as ResourceType, v ?? 0, 'quest', questId);
  }
  db.prepare('UPDATE quests SET claimed = 1 WHERE id = ?').run(questId);
  bumpVersion(userId);
  return getBaseState(userId);
}

export function advanceTutorial(userId: string, step: number) {
  const user = getUser(userId);
  const next = Math.max(user.tutorial_step, step);
  const done = next >= 8 ? 1 : 0;
  db.prepare('UPDATE users SET tutorial_step = ?, tutorial_done = ? WHERE id = ?').run(next, done, userId);
  if (done) {
    // Day 1 starter rewards once
    const already = db
      .prepare(`SELECT id FROM resource_transactions WHERE user_id = ? AND reason = 'tutorial_complete' LIMIT 1`)
      .get(userId);
    if (!already) {
      addResource(userId, 'badges', 100, 'tutorial_complete');
      addResource(userId, 'materials', 80, 'tutorial_complete');
      const hasMechanic = db.prepare(`SELECT id FROM specialists WHERE user_id = ? AND template_id = 'mechanic_petr'`).get(userId);
      if (!hasMechanic) {
        const s = SPECIALIST_TEMPLATES.find((x) => x.templateId === 'mechanic_petr')!;
        db.prepare(
          `INSERT INTO specialists (id, user_id, template_id, name, role, rarity, level, management, speed, reliability)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        ).run(randomUUID(), userId, s.templateId, s.name, s.role, s.rarity, s.management, s.speed, s.reliability);
      }
    }
  }
  bumpVersion(userId);
  return getBaseState(userId);
}
