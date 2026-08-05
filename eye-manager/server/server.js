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
const { createLeagueModule } = require('./league');
const { createSocialModule } = require('./social');

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
  const finance = club ? G.financeSnapshot(u, club) : null;
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
    teamBound: !!(u.teamBound || club),
    finance
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
    G.pickSponsor(club, user);
    db.setClub(user.id, club);
    user.teamBound = true;
    user.clubName = club.name;
    persistUser(user);
  }
  if (!club.userId) club.userId = user.id;
  G.ensureSponsor(club, user);
  return club;
}

let cups;
let league;
let social;

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
  const apply = (user, won, draw, oppName, isHome, sideInjuries) => {
    if (!user || user.isBot) return;
    const prize = won ? 45000 : draw ? 18000 : 8000;
    const club = db.getClub(user.id);
    const tickets = isHome && club
      ? G.ticketIncome(club, user, won, { derby: !!match.derby })
      : 0;
    const total = prize + tickets;
    user.money = Math.max(0, (user.money || 0) + total);
    user.xp = (user.xp || 0) + (won ? 35 : draw ? 18 : 10);
    user.level = G.levelFromXp(user.xp);
    user.fans = Math.max(1000, (user.fans || 10000) + (won ? 120 : draw ? 20 : -40));
    if (won) {
      user.points = (user.points || 0) + 3;
      user.fame = (user.fame || 0) + 2;
    } else if (draw) {
      user.points = (user.points || 0) + 1;
      user.fame = (user.fame || 0) + 1;
    } else {
      user.fame = Math.max(0, (user.fame || 0) - 1);
    }
    if (match.competition === 'cup' && won) user.prestige = (user.prestige || 0) + 1;
    persistUser(user);
    if (club) {
      G.pushLedger(club, prize, won ? `Победа vs ${oppName}` : draw ? `Ничья vs ${oppName}` : `Поражение vs ${oppName}`);
      if (tickets) G.pushLedger(club, tickets, 'Билеты (дома)');
      G.applyBoardAfterMatch(club, match, isHome);
      if (club.board?.sacked) {
        pushUserEvent(user.id, {
          type: 'board',
          title: 'Совет директоров уволил вас',
          body: `Уверенность ${club.board.confidence}%. Оформите новый контракт во вкладке «Совет».`
        });
      } else if (club.board && club.board.confidence < 35 && !won) {
        pushUserEvent(user.id, {
          type: 'board',
          title: 'Совет недоволен',
          body: `Уверенность совета: ${club.board.confidence}%. Нужны результаты.`
        });
      }
      db.setClub(user.id, club);
    }
    if (match.motm && match.motm.side === (isHome ? 'home' : 'away')) {
      pushUserEvent(user.id, {
        type: 'motm',
        title: 'Игрок матча',
        body: `${match.motm.name} · оценка ${match.motm.rating}`,
        matchId: match.id
      });
    }
    if (match.derby && won) {
      pushUserEvent(user.id, {
        type: 'derby',
        title: 'Победа в принципиальном матче',
        body: match.derby,
        matchId: match.id
      });
    }
    (sideInjuries || []).forEach((inj) => {
      pushUserEvent(user.id, {
        type: 'injury',
        title: inj.label ? `Травма · ${inj.label}` : 'Травма',
        body: `${inj.name} выбыл примерно на ${inj.hours} ч`
      });
    });
    (match.suspensions?.[isHome ? 'home' : 'away'] || []).forEach((ban) => {
      pushUserEvent(user.id, {
        type: 'suspension',
        title: 'Дисквалификация',
        body: `${ban.name}: ${ban.reason || 'карточки'} · пропуск ${ban.matches} матч`
      });
    });
  };
  apply(home, hg > ag, hg === ag, match.away?.name || 'соперник', true, match.injuries?.home);
  apply(away, ag > hg, hg === ag, match.home?.name || 'соперник', false, match.injuries?.away);
}

function annotateCupPens(matchId, score) {
  const m = db.getMatch(matchId);
  if (!m) return;
  m.score = [score[0], score[1]];
  m.events = m.events || [];
  m.events.push({
    minute: 120,
    type: 'pens',
    side: score[0] > score[1] ? 'home' : 'away',
    player: 'Серия пенальти',
    score: [score[0], score[1]]
  });
  db.addMatch(m);
}

function ensureBotClub(user, clubName) {
  if (!user?.id) return 0;
  let club = db.getClub(user.id);
  if (!club) {
    club = G.defaultClub(user, { name: clubName || user.clubName || `AI ${user.name}` });
    G.ensureLineup(club);
    db.setClub(user.id, club);
  }
  const str = G.clubStrength(club);
  user.strength = str;
  user.clubName = club.name;
  return str;
}

function processWageDay(user, club) {
  if (!user || user.isBot || !club) return null;
  const hadBaseline = user.lastWageAt != null;
  G.ensureSponsor(club, user);
  const result = G.settleWageDay(user, club);
  if (!result) {
    if (!hadBaseline && user.lastWageAt != null) persistUser(user);
    return null;
  }
  persistUser(user);
  db.setClub(user.id, club);
  pushUserEvent(user.id, {
    type: 'wage',
    title: result.days > 1 ? `Зарплаты за ${result.days} дн.` : 'Суточный расчёт',
    body: (result.delta >= 0 ? '+' : '') + Math.round(result.delta) + ' ¤',
    money: result.delta
  });
  (result.playtime?.created || []).forEach((p) => {
    pushUserEvent(user.id, {
      type: 'playtime',
      title: 'Мало игрового времени',
      body: `${p.name} хочет место в основе (матчей: ${p.seasonApps || 0})`,
      playerId: p.id
    });
  });
  (result.loans?.returned || []).forEach((p) => {
    pushUserEvent(user.id, {
      type: 'loan',
      title: 'Конец аренды',
      body: `${p.name} вернулся в клуб`
    });
  });
  if (result.tvPay > 0) {
    pushUserEvent(user.id, {
      type: 'finance',
      title: 'ТВ-права',
      body: `+${Math.round(result.tvPay)} ¤ медиадоход`,
      money: result.tvPay
    });
  }
  (result.offers || []).forEach((o) => {
    pushUserEvent(user.id, {
      type: 'transfer_offer',
      title: 'Входящее предложение',
      body: `${o.buyer} за ${o.playerName}: ${o.bid} ¤`,
      offerId: o.id,
      playerId: o.playerId,
      money: o.bid
    });
  });
  if (result.contracts) {
    (result.contracts.asks || []).forEach((p) => {
      pushUserEvent(user.id, {
        type: 'contract_ask',
        title: 'Контракт истёк',
        body: `${p.name} ждёт продления`
      });
    });
    (result.contracts.left || []).forEach((p) => {
      pushUserEvent(user.id, {
        type: 'contract_left',
        title: 'Свободный агент',
        body: `${p.name} покинул клуб`
      });
    });
  }
  if (result.finance && (result.finance.status === 'critical' || result.finance.status === 'insolvent')) {
    pushUserEvent(user.id, {
      type: 'finance',
      title: result.finance.status === 'insolvent' ? 'Банкротство клуба' : 'Финансовый кризис',
      body: result.finance.status === 'insolvent'
        ? 'Эмбарго на трансферы и улучшения. Продайте игроков или выиграйте призы.'
        : `Долг ${Math.round(result.finance.debt)} ¤ · лимит кредита ${result.finance.credit} ¤`
    });
  }
  return result;
}

function spendMoney(user, amount, club = null) {
  const cost = Math.max(0, Math.round(amount || 0));
  const clubObj = club || db.getClub(user.id);
  const fin = clubObj ? G.financeSnapshot(user, clubObj) : null;
  if (fin?.embargo && cost > 0) return false;
  const credit = fin?.credit || 0;
  const next = (user.money || 0) - cost;
  if (next < -credit) return false;
  user.money = next;
  return true;
}

