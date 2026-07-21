import { randomUUID } from 'node:crypto';
import {
  ACHIEVEMENTS,
  BUILDINGS,
  DAILY_QUESTS,
  OFFLINE_CAP_HOURS,
  OPERATIONS,
  OPERATION_REGION_EFFECTS,
  REGION_NODES,
  REQUEST_DEFS,
  SHOP_ITEMS,
  SPECIALIST_TEMPLATES,
  STORY_CHAPTERS,
  VEHICLE_TEMPLATES,
  capacityFor,
  operationResultLabel,
  upgradeCost,
  upgradeDurationSec,
  vehicleRepairCost,
  vehicleUpgradeCost,
  xpToLevel,
  type BuildingType,
  type ResourceType,
  type RequestType,
} from './config/balance.js';
import { db } from './db.js';

const automationGuard = new Set<string>();

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
      `INSERT INTO quest_counters (user_id, requests_completed, upgrades, collects, offline_claims, assignments, operations, day_key)
       VALUES (?, 0, 0, 0, 0, 0, 0, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         requests_completed=0, upgrades=0, collects=0, offline_claims=0, assignments=0, operations=0, day_key=excluded.day_key`,
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
    operations: 'operations',
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

  const buildings = db.prepare('SELECT type, level FROM buildings WHERE user_id = ?').all(userId) as any[];
  const unlocked = new Set(buildings.filter((b) => b.level > 0).map((b) => b.type));

  while (open.c < maxOpen) {
    const pool = REQUEST_DEFS.filter((r) => {
      if (r.type === 'tutorial_delivery') return false;
      if (!r.requiredBuilding) return true;
      return unlocked.has(r.requiredBuilding);
    });
    if (!pool.length) break;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    insertRequest(userId, pick.type);
    open.c += 1;
  }
}

function ensureMetaRows(userId: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO player_stats (user_id, requests_total, collects_total, operations_total) VALUES (?, 0, 0, 0)`,
  ).run(userId);
  db.prepare(`INSERT OR IGNORE INTO automation (user_id, auto_collect, auto_simple_requests) VALUES (?, 0, 0)`).run(userId);
  db.prepare(`INSERT OR IGNORE INTO story_progress (user_id, chapter) VALUES (?, 1)`).run(userId);
  for (const a of ACHIEVEMENTS) {
    db.prepare(
      `INSERT OR IGNORE INTO achievements (user_id, achievement_id, progress, unlocked, claimed) VALUES (?, ?, 0, 0, 0)`,
    ).run(userId, a.id);
  }
  ensureRegion(userId);
}

function ensureRegion(userId: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO region_state (user_id, stability, last_event, updated_at) VALUES (?, 62, NULL, ?)`,
  ).run(userId, nowIso());
  for (const node of REGION_NODES) {
    db.prepare(
      `INSERT OR IGNORE INTO region_nodes (user_id, node_id, name, status) VALUES (?, ?, ?, ?)`,
    ).run(userId, node.id, node.name, node.initialStatus);
  }
}

function syncRegionFromBuildings(userId: string): void {
  ensureRegion(userId);
  const buildings = db.prepare('SELECT type, level FROM buildings WHERE user_id = ?').all(userId) as any[];
  const has = (type: string) => buildings.some((b) => b.type === type && b.level > 0);
  if (has('warehouse')) setRegionNode(userId, 'depot', 'secured');
  if (has('comms')) setRegionNode(userId, 'comms_node', 'secured');
  if (has('medical')) setRegionNode(userId, 'med', 'secured');
}

function setRegionNode(userId: string, nodeId: string, status: string): void {
  const node = REGION_NODES.find((n) => n.id === nodeId);
  if (!node) return;
  db.prepare(
    `INSERT INTO region_nodes (user_id, node_id, name, status) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, node_id) DO UPDATE SET status = excluded.status, name = excluded.name`,
  ).run(userId, nodeId, node.name, status);
}

function adjustRegionStability(userId: string, delta: number, event?: string): number {
  ensureRegion(userId);
  const row = db.prepare('SELECT stability FROM region_state WHERE user_id = ?').get(userId) as any;
  const next = Math.max(20, Math.min(100, (row?.stability ?? 62) + delta));
  db.prepare(`UPDATE region_state SET stability = ?, last_event = ?, updated_at = ? WHERE user_id = ?`).run(
    next,
    event ?? null,
    nowIso(),
    userId,
  );
  return next;
}

