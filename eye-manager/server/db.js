'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

const DATA_DIR = process.env.EYE_DATA || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'eye.db');

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${DB_FILE}`;
}

let prisma = null;
let ready = false;

const usersCache = { users: {} };
const sessionsCache = { sessions: {} };
const clubsCache = Object.create(null);
const matchesCache = [];
const cupsCache = { cups: {}, meta: { lastTick: 0 } };
const archiveCache = { entries: [] };
const friendlyQueue = [];
const transferMarket = { list: [], refreshedAt: 0 };
const leaguesCache = { leagues: {}, meta: { lastTick: 0, seasonCounter: 1 } };

let writeChain = Promise.resolve();

function enqueue(label, fn) {
  writeChain = writeChain
    .then(fn)
    .catch((err) => console.error(`[EYE:db] ${label}:`, err && err.message ? err.message : err));
  return writeChain;
}

function parseJson(raw, fallback) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

function userToRow(u) {
  return {
    id: u.id,
    login: String(u.login || ''),
    name: String(u.name || ''),
    salt: String(u.salt || ''),
    hash: String(u.hash || ''),
    createdAt: BigInt(u.createdAt || Date.now()),
    role: String(u.role || 'user'),
    isBot: !!u.isBot,
    level: Number(u.level || 1),
    xp: Number(u.xp || 0),
    cupsPlayed: Number(u.cupsPlayed || 0),
    cupsWon: Number(u.cupsWon || 0),
    teamBound: !!u.teamBound,
    teamCreatedAt: u.teamCreatedAt != null ? BigInt(u.teamCreatedAt) : null,
    clubName: u.clubName != null ? String(u.clubName) : null,
    regIp: u.regIp != null ? String(u.regIp) : null,
    strength: u.strength != null ? Number(u.strength) : null,
    money: Number(u.money != null ? u.money : 500000),
    fans: Number(u.fans != null ? u.fans : 12000),
    boosters: Number(u.boosters != null ? u.boosters : 3),
    fame: Number(u.fame || 0),
    prestige: Number(u.prestige || 0),
    points: Number(u.points || 0),
    lastWageAt: u.lastWageAt != null ? BigInt(u.lastWageAt) : null,
    cupEventsJson: JSON.stringify(Array.isArray(u.cupEvents) ? u.cupEvents : [])
  };
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    login: row.login,
    name: row.name,
    salt: row.salt,
    hash: row.hash,
    createdAt: Number(row.createdAt),
    role: row.role,
    isBot: !!row.isBot,
    level: row.level,
    xp: row.xp,
    cupsPlayed: row.cupsPlayed,
    cupsWon: row.cupsWon,
    teamBound: !!row.teamBound,
    teamCreatedAt: row.teamCreatedAt != null ? Number(row.teamCreatedAt) : null,
    clubName: row.clubName || undefined,
    regIp: row.regIp || undefined,
    strength: row.strength != null ? row.strength : undefined,
    money: row.money,
    fans: row.fans,
    boosters: row.boosters,
    fame: row.fame,
    prestige: row.prestige,
    points: row.points,
    lastWageAt: row.lastWageAt != null ? Number(row.lastWageAt) : undefined,
    cupEvents: parseJson(row.cupEventsJson, [])
  };
}

async function flushUsers() {
  const ids = Object.keys(usersCache.users);
  for (const id of ids) {
    const data = userToRow(usersCache.users[id]);
    await prisma.user.upsert({ where: { id }, create: data, update: data });
  }
}

async function flushSessions() {
  const tokens = Object.keys(sessionsCache.sessions);
  for (const token of tokens) {
    const s = sessionsCache.sessions[token];
    const data = {
      token,
      userId: s.userId,
      createdAt: BigInt(s.createdAt || Date.now()),
      lastAt: BigInt(s.lastAt || Date.now())
    };
    await prisma.session.upsert({
      where: { token },
      create: data,
      update: { userId: data.userId, lastAt: data.lastAt }
    });
  }
  // Drop sessions removed from cache (logout / expiry), or they resurrect on restart.
  if (tokens.length === 0) {
    await prisma.session.deleteMany({});
  } else {
    await prisma.session.deleteMany({ where: { NOT: { token: { in: tokens } } } });
  }
}

async function flushClub(userId) {
  const club = clubsCache[userId];
  if (!club) {
    await prisma.club.delete({ where: { userId } }).catch(() => {});
    return;
  }
  const data = {
    userId,
    name: club.name,
    short: club.short || 'EYE',
    color: club.color || '#1FA65A',
    updatedAt: BigInt(Date.now()),
    dataJson: JSON.stringify(club)
  };
  await prisma.club.upsert({ where: { userId }, create: data, update: data });
}

async function flushMatch(match) {
  if (!match?.id) return;
  const data = {
    id: match.id,
    status: match.status || 'done',
    homeId: String(match.home?.userId || ''),
    awayId: String(match.away?.userId || ''),
    createdAt: BigInt(match.createdAt || Date.now()),
    dataJson: JSON.stringify(match)
  };
  await prisma.matchRec.upsert({ where: { id: match.id }, create: data, update: data });
}

async function flushCups() {
  const ids = new Set(Object.keys(cupsCache.cups || {}));
  for (const id of ids) {
    const cup = cupsCache.cups[id];
    const data = {
      id,
      status: String(cup.status || 'open'),
      bracketId: cup.bracketId || null,
      archived: false,
      updatedAt: BigInt(Date.now()),
      dataJson: JSON.stringify(cup)
    };
    await prisma.cup.upsert({ where: { id }, create: data, update: data });
  }
  // Cups removed from cache (archived/deleted) must leave the active set,
  // otherwise every restart rehydrates ghosts and open cups accumulate.
  if (ids.size === 0) {
    await prisma.cup.updateMany({
      where: { archived: false },
      data: { archived: true, updatedAt: BigInt(Date.now()) }
    });
  } else {
    const stale = await prisma.cup.findMany({
      where: { archived: false, NOT: { id: { in: [...ids] } } },
      select: { id: true }
    });
    if (stale.length) {
      await prisma.cup.updateMany({
        where: { id: { in: stale.map((r) => r.id) } },
        data: { archived: true, updatedAt: BigInt(Date.now()) }
      });
    }
  }
  await prisma.meta.upsert({
    where: { key: 'cups_meta' },
    create: { key: 'cups_meta', valueJson: JSON.stringify(cupsCache.meta || {}) },
    update: { valueJson: JSON.stringify(cupsCache.meta || {}) }
  });
}

async function flushArchive() {
  await prisma.meta.upsert({
    where: { key: 'cups_archive' },
    create: { key: 'cups_archive', valueJson: JSON.stringify({ entries: archiveCache.entries || [] }) },
    update: { valueJson: JSON.stringify({ entries: archiveCache.entries || [] }) }
  });
}

async function ensureSchema() {
  try {
    await prisma.$queryRawUnsafe('SELECT 1 FROM User LIMIT 1');
    await prisma.$queryRawUnsafe('SELECT money FROM User LIMIT 1');
    await prisma.$queryRawUnsafe('SELECT 1 FROM Club LIMIT 1');
    try {
      await prisma.$queryRawUnsafe('SELECT lastWageAt FROM User LIMIT 1');
    } catch {
      await prisma.$executeRawUnsafe('ALTER TABLE User ADD COLUMN lastWageAt BIGINT');
    }
    return;
  } catch {
    /* push */
  }
  console.log('[EYE:db] applying Prisma schema…');
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: __dirname,
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    stdio: 'inherit'
  });
  await prisma.$disconnect().catch(() => {});
  prisma = new PrismaClient();
  await prisma.$connect();
}

async function hydrateFromDb() {
  usersCache.users = {};
  for (const row of await prisma.user.findMany()) {
    usersCache.users[row.id] = rowToUser(row);
  }
  sessionsCache.sessions = {};
  for (const s of await prisma.session.findMany()) {
    sessionsCache.sessions[s.token] = {
      userId: s.userId,
      createdAt: Number(s.createdAt),
      lastAt: Number(s.lastAt)
    };
  }
  for (const k of Object.keys(clubsCache)) delete clubsCache[k];
  for (const row of await prisma.club.findMany()) {
    const club = parseJson(row.dataJson, null);
    if (club) clubsCache[row.userId] = club;
  }
  matchesCache.length = 0;
  const recent = await prisma.matchRec.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
  for (const row of recent) {
    const m = parseJson(row.dataJson, null);
    if (m) matchesCache.push(m);
  }
  cupsCache.cups = {};
  for (const row of await prisma.cup.findMany({ where: { archived: false } })) {
    const cup = parseJson(row.dataJson, null);
    if (cup?.id) cupsCache.cups[cup.id] = cup;
  }
  const metaRow = await prisma.meta.findUnique({ where: { key: 'cups_meta' } });
  cupsCache.meta = metaRow ? parseJson(metaRow.valueJson, { lastTick: 0 }) : { lastTick: 0 };
  const archRow = await prisma.meta.findUnique({ where: { key: 'cups_archive' } });
  archiveCache.entries = archRow ? (parseJson(archRow.valueJson, { entries: [] }).entries || []) : [];
  const fq = await prisma.meta.findUnique({ where: { key: 'friendly_queue' } });
  friendlyQueue.length = 0;
  const fqList = fq ? (parseJson(fq.valueJson, { queue: [] }).queue || []) : [];
  for (const e of fqList) friendlyQueue.push(e);
  const tm = await prisma.meta.findUnique({ where: { key: 'transfer_market' } });
  transferMarket.list = tm ? (parseJson(tm.valueJson, { list: [], refreshedAt: 0 }).list || []) : [];
  transferMarket.refreshedAt = tm ? (parseJson(tm.valueJson, { refreshedAt: 0 }).refreshedAt || 0) : 0;
  const lg = await prisma.meta.findUnique({ where: { key: 'leagues' } });
  const lgData = lg ? parseJson(lg.valueJson, { leagues: {}, meta: { lastTick: 0, seasonCounter: 1 } }) : null;
  leaguesCache.leagues = lgData?.leagues || {};
  leaguesCache.meta = lgData?.meta || { lastTick: 0, seasonCounter: 1 };
}

async function init() {
  if (ready) return prisma;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  process.env.DATABASE_URL = `file:${DB_FILE}`;
  prisma = new PrismaClient();
  await prisma.$connect();
  await ensureSchema();
  await hydrateFromDb();
  ready = true;
  console.log(`[EYE:db] SQLite ready · ${DB_FILE}`);
  return prisma;
}

function usersDb() { return usersCache; }
function saveUsers(dbObj) {
  if (dbObj && dbObj !== usersCache) usersCache.users = dbObj.users || {};
  enqueue('users', flushUsers);
}
function sessionsDb() { return sessionsCache; }
function saveSessions(dbObj) {
  if (dbObj && dbObj !== sessionsCache) sessionsCache.sessions = dbObj.sessions || {};
  enqueue('sessions', flushSessions);
}

function getClub(userId) {
  return clubsCache[userId] || null;
}

function setClub(userId, club) {
  clubsCache[userId] = club;
  const u = usersCache.users[userId];
  if (u) {
    u.teamBound = true;
    u.clubName = club.name;
    u.strength = undefined;
    saveUsers(usersCache);
  }
  enqueue('club:' + userId, () => flushClub(userId));
}

function hasClub(userId) {
  return !!clubsCache[userId];
}

function addMatch(match) {
  matchesCache.unshift(match);
  if (matchesCache.length > 300) matchesCache.length = 300;
  enqueue('match:' + match.id, () => flushMatch(match));
}

function listMatchesFor(userId, limit = 30) {
  return matchesCache
    .filter((m) => m.home?.userId === userId || m.away?.userId === userId)
    .slice(0, limit);
}

async function listMatchesForAsync(userId, limit = 30) {
  const cached = listMatchesFor(userId, limit);
  if (cached.length >= Math.min(limit, 5)) return cached;
  try {
    const rows = await prisma.matchRec.findMany({
      where: { OR: [{ homeId: String(userId) }, { awayId: String(userId) }] },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
    const out = [];
    for (const row of rows) {
      const m = parseJson(row.dataJson, null);
      if (!m) continue;
      out.push(m);
      if (!matchesCache.find((x) => x.id === m.id)) {
        matchesCache.push(m);
      }
    }
    matchesCache.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (matchesCache.length > 500) matchesCache.length = 500;
    return out.slice(0, limit);
  } catch {
    return cached;
  }
}

function getMatch(id) {
  return matchesCache.find((m) => m.id === id) || null;
}

async function loadMatch(id) {
  const cached = getMatch(id);
  if (cached) return cached;
  try {
    const row = await prisma.matchRec.findUnique({ where: { id: String(id) } });
    if (!row) return null;
    const m = parseJson(row.dataJson, null);
    if (m) {
      matchesCache.unshift(m);
      if (matchesCache.length > 500) matchesCache.length = 500;
    }
    return m;
  } catch {
    return null;
  }
}

async function loadCupById(id) {
  if (cupsCache.cups?.[id]) return cupsCache.cups[id];
  try {
    const row = await prisma.cup.findUnique({ where: { id: String(id) } });
    if (!row) return null;
    return parseJson(row.dataJson, null);
  } catch {
    return null;
  }
}

function loadCups() {
  if (!cupsCache.cups) cupsCache.cups = {};
  if (!cupsCache.meta) cupsCache.meta = { lastTick: 0 };
  return cupsCache;
}
function saveCups(dbObj) {
  if (dbObj && dbObj !== cupsCache) {
    cupsCache.cups = dbObj.cups || {};
    cupsCache.meta = dbObj.meta || cupsCache.meta;
  }
  enqueue('cups', flushCups);
}
function loadArchive() {
  if (!Array.isArray(archiveCache.entries)) archiveCache.entries = [];
  return archiveCache;
}
function saveArchive(dbObj) {
  if (dbObj && dbObj !== archiveCache) {
    archiveCache.entries = Array.isArray(dbObj.entries) ? dbObj.entries : [];
  }
  enqueue('archive', flushArchive);
}

function listOnlineUsers() {
  const cut = Date.now() - 15 * 60 * 1000;
  const active = new Set(
    Object.values(sessionsCache.sessions)
      .filter((s) => (s.lastAt || 0) > cut)
      .map((s) => s.userId)
  );
  return Object.values(usersCache.users)
    .filter((u) => !u.isBot && active.has(u.id))
    .map((u) => ({ id: u.id, login: u.login, name: u.name, level: u.level, clubName: u.clubName }));
}

async function flushFriendly() {
  await prisma.meta.upsert({
    where: { key: 'friendly_queue' },
    create: { key: 'friendly_queue', valueJson: JSON.stringify({ queue: friendlyQueue }) },
    update: { valueJson: JSON.stringify({ queue: friendlyQueue }) }
  });
}

function friendlyList() {
  const now = Date.now();
  let changed = false;
  for (let i = friendlyQueue.length - 1; i >= 0; i--) {
    if (friendlyQueue[i].expiresAt < now) {
      friendlyQueue.splice(i, 1);
      changed = true;
    }
  }
  if (changed) enqueue('friendly', flushFriendly);
  return friendlyQueue.slice();
}

function friendlyPost(entry) {
  friendlyQueue.unshift(entry);
  if (friendlyQueue.length > 80) friendlyQueue.length = 80;
  enqueue('friendly', flushFriendly);
  return entry;
}

function friendlyTake(id) {
  const i = friendlyQueue.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const item = friendlyQueue.splice(i, 1)[0];
  enqueue('friendly', flushFriendly);
  return item;
}

async function flushTransfers() {
  await prisma.meta.upsert({
    where: { key: 'transfer_market' },
    create: {
      key: 'transfer_market',
      valueJson: JSON.stringify({ list: transferMarket.list, refreshedAt: transferMarket.refreshedAt })
    },
    update: {
      valueJson: JSON.stringify({ list: transferMarket.list, refreshedAt: transferMarket.refreshedAt })
    }
  });
}

function getTransferMarket() {
  return transferMarket;
}

function setTransferMarket(list, refreshedAt = Date.now()) {
  transferMarket.list = Array.isArray(list) ? list : [];
  transferMarket.refreshedAt = refreshedAt;
  enqueue('transfers', flushTransfers);
  return transferMarket;
}

function removeTransferListing(playerId) {
  transferMarket.list = (transferMarket.list || []).filter((p) => p.id !== playerId);
  enqueue('transfers', flushTransfers);
}

async function flushLeagues() {
  await prisma.meta.upsert({
    where: { key: 'leagues' },
    create: {
      key: 'leagues',
      valueJson: JSON.stringify({ leagues: leaguesCache.leagues, meta: leaguesCache.meta })
    },
    update: {
      valueJson: JSON.stringify({ leagues: leaguesCache.leagues, meta: leaguesCache.meta })
    }
  });
}

function loadLeagues() {
  return leaguesCache;
}

function saveLeagues(obj) {
  if (obj) {
    leaguesCache.leagues = obj.leagues || {};
    leaguesCache.meta = obj.meta || leaguesCache.meta;
  }
  enqueue('leagues', flushLeagues);
  return leaguesCache;
}

async function flushAll() {
  await writeChain;
  await flushUsers();
  await flushSessions();
  for (const id of Object.keys(clubsCache)) await flushClub(id);
  await flushCups();
  await flushArchive();
  await flushFriendly();
  await flushTransfers();
  await flushLeagues();
}

async function disconnect() {
  await flushAll().catch(() => {});
  if (prisma) await prisma.$disconnect().catch(() => {});
  ready = false;
}

module.exports = {
  init,
  disconnect,
  flushAll,
  DATA_DIR,
  DB_FILE,
  usersDb,
  saveUsers,
  sessionsDb,
  saveSessions,
  getClub,
  setClub,
  hasClub,
  addMatch,
  listMatchesFor,
  listMatchesForAsync,
  getMatch,
  loadMatch,
  loadCupById,
  loadCups,
  saveCups,
  loadArchive,
  saveArchive,
  listOnlineUsers,
  friendlyList,
  friendlyPost,
  friendlyTake,
  getTransferMarket,
  setTransferMarket,
  removeTransferListing,
  loadLeagues,
  saveLeagues
};