function assertCanSpend(user, club, amount, label = 'Покупка') {
  const fin = G.financeSnapshot(user, club);
  if (fin.embargo) {
    return { ok: false, error: `Эмбарго при банкротстве — ${label} недоступна` };
  }
  const cost = Math.max(0, Math.round(amount || 0));
  if ((user.money || 0) - cost < -fin.credit) {
    return { ok: false, error: `Недостаточно средств (кредит ${fin.credit} ¤)` };
  }
  return { ok: true, finance: fin };
}

function matchCooldownOk(user, kind = 'match') {
  const key = kind === 'bot' ? 'lastBotAt' : 'lastMatchAt';
  const cd = kind === 'bot' ? 90 * 1000 : 45 * 1000;
  const last = user[key] || 0;
  const left = cd - (Date.now() - last);
  if (left > 0) return { ok: false, waitMs: left, error: `Подождите ${Math.ceil(left / 1000)} с` };
  return { ok: true };
}

function markMatchPlayed(user, kind = 'match') {
  user.lastMatchAt = Date.now();
  if (kind === 'bot') user.lastBotAt = Date.now();
  persistUser(user);
}

function sanitizeColor(c) {
  const s = String(c || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s;
  return '#1FA65A';
}

function pushUserEvent(userId, ev) {
  const u = usersDb().users[userId];
  if (!u || u.isBot) return;
  u.cupEvents = Array.isArray(u.cupEvents) ? u.cupEvents : [];
  u.cupEvents.unshift({
    id: G.uid('ev'),
    at: Date.now(),
    read: false,
    ...ev
  });
  if (u.cupEvents.length > 40) u.cupEvents.length = 40;
  persistUser(u);
}

function refreshTransferMarket(force = false, scoutLevel = 0, club = null) {
  if (club) {
    G.refreshClubMarket(club, force);
    return { list: club.transferList || [], refreshedAt: club.transferRefreshedAt || Date.now() };
  }
  const tm = db.getTransferMarket();
  const age = Date.now() - (tm.refreshedAt || 0);
  if (!force && tm.list?.length && age < 60 * 60e3) return tm;
  const list = G.generateTransferList(scoutLevel, 8);
  return db.setTransferMarket(list, Date.now());
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
  match.round = meta.round || null;
  db.setClub(homeUser.id, homeClub);
  db.setClub(awayUser.id, awayClub);
  // board confidence for humans
  if (!homeUser.isBot) {
    G.applyBoardAfterMatch(homeClub, match, true);
    db.setClub(homeUser.id, homeClub);
    if (homeClub.board?.sacked) {
      pushUserEvent(homeUser.id, {
        type: 'board',
        title: 'Совет директоров уволил вас',
        body: `Уверенность ${homeClub.board.confidence}%. Нужен новый контракт.`
      });
    }
  }
  if (!awayUser.isBot) {
    G.applyBoardAfterMatch(awayClub, match, false);
    db.setClub(awayUser.id, awayClub);
    if (awayClub.board?.sacked) {
      pushUserEvent(awayUser.id, {
        type: 'board',
        title: 'Совет директоров уволил вас',
        body: `Уверенность ${awayClub.board.confidence}%. Нужен новый контракт.`
      });
    }
  }
  db.addMatch(match);
  try { social?.newsFromMatch(match); } catch {}
  // prize money handled at cup finalize; appearance fee + home tickets
  if (!homeUser.isBot) {
    const homeWon = match.score[0] > match.score[1];
    const tickets = G.ticketIncome(homeClub, homeUser, homeWon, { derby: !!match.derby });
    homeUser.money = Math.max(0, (homeUser.money || 0) + 5000 + tickets);
    persistUser(homeUser);
    G.pushLedger(homeClub, 5000, `Кубок · ${meta.round || 'матч'}`);
    if (tickets) G.pushLedger(homeClub, tickets, 'Билеты (кубок)');
    db.setClub(homeUser.id, homeClub);
  }
  if (!awayUser.isBot) {
    awayUser.money = Math.max(0, (awayUser.money || 0) + 5000);
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

function playLeagueTie(homeUserId, awayUserId, meta = {}) {
  const homeUser = usersDb().users[homeUserId];
  const awayUser = usersDb().users[awayUserId];
  if (!homeUser || !awayUser) return null;
  const homeClub = ensureClub(homeUser);
  const awayClub = ensureClub(awayUser);
  const match = G.simulateMatch(homeClub, awayClub, {
    competition: 'league',
    homeUserId: homeUser.id,
    awayUserId: awayUser.id,
    leagueId: meta.leagueId,
    round: meta.round
  });
  match.leagueName = meta.leagueName;
  match.round = meta.round || null;
  db.setClub(homeUser.id, homeClub);
  db.setClub(awayUser.id, awayClub);
  db.addMatch(match);
  rewardUsers(homeUser, awayUser, match);
  try { social?.newsFromMatch(match); } catch {}
  return match;
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
      cups: cups ? cups.stats() : null,
      league: league ? league.stats() : null
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
    if (G.tickClubClock(club)) db.setClub(auth.user.id, club);
    const wage = processWageDay(auth.user, club);
    const myLeague = league ? league.findMyLeague(auth.user.id) : null;
    const cal = league ? league.calendarFor(auth.user.id) : null;
    return json(res, 200, {
      ok: true,
      user: enrichUser(auth.user),
      club: G.publicClub(club, auth.user),
      online: db.listOnlineUsers().length,
      liveCup: cups.findMyLiveCup(auth.user.id),
      league: myLeague ? league.publicLeague(myLeague, auth.user.id) : null,
      calendar: cal,
      cupEvents: cups.listCupEvents(auth.user.id, { limit: 8 }),
      wageDay: wage,
      challenges: db.friendlyList().filter((f) => f.type === 'challenge' && f.targetUserId === auth.user.id)
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
      if (body.color) club.color = sanitizeColor(body.color);
      if (body.stadium) club.stadium = String(body.stadium).slice(0, 40);
      const formationChanged = body.formation && G.FORMATIONS[body.formation] && body.formation !== club.formation;
      if (formationChanged) club.formation = body.formation;
      else if (body.formation && G.FORMATIONS[body.formation]) club.formation = body.formation;
      if (body.style && G.STYLES.includes(body.style)) club.style = body.style;
      if (Array.isArray(body.instructions)) club.instructions = body.instructions.slice(0, 8);
      const forceLineup = !!(body.rebuildLineup || body.autoLineup || formationChanged);
      G.ensureLineup(club, forceLineup);
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
      if (body.session) {
        const r = G.trainSession(club, body.playerId, body.session, {
          spendUserMoney: (cost) => spendMoney(auth.user, cost)
        });
        if (!r.ok) return json(res, 400, r);
        persistUser(auth.user);
        db.setClub(auth.user.id, club);
        return json(res, 200, {
          ok: true,
          session: r.session,
          sessionLabel: r.sessionLabel,
          xpGain: r.xpGain,
          cost: r.cost,
          player: r.player,
          club: G.publicClub(club, auth.user),
          user: enrichUser(auth.user)
        });
      }
      const r = G.trainPlayer(club, body.playerId, body.skill, Number(body.amount) || 1);
      if (!r.ok) return json(res, 400, r);
      db.setClub(auth.user.id, club);
      return json(res, 200, { ok: true, player: r.player, club: G.publicClub(club, auth.user) });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/train/sessions' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const sessions = Object.entries(G.TRAIN_SESSIONS || {}).map(([id, s]) => ({
      id,
      label: s.label,
      xp: [s.xpMin, s.xpMax],
      fitnessCost: s.fitnessCost,
      money: s.money || 0
    }));
    return json(res, 200, { ok: true, sessions });
  }

  if (pathname === '/api/news' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const tag = url.searchParams.get('tag') || undefined;
    const limit = Math.min(80, Math.max(1, Number(url.searchParams.get('limit')) || 40));
    return json(res, 200, { ok: true, items: social ? social.listNews({ limit, tag }) : [] });
  }

  if (pathname === '/api/chat' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const limit = Math.min(80, Math.max(1, Number(url.searchParams.get('limit')) || 40));
    const after = url.searchParams.get('after') || undefined;
    return json(res, 200, { ok: true, messages: social ? social.listChat({ limit, after }) : [] });
  }

  if (pathname === '/api/chat' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const club = ensureClub(auth.user);
      const r = social.postChat({
        userId: auth.user.id,
        login: auth.user.login,
        name: auth.user.name,
        clubName: club?.name,
        text: body.text
      });
      if (!r.ok) return json(res, 400, r);
      return json(res, 200, r);
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/press' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const club = ensureClub(auth.user);
    const cdLeft = club.lastPressAt ? Math.max(0, 30 * 60e3 - (Date.now() - club.lastPressAt)) : 0;
    return json(res, 200, {
      ok: true,
      options: social.pressOptions(),
      cooldownMs: cdLeft,
      buff: club.pressBuff && club.pressBuff.until > Date.now() ? club.pressBuff : null
    });
  }

  if (pathname === '/api/press' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const club = ensureClub(auth.user);
      const r = social.applyPress(club, auth.user, body.optionId || body.id);
      if (!r.ok) return json(res, 400, r);
      persistUser(auth.user);
      db.setClub(auth.user.id, club);
      return json(res, 200, {
        ok: true,
        option: { id: r.option.id, label: r.option.label },
        club: G.publicClub(club, auth.user),
        user: enrichUser(auth.user)
      });
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
        if (!spendMoney(auth.user, 15000)) return json(res, 400, { error: 'Нужно 15 000 на восстановление' });
        G.recoverSquad(club);
        G.pushLedger(club, -15000, 'Восстановление состава');
      }
      G.ensureLineup(club, true);
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
      const quote = G.quoteStaff(club, body.role);
      if (!quote.ok) return json(res, 400, quote);
      const gate = assertCanSpend(auth.user, club, quote.cost, 'Найм персонала');
      if (!gate.ok) return json(res, 400, gate);
      const r = G.hireStaff(club, body.role);
      if (!r.ok) return json(res, 400, r);
      if (!spendMoney(auth.user, r.cost, club)) return json(res, 400, { error: `Нужно ${r.cost} ¤` });
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
    const quote = G.quoteStadium(club);
    if (!quote.ok) return json(res, 400, quote);
    const gate = assertCanSpend(auth.user, club, quote.cost, 'Улучшение стадиона');
    if (!gate.ok) return json(res, 400, gate);
    const r = G.upgradeStadium(club);
    if (!r.ok) return json(res, 400, r);
    if (!spendMoney(auth.user, r.cost, club)) return json(res, 400, { error: `Нужно ${r.cost} ¤` });
    auth.user.fans = (auth.user.fans || 0) + 800;
    G.pushLedger(club, -r.cost, r.label);
    persistUser(auth.user);
    db.setClub(auth.user.id, club);
    return json(res, 200, { ok: true, club: G.publicClub(club, auth.user), user: enrichUser(auth.user) });
  }

  if (pathname === '/api/club/tickets' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const club = ensureClub(auth.user);
      const r = G.setTicketPrice(club, body.price);
      if (!r.ok) return json(res, 400, r);
      db.setClub(auth.user.id, club);
      return json(res, 200, { ok: true, club: G.publicClub(club, auth.user) });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/players/release' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      const club = ensureClub(auth.user);
      const r = G.releasePlayer(club, body.playerId);
      if (!r.ok) return json(res, 400, r);
      G.pushLedger(club, 0, r.label);
      db.setClub(auth.user.id, club);
      pushUserEvent(auth.user.id, { type: 'release', title: 'Отчисление', body: r.player.name });
      return json(res, 200, { ok: true, club: G.publicClub(club, auth.user) });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/players/wage' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      const club = ensureClub(auth.user);
      const r = G.renegotiateWage(club, body.playerId, body.direction);
      if (!r.ok) return json(res, 400, r);
      G.pushLedger(club, 0, r.label);
      db.setClub(auth.user.id, club);
      return json(res, 200, { ok: true, club: G.publicClub(club, auth.user), player: r.player });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/players/contract' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const club = ensureClub(auth.user);
      if (body.quote) {
        const q = G.quoteRenew(club, body.playerId, body.years);
        if (!q.ok) return json(res, 400, q);
        return json(res, 200, {
          ok: true,
          years: q.years,
          bonus: q.bonus,
          wage: q.wage,
          currentYears: q.currentYears
        });
      }
      const r = G.renewContract(club, body.playerId, body.years, {
        spendUserMoney: (cost) => spendMoney(auth.user, cost)
      });
      if (!r.ok) return json(res, 400, r);
      persistUser(auth.user);
      db.setClub(auth.user.id, club);
      return json(res, 200, {
        ok: true,
        player: r.player,
        bonus: r.bonus,
        years: r.years,
        club: G.publicClub(club, auth.user),
        user: enrichUser(auth.user)
      });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
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

  if (pathname === '/api/bonus/buy' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const qty = Math.max(1, Math.min(20, Number(body.qty) || 1));
      const unit = 25000;
      const cost = unit * qty;
      if ((auth.user.money || 0) < cost) return json(res, 400, { error: `Нужно ${cost} ¤` });
      const club = ensureClub(auth.user);
      if (!spendMoney(auth.user, cost)) return json(res, 400, { error: `Нужно ${cost} ¤` });
      auth.user.boosters = (auth.user.boosters || 0) + qty;
      G.pushLedger(club, -cost, qty === 1 ? 'Покупка бустера' : `Покупка бустеров ×${qty}`);
      persistUser(auth.user);
      db.setClub(auth.user.id, club);
      return json(res, 200, { ok: true, user: enrichUser(auth.user), club: G.publicClub(club, auth.user), qty, cost });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/friendly' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const all = db.friendlyList();
    const queue = all
      .filter((f) => f.type !== 'challenge' && f.userId !== auth.user.id)
      .map((f) => ({
        id: f.id,
        userId: f.userId,
        login: f.login,
        name: f.name,
        clubName: f.clubName,
        level: f.level,
        strength: f.strength,
        expiresAt: f.expiresAt
      }));
    const myRequest = all.find((f) => f.type !== 'challenge' && f.userId === auth.user.id) || null;
    const challenges = all
      .filter((f) => f.type === 'challenge' && f.targetUserId === auth.user.id)
      .map((f) => ({
        id: f.id,
        userId: f.userId,
        login: f.login,
        name: f.name,
        clubName: f.clubName,
        level: f.level,
        strength: f.strength,
        expiresAt: f.expiresAt
      }));
    const myChallenges = all
      .filter((f) => f.type === 'challenge' && f.userId === auth.user.id)
      .map((f) => ({
        id: f.id,
        targetUserId: f.targetUserId,
        targetName: f.targetName,
        clubName: f.targetClubName,
        expiresAt: f.expiresAt
      }));
    return json(res, 200, {
      ok: true,
      queue,
      myRequest,
      challenges,
      myChallenges,
      online: db.listOnlineUsers()
    });
  }

  if (pathname === '/api/friendly' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const club = ensureClub(auth.user);
    db.friendlyList()
      .filter((f) => f.type !== 'challenge' && f.userId === auth.user.id)
      .forEach((f) => db.friendlyTake(f.id));
    const entry = db.friendlyPost({
      id: G.uid('fr'),
      type: 'friendly',
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

  if (pathname === '/api/friendly/cancel' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const mine = db.friendlyList().filter((f) => f.userId === auth.user.id && f.type !== 'challenge');
    let removed = 0;
    mine.forEach((f) => {
      db.friendlyTake(f.id);
      removed++;
    });
    // also cancel outgoing challenges if body says so
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      if (body.challengeId) {
        const c = db.friendlyTake(body.challengeId);
        if (c && c.userId === auth.user.id) removed++;
        else if (c) db.friendlyPost(c);
      } else if (body.allChallenges) {
        db.friendlyList()
          .filter((f) => f.type === 'challenge' && f.userId === auth.user.id)
          .forEach((f) => { db.friendlyTake(f.id); removed++; });
      }
    } catch {}
    return json(res, 200, { ok: true, removed });
  }

  if (pathname.match(/^\/api\/friendly\/[^/]+\/accept$/) && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const id = pathname.split('/')[3];
    if (id === 'bot' || id === 'cancel' || id === 'challenge') {
      return json(res, 404, { error: 'Неверный id заявки' });
    }
    const entry = db.friendlyTake(id);
    if (!entry) return json(res, 404, { error: 'Заявка не найдена или устарела' });
    if (entry.type === 'challenge') {
      db.friendlyPost(entry);
      return json(res, 400, { error: 'Это вызов — используйте принять вызов' });
    }
    if (entry.userId === auth.user.id) {
      db.friendlyPost(entry);
      return json(res, 400, { error: 'Нельзя принять свою заявку' });
    }
    const homeUser = usersDb().users[entry.userId];
    const awayUser = auth.user;
    if (!homeUser) return json(res, 404, { error: 'Соперник недоступен' });
    const homeClub = ensureClub(homeUser);
    const awayClub = ensureClub(awayUser);
    const cd = matchCooldownOk(awayUser, 'match');
    if (!cd.ok) {
      db.friendlyPost(entry);
      return json(res, 429, { error: cd.error, waitMs: cd.waitMs });
    }
    const match = G.simulateMatch(homeClub, awayClub, {
      competition: 'friendly',
      homeUserId: homeUser.id,
      awayUserId: awayUser.id
    });
    db.setClub(homeUser.id, homeClub);
    db.setClub(awayUser.id, awayClub);
    db.addMatch(match);
    rewardUsers(homeUser, awayUser, match);
    markMatchPlayed(homeUser, 'match');
    markMatchPlayed(awayUser, 'match');
    try { social?.newsFromMatch(match); } catch {}
    pushUserEvent(homeUser.id, {
      type: 'friendly_done',
      title: 'Заявку приняли',
      body: `${awayClub.name} принял вашу заявку · ${match.score[0]}:${match.score[1]}`,
      matchId: match.id
    });
    return json(res, 200, { ok: true, match });
  }

  if (pathname === '/api/friendly/bot' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const cd = matchCooldownOk(auth.user, 'bot');
    if (!cd.ok) return json(res, 429, { error: cd.error, waitMs: cd.waitMs });
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
    markMatchPlayed(auth.user, 'bot');
    try { social?.newsFromMatch(match); } catch {}
    return json(res, 200, { ok: true, match });
  }

  if (pathname === '/api/friendly/challenge' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const target = usersDb().users[body.userId];
      if (!target || target.isBot) return json(res, 404, { error: 'Игрок не найден' });
      if (target.id === auth.user.id) return json(res, 400, { error: 'Нельзя вызвать себя' });
      const online = db.listOnlineUsers().some((u) => u.id === target.id);
      if (!online) return json(res, 400, { error: 'Соперник не в сети' });
      // replace previous challenge to same target
      db.friendlyList()
        .filter((f) => f.type === 'challenge' && f.userId === auth.user.id && f.targetUserId === target.id)
        .forEach((f) => db.friendlyTake(f.id));
      const club = ensureClub(auth.user);
      const targetClub = ensureClub(target);
      const entry = db.friendlyPost({
        id: G.uid('ch'),
        type: 'challenge',
        userId: auth.user.id,
        login: auth.user.login,
        name: auth.user.name,
        clubName: club.name,
        level: auth.user.level,
        strength: G.clubStrength(club),
        targetUserId: target.id,
        targetName: target.name || target.login,
        targetClubName: targetClub.name,
        expiresAt: Date.now() + 15 * 60 * 1000
      });
      pushUserEvent(target.id, {
        type: 'challenge_in',
        title: 'Вызов на матч',
        body: `${club.name} (@${auth.user.login}) вызывает вас на товарищеский`,
        fromUserId: auth.user.id,
        challengeId: entry.id
      });
      return json(res, 200, { ok: true, entry, message: 'Вызов отправлен' });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname.match(/^\/api\/friendly\/challenge\/[^/]+\/accept$/) && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const id = pathname.split('/')[4];
    const entry = db.friendlyTake(id);
    if (!entry || entry.type !== 'challenge') return json(res, 404, { error: 'Вызов не найден' });
    if (entry.targetUserId !== auth.user.id) {
      db.friendlyPost(entry);
      return json(res, 403, { error: 'Это не ваш вызов' });
    }
    const homeUser = usersDb().users[entry.userId];
    if (!homeUser) return json(res, 404, { error: 'Соперник недоступен' });
    const homeClub = ensureClub(homeUser);
    const awayClub = ensureClub(auth.user);
    const match = G.simulateMatch(homeClub, awayClub, {
      competition: 'friendly',
      homeUserId: homeUser.id,
      awayUserId: auth.user.id,
      challenge: true
    });
    db.setClub(homeUser.id, homeClub);
    db.setClub(auth.user.id, awayClub);
    db.addMatch(match);
    rewardUsers(homeUser, auth.user, match);
    try { social?.newsFromMatch(match); } catch {}
    pushUserEvent(homeUser.id, {
      type: 'challenge_done',
      title: 'Вызов принят',
      body: `${awayClub.name} принял вызов · ${match.score[0]}:${match.score[1]}`,
      matchId: match.id
    });
    return json(res, 200, { ok: true, match });
  }

  if (pathname.match(/^\/api\/friendly\/challenge\/[^/]+\/decline$/) && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const id = pathname.split('/')[4];
    const entry = db.friendlyTake(id);
    if (!entry || entry.type !== 'challenge') return json(res, 404, { error: 'Вызов не найден' });
    if (entry.targetUserId !== auth.user.id && entry.userId !== auth.user.id) {
      db.friendlyPost(entry);
      return json(res, 403, { error: 'Это не ваш вызов' });
    }
    if (entry.targetUserId === auth.user.id) {
      pushUserEvent(entry.userId, {
        type: 'challenge_declined',
        title: 'Вызов отклонён',
        body: `${auth.user.clubName || auth.user.name} отклонил ваш вызов`
      });
    }
    return json(res, 200, { ok: true });
  }

  if (pathname === '/api/matches' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const matches = await db.listMatchesForAsync(auth.user.id, 40);
    return json(res, 200, { ok: true, matches });
  }

  if (pathname.startsWith('/api/matches/') && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const id = pathname.slice('/api/matches/'.length);
    const match = await db.loadMatch(id);
    if (!match) return json(res, 404, { error: 'Матч не найден' });
    return json(res, 200, { ok: true, match });
  }

  if (pathname === '/api/transfers' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const club = ensureClub(auth.user);
    const scout = club.staff?.scout || 0;
    const agents = G.refreshClubMarket(club, false);
    db.setClub(auth.user.id, club);
    const market = db.getTransferMarket();
    const clubListings = (market.list || []).filter(
      (p) => p.source === 'club' && p.sellerUserId && p.sellerUserId !== auth.user.id
    );
    const myListings = (market.list || []).filter((p) => p.sellerUserId === auth.user.id);
    return json(res, 200, {
      ok: true,
      list: agents,
      clubListings,
      myListings,
      refreshedAt: club.transferRefreshedAt || Date.now(),
      scoutLevel: scout,
      squadSize: (club.players || []).length,
      youthReadyAt: club.lastYouthAt ? club.lastYouthAt + 24 * 3600e3 : null,
      stadiumLevel: club.stadiumLevel || 1
    });
  }

  if (pathname === '/api/transfers/refresh' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const club = ensureClub(auth.user);
    const scout = club.staff?.scout || 0;
    if (scout < 1) return json(res, 400, { error: 'Нужен скаут ур. 1+ чтобы обновлять рынок' });
    if ((auth.user.money || 0) < 5000) return json(res, 400, { error: 'Нужно 5 000 ¤' });
    if (!spendMoney(auth.user, 5000)) return json(res, 400, { error: 'Нужно 5 000 ¤' });
    G.pushLedger(club, -5000, 'Обновление рынка');
    const list = G.refreshClubMarket(club, true);
    persistUser(auth.user);
    db.setClub(auth.user.id, club);
    return json(res, 200, {
      ok: true,
      list,
      refreshedAt: club.transferRefreshedAt,
      user: enrichUser(auth.user),
      club: G.publicClub(club, auth.user)
    });
  }

  if (pathname === '/api/transfers/buy' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      const club = ensureClub(auth.user);
      const embargo = assertCanSpend(auth.user, club, 0, 'Трансферы');
      if (!embargo.ok && G.financeSnapshot(auth.user, club).embargo) {
        return json(res, 400, { error: 'Эмбарго при банкротстве — трансферы закрыты' });
      }
      const market = db.getTransferMarket();
      const clubListing = (market.list || []).find((p) => p.id === body.playerId && p.source === 'club');
      if (clubListing) {
        if (clubListing.sellerUserId === auth.user.id) {
          return json(res, 400, { error: 'Нельзя купить своего игрока' });
        }
        const gate = assertCanSpend(auth.user, club, clubListing.value, 'Трансфер');
        if (!gate.ok) return json(res, 400, gate);
        const seller = usersDb().users[clubListing.sellerUserId];
        const sellerClub = seller ? ensureClub(seller) : null;
        if (!seller || !sellerClub) {
          db.removeTransferListing(clubListing.id);
          return json(res, 404, { error: 'Продавец недоступен — лот снят' });
        }
        const taken = G.takeListedPlayer(sellerClub, clubListing.id);
        if (!taken.ok) {
          db.removeTransferListing(clubListing.id);
          return json(res, 404, { error: taken.error });
        }
        const r = G.buyPlayer(club, { ...clubListing, ...taken.player, value: clubListing.value });
        if (!r.ok) {
          // restore seller? rare race — put back
          sellerClub.players.push(taken.player);
          db.setClub(seller.id, sellerClub);
          return json(res, 400, r);
        }
        if (!spendMoney(auth.user, r.cost, club)) return json(res, 400, { error: `Нужно ${r.cost} ¤` });
        seller.money = (seller.money || 0) + r.cost;
        G.pushLedger(club, -r.cost, `Трансфер у ${sellerClub.name} · ${r.player.name}`);
        G.pushLedger(sellerClub, r.cost, `Продажа клубу · ${r.player.name}`);
        db.removeTransferListing(clubListing.id);
        persistUser(auth.user);
        persistUser(seller);
        db.setClub(auth.user.id, club);
        db.setClub(seller.id, sellerClub);
        pushUserEvent(seller.id, {
          type: 'transfer_sold',
          title: 'Игрок продан',
          body: `${r.player.name} → ${club.name} за ${r.cost} ¤`,
          money: r.cost
        });
        pushUserEvent(auth.user.id, {
          type: 'transfer_bought',
          title: 'Игрок куплен',
          body: `${r.player.name} из ${sellerClub.name}`
        });
        try {
          social?.newsTransfer({
            player: r.player.name,
            buyer: club.name,
            seller: sellerClub.name,
            value: r.cost
          });
        } catch {}
        return json(res, 200, { ok: true, club: G.publicClub(club, auth.user), user: enrichUser(auth.user), player: r.player, fromClub: true });
      }

      G.refreshClubMarket(club, false);
      const listing = (club.transferList || []).find((p) => p.id === body.playerId);
      if (!listing) return json(res, 404, { error: 'Игрок уже куплен или снят с рынка' });
      const gateAgents = assertCanSpend(auth.user, club, listing.value, 'Трансфер');
      if (!gateAgents.ok) return json(res, 400, gateAgents);
      const r = G.buyPlayer(club, listing);
      if (!r.ok) return json(res, 400, r);
      if (!spendMoney(auth.user, r.cost, club)) return json(res, 400, { error: `Нужно ${r.cost} ¤` });
      G.pushLedger(club, -r.cost, r.label);
      club.transferList = (club.transferList || []).filter((p) => p.id !== listing.id);
      persistUser(auth.user);
      db.setClub(auth.user.id, club);
      pushUserEvent(auth.user.id, {
        type: 'transfer_bought',
        title: 'Игрок куплен',
        body: `${r.player.name} (агенты)`
      });
      try {
        social?.newsTransfer({
          player: r.player.name,
          buyer: club.name,
          seller: null,
          value: r.cost
        });
      } catch {}
      return json(res, 200, { ok: true, club: G.publicClub(club, auth.user), user: enrichUser(auth.user), player: r.player });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/transfers/sell' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      const club = ensureClub(auth.user);
      const mode = body.mode === 'list' ? 'list' : 'agents';
      if (mode === 'list') {
        const listed = G.listPlayer(club, body.playerId, body.price);
        if (!listed.ok) return json(res, 400, listed);
        listed.listing.sellerUserId = auth.user.id;
        listed.listing.sellerClub = club.name;
        // remove from squad while listed
        const taken = G.takeListedPlayer(club, body.playerId);
        if (!taken.ok) return json(res, 400, taken);
        const market = db.getTransferMarket();
        const list = (market.list || []).filter((p) => p.id !== listed.listing.id);
        list.unshift(listed.listing);
        db.setTransferMarket(list.slice(0, 80), Date.now());
        db.setClub(auth.user.id, club);
        pushUserEvent(auth.user.id, {
          type: 'transfer_listed',
          title: 'Игрок на рынке',
          body: `${listed.listing.name} · ${listed.listing.value} ¤`
        });
        return json(res, 200, {
          ok: true,
          listed: true,
          listing: listed.listing,
          club: G.publicClub(club, auth.user),
          user: enrichUser(auth.user)
        });
      }
      const r = G.sellPlayer(club, body.playerId);
      if (!r.ok) return json(res, 400, r);
      auth.user.money = (auth.user.money || 0) + r.value;
      G.pushLedger(club, r.value, r.label);
      persistUser(auth.user);
      db.setClub(auth.user.id, club);
      pushUserEvent(auth.user.id, {
        type: 'transfer_sold',
        title: 'Продажа агентам',
        body: `${r.player.name} · ${r.value} ¤`,
        money: r.value
      });
      return json(res, 200, { ok: true, club: G.publicClub(club, auth.user), user: enrichUser(auth.user), value: r.value });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/transfers/unlist' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      const club = ensureClub(auth.user);
      const market = db.getTransferMarket();
      const listing = (market.list || []).find((p) => p.id === body.playerId && p.sellerUserId === auth.user.id);
      if (!listing) return json(res, 404, { error: 'Лот не найден' });
      if ((club.players || []).length >= 25) return json(res, 400, { error: 'Состав полон' });
      const r = G.buyPlayer(club, listing);
      if (!r.ok) return json(res, 400, r);
      // free reclaim
      db.removeTransferListing(listing.id);
      db.setClub(auth.user.id, club);
      return json(res, 200, { ok: true, club: G.publicClub(club, auth.user), player: r.player });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/academy/promote' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const club = ensureClub(auth.user);
      const quote = G.quoteYouth(club);
      if (!quote.ok) return json(res, 400, quote);
      const gate = assertCanSpend(auth.user, club, quote.cost, 'Академия');
      if (!gate.ok) return json(res, 400, gate);
      if (!spendMoney(auth.user, quote.cost, club)) return json(res, 400, { error: `Нужно ${quote.cost} ¤` });
      const r = G.promoteYouth(club, body.youthId || null);
      if (!r.ok) {
        auth.user.money = (auth.user.money || 0) + quote.cost;
        persistUser(auth.user);
        return json(res, 400, r);
      }
      G.pushLedger(club, -r.cost, r.label);
      persistUser(auth.user);
      db.setClub(auth.user.id, club);
      pushUserEvent(auth.user.id, {
        type: 'youth',
        title: 'Выпуск академии',
        body: `${r.player.name} · ${r.player.pos} · талант ${r.player.talent}`
      });
      return json(res, 200, {
        ok: true,
        player: r.player,
        club: G.publicClub(club, auth.user),
        academy: G.academyStatus(club),
        user: enrichUser(auth.user),
        cost: r.cost
      });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/academy' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const club = ensureClub(auth.user);
    G.ensureYouthPool(club, { refill: url.searchParams.get('refill') === '1' });
    db.setClub(auth.user.id, club);
    return json(res, 200, { ok: true, ...G.academyStatus(club) });
  }

  if (pathname === '/api/academy/release' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const club = ensureClub(auth.user);
      const r = G.releaseYouth(club, body.youthId);
      if (!r.ok) return json(res, 400, r);
      db.setClub(auth.user.id, club);
      return json(res, 200, { ok: true, academy: G.academyStatus(club), club: G.publicClub(club, auth.user) });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/medical' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const club = ensureClub(auth.user);
    G.tickClubClock(club);
    db.setClub(auth.user.id, club);
    return json(res, 200, { ok: true, ...G.medicalBay(club) });
  }

  if (pathname === '/api/medical/treat' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = await readBody(req);
      const club = ensureClub(auth.user);
      const r = G.treatInjury(club, body.playerId, {
        spendUserMoney: (cost) => {
          if ((auth.user.money || 0) < cost) return false;
          auth.user.money -= cost;
          persistUser(auth.user);
          return true;
        }
      });
      if (!r.ok) return json(res, 400, { error: r.error });
      db.setClub(auth.user.id, club);
      return json(res, 200, {
        ok: true,
        ...r,
        club: G.publicClub(club, auth.user),
        user: enrichUser(auth.user),
        medical: G.medicalBay(club)
      });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/board' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const club = ensureClub(auth.user);
    G.ensureBoard(club, auth.user);
    const myLeague = league ? league.findMyLeague(auth.user.id) : null;
    let place = null;
    let leagueName = null;
    let week = null;
    let season = null;
    if (myLeague) {
      const pub = league.publicLeague(myLeague, auth.user.id);
      const row = (pub.standings || []).find((s) => s.userId === auth.user.id);
      place = row?.rank ?? null;
      leagueName = pub.name || myLeague.name;
      week = pub.week || myLeague.week;
      season = pub.season || myLeague.season;
    }
    const board = G.boardStatus(club, auth.user, { place, leagueName, week, season });
    db.setClub(auth.user.id, club);
    return json(res, 200, { ok: true, board, club: G.publicClub(club, auth.user) });
  }

  if (pathname === '/api/board/new-job' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const club = ensureClub(auth.user);
      const r = G.takeNewJob(club, auth.user);
      if (!r.ok) return json(res, 400, { error: r.error });
      auth.user.prestige = Math.max(0, (auth.user.prestige || 0) - (r.prestigeCost || 2));
      persistUser(auth.user);
      db.setClub(auth.user.id, club);
      pushUserEvent(auth.user.id, {
        type: 'board',
        title: 'Новый контракт с советом',
        body: `Цель: ${r.board.targetLabel}. Уверенность ${r.board.confidence}%.`
      });
      return json(res, 200, {
        ok: true,
        board: G.boardStatus(club, auth.user),
        club: G.publicClub(club, auth.user),
        user: enrichUser(auth.user)
      });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/academy/upgrade' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const club = ensureClub(auth.user);
      const fin = G.financeSnapshot(auth.user, club);
      if (fin.embargo) return json(res, 400, { error: 'Эмбарго: улучшения закрыты' });
      const q = G.quoteAcademy(club);
      if (!q.ok) return json(res, 400, { error: q.error });
      if ((auth.user.money || 0) < q.cost) return json(res, 400, { error: `Нужно ${q.cost} ¤` });
      auth.user.money -= q.cost;
      persistUser(auth.user);
      const r = G.upgradeAcademy(club);
      G.pushLedger(club, -q.cost, r.label);
      db.setClub(auth.user.id, club);
      return json(res, 200, {
        ok: true,
        academy: G.academyStatus(club),
        club: G.publicClub(club, auth.user),
        user: enrichUser(auth.user)
      });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/training' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const club = ensureClub(auth.user);
    const upgrade = G.quoteTraining(club);
    return json(res, 200, {
      ok: true,
      trainingLevel: club.trainingLevel || 1,
      stadiumLevel: club.stadiumLevel || 1,
      skillCap: G.skillCap(club, false),
      gkSkillCap: G.skillCap(club, true),
      upgrade: upgrade.ok ? upgrade : { ok: false, error: upgrade.error }
    });
  }

  if (pathname === '/api/training/upgrade' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const club = ensureClub(auth.user);
      const fin = G.financeSnapshot(auth.user, club);
      if (fin.embargo) return json(res, 400, { error: 'Эмбарго: улучшения закрыты' });
      const q = G.quoteTraining(club);
      if (!q.ok) return json(res, 400, { error: q.error });
      if ((auth.user.money || 0) < q.cost) return json(res, 400, { error: `Нужно ${q.cost} ¤` });
      auth.user.money -= q.cost;
      persistUser(auth.user);
      const r = G.upgradeTraining(club);
      G.pushLedger(club, -q.cost, r.label);
      db.setClub(auth.user.id, club);
      return json(res, 200, {
        ok: true,
        trainingLevel: club.trainingLevel || 1,
        club: G.publicClub(club, auth.user),
        user: enrichUser(auth.user),
        label: r.label
      });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/transfers/offers' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const club = ensureClub(auth.user);
    G.maybeGenerateTransferOffers(club);
    db.setClub(auth.user.id, club);
    const offers = (club.transferOffers || []).filter((o) => !o.resolved && (o.expiresAt || 0) > Date.now());
    return json(res, 200, { ok: true, offers });
  }

  if (pathname === '/api/transfers/offers' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const club = ensureClub(auth.user);
      const decision = body.decision === 'accept' ? 'accept' : 'reject';
      const r = G.resolveTransferOffer(club, body.offerId, decision);
      if (!r.ok) return json(res, 400, { error: r.error });
      if (r.decision === 'accept') {
        auth.user.money = (auth.user.money || 0) + r.offer.bid;
        persistUser(auth.user);
        pushUserEvent(auth.user.id, {
          type: 'transfer_sold',
          title: 'Продажа по предложению',
          body: `${r.offer.playerName} → ${r.offer.buyer} · ${r.offer.bid} ¤`,
          money: r.offer.bid
        });
      }
      db.setClub(auth.user.id, club);
      return json(res, 200, {
        ok: true,
        ...r,
        club: G.publicClub(club, auth.user),
        user: enrichUser(auth.user)
      });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname.match(/^\/api\/players\/[^/]+$/) && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const playerId = decodeURIComponent(pathname.split('/')[3] || '');
    const club = ensureClub(auth.user);
    const card = G.playerCard(club, playerId);
    if (!card) return json(res, 404, { error: 'Игрок не найден' });
    return json(res, 200, { ok: true, player: card });
  }

  if (pathname === '/api/sponsor' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const club = ensureClub(auth.user);
    const sponsor = G.ensureSponsor(club, auth.user);
    db.setClub(auth.user.id, club);
    return json(res, 200, {
      ok: true,
      sponsor,
      form: G.clubFormGuide(club),
      finance: G.financeSnapshot(auth.user, club)
    });
  }

  if (pathname === '/api/sponsor/renegotiate' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const club = ensureClub(auth.user);
      const r = G.renegotiateSponsor(club, auth.user);
      if (!r.ok) return json(res, 400, { error: r.error });
      db.setClub(auth.user.id, club);
      return json(res, 200, {
        ok: true,
        ...r,
        club: G.publicClub(club, auth.user),
        user: enrichUser(auth.user)
      });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/loans' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const club = ensureClub(auth.user);
    const tick = G.tickLoans(club);
    if (tick.returned?.length) db.setClub(auth.user.id, club);
    return json(res, 200, { ok: true, ...G.loansStatus(club), returned: tick.returned });
  }

  if (pathname === '/api/loans' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const club = ensureClub(auth.user);
      const r = G.loanOutPlayer(club, body.playerId, body.days || 7);
      if (!r.ok) return json(res, 400, { error: r.error });
      auth.user.money = (auth.user.money || 0) + r.fee;
      persistUser(auth.user);
      db.setClub(auth.user.id, club);
      pushUserEvent(auth.user.id, {
        type: 'loan',
        title: 'Игрок в аренде',
        body: `${r.player.name} · ${r.days} дн. · +${r.fee} ¤`,
        money: r.fee
      });
      return json(res, 200, {
        ok: true,
        ...r,
        loans: G.loansStatus(club),
        club: G.publicClub(club, auth.user),
        user: enrichUser(auth.user)
      });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname.match(/^\/api\/profile\/[^/]+$/) && req.method === 'GET') {
    const login = decodeURIComponent(pathname.split('/')[3] || '').toLowerCase();
    const user = Object.values(usersDb().users).find((u) => !u.isBot && u.login === login);
    if (!user) return json(res, 404, { error: 'Менеджер не найден' });
    const club = db.getClub(user.id);
    return json(res, 200, { ok: true, profile: G.publicProfile(user, club) });
  }

  if (pathname === '/api/players/playtime' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const club = ensureClub(auth.user);
      const decision = body.decision || 'promise';
      const r = G.resolvePlaytimeRequest(club, body.playerId, decision);
      if (!r.ok) return json(res, 400, { error: r.error });
      let listing = null;
      if (r.decision === 'list') {
        const listed = G.listPlayer(club, body.playerId);
        if (!listed.ok) {
          // restore request if listing blocked
          const p = (club.players || []).find((x) => x.id === body.playerId);
          if (p) p.request = 'playtime';
          return json(res, 400, { error: listed.error });
        }
        listed.listing.sellerUserId = auth.user.id;
        listed.listing.sellerClub = club.name;
        const taken = G.takeListedPlayer(club, body.playerId);
        if (!taken.ok) {
          const p = (club.players || []).find((x) => x.id === body.playerId);
          if (p) p.request = 'playtime';
          return json(res, 400, { error: taken.error });
        }
        const market = db.getTransferMarket();
        const list = (market.list || []).filter((p) => p.id !== listed.listing.id);
        list.unshift(listed.listing);
        db.setTransferMarket(list.slice(0, 80), Date.now());
        listing = listed.listing;
        pushUserEvent(auth.user.id, {
          type: 'transfer_listed',
          title: 'Игрок на рынке',
          body: `${listed.listing.name} · ${listed.listing.value} ¤`
        });
      }
      db.setClub(auth.user.id, club);
      return json(res, 200, {
        ok: true,
        ...r,
        listing,
        club: G.publicClub(club, auth.user),
        user: enrichUser(auth.user)
      });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/rating' && req.method === 'GET') {
    const list = Object.values(usersDb().users)
      .filter((u) => !u.isBot)
      .map((u) => enrichUser(u))
      .sort((a, b) => (b.points - a.points) || (b.xp - a.xp))
      .slice(0, 50);
    const scorers = [];
    const assists = [];
    const motms = [];
    Object.values(usersDb().users).forEach((u) => {
      if (u.isBot) return;
      const club = db.getClub(u.id);
      if (!club) return;
      (club.players || []).forEach((p) => {
        const row = {
          name: p.name,
          pos: p.pos,
          clubName: club.name,
          login: u.login,
          goals: p.seasonGoals || 0,
          assists: p.seasonAssists || 0,
          motm: p.seasonMotm || 0
        };
        if (row.goals) scorers.push(row);
        if (row.assists) assists.push(row);
        if (row.motm) motms.push(row);
      });
    });
    scorers.sort((a, b) => b.goals - a.goals || b.assists - a.assists);
    assists.sort((a, b) => b.assists - a.assists || b.goals - a.goals);
    motms.sort((a, b) => b.motm - a.motm || b.goals - a.goals);
    return json(res, 200, {
      ok: true,
      leaders: list,
      scorers: scorers.slice(0, 30),
      assists: assists.slice(0, 30),
      motm: motms.slice(0, 30)
    });
  }

  // ——— league ———
  if (pathname === '/api/league' && req.method === 'GET') {
    const auth = authUser(req);
    const status = url.searchParams.get('status') || undefined;
    const mine = url.searchParams.get('mine') === '1';
    if (mine) {
      if (!auth) return json(res, 401, { error: 'Нужен вход' });
      const my = league.findMyLeague(auth.user.id);
      const pub = my ? league.publicLeague(my, auth.user.id) : null;
      let prematch = null;
      if (pub && pub.status === 'live') {
        const club = ensureClub(auth.user);
        const myId = auth.user.id;
        const nextMine = (pub.fixtures || []).find(
          (f) => f.round === pub.currentRound && !f.playedAt && (f.homeUserId === myId || f.awayUserId === myId)
        );
        if (nextMine) {
          const oppId = nextMine.homeUserId === myId ? nextMine.awayUserId : nextMine.homeUserId;
          const oppUser = usersDb().users[oppId];
          const scoutLevel = (club.staff && club.staff.scout) || 0;
          prematch = {
            board: G.prematchBoard(club),
            opponent: oppUser ? {
              ...G.opponentBrief(ensureClub(oppUser), { scoutLevel }),
              userId: oppId,
              home: nextMine.homeUserId === myId
            } : null,
            fixture: nextMine,
            scoutLevel
          };
        }
      }
      return json(res, 200, {
        ok: true,
        league: pub,
        calendar: league.calendarFor(auth.user.id),
        prematch,
        open: league.listLeagues({ status: 'open' }).filter((L) => {
          const lvl = auth.user.level || 1;
          return lvl >= (L.minLevel || 1) && lvl <= (L.maxLevel || 10);
        }),
        stats: league.stats()
      });
    }
    return json(res, 200, {
      ok: true,
      leagues: league.listLeagues({ status }),
      stats: league.stats()
    });
  }

  if (pathname === '/api/league/join' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const club = ensureClub(auth.user);
    const r = league.joinLeague(auth.user, club.name, { strength: G.clubStrength(club) });
    if (!r.ok) return json(res, 400, r);
    return json(res, 200, r);
  }

  if (pathname === '/api/league/leave' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const r = league.leaveLeague(auth.user.id);
    if (!r.ok) return json(res, 400, r);
    return json(res, 200, r);
  }

  if (pathname === '/api/calendar' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    return json(res, 200, { ok: true, ...league.calendarFor(auth.user.id) });
  }

  if (pathname === '/api/prematch' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const club = ensureClub(auth.user);
    const board = G.prematchBoard(club);
    const scoutLevel = (club.staff && club.staff.scout) || 0;
    let opponent = null;
    const oppId = url.searchParams.get('opponent') || url.searchParams.get('userId');
    if (oppId) {
      const oppUser = usersDb().users[oppId];
      if (oppUser) {
        const oppClub = ensureClub(oppUser);
        opponent = G.opponentBrief(oppClub, { scoutLevel });
        opponent.userId = oppId;
        opponent.login = oppUser.login;
        opponent.level = oppUser.level || 1;
      }
    }
    return json(res, 200, {
      ok: true,
      board,
      opponent,
      scoutLevel,
      finance: G.financeSnapshot(auth.user, club)
    });
  }

  if (pathname === '/api/finance' && req.method === 'GET') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const club = ensureClub(auth.user);
    return json(res, 200, { ok: true, finance: G.financeSnapshot(auth.user, club), ledger: (club.ledger || []).slice(0, 40) });
  }

  if (pathname.match(/^\/api\/league\/[^/]+$/) && req.method === 'GET') {
    const auth = authUser(req);
    const id = pathname.split('/')[3];
    if (id === 'join' || id === 'leave') return json(res, 404, { error: 'Нет' });
    const L = league.getLeague(id, auth?.user?.id);
    if (!L) return json(res, 404, { error: 'Лига не найдена' });
    return json(res, 200, { ok: true, league: L });
  }

  if (pathname === '/api/admin/league/tick' && req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    return json(res, 200, league.tick());
  }

  if (pathname.match(/^\/api\/admin\/league\/[^/]+\/round$/) && req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    const id = pathname.split('/')[4];
    const r = league.adminForceRound(id);
    if (!r.ok) return json(res, 400, r);
    return json(res, 200, r);
  }

  if (pathname.match(/^\/api\/admin\/league\/[^/]+\/finish$/) && req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    const id = pathname.split('/')[4];
    const r = league.adminFinish(id);
    if (!r.ok) return json(res, 400, r);
    return json(res, 200, r);
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
    if (!id || id === 'meta' || id === 'leaderboard' || id === 'events') return json(res, 404, { error: 'Нет' });
    const cup = (await cups.getCupAsync?.(id)) || cups.getCup(id);
    if (!cup) return json(res, 404, { error: 'Кубок не найден' });
    return json(res, 200, { ok: true, cup });
  }

  if (pathname === '/api/cups/events/read' && req.method === 'POST') {
    const auth = requireAuth(req, res);
    if (!auth) return;
    cups.markCupEventsRead(auth.user.id);
    return json(res, 200, { ok: true });
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

  if (pathname === '/api/admin/cups' && req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const cup = cups.adminCreateCup({
        size: Number(body.size) || 8,
        bracketId: body.bracketId || 'l1_2',
        startInMs: Number(body.startInMs) || 60_000
      });
      return json(res, 200, { ok: true, cup });
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname.match(/^\/api\/admin\/cups\/[^/]+\/force-start$/) && req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    const id = pathname.split('/')[4];
    const r = cups.adminForceStart(id);
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

  if (pathname.match(/^\/api\/admin\/cups\/[^/]+\/advance$/) && req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    const id = pathname.split('/')[4];
    const r = cups.adminAdvanceCup(id);
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

  if (pathname === '/api/admin/cups' && req.method === 'GET') {
    if (!requireAdmin(req, res)) return;
    return json(res, 200, {
      ok: true,
      open: cups.listCups({ status: 'open' }),
      live: cups.listCups({ status: 'live' }),
      finished: cups.listCups({ status: 'finished' }).slice(0, 20),
      stats: cups.stats()
    });
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
  social = createSocialModule({
    store: {
      loadNews: () => db.loadNews(),
      saveNews: (x) => db.saveNews(x),
      loadChat: () => db.loadChat(),
      saveChat: (x) => db.saveChat(x)
    }
  });
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
      loadCupById: (id) => db.loadCupById(id),
      clubStrength: (userId) => {
        const club = db.getClub(userId);
        return club ? G.clubStrength(club) : 0;
      },
      ensureBotClub,
      hasClub: (userId) => db.hasClub(userId),
      playCupTie,
      annotateCupPens,
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
        const cal = league ? league.calendarFor(userId) : null;
        const st = {
          clubId: 'me',
          clubs: [me],
          week: cal?.week || 1,
          season: cal?.season || 1,
          ledger: club.ledger || [],
          inbox: []
        };
        return { payload: { state: st }, st, me };
      },
      writeCareer: (userId, payload) => {
        const u = usersDb().users[userId];
        const club = db.getClub(userId);
        const me = payload?.state?.clubs?.find((c) => c.id === payload.state.clubId);
        if (u && me && me.budget != null) {
          u.money = Math.max(0, Math.round(me.budget));
          persistUser(u);
          if (club) {
            // ledger already updated via shared reference in applyCareerMoney — do not push again
            if (Array.isArray(payload.state.ledger)) club.ledger = payload.state.ledger.slice(0, 80);
            db.setClub(userId, club);
          }
        }
      },
      onCupFinish: (info) => {
        const champ = info.champion?.clubName || info.champion?.name || '—';
        social?.newsCup({
          title: `Кубок: чемпион ${champ}`,
          body: info.name || 'Онлайн-кубок завершён',
          cupId: info.id
        });
        const uid = info.champion?.userId;
        if (uid) {
          const club = db.getClub(uid);
          if (club) {
            G.ensureBoard(club);
            club.board.cupReached = 'Чемпион';
            club.board.confidence = Math.min(100, (club.board.confidence || 65) + 8);
            db.setClub(uid, club);
          }
        }
      }
    }
  });

  league = createLeagueModule({
    usersDb,
    saveUsers,
    store: {
      loadLeagues: () => db.loadLeagues(),
      saveLeagues: (x) => db.saveLeagues(x),
      clubStrength: (userId) => {
        const club = db.getClub(userId);
        return club ? G.clubStrength(club) : 0;
      },
      ensureBotClub,
      ensureBotPool: (n) => ensureBotPool(n),
      playLeagueTie,
      pushLedger: (userId, amount, label) => {
        const club = db.getClub(userId);
        if (!club) return;
        G.pushLedger(club, amount, label);
        db.setClub(userId, club);
      },
      onSeasonContracts: (userId) => {
        const club = db.getClub(userId);
        if (!club) return;
        const r = G.tickContracts(club, 1);
        db.setClub(userId, club);
        (r.asks || []).forEach((p) => {
          pushUserEvent(userId, {
            type: 'contract_ask',
            title: 'Конец сезона · контракт',
            body: `${p.name} требует продления`
          });
        });
        (r.left || []).forEach((p) => {
          pushUserEvent(userId, {
            type: 'contract_left',
            title: 'Ушёл как свободный агент',
            body: p.name
          });
        });
      },
      onBoardSeasonReview: (userId, info) => {
        const club = db.getClub(userId);
        const u = usersDb().users[userId];
        if (!club || !u || u.isBot) return;
        const archive = G.snapshotSeasonAwards(club, {
          season: info.season || 1,
          rank: info.rank || null,
          leagueName: info.leagueName || null
        });
        const review = G.seasonBoardReview(club, info.rank || 99, {
          user: u,
          cupReached: club.board?.cupReached || null
        });
        G.pickSponsor(club, u, { force: true });
        db.setClub(userId, club);
        const conf = review.board?.confidence ?? '—';
        pushUserEvent(userId, {
          type: 'board',
          title: review.sacked
            ? 'Увольнение советом'
            : review.ok
              ? 'Цели сезона выполнены'
              : 'Цели сезона провалены',
          body: review.sacked
            ? `Уверенность ${conf}%. Оформите новый контракт.`
            : `${review.ok ? 'Совет доволен' : 'Нужны результаты'} · уверенность ${conf}% · место ${info.rank}`
        });
        if (archive?.scorers?.length) {
          pushUserEvent(userId, {
            type: 'season_awards',
            title: `Итоги сезона · бомбардир ${archive.scorers[0].name}`,
            body: `${archive.scorers[0].goals} голов` + (archive.motm?.[0] ? ` · MOTM: ${archive.motm[0].name}` : '')
          });
        }
        if (review.sacked) {
          u.prestige = Math.max(0, (u.prestige || 0) - 1);
          persistUser(u);
        } else if (review.ok) {
          u.prestige = (u.prestige || 0) + 1;
          persistUser(u);
        }
      },
      onMidSeasonBoard: (userId, info) => {
        const club = db.getClub(userId);
        const u = usersDb().users[userId];
        if (!club || !u || u.isBot) return;
        const review = G.midSeasonBoardReview(club, info.rank || 99, {
          user: u,
          season: info.season || 1
        });
        if (!review.ok) return;
        db.setClub(userId, club);
        pushUserEvent(userId, {
          type: 'board',
          title: review.label || 'Промежуточная оценка совета',
          body: `Место ${review.place} · цель ≤${review.target} · уверенность ${review.board?.confidence}% (${review.delta >= 0 ? '+' : ''}${review.delta})`
        });
        if (review.sacked) {
          pushUserEvent(userId, {
            type: 'board',
            title: 'Увольнение советом',
            body: 'После промежуточного отчёта совет расторг контракт.'
          });
        }
      },
      onLeagueFinish: (info) => {
        const moves = (info.movements || []).filter((m) => m.kind === 'promote').slice(0, 2);
        const bodyParts = [
          info.name,
          moves.length ? `Повышение: ${moves.map((m) => m.clubName).join(', ')}` : null
        ].filter(Boolean);
        social?.newsLeague({
          title: info.champion
            ? `Чемпион: ${info.champion.clubName}`
            : `Лига завершена: ${info.name}`,
          body: bodyParts.join(' · '),
          leagueId: info.id,
          tag: 'league'
        });
      }
    }
  });

  ensureAdminUser();
  ensureBotPool(24);
  cups.ensureBotPool?.(8);
  Object.values(usersDb().users).filter((u) => u.isBot).forEach((u) => ensureBotClub(u, u.clubName));

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[EYE XI] http://0.0.0.0:${PORT}`);
    console.log(`[EYE XI] db ${db.DB_FILE}`);
    cups.startScheduler();
    league.startScheduler();
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