function getRegionView(userId: string) {
  syncRegionFromBuildings(userId);
  const state = db.prepare('SELECT * FROM region_state WHERE user_id = ?').get(userId) as any;
  const nodes = db.prepare('SELECT node_id as id, name, status FROM region_nodes WHERE user_id = ?').all(userId) as any[];
  return {
    id: 'training',
    name: 'Учебный район «Сосновый тыл»',
    stability: state?.stability ?? 62,
    lastEvent: state?.last_event ?? null,
    nodes,
  };
}

function canAfford(userId: string, cost: Partial<Record<ResourceType, number>>): boolean {
  const resources = getResourcesMap(userId);
  return Object.entries(cost).every(([k, v]) => (resources[k as ResourceType] ?? 0) >= (v ?? 0));
}

function pickIdleVehicle(userId: string, vehicleId?: string) {
  if (vehicleId) {
    return db.prepare('SELECT * FROM vehicles WHERE id = ? AND user_id = ?').get(vehicleId, userId) as any;
  }
  return db
    .prepare(`SELECT * FROM vehicles WHERE user_id = ? AND status = 'idle' AND condition >= 35 ORDER BY speed DESC`)
    .get(userId) as any;
}

function grantSpecialist(userId: string, templateId: string): void {
  const exists = db.prepare(`SELECT id FROM specialists WHERE user_id = ? AND template_id = ?`).get(userId, templateId);
  if (exists) return;
  const s = SPECIALIST_TEMPLATES.find((x) => x.templateId === templateId);
  if (!s) return;
  db.prepare(
    `INSERT INTO specialists (id, user_id, template_id, name, role, rarity, level, management, speed, reliability)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
  ).run(randomUUID(), userId, s.templateId, s.name, s.role, s.rarity, s.management, s.speed, s.reliability);
}

function grantVehicle(userId: string, templateId: string): void {
  const exists = db.prepare(`SELECT id FROM vehicles WHERE user_id = ? AND template_id = ?`).get(userId, templateId);
  if (exists) return;
  const v = VEHICLE_TEMPLATES.find((x) => x.templateId === templateId);
  if (!v) return;
  db.prepare(
    `INSERT INTO vehicles (id, user_id, template_id, name, category, level, condition, capacity, speed, reliability, fuel_use, status)
     VALUES (?, ?, ?, ?, ?, 1, 100, ?, ?, ?, ?, 'idle')`,
  ).run(randomUUID(), userId, v.templateId, v.name, v.category, v.capacity, v.speed, v.reliability, v.fuelUse);
}

function syncAchievements(userId: string): void {
  ensureMetaRows(userId);
  const stats = db.prepare('SELECT * FROM player_stats WHERE user_id = ?').get(userId) as any;
  const buildings = db.prepare('SELECT type, level FROM buildings WHERE user_id = ?').all(userId) as any[];
  const auto = db.prepare('SELECT * FROM automation WHERE user_id = ?').get(userId) as any;
  const story = db.prepare('SELECT chapter FROM story_progress WHERE user_id = ?').get(userId) as any;
  const region = db.prepare('SELECT stability FROM region_state WHERE user_id = ?').get(userId) as any;
  const command = buildings.find((b) => b.type === 'command');
  const metrics: Record<string, number> = {
    requestsTotal: stats?.requests_total ?? 0,
    collectsTotal: stats?.collects_total ?? 0,
    repairUnlocked: buildings.some((b) => b.type === 'repair' && b.level > 0) ? 1 : 0,
    commsUnlocked: buildings.some((b) => b.type === 'comms' && b.level > 0) ? 1 : 0,
    commandLevel: command?.level ?? 1,
    autoCollect: auto?.auto_collect ? 1 : 0,
    autoSimpleRequests: auto?.auto_simple_requests ? 1 : 0,
    repairsTotal: stats?.repairs_total ?? 0,
    regionStability: region?.stability ?? 62,
    storyChapter: story?.chapter ?? 1,
  };
  for (const op of OPERATIONS) {
    const done = db
      .prepare(`SELECT COUNT(*) as c FROM operations WHERE user_id = ? AND def_id = ? AND claimed = 1`)
      .get(userId, op.id) as { c: number };
    metrics[op.id] = done.c > 0 ? 1 : 0;
  }

  for (const a of ACHIEVEMENTS) {
    const progress = metrics[a.metric] ?? 0;
    const unlocked = progress >= a.target ? 1 : 0;
    db.prepare(
      `UPDATE achievements SET progress = ?, unlocked = CASE WHEN ? = 1 THEN 1 ELSE unlocked END,
       unlocked_at = CASE WHEN ? = 1 AND unlocked_at IS NULL THEN ? ELSE unlocked_at END
       WHERE user_id = ? AND achievement_id = ?`,
    ).run(progress, unlocked, unlocked, nowIso(), userId, a.id);
  }
}

function settleOperations(userId: string): void {
  const now = nowIso();
  const rows = db
    .prepare(`SELECT * FROM operations WHERE user_id = ? AND status = 'in_progress' AND ends_at IS NOT NULL AND ends_at <= ?`)
    .all(userId, now) as any[];
  for (const row of rows) {
    db.prepare(`UPDATE operations SET status = 'ready' WHERE id = ?`).run(row.id);
  }
}

function runAutomation(userId: string): void {
  if (automationGuard.has(userId)) return;
  automationGuard.add(userId);
  try {
    ensureMetaRows(userId);
    const auto = db.prepare('SELECT * FROM automation WHERE user_id = ?').get(userId) as any;
    if (!auto) return;

    if (auto.auto_collect) {
      const buildings = db.prepare(`SELECT * FROM buildings WHERE user_id = ? AND stored >= 8`).all(userId) as any[];
      const warehouse = buildings.find((b) => b.type === 'warehouse');
      const command = buildings.find((b) => b.type === 'command');
      let collected = 0;
      for (const b of buildings) {
        const def = BUILDINGS.find((x) => x.type === b.type);
        if (!def?.produces || b.stored <= 0) continue;
        const cap = capacityFor(def.produces, warehouse?.level ?? 1, command?.level ?? 1);
        addResource(userId, def.produces, b.stored, 'auto_collect', b.id, cap);
        db.prepare('UPDATE buildings SET stored = 0 WHERE id = ?').run(b.id);
        db.prepare(`UPDATE player_stats SET collects_total = collects_total + 1 WHERE user_id = ?`).run(userId);
        collected += 1;
      }
      if (collected > 0) {
        db.prepare(`UPDATE users SET last_auto_action = ? WHERE id = ?`).run(`Автосбор: ${collected} объектов`, userId);
      }
    }

    if (auto.auto_simple_requests) {
      settleRequestTimers(userId);
      const ready = db
        .prepare(
          `SELECT id FROM requests WHERE user_id = ? AND status = 'ready' AND difficulty <= 1 ORDER BY created_at LIMIT 4`,
        )
        .all(userId) as any[];
      for (const row of ready) {
        try {
          claimRequest(userId, row.id);
          db.prepare(`UPDATE users SET last_auto_action = ? WHERE id = ?`).run('Автозаявка получена', userId);
        } catch {
          /* ignore */
        }
      }

      const available = db
        .prepare(
          `SELECT * FROM requests WHERE user_id = ? AND status = 'available' AND difficulty <= 1 ORDER BY created_at LIMIT 3`,
        )
        .all(userId) as any[];
      for (const req of available) {
        const vehicle = pickIdleVehicle(userId);
        if (!vehicle) break;
        const baseCost = parseJson<Partial<Record<ResourceType, number>>>(req.cost_json);
        const cost = { ...baseCost, fuel: (baseCost.fuel ?? 0) + Math.max(1, vehicle.fuel_use ?? 1) };
        if (!canAfford(userId, cost)) continue;
        try {
          startRequest(userId, req.id, vehicle.id);
          db.prepare(`UPDATE users SET last_auto_action = ? WHERE id = ?`).run(`Автостарт: ${req.title}`, userId);
        } catch {
          /* ignore */
        }
      }
    }
  } finally {
    automationGuard.delete(userId);
  }
}

function evaluateStoryObjective(userId: string) {
  ensureMetaRows(userId);
  const row = db.prepare('SELECT * FROM story_progress WHERE user_id = ?').get(userId) as any;
  const chapter = row?.chapter ?? 1;
  const def = STORY_CHAPTERS.find((c) => c.id === chapter) || STORY_CHAPTERS[0];
  const obj = def.objective;
  let progress = 0;
  let target = 1;
  let done = false;

  if (obj.type === 'requests') {
    const stats = db.prepare('SELECT requests_total FROM player_stats WHERE user_id = ?').get(userId) as any;
    progress = stats?.requests_total ?? 0;
    target = Number(obj.target);
    done = progress >= target;
  } else if (obj.type === 'building_level') {
    const [type, lvl] = String(obj.target).split(':');
    const b = db.prepare('SELECT level FROM buildings WHERE user_id = ? AND type = ?').get(userId, type) as any;
    progress = b?.level ?? 0;
    target = Number(lvl);
    done = progress >= target;
  } else if (obj.type === 'operation') {
    const doneOp = db
      .prepare(`SELECT COUNT(*) as c FROM operations WHERE user_id = ? AND def_id = ? AND claimed = 1`)
      .get(userId, String(obj.target)) as { c: number };
    progress = doneOp.c > 0 ? 1 : 0;
    target = 1;
    done = progress >= 1;
  } else if (obj.type === 'region_node') {
    const node = db
      .prepare(`SELECT status FROM region_nodes WHERE user_id = ? AND node_id = ?`)
      .get(userId, String(obj.target)) as any;
    progress = node?.status === 'secured' ? 1 : 0;
    target = 1;
    done = progress >= 1;
  } else if (obj.type === 'stability') {
    const region = db.prepare('SELECT stability FROM region_state WHERE user_id = ?').get(userId) as any;
    progress = region?.stability ?? 0;
    target = Number(obj.target);
    done = progress >= target;
  }

  if (done && !row?.objective_done) {
    db.prepare(`UPDATE story_progress SET objective_done = 1 WHERE user_id = ?`).run(userId);
  }
  return { chapter, def, progress, target, done: done || !!row?.objective_done, claimed: (row?.claimed_reward_chapter ?? 0) >= chapter };
}

function storyFor(userId: string) {
  const evaled = evaluateStoryObjective(userId);
  return {
    chapter: evaled.chapter,
    title: evaled.def.title,
    text: evaled.def.text,
    total: STORY_CHAPTERS.length,
    objective: evaled.def.objective.label,
    objectiveProgress: evaled.progress,
    objectiveTarget: evaled.target,
    objectiveDone: evaled.done,
    canClaim: evaled.done && !evaled.claimed,
    reward: evaled.def.reward,
  };
}

function speedMultiplier(userId: string): number {
  const user = getUser(userId);
  if (user.speed_boost_until && new Date(user.speed_boost_until).getTime() > Date.now()) return 0.9;
  const comms = db.prepare(`SELECT level FROM buildings WHERE user_id = ? AND type = 'comms'`).get(userId) as any;
  return comms?.level > 0 ? 1 - Math.min(0.2, comms.level * 0.03) : 1;
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
    ensureMetaRows(id);
    spawnRequests(id, true);
  });
  tx();
  return getBaseState(id);
}

export function getBaseState(userId: string) {
  getUser(userId);
  ensureMetaRows(userId);
  tickProduction(userId);
  settleRequestTimers(userId);
  settleOperations(userId);
  runAutomation(userId);
  spawnRequests(userId);
  ensureDailyQuests(userId);
  syncAchievements(userId);

  // Ensure newly added building types exist for older saves
  for (const b of BUILDINGS) {
    const exists = db.prepare('SELECT id FROM buildings WHERE user_id = ? AND type = ?').get(userId, b.type);
    if (!exists) {
      db.prepare(
        `INSERT INTO buildings (id, user_id, type, level, state, stored, last_tick_at)
         VALUES (?, ?, ?, 0, 'locked', 0, ?)`,
      ).run(randomUUID(), userId, b.type, nowIso());
    }
  }

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

  const operations = db
    .prepare(`SELECT * FROM operations WHERE user_id = ? AND status != 'claimed' ORDER BY created_at DESC LIMIT 10`)
    .all(userId)
    .map((o: any) => ({
      ...o,
      reward: parseJson(o.reward_json),
      claimed: !!o.claimed,
    }));

  const availableOperations = OPERATIONS.map((op) => {
    const locked = (command?.level ?? 1) < op.minCommandLevel;
    const active = (operations as any[]).find((o) => o.def_id === op.id && o.status !== 'claimed');
    return {
      ...op,
      locked,
      active: active || null,
    };
  });

  const achievements = ACHIEVEMENTS.map((a) => {
    const row = db.prepare(`SELECT * FROM achievements WHERE user_id = ? AND achievement_id = ?`).get(userId, a.id) as any;
    return {
      ...a,
      progress: row?.progress ?? 0,
      unlocked: !!row?.unlocked,
      claimed: !!row?.claimed,
    };
  });

  const automation = db.prepare('SELECT * FROM automation WHERE user_id = ?').get(userId) as any;
  const shop = SHOP_ITEMS.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    costBadges: item.costBadges,
  }));

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
      speedBoostUntil: user.speed_boost_until,
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
        unlockLevel: def.unlockLevel,
      };
    }),
    specialists,
    vehicles,
    requests,
    quests,
    operations,
    availableOperations,
    achievements,
    shop,
    automation: {
      autoCollect: !!automation?.auto_collect,
      autoSimpleRequests: !!automation?.auto_simple_requests,
      unlockAutoCollect: (command?.level ?? 1) >= 2,
      unlockAutoRequests: (command?.level ?? 1) >= 4,
      lastAction: user.last_auto_action || null,
    },
    story: storyFor(userId),
    offline: {
      hoursAvailable: Number(offlineHours.toFixed(2)),
      capHours: OFFLINE_CAP_HOURS,
      lastClaimAt: user.last_offline_claim_at,
    },
    region: getRegionView(userId),
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

  // Unlock specialists / vehicles with buildings
  if (b.level <= 0 && b.type === 'repair') {
    grantSpecialist(userId, 'mechanic_petr');
    grantVehicle(userId, 'repair_evac');
  }
  if (b.level <= 0 && b.type === 'medical') {
    grantSpecialist(userId, 'medic_anna');
    grantVehicle(userId, 'ambulance');
  }
  if (b.level <= 0 && b.type === 'comms') {
    grantSpecialist(userId, 'comms_kirill');
    grantVehicle(userId, 'comms_van');
  }
  if (b.level <= 0 && b.type === 'engineering') {
    grantSpecialist(userId, 'engineer_mira');
    grantVehicle(userId, 'eng_dozer');
  }
  if (b.level <= 0 && b.type === 'training') {
    grantSpecialist(userId, 'instructor_vera');
  }
  if (b.level <= 0 && b.type === 'food_hub') {
    grantVehicle(userId, 'field_kitchen');
  }
  if (b.type === 'warehouse' && targetLevel >= 3) {
    grantVehicle(userId, 'loader');
  }
  if (b.type === 'training' && targetLevel >= 2) {
    grantSpecialist(userId, 'psych_dmitry');
  }
  if (b.type === 'command' && targetLevel >= 5) {
    grantSpecialist(userId, 'commander_nazar');
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
  db.prepare(`UPDATE player_stats SET collects_total = collects_total + 1 WHERE user_id = ?`).run(userId);
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

  const vehicle = pickIdleVehicle(userId, vehicleId);
  if (!vehicle || vehicle.status !== 'idle') {
    throw Object.assign(new Error('Нет свободного транспорта'), { statusCode: 400 });
  }
  if (vehicle.condition < 35) {
    throw Object.assign(new Error('Техника требует ремонта'), { statusCode: 400 });
  }

  const baseCost = parseJson<Partial<Record<ResourceType, number>>>(req.cost_json);
  const cost: Partial<Record<ResourceType, number>> = {
    ...baseCost,
    fuel: (baseCost.fuel ?? 0) + Math.max(1, vehicle.fuel_use ?? 1),
  };
  spendResources(userId, cost, 'request_start', requestId);

  const assigned = db
    .prepare(
      `SELECT s.* FROM specialists s
       JOIN buildings b ON b.assigned_specialist_id = s.id
       WHERE b.user_id = ? AND b.type IN ('motorpool','warehouse','repair','medical','comms','engineering')
       LIMIT 1`,
    )
    .get(userId) as any;
  const conditionFactor = vehicle.condition < 60 ? 1.25 : vehicle.condition < 80 ? 1.1 : 1;
  const vehicleSpeedFactor = Math.max(0.7, 6 / Math.max(3, vehicle.speed));
  const speedBonus =
    (assigned ? 1 - Math.min(0.35, assigned.speed * 0.02) : 1) * speedMultiplier(userId) * conditionFactor * vehicleSpeedFactor;
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
  db.prepare(`UPDATE player_stats SET requests_total = requests_total + 1 WHERE user_id = ?`).run(userId);

  // Online race + clan weekly contribution
  const raceDay = new Date().toISOString().slice(0, 10);
  db.prepare(
    `INSERT INTO race_scores (user_id, day_key, requests) VALUES (?, ?, 1)
     ON CONFLICT(user_id, day_key) DO UPDATE SET requests = requests + 1`,
  ).run(userId, raceDay);
  const membership = db.prepare('SELECT * FROM clan_members WHERE user_id = ?').get(userId) as any;
  if (membership) {
    db.prepare(`UPDATE clan_members SET contribution = contribution + 1 WHERE user_id = ?`).run(userId);
    db.prepare(`UPDATE clans SET weekly_progress = weekly_progress + 1, xp = xp + 2 WHERE id = ?`).run(membership.clan_id);
  }

  const user = getUser(userId);
  if (user.tutorial_done === 0 && req.type === 'tutorial_delivery') {
    db.prepare('UPDATE users SET tutorial_step = 7, tutorial_done = 0 WHERE id = ?').run(userId);
  }

  // Soft story progress hint (actual chapter advance is claim-gated)
  evaluateStoryObjective(userId);

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
    const already = db
      .prepare(`SELECT id FROM resource_transactions WHERE user_id = ? AND reason = 'tutorial_complete' LIMIT 1`)
      .get(userId);
    if (!already) {
      addResource(userId, 'badges', 100, 'tutorial_complete');
      addResource(userId, 'materials', 80, 'tutorial_complete');
      grantSpecialist(userId, 'mechanic_petr');
    }
  }
  bumpVersion(userId);
  return getBaseState(userId);
}

export function startOperation(userId: string, defId: string) {
  tickProduction(userId);
  settleOperations(userId);
  const def = OPERATIONS.find((o) => o.id === defId);
  if (!def) throw Object.assign(new Error('Операция не найдена'), { statusCode: 404 });

  const command = db.prepare(`SELECT * FROM buildings WHERE user_id = ? AND type = 'command'`).get(userId) as any;
  if ((command?.level ?? 1) < def.minCommandLevel) {
    throw Object.assign(new Error('Недостаточный уровень командного пункта'), { statusCode: 400 });
  }

  const active = db
    .prepare(`SELECT id FROM operations WHERE user_id = ? AND status IN ('in_progress','ready') LIMIT 1`)
    .get(userId);
  if (active) throw Object.assign(new Error('Уже есть активная операция'), { statusCode: 400 });

  spendResources(userId, def.cost, 'operation_start', defId);

  const buildings = db.prepare('SELECT * FROM buildings WHERE user_id = ?').all(userId) as any[];
  const specialists = db.prepare('SELECT * FROM specialists WHERE user_id = ?').all(userId) as any[];
  const vehicles = db.prepare('SELECT * FROM vehicles WHERE user_id = ?').all(userId) as any[];

  const supply = Math.min(1, (buildings.find((b) => b.type === 'warehouse')?.level ?? 0) / 6);
  const mobility = Math.min(
    1,
    (buildings.find((b) => b.type === 'motorpool')?.level ?? 0) / 6 + vehicles.filter((v) => v.status === 'idle').length * 0.05,
  );
  const comms = Math.min(1, (buildings.find((b) => b.type === 'comms')?.level ?? 0) / 5);
  const engineering = Math.min(1, (buildings.find((b) => b.type === 'engineering')?.level ?? 0) / 5);
  const morale = Math.min(
    1,
    0.4 + specialists.length * 0.05 + (buildings.find((b) => b.type === 'food_hub')?.level ?? 0) * 0.05,
  );

  const weighted =
    supply * def.weights.supply +
    mobility * def.weights.mobility +
    comms * def.weights.comms +
    engineering * def.weights.engineering +
    morale * def.weights.morale;

  // Base competence so early operations are usually at least partial success.
  const prep = 0.42 + weighted * 0.58;

  const teamBonus = Math.min(0.25, specialists.reduce((s, x) => s + x.management + x.reliability, 0) * 0.004);
  const vehicleBonus = Math.min(0.15, vehicles.reduce((s, x) => s + x.reliability, 0) * 0.004);
  const randomFactor = 0.925 + Math.random() * 0.15;
  const score = Math.max(0, Math.min(1.2, prep * (1 + teamBonus + vehicleBonus) * randomFactor));
  const label = operationResultLabel(score);
  const duration = Math.max(20, Math.round(def.durationSec * speedMultiplier(userId)));
  const ends = new Date(Date.now() + duration * 1000).toISOString();

  const rewardScale = score < 0.45 ? 0.25 : score < 0.6 ? 0.55 : score < 0.78 ? 0.85 : score < 0.92 ? 1 : 1.2;
  const reward: Partial<Record<ResourceType, number>> = {};
  for (const [k, v] of Object.entries(def.reward)) {
    reward[k as ResourceType] = Math.round((v ?? 0) * rewardScale);
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO operations (id, user_id, def_id, title, status, score, result_label, reward_json, started_at, ends_at, claimed, created_at)
     VALUES (?, ?, ?, ?, 'in_progress', ?, ?, ?, ?, ?, 0, ?)`,
  ).run(id, userId, def.id, def.title, score, label, JSON.stringify(reward), nowIso(), ends, nowIso());

  bumpVersion(userId);
  return getBaseState(userId);
}

