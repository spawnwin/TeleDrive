#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const db = require('./db');
const G = require('./game');
const { createCupsModule } = require('./cups');

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

function normalizeLogin(login) {
  return String(login || '').trim().toLowerCase().replace(/[^a-z0-9_\-\.]/g, '').slice(0, 24);
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';
  if (xf) return String(xf).split(',')[0].trim().slice(0, 64);
  return String(req.socket?.remoteAddress || '').slice(0, 64);
}

function usersDb() { return db.usersDb(); }
function saveUsers(u) { db.saveUsers(u); }
function sessionsDb() { return db.sessionsDb(); }
function publicUser(u) {
  return { id: u.id, login: u.login, name: u.name, createdAt: u.createdAt };
}

function enrichUser(u) {
  const club = db.getClub(u.id);
  return {
    ...publicUser(u),
    level: u.level || 1,
    xp: u.xp || 0,
    xpNext: u.level >= 10 ? 0 : Math.max(0, [0, 0, 100, 250, 500, 900, 1500, 2400, 3600, 5200, 7500][(u.level || 1) + 1] - (u.xp || 0)),
    role: u.role || 'user',
    isBot: !!u.isBot,
    money: u.money ?? 500000,
    fans: u.fans ?? 12000,
    boosters: u.boosters ?? 3,
    fame: u.fame || 0,
    prestige: u.prestige || 0,
    points: u.points || 0,
    cupsPlayed: u.cupsPlayed || 0,
    cupsWon: u.cupsWon || 0,
    clubName: club?.name || u.clubName || null,
    strength: club ? G.clubStrength(club) : (u.strength || 0),
    teamBound: !!(u.teamBound || club)
  };
}

function persistUser(user) {
  const users = usersDb();
  users.users[user.id] = user;
  saveUsers(users);
}

function ensureClub(user, opts = {}) {
  let club = db.getClub(user.id);
  if (!club) {
    club = G.defaultClub(user, opts);
    G.ensureLineup(club);
    db.setClub(user.id, club);
    user.teamBound = true;
    user.clubName = club.name;
    persistUser(user);
  }
  return club;
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
      id, login: ADMIN_LOGIN, name: 'Админ EYE', salt, hash,
      createdAt: Date.now(), role: 'admin', isBot: false,
      level: 10, xp: 7500, cupsPlayed: 0, cupsWon: 0,
      money: 2000000, fans: 80000, boosters: 20, fame: 100, prestige: 50, points: 0
    };
    users.users[id] = admin;
    saveUsers(users);
    ensureClub(admin, { name: 'EYE Admin FC', short: 'ADM', color: '#0B3D2E' });
    console.log(`[EYE] admin created · login=${ADMIN_LOGIN}`);
  } else {
    admin.role = 'admin';
    persistUser(admin);
    ensureClub(admin, { name: admin.clubName || 'EYE Admin FC' });
  }
}

function ensureBotPool(n = 24) {
  const users = usersDb();
  const bots = Object.values(users.users).filter((u) => u.isBot);
  while (bots.length < n) {
    const id = crypto.randomBytes(8).toString('hex');
    const login = 'bot_' + id.slice(0, 6);
    const bot = {
      id, login, name: 'Бот ' + (bots.length + 1),
      salt: '', hash: '', createdAt: Date.now(),
      role: 'bot', isBot: true, level: rndLevel(), xp: 0,
      cupsPlayed: 0, cupsWon: 0,
      money: 300000, fans: 8000, boosters: 0, fame: 0, prestige: 0, points: 0
    };
    users.users[id] = bot;
    bots.push(bot);
    const club = G.defaultClub(bot);
    G.ensureLineup(club);
    db.setClub(id, club);
  }
  saveUsers(users);
  return bots;
}

