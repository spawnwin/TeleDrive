'use strict';

/**
 * Prisma + SQLite persistence for EYE Manager.
 * Keeps in-memory caches for the sync cups/auth API and write-through flushes to SQLite.
 */

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
const cupsCache = { cups: {}, meta: { lastTick: 0, nextId: 1 } };
const archiveCache = { entries: [] };
const careersCache = Object.create(null);

let writeChain = Promise.resolve();

function enqueue(label, fn) {
  writeChain = writeChain
    .then(fn)
    .catch((err) => console.error(`[EYE:db] ${label}:`, err && err.message ? err.message : err));
  return writeChain;
}

function parseJson(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function loadJsonFile(file, fallback) {
  try {
    if (!fs.existsSync(file)) return structuredClone(fallback);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return structuredClone(fallback);
  }
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
    cupEvents: parseJson(row.cupEventsJson, [])
  };
}

function careerToPayload(row) {
  if (!row) return null;
  return {
    id: row.userId,
    userId: row.userId,
    manager: row.manager || undefined,
    updatedAt: Number(row.updatedAt),
    state: parseJson(row.stateJson, null)
  };
}

async function flushUsers() {
  const ids = Object.keys(usersCache.users);
  for (const id of ids) {
    const u = usersCache.users[id];
    const data = userToRow(u);
    await prisma.user.upsert({
      where: { id },
      create: data,
      update: data
    });
  }
  const dbIds = (await prisma.user.findMany({ select: { id: true } })).map((r) => r.id);
  const keep = new Set(ids);
  for (const id of dbIds) {
    if (!keep.has(id)) await prisma.user.delete({ where: { id } }).catch(() => {});
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
  const dbTokens = (await prisma.session.findMany({ select: { token: true } })).map((r) => r.token);
  const keep = new Set(tokens);
  for (const token of dbTokens) {
    if (!keep.has(token)) await prisma.session.delete({ where: { token } }).catch(() => {});
  }
}

async function flushCups() {
  const ids = Object.keys(cupsCache.cups || {});
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
    await prisma.cup.upsert({
      where: { id },
      create: data,
      update: data
    });
  }
  await prisma.meta.upsert({
    where: { key: 'cups_meta' },
    create: { key: 'cups_meta', valueJson: JSON.stringify(cupsCache.meta || {}) },
    update: { valueJson: JSON.stringify(cupsCache.meta || {}) }
  });
  const live = await prisma.cup.findMany({ where: { archived: false }, select: { id: true } });
  const keep = new Set(ids);
  for (const row of live) {
    if (!keep.has(row.id)) await prisma.cup.delete({ where: { id: row.id } }).catch(() => {});
  }
}

async function flushArchive() {
  const entries = Array.isArray(archiveCache.entries) ? archiveCache.entries : [];
  await prisma.meta.upsert({
    where: { key: 'cups_archive' },
    create: { key: 'cups_archive', valueJson: JSON.stringify({ entries }) },
    update: { valueJson: JSON.stringify({ entries }) }
  });
  // Also keep archived cups as Cup rows for querying
  for (const entry of entries.slice(0, 200)) {
    const cup = entry.cup || entry;
    if (!cup?.id) continue;
    const data = {
      id: cup.id,
      status: String(cup.status || 'archived'),
      bracketId: cup.bracketId || null,
      archived: true,
      updatedAt: BigInt(entry.at || cup.finishedAt || Date.now()),
      dataJson: JSON.stringify(cup)
    };
    await prisma.cup.upsert({
      where: { id: cup.id },
      create: data,
      update: data
    });
  }
}

async function flushCareer(userId) {
  const payload = careersCache[userId];
  if (!payload) {
    await prisma.career.delete({ where: { userId } }).catch(() => {});
    return;
  }
  const data = {
    userId,
    manager: payload.manager != null ? String(payload.manager) : null,
    updatedAt: BigInt(payload.updatedAt || Date.now()),
    stateJson: JSON.stringify(payload.state || {})
  };
  await prisma.career.upsert({
    where: { userId },
    create: data,
    update: data
  });
}