export function claimOperation(userId: string, operationId: string) {
  settleOperations(userId);
  const op = db.prepare('SELECT * FROM operations WHERE id = ? AND user_id = ?').get(operationId, userId) as any;
  if (!op) throw Object.assign(new Error('Операция не найдена'), { statusCode: 404 });
  if (op.status !== 'ready') throw Object.assign(new Error('Операция ещё идёт'), { statusCode: 400 });
  if (op.claimed) throw Object.assign(new Error('Награда уже получена'), { statusCode: 400 });

  const reward = parseJson<Partial<Record<ResourceType, number>>>(op.reward_json);
  for (const [k, v] of Object.entries(reward)) {
    addResource(userId, k as ResourceType, v ?? 0, 'operation_reward', operationId);
  }
  const def = OPERATIONS.find((o) => o.id === op.def_id);
  if (def) addXp(userId, Math.round(def.xp * Math.min(1.2, op.score || 0.7)));

  db.prepare(`UPDATE operations SET claimed = 1, status = 'claimed' WHERE id = ?`).run(operationId);
  bumpQuest(userId, 'operations');
  db.prepare(`UPDATE player_stats SET operations_total = operations_total + 1 WHERE user_id = ?`).run(userId);

  const effect = OPERATION_REGION_EFFECTS[op.def_id];
  if (effect) {
    if (effect.nodeId && effect.nodeStatus) setRegionNode(userId, effect.nodeId, effect.nodeStatus);
    const score = op.score ?? 0.7;
    const delta = Math.round(effect.stabilityDelta * (score < 0.45 ? 0.25 : score < 0.6 ? 0.55 : score < 0.78 ? 0.85 : 1));
    adjustRegionStability(userId, delta, op.result_label || op.title);
  } else if ((op.score ?? 0) < 0.45) {
    adjustRegionStability(userId, -4, 'Сбой операции');
  }

  evaluateStoryObjective(userId);
  grantSpecialist(userId, 'coord_leon');
  bumpVersion(userId);
  return { ...getBaseState(userId), lastQuality: op.result_label };
}

