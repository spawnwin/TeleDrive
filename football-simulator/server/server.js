'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { Store } = require('./store');
const {
  hashPassword, verifyPassword, issueToken, hashToken, newId,
  validateName, validatePassword, RateLimiter
} = require('./auth');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'futbolx.json');
const STATIC_DIR = path.join(__dirname, '..');
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // 30 дней
const MAX_BODY = 512 * 1024;                        // сохранение игры ~150 КБ
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';

const store = new Store(DB_FILE);
const loginLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
const registerLimiter = new RateLimiter({ windowMs: 60 * 60 * 1000, max: 5 });

setInterval(() => {
  store.purgeExpiredSessions();
  loginLimiter.sweep();
  registerLimiter.sweep();
}, 10 * 60 * 1000).unref();

// ---------------- утилиты ----------------
function send(res, status, payload, extraHeaders) {
  const body = payload === null ? '' : JSON.stringify(payload);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Cache-Control': 'no-store'
  }, extraHeaders || {}));
  res.end(body);
}

function fail(res, status, message) {
  send(res, status, { error: message });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let aborted = false;
    const chunks = [];
    req.on('data', chunk => {
      if (aborted) return;
      size += chunk.length;
      if (size > MAX_BODY) {
        aborted = true;
        /* Соединение не рвём: иначе ответ 413 не успевает уйти и клиент
           видит сетевую ошибку. Остаток тела просто вычитываем в никуда. */
        req.resume();
        reject(Object.assign(new Error('Тело запроса слишком большое'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (aborted) return;
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(Object.assign(new Error('Некорректный JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function clientKey(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function bearer(req) {
  const header = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1] : null;
}

/* Возвращает пользователя по токену либо null. */
function authenticate(req) {
  const raw = bearer(req);
  if (!raw) return null;
  const session = store.findSession(hashToken(raw));
  if (!session) return null;
  const user = store.findUserById(session.userId);
  if (!user) return null;
  return { user, session };
}

function publicUser(user) {
  return { id: user.id, name: user.name, createdAt: user.createdAt };
}

// ---------------- обработчики API ----------------
const routes = {
  'POST /api/auth/register': async (req, res) => {
    const gate = registerLimiter.check(clientKey(req));
    if (!gate.allowed) return fail(res, 429, `Слишком много регистраций. Повторите через ${gate.retryAfter} с`);

    const body = await readJson(req);
    const nameError = validateName(body.name);
    if (nameError) return fail(res, 400, nameError);
    const passError = validatePassword(body.password);
    if (passError) return fail(res, 400, passError);

    const name = body.name.trim();
    if (store.findUserByName(name)) return fail(res, 409, 'Такое имя менеджера уже занято');

    const user = store.addUser({
      id: newId('u_'),
      name,
      nameKey: name.toLowerCase(),
      passwordHash: hashPassword(body.password),
      createdAt: Date.now()
    });

    const token = issueToken();
    store.addSession({
      tokenHash: token.hash,
      userId: user.id,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS
    });

    send(res, 201, { token: token.raw, user: publicUser(user), save: null });
  },

  'POST /api/auth/login': async (req, res) => {
    const body = await readJson(req);
    if (typeof body.name !== 'string' || typeof body.password !== 'string') {
      return fail(res, 400, 'Нужны имя менеджера и пароль');
    }
    const key = clientKey(req) + '|' + body.name.trim().toLowerCase();
    const gate = loginLimiter.check(key);
    if (!gate.allowed) return fail(res, 429, `Слишком много попыток. Повторите через ${gate.retryAfter} с`);

    const user = store.findUserByName(body.name);
    // Ответ одинаков и для несуществующего имени, и для неверного пароля.
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      return fail(res, 401, 'Неверное имя менеджера или пароль');
    }
    loginLimiter.reset(key);

    const token = issueToken();
    store.addSession({
      tokenHash: token.hash,
      userId: user.id,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS
    });

    const entry = store.getSave(user.id);
    send(res, 200, {
      token: token.raw,
      user: publicUser(user),
      save: entry ? entry.save : null,
      updatedAt: entry ? entry.updatedAt : null
    });
  },

  'POST /api/auth/logout': async (req, res) => {
    const raw = bearer(req);
    if (raw) store.removeSession(hashToken(raw));
    send(res, 200, { ok: true });
  },

  'GET /api/me': async (req, res) => {
    const auth = authenticate(req);
    if (!auth) return fail(res, 401, 'Нужен вход');
    send(res, 200, { user: publicUser(auth.user) });
  },

  'GET /api/save': async (req, res) => {
    const auth = authenticate(req);
    if (!auth) return fail(res, 401, 'Нужен вход');
    const entry = store.getSave(auth.user.id);
    send(res, 200, { save: entry ? entry.save : null, updatedAt: entry ? entry.updatedAt : null });
  },

  'PUT /api/save': async (req, res) => {
    const auth = authenticate(req);
    if (!auth) return fail(res, 401, 'Нужен вход');
    const body = await readJson(req);
    if (!body.save || typeof body.save !== 'object') {
      return fail(res, 400, 'Ожидается объект save');
    }
    const entry = store.putSave(auth.user.id, body.save);
    send(res, 200, { ok: true, updatedAt: entry.updatedAt });
  },

  'GET /api/leaderboard': async (req, res) => {
    send(res, 200, { rows: store.leaderboard(50) });
  },

  'DELETE /api/account': async (req, res) => {
    const auth = authenticate(req);
    if (!auth) return fail(res, 401, 'Нужен вход');
    store.removeUser(auth.user.id);
    send(res, 200, { ok: true });
  },

  'GET /api/health': async (req, res) => {
    send(res, 200, { ok: true, users: store.data.users.length });
  }
};

// ---------------- статика ----------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  // Не выпускаем запрос за пределы каталога игры.
  const target = path.normalize(path.join(STATIC_DIR, decodeURIComponent(rel)));
  if (!target.startsWith(STATIC_DIR)) return fail(res, 403, 'Доступ запрещён');

  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) return fail(res, 404, 'Не найдено');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(target)] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(target).pipe(res);
  });
}

// ---------------- сервер ----------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') return send(res, 204, null);

  const key = `${req.method} ${url.pathname}`;
  const handler = routes[key];

  if (handler) {
    try {
      await handler(req, res);
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error('[api]', key, e);
      fail(res, status, status === 500 ? 'Внутренняя ошибка сервера' : e.message);
    }
    return;
  }

  if (url.pathname.startsWith('/api/')) return fail(res, 404, 'Такого метода нет');
  if (req.method !== 'GET') return fail(res, 405, 'Метод не поддерживается');
  serveStatic(req, res, url.pathname);
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`FUTBOL X сервер слушает http://${HOST}:${PORT}`);
    console.log(`База: ${DB_FILE}`);
    console.log(`Игра раздаётся из ${STATIC_DIR}`);
  });
}

module.exports = { server, store };