async function hydrateFromDb() {
  const users = await prisma.user.findMany();
  usersCache.users = {};
  for (const row of users) {
    usersCache.users[row.id] = rowToUser(row);
  }

  const sessions = await prisma.session.findMany();
  sessionsCache.sessions = {};
  for (const s of sessions) {
    sessionsCache.sessions[s.token] = {
      userId: s.userId,
      createdAt: Number(s.createdAt),
      lastAt: Number(s.lastAt)
    };
  }

  const careers = await prisma.career.findMany();
  for (const key of Object.keys(careersCache)) delete careersCache[key];
  for (const row of careers) {
    const payload = careerToPayload(row);
    if (payload?.state) careersCache[row.userId] = payload;
  }

  const liveCups = await prisma.cup.findMany({ where: { archived: false } });
  cupsCache.cups = {};
  for (const row of liveCups) {
    const cup = parseJson(row.dataJson, null);
    if (cup?.id) cupsCache.cups[cup.id] = cup;
  }
  const metaRow = await prisma.meta.findUnique({ where: { key: 'cups_meta' } });
  cupsCache.meta = metaRow ? parseJson(metaRow.valueJson, { lastTick: 0 }) : { lastTick: 0 };

  const archRow = await prisma.meta.findUnique({ where: { key: 'cups_archive' } });
  archiveCache.entries = archRow ? (parseJson(archRow.valueJson, { entries: [] }).entries || []) : [];
}

async function migrateFromJsonIfEmpty() {
  const count = await prisma.user.count();
  const careerCount = await prisma.career.count();
  const cupCount = await prisma.cup.count();
  if (count > 0 || careerCount > 0 || cupCount > 0) return false;

  const usersFile = path.join(DATA_DIR, 'users.json');
  const sessionsFile = path.join(DATA_DIR, 'sessions.json');
  const cupsFile = path.join(DATA_DIR, 'cups.json');
  const archiveFile = path.join(DATA_DIR, 'cups_archive.json');
  const savesDir = path.join(DATA_DIR, 'saves');

  if (!fs.existsSync(usersFile) && !fs.existsSync(cupsFile) && !fs.existsSync(savesDir)) {
    return false;
  }

  console.log('[EYE:db] migrating JSON → SQLite…');

  const usersDb = loadJsonFile(usersFile, { users: {} });
  for (const u of Object.values(usersDb.users || {})) {
    if (!u?.id) continue;
    await prisma.user.create({ data: userToRow(u) });
  }

  const sessDb = loadJsonFile(sessionsFile, { sessions: {} });
  for (const [token, s] of Object.entries(sessDb.sessions || {})) {
    if (!s?.userId) continue;
    const userExists = await prisma.user.findUnique({ where: { id: s.userId } });
    if (!userExists) continue;
    await prisma.session.create({
      data: {
        token,
        userId: s.userId,
        createdAt: BigInt(s.createdAt || Date.now()),
        lastAt: BigInt(s.lastAt || Date.now())
      }
    }).catch(() => {});
  }

  if (fs.existsSync(savesDir)) {
    for (const name of fs.readdirSync(savesDir)) {
      if (!name.startsWith('user_') || !name.endsWith('.json')) continue;
      try {
        const payload = JSON.parse(fs.readFileSync(path.join(savesDir, name), 'utf8'));
        const userId = payload.userId || payload.id || name.slice(5, -5);
        if (!userId || !payload.state) continue;
        const userExists = await prisma.user.findUnique({ where: { id: userId } });
        if (!userExists) continue;
        await prisma.career.create({
          data: {
            userId,
            manager: payload.manager != null ? String(payload.manager) : null,
            updatedAt: BigInt(payload.updatedAt || Date.now()),
            stateJson: JSON.stringify(payload.state)
          }
        });
        if (!userExists.teamBound) {
          await prisma.user.update({
            where: { id: userId },
            data: { teamBound: true, teamCreatedAt: BigInt(payload.updatedAt || Date.now()) }
          });
        }
      } catch (e) {
        console.warn('[EYE:db] skip save', name, e.message);
      }
    }
  }

  const cupsDb = loadJsonFile(cupsFile, { cups: {}, meta: {} });
  for (const cup of Object.values(cupsDb.cups || {})) {
    if (!cup?.id) continue;
    await prisma.cup.create({
      data: {
        id: cup.id,
        status: String(cup.status || 'open'),
        bracketId: cup.bracketId || null,
        archived: false,
        updatedAt: BigInt(Date.now()),
        dataJson: JSON.stringify(cup)
      }
    });
  }
  await prisma.meta.create({
    data: { key: 'cups_meta', valueJson: JSON.stringify(cupsDb.meta || { lastTick: 0 }) }
  }).catch(() => {});

  const archDb = loadJsonFile(archiveFile, { entries: [] });
  await prisma.meta.create({
    data: { key: 'cups_archive', valueJson: JSON.stringify({ entries: archDb.entries || [] }) }
  }).catch(() => {});

  console.log('[EYE:db] JSON migration done');
  return true;
}