export function setAutomation(userId: string, opts: { autoCollect?: boolean; autoSimpleRequests?: boolean }) {
  ensureMetaRows(userId);
  const command = db.prepare(`SELECT level FROM buildings WHERE user_id = ? AND type = 'command'`).get(userId) as any;
  const level = command?.level ?? 1;
  if (opts.autoCollect && level < 2) {
    throw Object.assign(new Error('Автосбор открывается с КП 2'), { statusCode: 400 });
  }
  if (opts.autoSimpleRequests && level < 4) {
    throw Object.assign(new Error('Автозаявки открываются с КП 4'), { statusCode: 400 });
  }
  const current = db.prepare('SELECT * FROM automation WHERE user_id = ?').get(userId) as any;
  const autoCollect = opts.autoCollect === undefined ? current.auto_collect : opts.autoCollect ? 1 : 0;
  const autoReq = opts.autoSimpleRequests === undefined ? current.auto_simple_requests : opts.autoSimpleRequests ? 1 : 0;
  db.prepare(`UPDATE automation SET auto_collect = ?, auto_simple_requests = ? WHERE user_id = ?`).run(autoCollect, autoReq, userId);
  bumpVersion(userId);
  return getBaseState(userId);
}

export function claimAchievement(userId: string, achievementId: string) {
  syncAchievements(userId);
  const row = db.prepare(`SELECT * FROM achievements WHERE user_id = ? AND achievement_id = ?`).get(userId, achievementId) as any;
  if (!row) throw Object.assign(new Error('Достижение не найдено'), { statusCode: 404 });
  if (!row.unlocked) throw Object.assign(new Error('Ещё не открыто'), { statusCode: 400 });
  if (row.claimed) throw Object.assign(new Error('Уже получено'), { statusCode: 400 });
  const def = ACHIEVEMENTS.find((a) => a.id === achievementId);
  if (!def) throw Object.assign(new Error('Нет описания достижения'), { statusCode: 404 });
  for (const [k, v] of Object.entries(def.reward)) {
    addResource(userId, k as ResourceType, v ?? 0, 'achievement', achievementId);
  }
  db.prepare(`UPDATE achievements SET claimed = 1 WHERE user_id = ? AND achievement_id = ?`).run(userId, achievementId);
  bumpVersion(userId);
  return getBaseState(userId);
}

