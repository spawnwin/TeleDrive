#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const { createCupsModule } = require('./cups');
const db = require('./db');

const PORT = Number(process.env.EYE_PORT || 9140);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.EYE_DATA || path.join(__dirname, 'data');
const ADMIN_LOGIN = normalizeLogin(process.env.EYE_ADMIN_LOGIN || 'admin');
const ADMIN_PASS = String(process.env.EYE_ADMIN_PASSWORD || 'eyeadmin');

fs.mkdirSync(DATA_DIR, { recursive: true });

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), s, 64).toString('hex');
  return { salt: s, hash };
}

function verifyPassword(password, salt, hash) {
  try {
    const check = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

function usersDb() {
  return db.usersDb();
}

function saveUsers(users) {
  db.saveUsers(users);
}

function sessionsDb() {
  return db.sessionsDb();
}

function publicUser(u) {
  return { id: u.id, login: u.login, name: u.name, createdAt: u.createdAt };
}

function normalizeLogin(login) {
  return String(login || '').trim().toLowerCase().replace(/[^a-z0-9_\-\.]/g, '').slice(0, 24);
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';
  if (xf) return String(xf).split(',')[0].trim().slice(0, 64);
  return String(req.socket?.remoteAddress || '').slice(0, 64);
}

function hasCareer(userId) {
  return db.hasCareer(userId);
}

function markTeamBound(user, clubName) {
  user.teamBound = true;
  user.teamCreatedAt = user.teamCreatedAt || Date.now();
  if (clubName) user.clubName = String(clubName).slice(0, 40);
}

function registrationBlocked(users, ip) {
  const local = !ip || ip === '127.0.0.1' || ip === '::1' || ip === ':ffff:127.0.0.1';
  const humans = Object.values(users.users).filter((u) => !u.isBot && u.role !== 'bot');
  const sameIp = humans.filter((u) => u.regIp && u.regIp === ip);
  if (!sameIp.length) return null;
  const withTeam = sameIp.find((u) => u.teamBound || hasCareer(u.id));
  if (withTeam) {
    return 'Мультиаккаунты запрещены: с этой сети уже есть аккаунт с командой. Войдите в существующий.';
  }
  if (!local && sameIp.length >= 1) {
    return 'С этой сети аккаунт уже создан. Перерегистрация запрещена правилами.';
  }
  return null;
}

let cups;

function createSession(userId) {
  const sess = sessionsDb();
  const token = crypto.randomBytes(24).toString('hex');
  sess.sessions[token] = { userId, createdAt: Date.now(), lastAt: Date.now() };
  const cut = Date.now() - 30 * 864e5;
  Object.keys(sess.sessions).forEach((t) => {
    if ((sess.sessions[t].lastAt || 0) < cut) delete sess.sessions[t];
  });
  db.saveSessions(sess);
  return token;
}

function authUser(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1].trim() : (req.headers['x-eye-token'] || '').trim();
  if (!token) return null;
  const sess = sessionsDb();
  const s = sess.sessions[token];
  if (!s) return null;
  s.lastAt = Date.now();
  db.saveSessions(sess);
  const u = usersDb().users[s.userId];
  if (!u) return null;
  cups.ensureUserProgress(u);
  return { user: u, token };
}

function requireAuth(req, res) {
  const auth = authUser(req);
  if (!auth) {
    json(res, 401, { error: 'Не авторизован' });
    return null;
  }
  return auth;
}

function requireAdmin(req, res) {
  const auth = requireAuth(req, res);
  if (!auth) return null;
  if (auth.user.role !== 'admin' && auth.user.login !== ADMIN_LOGIN) {
    json(res, 403, { error: 'Только для администратора' });
    return null;
  }
  return auth;
}

function ensureAdminUser() {
  const users = usersDb();
  let admin = Object.values(users.users).find((u) => u.login === ADMIN_LOGIN);
  if (!admin) {
    const id = crypto.randomBytes(8).toString('hex');
    const { salt, hash } = hashPassword(ADMIN_PASS);
    admin = {
      id,
      login: ADMIN_LOGIN,
      name: 'Админ EYE',
      salt,
      hash,
      createdAt: Date.now(),
      role: 'admin',
      isBot: false,
      level: 10,
      xp: cups.XP_THRESHOLDS[10],
      cupsPlayed: 0,
      cupsWon: 0
    };
    users.users[id] = admin;
    saveUsers(users);
    console.log(`[EYE] admin created · login=${ADMIN_LOGIN}`);
  } else {
    admin.role = 'admin';
    cups.ensureUserProgress(admin);
    saveUsers(users);
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

function send(res, code, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, {
    'Cache-Control': code === 200 && headers['Content-Type']?.includes('text/html') ? 'no-cache' : 'public, max-age=3600',
    ...headers,
    'Content-Length': Buffer.byteLength(data)
  });
  res.end(data);
}

function json(res, code, obj) {
  send(res, code, JSON.stringify(obj), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Eye-Token',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS'
  });
}

function safeJoin(root, reqPath) {
  const decoded = decodeURIComponent(reqPath.split('?')[0]);
  const clean = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(root, clean);
  if (!full.startsWith(root)) return null;
  return full;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 4e6) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function persistUser(user) {
  const users = usersDb();
  users.users[user.id] = user;
  saveUsers(users);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') {
    return json(res, 204, {});
  }

  if (pathname === '/api/health') {
    return json(res, 200, {
      ok: true,
      service: 'eye-manager',
      ts: Date.now(),
      db: 'sqlite',
      cups: cups.stats()
    });
  }

  // ——— AUTH ———
  if (pathname === '/api/register' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      const login = normalizeLogin(body.login);
      const password = String(body.password || '');
      const name = String(body.name || login).trim().slice(0, 32);
      if (login.length < 3) return json(res, 400, { error: 'Логин минимум 3 символа (a-z, 0-9)' });
      if (password.length < 4) return json(res, 400, { error: 'Пароль минимум 4 символа' });
      if (login === ADMIN_LOGIN) return json(res, 400, { error: 'Логин зарезервирован' });
      const db = usersDb();
      if (Object.values(db.users).some((u) => u.login === login)) {
        return json(res, 409, { error: 'Логин уже занят' });
      }
      const ip = clientIp(req);
      const blocked = registrationBlocked(db, ip);
      if (blocked) return json(res, 403, { error: blocked, code: 'multi_account' });
      const id = crypto.randomBytes(8).toString('hex');
      const { salt, hash } = hashPassword(password);
      const user = {
        id, login, name, salt, hash, createdAt: Date.now(),
        role: 'user', isBot: false, level: 1, xp: 0, cupsPlayed: 0, cupsWon: 0,
        teamBound: false, regIp: ip || null
      };
      db.users[id] = user;
      saveUsers(db);
      const token = createSession(id);
      return json(res, 200, { ok: true, token, user: cups.enrichPublic(user) });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      const login = normalizeLogin(body.login);
      const password = String(body.password || '');
      const db = usersDb();
      const user = Object.values(db.users).find((u) => u.login === login);
      if (!user || user.isBot || !verifyPassword(password, user.salt, user.hash)) {
        return json(res, 401, { error: 'Неверный логин или пароль' });
      }
      cups.ensureUserProgress(user);
      persistUser(user);
      const token = createSession(user.id);
      const careerOk = hasCareer(user.id);
      if (careerOk && !user.teamBound) {
        markTeamBound(user);
        persistUser(user);
      }
      return json(res, 200, {
        ok: true,
        token,
        user: cups.enrichPublic(user),
        hasCareer: careerOk,
        teamBound: !!(user.teamBound || careerOk)
      });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    const auth = authUser(req);
    if (auth) {
      const sess = sessionsDb();
      delete sess.sessions[auth.token];
      db.saveSessions(sess);
    }
    return json(res, 200, { ok: true });
  }

  if (pathname === '/api/me' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const careerOk = hasCareer(auth.user.id);
    if (careerOk && !auth.user.teamBound) {
      markTeamBound(auth.user);
      persistUser(auth.user);
    } else {
      persistUser(auth.user);
    }
    return json(res, 200, {
      ok: true,
      user: cups.enrichPublic(auth.user),
      hasCareer: careerOk,
      teamBound: !!(auth.user.teamBound || careerOk),
      bracket: cups.bracketForLevel(auth.user.level || 1),
      liveCup: cups.findMyLiveCup(auth.user.id),
      cupEvents: cups.listCupEvents(auth.user.id, { limit: 10 }),
      cupEventsUnread: cups.listCupEvents(auth.user.id, { unreadOnly: true, limit: 20 }).length
    });
  }

  if (pathname === '/api/career' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const payload = db.getCareer(auth.user.id);
    if (!payload?.state) return json(res, 404, { error: 'Нет карьеры' });
    return json(res, 200, { ok: true, ...payload });
  }

  if (pathname === '/api/career' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      if (!body || !body.state) return json(res, 400, { error: 'state required' });
      const mode = body.mode === 'create' ? 'create' : 'save';
      const exists = hasCareer(auth.user.id);
      const bound = !!(auth.user.teamBound || exists);

      if (mode === 'create' && bound) {
        return json(res, 403, {
          error: 'Команда уже создана. Новая команда и пересоздание запрещены (антимультиаккаунт).',
          code: 'team_bound'
        });
      }

      if (exists) {
        const prev = db.getCareer(auth.user.id);
        const oldClub = prev?.state?.clubId;
        const newClub = body.state?.clubId;
        if (oldClub && newClub && oldClub !== newClub) {
          return json(res, 403, {
            error: 'Нельзя заменить существующую команду. Пересоздание запрещено правилами.',
            code: 'team_bound'
          });
        }
      }

      if (mode === 'create' || (!exists && !auth.user.teamBound)) {
        const club = (body.state.clubs || []).find((c) => c.id === body.state.clubId);
        markTeamBound(auth.user, club?.name || body.state.managerName);
        persistUser(auth.user);
      } else if (exists && !auth.user.teamBound) {
        markTeamBound(auth.user);
        persistUser(auth.user);
      }

      const payload = {
        id: auth.user.id,
        manager: body.manager || body.state.managerName || auth.user.name,
        userId: auth.user.id,
        updatedAt: Date.now(),
        state: body.state
      };
      db.setCareer(auth.user.id, payload);
      return json(res, 200, {
        ok: true,
        id: auth.user.id,
        created: mode === 'create' || !exists,
        teamBound: true
      });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/career' && req.method === 'DELETE') {
    const auth = requireAdmin(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const targetId = body.userId || auth.user.id;
      const users = usersDb();
      const u = users.users[targetId];
      if (!u) return json(res, 404, { error: 'Нет пользователя' });
      db.deleteCareer(targetId);
      u.teamBound = false;
      u.teamCreatedAt = null;
      saveUsers(users);
      return json(res, 200, { ok: true });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  // legacy endpoints — career only via auth + DB
  if (pathname === '/api/save' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      if (!body || !body.state) return json(res, 400, { error: 'state required' });
      db.setCareer(auth.user.id, {
        id: auth.user.id,
        manager: body.manager || body.state.managerName || auth.user.name,
        userId: auth.user.id,
        updatedAt: Date.now(),
        state: body.state
      });
      return json(res, 200, { ok: true, id: auth.user.id });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/saves' && req.method === 'GET') {
    return json(res, 200, { saves: [] });
  }

  // ——— ONLINE CUPS ———
  if (pathname === '/api/cups' && req.method === 'GET') {
    const status = url.searchParams.get('status') || undefined;
    const bracketId = url.searchParams.get('bracketId') || undefined;
    const mine = url.searchParams.get('mine') === '1';
    const auth = mine ? requireAuth(req, res) : authUser(req);
    if (mine && !auth) return;
    return json(res, 200, {
      ok: true,
      cups: cups.listCups({
        status,
        bracketId,
        mineFor: mine ? auth.user.id : undefined
      }),
      meta: cups.stats()
    });
  }

  if (pathname === '/api/cups/meta' && req.method === 'GET') {
    return json(res, 200, { ok: true, ...cups.stats() });
  }

  if (pathname === '/api/cups/leaderboard' && req.method === 'GET') {
    const bracketId = url.searchParams.get('bracketId') || undefined;
    const limit = Math.min(50, Math.max(5, Number(url.searchParams.get('limit') || 30)));
    return json(res, 200, {
      ok: true,
      leaders: cups.leaderboard({ bracketId, limit }),
      brackets: cups.LEVEL_BRACKETS
    });
  }

  if (pathname === '/api/cups/events' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    return json(res, 200, {
      ok: true,
      events: cups.listCupEvents(auth.user.id, { limit: 30 }),
      unread: cups.listCupEvents(auth.user.id, { unreadOnly: true, limit: 40 }).length
    });
  }

  if (pathname === '/api/cups/events/read' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const r = cups.markCupEventsRead(auth.user.id, body.ids || []);
      return json(res, 200, r);
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname.startsWith('/api/cups/') && req.method === 'GET') {
    const id = pathname.slice('/api/cups/'.length).split('/')[0];
    if (!id || id === 'meta' || id === 'leaderboard' || id === 'events') return json(res, 404, { error: 'Нет' });
    const cup = cups.getCup(id);
    if (!cup) return json(res, 404, { error: 'Кубок не найден' });
    return json(res, 200, { ok: true, cup });
  }

  if (pathname.match(/^\/api\/cups\/[^/]+\/join$/) && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const id = pathname.split('/')[3];
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const r = cups.joinCup(id, auth.user, body.clubName, { strength: body.strength });
      if (!r.ok) return json(res, 400, r);
      return json(res, 200, r);
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname.match(/^\/api\/cups\/[^/]+\/leave$/) && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const id = pathname.split('/')[3];
    const r = cups.leaveCup(id, auth.user.id);
    if (!r.ok) return json(res, 400, r);
    return json(res, 200, r);
  }

  // ——— ADMIN ———
  if (pathname === '/api/admin/stats' && req.method === 'GET') {
    if (!requireAdmin(req, res)) return;
    return json(res, 200, { ok: true, ...cups.stats() });
  }

  if (pathname === '/api/admin/users' && req.method === 'GET') {
    if (!requireAdmin(req, res)) return;
    const list = Object.values(usersDb().users)
      .filter((u) => !u.isBot)
      .map((u) => cups.enrichPublic(u));
    return json(res, 200, { ok: true, users: list });
  }

  if (pathname === '/api/admin/bots' && req.method === 'GET') {
    if (!requireAdmin(req, res)) return;
    cups.ensureBotPool();
    const list = Object.values(usersDb().users)
      .filter((u) => u.isBot)
      .map((u) => cups.enrichPublic(u));
    return json(res, 200, { ok: true, bots: list });
  }

  if (pathname === '/api/admin/bots/ensure' && req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    const bots = cups.ensureBotPool(8);
    return json(res, 200, { ok: true, count: bots.length });
  }

  if (pathname === '/api/admin/users/level' && req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      const db = usersDb();
      const u = db.users[body.userId];
      if (!u) return json(res, 404, { error: 'Нет пользователя' });
      const level = Math.max(1, Math.min(10, Number(body.level) || 1));
      u.level = level;
      u.xp = cups.XP_THRESHOLDS[level] || 0;
      saveUsers(db);
      return json(res, 200, { ok: true, user: cups.enrichPublic(u) });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/admin/cups' && req.method === 'GET') {
    if (!requireAdmin(req, res)) return;
    return json(res, 200, {
      ok: true,
      cups: cups.listCups(),
      archive: cups.loadArchive().entries.slice(0, 40)
    });
  }

  if (pathname === '/api/admin/cups' && req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const cup = cups.adminCreateCup(body);
      return json(res, 200, { ok: true, cup });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname.match(/^\/api\/admin\/cups\/[^/]+\/start$/) && req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    const id = pathname.split('/')[4];
    const r = cups.adminForceStart(id);
    if (!r.ok) return json(res, 400, r);
    return json(res, 200, r);
  }

  if (pathname.match(/^\/api\/admin\/cups\/[^/]+\/advance$/) && req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    const id = pathname.split('/')[4];
    const r = cups.adminAdvanceCup(id);
    if (!r.ok) return json(res, 400, r);
    return json(res, 200, r);
  }

  if (pathname.match(/^\/api\/admin\/cups\/[^/]+\/finish$/) && req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    const id = pathname.split('/')[4];
    const r = cups.adminFinishCup(id);
    if (!r.ok) return json(res, 400, r);
    return json(res, 200, r);
  }

  if (pathname.match(/^\/api\/admin\/cups\/[^/]+$/) && req.method === 'DELETE') {
    if (!requireAdmin(req, res)) return;
    const id = pathname.split('/')[4];
    const r = cups.adminDeleteCup(id);
    if (!r.ok) return json(res, 400, r);
    return json(res, 200, r);
  }

  if (pathname === '/api/admin/tick' && req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    const r = cups.tick();
    return json(res, 200, r);
  }

  // static
  let target = pathname === '/' ? '/index.html' : pathname;
  let file = safeJoin(ROOT, target);
  if (!file) return send(res, 403, 'Forbidden');
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, 'index.html');
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    file = path.join(ROOT, 'index.html');
  }
  if (file.startsWith(path.join(ROOT, 'server', 'data'))) {
    return send(res, 404, 'Not found');
  }
  const ext = path.extname(file);
  const type = MIME[ext] || 'application/octet-stream';
  const cache = ext === '.html' || ext === '.js' || ext === '.css' ? 'no-cache' : 'public, max-age=86400';
  send(res, 200, fs.readFileSync(file), { 'Content-Type': type, 'Cache-Control': cache });
});

async function main() {
  await db.init();
  cups = createCupsModule({
    dataDir: DATA_DIR,
    usersDb,
    saveUsers,
    publicUser,
    store: {
      loadCups: () => db.loadCups(),
      saveCups: (x) => db.saveCups(x),
      loadArchive: () => db.loadArchive(),
      saveArchive: (x) => db.saveArchive(x),
      readCareerClub: (userId) => db.readCareerClub(userId),
      writeCareer: (userId, payload) => db.writeCareerPayload(userId, payload)
    }
  });
  ensureAdminUser();
  cups.ensureBotPool();

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[EYE] listening on http://0.0.0.0:${PORT}`);
    console.log(`[EYE] root ${ROOT}`);
    console.log(`[EYE] data ${DATA_DIR}`);
    console.log(`[EYE] db ${db.DB_FILE}`);
    cups.startScheduler();
  });

  const shutdown = async () => {
    try { await db.disconnect(); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[EYE] fatal', err);
  process.exit(1);
});
