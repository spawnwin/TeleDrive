#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.EYE_PORT || 9140);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.EYE_DATA || path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const SAVES = path.join(DATA_DIR, 'saves');

fs.mkdirSync(SAVES, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), s, 64).toString('hex');
  return { salt: s, hash };
}

function verifyPassword(password, salt, hash) {
  const check = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(hash, 'hex'));
}

function usersDb() {
  const db = loadJson(USERS_FILE, { users: {} });
  if (!db.users) db.users = {};
  return db;
}

function sessionsDb() {
  const db = loadJson(SESSIONS_FILE, { sessions: {} });
  if (!db.sessions) db.sessions = {};
  return db;
}

function publicUser(u) {
  return { id: u.id, login: u.login, name: u.name, createdAt: u.createdAt };
}

function createSession(userId) {
  const db = sessionsDb();
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = { userId, createdAt: Date.now(), lastAt: Date.now() };
  // prune old (>30d)
  const cut = Date.now() - 30 * 864e5;
  Object.keys(db.sessions).forEach((t) => {
    if ((db.sessions[t].lastAt || 0) < cut) delete db.sessions[t];
  });
  saveJson(SESSIONS_FILE, db);
  return token;
}

function authUser(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1].trim() : (req.headers['x-eye-token'] || '').trim();
  if (!token) return null;
  const db = sessionsDb();
  const s = db.sessions[token];
  if (!s) return null;
  s.lastAt = Date.now();
  saveJson(SESSIONS_FILE, db);
  const users = usersDb().users;
  const u = users[s.userId];
  if (!u) return null;
  return { user: u, token };
}

function savePathFor(userId) {
  return path.join(SAVES, `user_${userId}.json`);
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
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
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

function normalizeLogin(login) {
  return String(login || '').trim().toLowerCase().replace(/[^a-z0-9_\-\.]/g, '').slice(0, 24);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') {
    return json(res, 204, {});
  }

  if (pathname === '/api/health') {
    return json(res, 200, { ok: true, service: 'eye-manager', ts: Date.now() });
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
      const db = usersDb();
      if (Object.values(db.users).some((u) => u.login === login)) {
        return json(res, 409, { error: 'Логин уже занят' });
      }
      const id = crypto.randomBytes(8).toString('hex');
      const { salt, hash } = hashPassword(password);
      const user = { id, login, name, salt, hash, createdAt: Date.now() };
      db.users[id] = user;
      saveJson(USERS_FILE, db);
      const token = createSession(id);
      return json(res, 200, { ok: true, token, user: publicUser(user) });
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
      if (!user || !verifyPassword(password, user.salt, user.hash)) {
        return json(res, 401, { error: 'Неверный логин или пароль' });
      }
      const token = createSession(user.id);
      const file = savePathFor(user.id);
      const hasCareer = fs.existsSync(file);
      return json(res, 200, { ok: true, token, user: publicUser(user), hasCareer });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    const auth = authUser(req);
    if (auth) {
      const db = sessionsDb();
      delete db.sessions[auth.token];
      saveJson(SESSIONS_FILE, db);
    }
    return json(res, 200, { ok: true });
  }

  if (pathname === '/api/me' && req.method === 'GET') {
    const auth = authUser(req);
    if (!auth) return json(res, 401, { error: 'Не авторизован' });
    const hasCareer = fs.existsSync(savePathFor(auth.user.id));
    return json(res, 200, { ok: true, user: publicUser(auth.user), hasCareer });
  }

  if (pathname === '/api/career' && req.method === 'GET') {
    const auth = authUser(req);
    if (!auth) return json(res, 401, { error: 'Не авторизован' });
    const file = savePathFor(auth.user.id);
    if (!fs.existsSync(file)) return json(res, 404, { error: 'Нет сохранения' });
    const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
    return json(res, 200, { ok: true, ...payload });
  }

  if (pathname === '/api/career' && req.method === 'POST') {
    const auth = authUser(req);
    if (!auth) return json(res, 401, { error: 'Не авторизован' });
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      if (!body || !body.state) return json(res, 400, { error: 'state required' });
      const payload = {
        id: auth.user.id,
        manager: body.manager || body.state.managerName || auth.user.name,
        userId: auth.user.id,
        updatedAt: Date.now(),
        state: body.state
      };
      fs.writeFileSync(savePathFor(auth.user.id), JSON.stringify(payload));
      return json(res, 200, { ok: true, id: auth.user.id });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  // legacy anonymous save (kept for compatibility)
  if (pathname === '/api/save' && req.method === 'POST') {
    const auth = authUser(req);
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8'));
      if (!body || !body.state) return json(res, 400, { error: 'state required' });
      if (auth) {
        const payload = {
          id: auth.user.id,
          manager: body.manager || body.state.managerName || auth.user.name,
          userId: auth.user.id,
          updatedAt: Date.now(),
          state: body.state
        };
        fs.writeFileSync(savePathFor(auth.user.id), JSON.stringify(payload));
        return json(res, 200, { ok: true, id: auth.user.id });
      }
      const id = crypto.createHash('sha1')
        .update(String(body.manager || body.state.managerName || 'coach') + '|' + (body.state.clubId || ''))
        .digest('hex')
        .slice(0, 16);
      const payload = {
        id,
        manager: body.manager || body.state.managerName,
        updatedAt: Date.now(),
        state: body.state
      };
      fs.writeFileSync(path.join(SAVES, id + '.json'), JSON.stringify(payload));
      return json(res, 200, { ok: true, id });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/saves' && req.method === 'GET') {
    return json(res, 200, { saves: [] });
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[EYE] listening on http://0.0.0.0:${PORT}`);
  console.log(`[EYE] root ${ROOT}`);
  console.log(`[EYE] data ${DATA_DIR}`);
});