export function buyShopItem(userId: string, itemId: string) {
  const item = SHOP_ITEMS.find((i) => i.id === itemId);
  if (!item) throw Object.assign(new Error('Товар не найден'), { statusCode: 404 });
  spendResources(userId, { badges: item.costBadges }, 'shop', itemId);
  for (const [k, v] of Object.entries(item.reward || {})) {
    addResource(userId, k as ResourceType, v ?? 0, 'shop', itemId);
  }
  if (item.unlockSpecialist) grantSpecialist(userId, item.unlockSpecialist);
  if ((item as any).unlockVehicle) grantVehicle(userId, (item as any).unlockVehicle);
  if (item.effect === 'speed_boost_30m') {
    const until = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    db.prepare(`UPDATE users SET speed_boost_until = ? WHERE id = ?`).run(until, userId);
  }
  bumpVersion(userId);
  return getBaseState(userId);
}

export function advanceStory(userId: string) {
  ensureMetaRows(userId);
  const evaled = evaluateStoryObjective(userId);
  if (!evaled.done) {
    throw Object.assign(new Error('Цель главы ещё не выполнена'), { statusCode: 400 });
  }
  const row = db.prepare('SELECT * FROM story_progress WHERE user_id = ?').get(userId) as any;
  const chapter = row?.chapter ?? 1;
  if ((row?.claimed_reward_chapter ?? 0) < chapter) {
    for (const [k, v] of Object.entries(evaled.def.reward || {})) {
      addResource(userId, k as ResourceType, v ?? 0, 'story_reward', String(chapter));
    }
    db.prepare(`UPDATE story_progress SET claimed_reward_chapter = ? WHERE user_id = ?`).run(chapter, userId);
  }
  if (chapter < STORY_CHAPTERS.length) {
    db.prepare(`UPDATE story_progress SET chapter = ?, objective_done = 0 WHERE user_id = ?`).run(chapter + 1, userId);
    db.prepare(`UPDATE users SET story_chapter = ? WHERE id = ?`).run(chapter + 1, userId);
  }
  bumpVersion(userId);
  return getBaseState(userId);
}