async function ensureSchema() {
  try {
    await prisma.$queryRawUnsafe('SELECT 1 FROM User LIMIT 1');
    return;
  } catch {
    /* tables missing — push schema */
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

async function init() {
  if (ready) return prisma;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // Prefer absolute file URL so runtime and CLI agree
  process.env.DATABASE_URL = `file:${DB_FILE}`;
  prisma = new PrismaClient();
  await prisma.$connect();
  await ensureSchema();
  await migrateFromJsonIfEmpty();
  await hydrateFromDb();
  ready = true;
  console.log(`[EYE:db] SQLite ready · ${DB_FILE}`);
  return prisma;
}

function usersDb() {
  return usersCache;
}

function saveUsers(db) {
  if (db && db !== usersCache) {
    usersCache.users = db.users || {};
  }
  enqueue('users', flushUsers);
}

function sessionsDb() {
  return sessionsCache;
}

function saveSessions(db) {
  if (db && db !== sessionsCache) {
    sessionsCache.sessions = db.sessions || {};
  }
  enqueue('sessions', flushSessions);
}

function loadCups() {
  if (!cupsCache.cups) cupsCache.cups = {};
  if (!cupsCache.meta) cupsCache.meta = { lastTick: 0 };
  return cupsCache;
}

function saveCups(db) {
  if (db && db !== cupsCache) {
    cupsCache.cups = db.cups || {};
    cupsCache.meta = db.meta || cupsCache.meta;
  }
  enqueue('cups', flushCups);
}

function loadArchive() {
  if (!Array.isArray(archiveCache.entries)) archiveCache.entries = [];
  return archiveCache;
}

function saveArchive(db) {
  if (db && db !== archiveCache) {
    archiveCache.entries = Array.isArray(db.entries) ? db.entries : [];
  }
  enqueue('archive', flushArchive);
}

function hasCareer(userId) {
  return !!(careersCache[userId] && careersCache[userId].state);
}

function getCareer(userId) {
  const payload = careersCache[userId];
  return payload ? structuredClone(payload) : null;
}

function setCareer(userId, payload) {
  careersCache[userId] = {
    id: userId,
    userId,
    manager: payload.manager,
    updatedAt: payload.updatedAt || Date.now(),
    state: payload.state
  };
  enqueue('career:' + userId, () => flushCareer(userId));
}

function deleteCareer(userId) {
  delete careersCache[userId];
  enqueue('career-del:' + userId, () => flushCareer(userId));
}

function readCareerClub(userId) {
  const payload = careersCache[userId];
  if (!payload?.state) return null;
  const st = payload.state;
  const me = (st.clubs || []).find((c) => c.id === st.clubId);
  if (!me) return null;
  return { payload, st, me };
}

function writeCareerPayload(userId, payload) {
  setCareer(userId, payload);
}

async function flushAll() {
  await writeChain;
  await flushUsers();
  await flushSessions();
  await flushCups();
  await flushArchive();
  for (const userId of Object.keys(careersCache)) {
    await flushCareer(userId);
  }
}

async function disconnect() {
  await flushAll().catch(() => {});
  if (prisma) await prisma.$disconnect().catch(() => {});
  ready = false;
}

function getPrisma() {
  return prisma;
}

module.exports = {
  init,
  disconnect,
  flushAll,
  getPrisma,
  DATA_DIR,
  DB_FILE,
  usersDb,
  saveUsers,
  sessionsDb,
  saveSessions,
  loadCups,
  saveCups,
  loadArchive,
  saveArchive,
  hasCareer,
  getCareer,
  setCareer,
  deleteCareer,
  readCareerClub,
  writeCareerPayload
};