function rndLevel() {
  return 1 + Math.floor(Math.random() * 8);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

function send(res, code, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, {
    'Cache-Control': headers['Cache-Control'] || 'no-cache',
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

function rewardUsers(home, away, match) {
  const [hg, ag] = match.score;
  const apply = (user, won, draw, oppName) => {
    if (!user || user.isBot) return;
    const prize = won ? 45000 : draw ? 18000 : 8000;
    user.money = (user.money || 0) + prize;
    user.xp = (user.xp || 0) + (won ? 35 : draw ? 18 : 10);
    user.level = G.levelFromXp(user.xp);
    user.fans = Math.max(1000, (user.fans || 10000) + (won ? 120 : draw ? 20 : -40));
    if (won) user.points = (user.points || 0) + 3;
    else if (draw) user.points = (user.points || 0) + 1;
    persistUser(user);
    const club = db.getClub(user.id);
    if (club) {
      G.pushLedger(club, prize, won ? `Победа vs ${oppName}` : draw ? `Ничья vs ${oppName}` : `Поражение vs ${oppName}`);
      db.setClub(user.id, club);
    }
  };
  apply(home, hg > ag, hg === ag, match.away?.name || 'соперник');
  apply(away, ag > hg, hg === ag, match.home?.name || 'соперник');
}

function playCupTie(homeEnt, awayEnt, meta = {}) {
  const homeUser = usersDb().users[homeEnt.userId];
  const awayUser = usersDb().users[awayEnt.userId];
  if (!homeUser || !awayUser) return null;
  const homeClub = ensureClub(homeUser, { name: homeEnt.clubName });
  const awayClub = ensureClub(awayUser, { name: awayEnt.clubName });
  const match = G.simulateMatch(homeClub, awayClub, {
    competition: 'cup',
    homeUserId: homeUser.id,
    awayUserId: awayUser.id,
    cupId: meta.cupId,
    round: meta.round
  });
  match.cupName = meta.cupName;
  db.setClub(homeUser.id, homeClub);
  db.setClub(awayUser.id, awayClub);
  db.addMatch(match);
  // prize money handled at cup finalize; small appearance fee
  if (!homeUser.isBot) {
    homeUser.money = (homeUser.money || 0) + 5000;
    persistUser(homeUser);
    G.pushLedger(homeClub, 5000, `Кубок · ${meta.round || 'матч'}`);
    db.setClub(homeUser.id, homeClub);
  }
  if (!awayUser.isBot) {
    awayUser.money = (awayUser.money || 0) + 5000;
    persistUser(awayUser);
    G.pushLedger(awayClub, 5000, `Кубок · ${meta.round || 'матч'}`);
    db.setClub(awayUser.id, awayClub);
  }
  return {
    score: match.score,
    matchId: match.id,
    homeStrength: match.home.strength,
    awayStrength: match.away.strength
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') return json(res, 204, {});

  if (pathname === '/api/health') {
    return json(res, 200, {
      ok: true,
      service: 'eye-manager',
      product: 'EYE XI',
      ts: Date.now(),
      db: 'sqlite',
      online: db.listOnlineUsers().length,
      cups: cups ? cups.stats() : null
    });
  }

  if (pathname === '/api/register' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      const login = normalizeLogin(body.login);
      const password = String(body.password || '');
      const name = String(body.name || login).trim().slice(0, 32);
      if (login.length < 3) return json(res, 400, { error: 'Логин минимум 3 символа' });
      if (password.length < 4) return json(res, 400, { error: 'Пароль минимум 4 символа' });
      if (login === ADMIN_LOGIN) return json(res, 400, { error: 'Логин зарезервирован' });
      const users = usersDb();
      if (Object.values(users.users).some((u) => u.login === login)) {
        return json(res, 409, { error: 'Логин уже занят' });
      }
      const id = crypto.randomBytes(8).toString('hex');
      const { salt, hash } = hashPassword(password);
      const user = {
        id, login, name, salt, hash, createdAt: Date.now(),
        role: 'user', isBot: false, level: 1, xp: 0, cupsPlayed: 0, cupsWon: 0,
        teamBound: false, regIp: clientIp(req) || null,
        money: 500000, fans: 12000, boosters: 3, fame: 0, prestige: 0, points: 0
      };
      users.users[id] = user;
      saveUsers(users);
      const club = ensureClub(user, {
        name: body.clubName ? String(body.clubName).slice(0, 32) : undefined,
        color: body.color
      });
      const token = createSession(id);
      return json(res, 200, {
        ok: true,
        token,
        user: enrichUser(user),
        club: G.publicClub(club, user)
      });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      const login = normalizeLogin(body.login);
      const password = String(body.password || '');
      const user = Object.values(usersDb().users).find((u) => u.login === login);
      if (!user || user.isBot || !verifyPassword(password, user.salt, user.hash)) {
        return json(res, 401, { error: 'Неверный логин или пароль' });
      }
      const club = ensureClub(user);
      const token = createSession(user.id);
      return json(res, 200, {
        ok: true,
        token,
        user: enrichUser(user),
        club: G.publicClub(club, user)
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
    const club = ensureClub(auth.user);
    return json(res, 200, {
      ok: true,
      user: enrichUser(auth.user),
      club: G.publicClub(club, auth.user),
      online: db.listOnlineUsers().length,
      liveCup: cups.findMyLiveCup(auth.user.id),
      cupEvents: cups.listCupEvents(auth.user.id, { limit: 8 })
    });
  }

  if (pathname === '/api/club' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const club = ensureClub(auth.user);
    return json(res, 200, { ok: true, club: G.publicClub(club, auth.user), user: enrichUser(auth.user) });
  }

  if (pathname === '/api/club' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const club = ensureClub(auth.user);
      if (body.name) club.name = String(body.name).slice(0, 32);
      if (body.short) club.short = String(body.short).slice(0, 4).toUpperCase();
      if (body.color) club.color = String(body.color).slice(0, 16);
      if (body.stadium) club.stadium = String(body.stadium).slice(0, 40);
      const formationChanged = body.formation && G.FORMATIONS[body.formation] && body.formation !== club.formation;
      if (formationChanged) club.formation = body.formation;
      if (body.style && G.STYLES.includes(body.style)) club.style = body.style;
      if (Array.isArray(body.instructions)) club.instructions = body.instructions.slice(0, 8);
      G.ensureLineup(club, !!formationChanged);
      db.setClub(auth.user.id, club);
      auth.user.clubName = club.name;
      persistUser(auth.user);
      return json(res, 200, { ok: true, club: G.publicClub(club, auth.user) });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/players/train' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      const club = ensureClub(auth.user);
      const r = G.trainPlayer(club, body.playerId, body.skill, Number(body.amount) || 1);
      if (!r.ok) return json(res, 400, r);
      db.setClub(auth.user.id, club);
      return json(res, 200, { ok: true, player: r.player, club: G.publicClub(club, auth.user) });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/players/recover' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const club = ensureClub(auth.user);
      const useBooster = !!body.booster;
      if (useBooster) {
        if ((auth.user.boosters || 0) < 1) return json(res, 400, { error: 'Нет бустеров' });
        auth.user.boosters -= 1;
        G.recoverSquad(club);
        G.pushLedger(club, 0, 'Восстановление за бустер');
      } else {
        if ((auth.user.money || 0) < 15000) return json(res, 400, { error: 'Нужно 15 000 на восстановление' });
        auth.user.money -= 15000;
        G.recoverSquad(club);
        G.pushLedger(club, -15000, 'Восстановление состава');
      }
      persistUser(auth.user);
      db.setClub(auth.user.id, club);
      return json(res, 200, { ok: true, club: G.publicClub(club, auth.user), user: enrichUser(auth.user) });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/club/staff' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      const club = ensureClub(auth.user);
      const r = G.hireStaff(club, body.role);
      if (!r.ok) return json(res, 400, r);
      if ((auth.user.money || 0) < r.cost) return json(res, 400, { error: `Нужно ${r.cost} ¤` });
      auth.user.money -= r.cost;
      G.pushLedger(club, -r.cost, r.label);
      persistUser(auth.user);
      db.setClub(auth.user.id, club);
      return json(res, 200, { ok: true, club: G.publicClub(club, auth.user), user: enrichUser(auth.user) });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/club/stadium' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const club = ensureClub(auth.user);
    const r = G.upgradeStadium(club);
    if (!r.ok) return json(res, 400, r);
    if ((auth.user.money || 0) < r.cost) return json(res, 400, { error: `Нужно ${r.cost} ¤` });
    auth.user.money -= r.cost;
    auth.user.fans = (auth.user.fans || 0) + 800;
    G.pushLedger(club, -r.cost, r.label);
    persistUser(auth.user);
    db.setClub(auth.user.id, club);
    return json(res, 200, { ok: true, club: G.publicClub(club, auth.user), user: enrichUser(auth.user) });
  }

  if (pathname === '/api/club/lineup' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      const club = ensureClub(auth.user);
      const r = G.setLineup(club, body.lineupIds, body.benchIds);
      if (!r.ok) return json(res, 400, r);
      db.setClub(auth.user.id, club);
      return json(res, 200, { ok: true, club: G.publicClub(club, auth.user) });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/bonus/xp' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    if ((auth.user.boosters || 0) < 1) return json(res, 400, { error: 'Нет бустеров' });
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const club = ensureClub(auth.user);
      const p = club.players.find((x) => x.id === body.playerId) || club.players[0];
      if (!p) return json(res, 400, { error: 'Нет игрока' });
      auth.user.boosters -= 1;
      p.xpPool = (p.xpPool || 0) + 40;
      G.pushLedger(club, 0, `Бустер опыта · ${p.name}`);
      persistUser(auth.user);
      db.setClub(auth.user.id, club);
      return json(res, 200, { ok: true, club: G.publicClub(club, auth.user), user: enrichUser(auth.user) });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/friendly' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    return json(res, 200, {
      ok: true,
      queue: db.friendlyList().map((f) => ({
        id: f.id,
        userId: f.userId,
        login: f.login,
        name: f.name,
        clubName: f.clubName,
        level: f.level,
        strength: f.strength,
        expiresAt: f.expiresAt
      })),
      online: db.listOnlineUsers()
    });
  }

  if (pathname === '/api/friendly' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const club = ensureClub(auth.user);
    // remove old own
    db.friendlyList().filter((f) => f.userId === auth.user.id).forEach((f) => db.friendlyTake(f.id));
    const entry = db.friendlyPost({
      id: G.uid('fr'),
      userId: auth.user.id,
      login: auth.user.login,
      name: auth.user.name,
      clubName: club.name,
      level: auth.user.level,
      strength: G.clubStrength(club),
      expiresAt: Date.now() + 20 * 60 * 1000
    });
    return json(res, 200, { ok: true, entry });
  }

  if (pathname.match(/^\/api\/friendly\/[^/]+\/accept$/) && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const id = pathname.split('/')[3];
    const entry = db.friendlyTake(id);
    if (!entry) return json(res, 404, { error: 'Заявка не найдена или устарела' });
    if (entry.userId === auth.user.id) {
      db.friendlyPost(entry);
      return json(res, 400, { error: 'Нельзя принять свою заявку' });
    }
    const homeUser = usersDb().users[entry.userId];
    const awayUser = auth.user;
    if (!homeUser) return json(res, 404, { error: 'Соперник недоступен' });
    const homeClub = ensureClub(homeUser);
    const awayClub = ensureClub(awayUser);
    const match = G.simulateMatch(homeClub, awayClub, {
      competition: 'friendly',
      homeUserId: homeUser.id,
      awayUserId: awayUser.id
    });
    db.setClub(homeUser.id, homeClub);
    db.setClub(awayUser.id, awayClub);
    db.addMatch(match);
    rewardUsers(homeUser, awayUser, match);
    return json(res, 200, { ok: true, match });
  }

  if (pathname === '/api/friendly/bot' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    ensureBotPool(12);
    const bots = Object.values(usersDb().users).filter((u) => u.isBot);
    const bot = bots[Math.floor(Math.random() * bots.length)];
    const homeClub = ensureClub(auth.user);
    const awayClub = ensureClub(bot);
    const match = G.simulateMatch(homeClub, awayClub, {
      competition: 'friendly',
      homeUserId: auth.user.id,
      awayUserId: bot.id
    });
    db.setClub(auth.user.id, homeClub);
    db.setClub(bot.id, awayClub);
    db.addMatch(match);
    rewardUsers(auth.user, bot, match);
    return json(res, 200, { ok: true, match });
  }

  if (pathname === '/api/matches' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    return json(res, 200, { ok: true, matches: db.listMatchesFor(auth.user.id, 40) });
  }

  if (pathname.startsWith('/api/matches/') && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const id = pathname.slice('/api/matches/'.length);
    const match = db.getMatch(id);
    if (!match) return json(res, 404, { error: 'Матч не найден' });
    return json(res, 200, { ok: true, match });
  }

  if (pathname === '/api/rating' && req.method === 'GET') {
    const list = Object.values(usersDb().users)
      .filter((u) => !u.isBot)
      .map((u) => enrichUser(u))
      .sort((a, b) => (b.points - a.points) || (b.xp - a.xp))
      .slice(0, 50);
    return json(res, 200, { ok: true, leaders: list });
  }

  // ——— cups (reuse module) ———
  if (pathname === '/api/cups' && req.method === 'GET') {
    const status = url.searchParams.get('status') || undefined;
    const bracketId = url.searchParams.get('bracketId') || undefined;
    const mine = url.searchParams.get('mine') === '1';
    const auth = mine ? requireAuth(req, res) : authUser(req);
    if (mine && !auth) return;
    return json(res, 200, {
      ok: true,
      cups: cups.listCups({ status, bracketId, mineFor: mine ? auth.user.id : undefined }),
      meta: cups.stats()
    });
  }

  if (pathname === '/api/cups/meta' && req.method === 'GET') {
    return json(res, 200, { ok: true, ...cups.stats() });
  }

  if (pathname === '/api/cups/leaderboard' && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      leaders: cups.leaderboard({ limit: 40 }),
      brackets: cups.LEVEL_BRACKETS
    });
  }

  if (pathname.startsWith('/api/cups/') && req.method === 'GET') {
    const id = pathname.slice('/api/cups/'.length).split('/')[0];
    if (!id || id === 'meta' || id === 'leaderboard') return json(res, 404, { error: 'Нет' });
    const cup = cups.getCup(id);
    if (!cup) return json(res, 404, { error: 'Кубок не найден' });
    return json(res, 200, { ok: true, cup });
  }

  if (pathname.match(/^\/api\/cups\/[^/]+\/join$/) && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const id = pathname.split('/')[3];
    const club = ensureClub(auth.user);
    const r = cups.joinCup(id, auth.user, club.name, { strength: G.clubStrength(club) });
    if (!r.ok) return json(res, 400, r);
    return json(res, 200, r);
  }

  if (pathname.match(/^\/api\/cups\/[^/]+\/leave$/) && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const id = pathname.split('/')[3];
    const r = cups.leaveCup(id, auth.user.id);
    if (!r.ok) return json(res, 400, r);
    return json(res, 200, r);
  }

  if (pathname === '/api/admin/tick' && req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    return json(res, 200, cups.tick());
  }

  if (pathname === '/api/admin/stats' && req.method === 'GET') {
    if (!requireAdmin(req, res)) return;
    return json(res, 200, { ok: true, ...cups.stats(), humans: Object.values(usersDb().users).filter((u) => !u.isBot).length });
  }

  // static
  let target = pathname === '/' ? '/index.html' : pathname;
  let file = safeJoin(ROOT, target);
  if (!file) return send(res, 403, 'Forbidden');
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(ROOT, 'index.html');
  if (file.startsWith(path.join(ROOT, 'server', 'data'))) return send(res, 404, 'Not found');
  const ext = path.extname(file);
  const type = MIME[ext] || 'application/octet-stream';
  const cache = ['.html', '.js', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=86400';
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
      clubStrength: (userId) => {
        const club = db.getClub(userId);
        return club ? G.clubStrength(club) : 0;
      },
      playCupTie,
      readCareerClub: (userId) => {
        const club = db.getClub(userId);
        const u = usersDb().users[userId];
        if (!club || !u) return null;
        const me = {
          id: 'me',
          name: club.name,
          budget: u.money || 0,
          squad: club.players,
          lineup: club.lineupIds,
          lineupIds: club.lineupIds
        };
        const st = { clubId: 'me', clubs: [me], week: 1, season: 1, ledger: club.ledger || [], inbox: [] };
        return { payload: { state: st }, st, me };
      },
      writeCareer: (userId, payload) => {
        const u = usersDb().users[userId];
        const club = db.getClub(userId);
        const me = payload?.state?.clubs?.find((c) => c.id === payload.state.clubId);
        if (u && me && me.budget != null) {
          const prev = u.money || 0;
          u.money = Math.round(me.budget);
          persistUser(u);
          if (club) {
            const delta = u.money - prev;
            if (delta) {
              const last = (payload.state.ledger || [])[0];
              G.pushLedger(club, delta, last?.label || 'Приз кубка');
            }
            if (Array.isArray(payload.state.ledger)) club.ledger = payload.state.ledger.slice(0, 80);
            db.setClub(userId, club);
          }
        }
      }
    }
  });
  ensureAdminUser();
  ensureBotPool(24);
  cups.ensureBotPool?.(8);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[EYE XI] http://0.0.0.0:${PORT}`);
    console.log(`[EYE XI] db ${db.DB_FILE}`);
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