export function repairVehicle(userId: string, vehicleId: string) {
  tickProduction(userId);
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ? AND user_id = ?').get(vehicleId, userId) as any;
  if (!vehicle) throw Object.assign(new Error('Техника не найдена'), { statusCode: 404 });
  if (vehicle.status !== 'idle') throw Object.assign(new Error('Техника на задании'), { statusCode: 400 });
  if (vehicle.condition >= 100) throw Object.assign(new Error('Ремонт не требуется'), { statusCode: 400 });
  const repairBay = db.prepare(`SELECT * FROM buildings WHERE user_id = ? AND type = 'repair'`).get(userId) as any;
  if (!repairBay || repairBay.level <= 0) {
    throw Object.assign(new Error('Нужен ремонтный комплекс'), { statusCode: 400 });
  }
  const cost = vehicleRepairCost(vehicle.condition);
  spendResources(userId, cost, 'vehicle_repair', vehicleId);
  const restored = Math.min(100, vehicle.condition + 25 + repairBay.level * 5);
  db.prepare(`UPDATE vehicles SET condition = ? WHERE id = ?`).run(restored, vehicleId);
  db.prepare(`UPDATE player_stats SET repairs_total = repairs_total + 1 WHERE user_id = ?`).run(userId);
  bumpVersion(userId);
  return getBaseState(userId);
}

export function upgradeVehicle(userId: string, vehicleId: string) {
  tickProduction(userId);
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ? AND user_id = ?').get(vehicleId, userId) as any;
  if (!vehicle) throw Object.assign(new Error('Техника не найдена'), { statusCode: 404 });
  if (vehicle.status !== 'idle') throw Object.assign(new Error('Техника на задании'), { statusCode: 400 });
  if (vehicle.condition < 70) throw Object.assign(new Error('Сначала отремонтируйте технику'), { statusCode: 400 });
  const motorpool = db.prepare(`SELECT * FROM buildings WHERE user_id = ? AND type = 'motorpool'`).get(userId) as any;
  if (!motorpool || motorpool.level < 2) {
    throw Object.assign(new Error('Нужен автопарк 2+ уровня'), { statusCode: 400 });
  }
  if (vehicle.level >= 5) throw Object.assign(new Error('Максимальный уровень техники'), { statusCode: 400 });
  const cost = vehicleUpgradeCost(vehicle.level);
  spendResources(userId, cost, 'vehicle_upgrade', vehicleId);
  db.prepare(
    `UPDATE vehicles SET level = level + 1, capacity = capacity + 5, speed = speed + 1, reliability = MIN(12, reliability + 1) WHERE id = ?`,
  ).run(vehicleId);
  bumpVersion(userId);
  return getBaseState(userId);
}
