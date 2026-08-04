'use strict';

/**
 * Online cups + AI bots for EYE Manager.
 * Cups auto-spawn on a timer; start only if ≥1 human joined, else archive/delete.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CUP_SIZES = [4, 8, 16];
const LEVEL_BRACKETS = [
  { id: 'l1_2', label: 'Ур. 1–2', min: 1, max: 2 },
  { id: 'l3_4', label: 'Ур. 3–4', min: 3, max: 4 },
  { id: 'l5_6', label: 'Ур. 5–6', min: 5, max: 6 },
  { id: 'l7_8', label: 'Ур. 7–8', min: 7, max: 8 },
  { id: 'l9_10', label: 'Ур. 9–10', min: 9, max: 10 }
];

const XP_THRESHOLDS = [0, 0, 100, 250, 500, 900, 1500, 2400, 3600, 5200, 7500];
const BOT_FIRST = ['Алекс', 'Макс', 'Иван', 'Лука', 'Нико', 'Олег', 'Серж', 'Тимур', 'Юрий', 'Дани', 'Марк', 'Роман'];
const BOT_LAST = ['Волков', 'Орлов', 'Сокол', 'Рыбаков', 'Лебедев', 'Козлов', 'Павлов', 'Морозов', 'Новиков', 'Федоров'];
const CLUB_NAMES = [
  'Северная Звезда', 'Алый Шторм', 'Синий Горизонт', 'Зелёный Парк', 'Чёрный Ястреб',
  'Белые Ночи', 'Уральский Орёл', 'Волга Юнайтед', 'Балтика Сити', 'Тайга FC',
  'Сапфир', 'Метеор', 'Авангард', 'Динамо Плюс', 'Локомотив 2.0',
  'Фортуна', 'Энергия', 'Рубин Юг', 'Факел Про', 'Спарта Нова'
];

function uid(prefix) {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}

function levelFromXp(xp) {
  let lvl = 1;
  for (let i = 2; i <= 10; i++) {
    if ((xp || 0) >= XP_THRESHOLDS[i]) lvl = i;
  }
  return lvl;
}

function xpToNext(level, xp) {
  if (level >= 10) return 0;
  return Math.max(0, XP_THRESHOLDS[level + 1] - (xp || 0));
}

function bracketForLevel(level) {
  return LEVEL_BRACKETS.find((b) => level >= b.min && level <= b.max) || LEVEL_BRACKETS[0];
}

function createCupsModule({ dataDir, usersDb, saveUsers, publicUser }) {
  const CUPS_FILE = path.join(dataDir, 'cups.json');
  const ARCHIVE_FILE = path.join(dataDir, 'cups_archive.json');
  const TICK_MS = Number(process.env.EYE_CUP_TICK_MS || 5 * 60 * 1000);
  const OPEN_WINDOW_MS = Number(process.env.EYE_CUP_OPEN_MS || 5 * 60 * 1000);
  const LIVE_ROUND_MS = Number(process.env.EYE_CUP_LIVE_MS || 20 * 1000);
  const LIVE_POLL_MS = Math.min(5000, Math.max(1000, Math.floor(LIVE_ROUND_MS / 4)));

  function loadCups() {
    const db = load(CUPS_FILE, { cups: {}, meta: { lastTick: 0 } });
    if (!db.cups) db.cups = {};
    if (!db.meta) db.meta = { lastTick: 0 };
    return db;
  }

  function saveCups(db) {
    save(CUPS_FILE, db);
  }

  function loadArchive() {
    const db = load(ARCHIVE_FILE, { entries: [] });
    if (!Array.isArray(db.entries)) db.entries = [];
    return db;
  }

  function saveArchive(db) {
    save(ARCHIVE_FILE, db);
  }

  function load(file, fallback) {
    try {
      if (!fs.existsSync(file)) return structuredClone(fallback);
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return structuredClone(fallback);
    }
  }

  function save(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  function ensureUserProgress(u) {
    if (u.xp == null) u.xp = 0;
    if (u.level == null) u.level = levelFromXp(u.xp);
    if (u.cupsPlayed == null) u.cupsPlayed = 0;
    if (u.cupsWon == null) u.cupsWon = 0;
    if (u.role == null) u.role = u.login === 'admin' ? 'admin' : 'user';
    if (u.isBot == null) u.isBot = false;
    return u;
  }

  function enrichPublic(u) {
    ensureUserProgress(u);
    const out = {
      ...publicUser(u),
      level: u.level,
      xp: u.xp,
      xpNext: xpToNext(u.level, u.xp),
      xpThresholds: XP_THRESHOLDS,
      cupsPlayed: u.cupsPlayed,
      cupsWon: u.cupsWon,
      role: u.role || 'user',
      isBot: !!u.isBot
    };
    if (u.isBot && u.strength != null) out.strength = u.strength;
    if (u.clubName) out.clubName = u.clubName;
    return out;
  }

  function awardXp(userId, amount, reason) {
    const db = usersDb();
    const u = db.users[userId];
    if (!u || u.isBot) return null;
    ensureUserProgress(u);
    u.xp = (u.xp || 0) + Math.max(0, amount);
    const prev = u.level;
    u.level = levelFromXp(u.xp);
    saveUsers(db);
    return { xp: u.xp, level: u.level, leveledUp: u.level > prev, reason };
  }

  function botName(i) {
    return `${BOT_FIRST[i % BOT_FIRST.length]} ${BOT_LAST[Math.floor(i / BOT_FIRST.length) % BOT_LAST.length]}`;
  }

  function ensureBotPool(minPerBracket = 6) {
    const db = usersDb();
    let changed = false;
    let botCount = Object.values(db.users).filter((u) => u.isBot).length;
    LEVEL_BRACKETS.forEach((br) => {
      const have = Object.values(db.users).filter(
        (u) => u.isBot && (u.level || 1) >= br.min && (u.level || 1) <= br.max
      ).length;
      for (let n = have; n < minPerBracket; n++) {
        const id = uid('bot');
        const level = br.min + ((n + botCount) % (br.max - br.min + 1));
        const xp = XP_THRESHOLDS[level] + 10;
        const name = botName(botCount++);
        const login = ('bot_' + id.slice(-8)).toLowerCase();
        db.users[id] = {
          id,
          login,
          name,
          salt: 'bot',
          hash: 'bot',
          createdAt: Date.now(),
          isBot: true,
          role: 'bot',
          level,
          xp,
          cupsPlayed: 0,
          cupsWon: 0,
          clubName: CLUB_NAMES[botCount % CLUB_NAMES.length],
          strength: 52 + level * 3 + (botCount % 5)
        };
        changed = true;
      }
    });
    if (changed) saveUsers(db);
    return Object.values(db.users).filter((u) => u.isBot);
  }

  function publicCup(c) {
    return {
      id: c.id,
      name: c.name,
      size: c.size,
      bracketId: c.bracketId,
      bracketLabel: c.bracketLabel,
      minLevel: c.minLevel,
      maxLevel: c.maxLevel,
      status: c.status,
      createdAt: c.createdAt,
      startAt: c.startAt,
      startedAt: c.startedAt || null,
      finishedAt: c.finishedAt || null,
      slotsFilled: (c.entrants || []).length,
      humans: (c.entrants || []).filter((e) => !e.isBot).length,
      bots: (c.entrants || []).filter((e) => e.isBot).length,
      entrants: (c.entrants || []).map((e) => ({
        userId: e.userId,
        name: e.name,
        clubName: e.clubName,
        level: e.level,
        isBot: !!e.isBot,
        strength: e.strength
      })),
      champion: c.champion || null,
      round: c.round || null,
      nextRoundAt: c.nextRoundAt || null,
      aliveCount: Array.isArray(c.alive) ? c.alive.length : null,
      xpAwards: c.xpAwards || null,
      bracket: c.bracket || [],
      history: c.history || []
    };
  }

  function createOpenCup(size, bracket) {
    const id = uid('cup');
    const now = Date.now();
    return {
      id,
      name: `Кубок ${bracket.label} · ${size}`,
      size,
      bracketId: bracket.id,
      bracketLabel: bracket.label,
      minLevel: bracket.min,
      maxLevel: bracket.max,
      status: 'open',
      createdAt: now,
      startAt: now + OPEN_WINDOW_MS,
      entrants: [],
      bracket: [],
      history: [],
      round: null,
      champion: null
    };
  }

  function ensureOpenCups(db) {
    CUP_SIZES.forEach((size) => {
      LEVEL_BRACKETS.forEach((br) => {
        const hasOpen = Object.values(db.cups).some(
          (c) => c.status === 'open' && c.size === size && c.bracketId === br.id
        );
        if (!hasOpen) {
          const cup = createOpenCup(size, br);
          db.cups[cup.id] = cup;
        }
      });
    });
  }

  function pickBots(bracket, count, excludeIds) {
    ensureBotPool();
    const db = usersDb();
    const pool = Object.values(db.users)
      .filter((u) => u.isBot && (u.level || 1) >= bracket.min && (u.level || 1) <= bracket.max)
      .filter((u) => !excludeIds.has(u.id))
      .sort(() => Math.random() - 0.5);
    return pool.slice(0, count).map((u) => ({
      userId: u.id,
      name: u.name,
      clubName: u.clubName || 'AI FC',
      level: u.level || 1,
      isBot: true,
      strength: u.strength || 60
    }));
  }

  function simScore(aStr, bStr) {
    const pa = 0.45 + (aStr - bStr) / 80;
    const pb = 0.45 + (bStr - aStr) / 80;
    let hg = 0;
    let ag = 0;
    for (let i = 0; i < 10; i++) {
      if (Math.random() < Math.max(0.08, Math.min(0.42, pa / 10))) hg++;
      if (Math.random() < Math.max(0.08, Math.min(0.42, pb / 10))) ag++;
    }
    if (hg === ag) {
      if (Math.random() < 0.5) hg++;
      else ag++;
    }
    return [hg, ag];
  }

  function buildKnockout(entrants) {
    const seeded = [...entrants].sort(() => Math.random() - 0.5);
    const ties = [];
    for (let i = 0; i < seeded.length; i += 2) {
      ties.push({
        id: uid('m'),
        home: seeded[i],
        away: seeded[i + 1],
        score: null,
        played: false,
        winnerId: null
      });
    }
    return ties;
  }

  function roundLabel(size, remainingTies) {
    const playersLeft = remainingTies * 2;
    if (playersLeft <= 2) return 'Финал';
    if (playersLeft <= 4) return '1/2';
    if (playersLeft <= 8) return '1/4';
    if (playersLeft <= 16) return '1/8';
    return `R${playersLeft}`;
  }

  function playRound(cup, entrants) {
    const ties = buildKnockout(entrants);
    const label = roundLabel(cup.size || entrants.length, ties.length);
    cup.round = label;
    const winners = [];
    ties.forEach((m) => {
      const score = simScore(m.home.strength || 60, m.away.strength || 60);
      m.score = score;
      m.played = true;
      m.winnerId = score[0] > score[1] ? m.home.userId : m.away.userId;
      winners.push(m.winnerId === m.home.userId ? m.home : m.away);
    });
    cup.history.push({
      round: label,
      ties: ties.map((m) => ({
        id: m.id,
        home: { userId: m.home.userId, name: m.home.name, clubName: m.home.clubName, isBot: m.home.isBot },
        away: { userId: m.away.userId, name: m.away.name, clubName: m.away.clubName, isBot: m.away.isBot },
        score: m.score,
        winnerId: m.winnerId
      }))
    });
    cup.bracket = cup.history[cup.history.length - 1].ties;
    return winners;
  }

  function finalizeCup(cup) {
    const champ = (cup.alive && cup.alive[0]) || null;
    cup.champion = champ
      ? { userId: champ.userId, name: champ.name, clubName: champ.clubName, isBot: !!champ.isBot, level: champ.level }
      : null;
    cup.status = 'finished';
    cup.finishedAt = Date.now();
    cup.round = 'Чемпион';
    cup.nextRoundAt = null;
    cup.alive = champ ? [champ] : [];
    cup.xpAwards = {};

    const udb = usersDb();
    let dirty = false;
    (cup.entrants || []).forEach((e) => {
      if (e.isBot) {
        const bot = udb.users[e.userId];
        if (bot) {
          bot.cupsPlayed = (bot.cupsPlayed || 0) + 1;
          if (cup.champion && cup.champion.userId === e.userId) bot.cupsWon = (bot.cupsWon || 0) + 1;
          dirty = true;
        }
        return;
      }
      const u = udb.users[e.userId];
      if (!u) return;
      ensureUserProgress(u);
      u.cupsPlayed = (u.cupsPlayed || 0) + 1;
      let xpGain = 25 + Math.floor(cup.size / 2);
      if (cup.champion && cup.champion.userId === e.userId) {
        u.cupsWon = (u.cupsWon || 0) + 1;
        xpGain += 40 + cup.size * 2;
      } else if (cup.history.some((h) => h.round === '1/2' && h.ties.some((t) => t.winnerId === e.userId))) {
        xpGain += 20;
      }
      u.xp = (u.xp || 0) + xpGain;
      u.level = levelFromXp(u.xp);
      cup.xpAwards[e.userId] = xpGain;
      dirty = true;
    });
    if (dirty) saveUsers(udb);
  }

  function beginTournament(cup) {
    cup.history = [];
    cup.status = 'live';
    cup.startedAt = Date.now();
    cup.champion = null;
    cup.xpAwards = {};
    cup.alive = [...cup.entrants];
    const winners = playRound(cup, cup.alive);
    cup.alive = winners;
    if (cup.alive.length <= 1) {
      finalizeCup(cup);
    } else {
      cup.nextRoundAt = Date.now() + LIVE_ROUND_MS;
    }
  }

  function advanceLiveCup(cup, now = Date.now(), { force = false } = {}) {
    if (cup.status !== 'live') return null;
    if (!force && cup.nextRoundAt && now < cup.nextRoundAt) return null;
    if (!cup.alive || cup.alive.length < 2) {
      finalizeCup(cup);
      return { action: 'finished', id: cup.id, champion: cup.champion };
    }
    const winners = playRound(cup, cup.alive);
    cup.alive = winners;
    if (cup.alive.length <= 1) {
      finalizeCup(cup);
      return { action: 'finished', id: cup.id, champion: cup.champion };
    }
    cup.nextRoundAt = now + LIVE_ROUND_MS;
    return { action: 'round', id: cup.id, round: cup.round, nextRoundAt: cup.nextRoundAt };
  }

  function advanceLiveCups({ force = false } = {}) {
    const db = loadCups();
    const now = Date.now();
    const results = [];
    Object.values(db.cups).forEach((cup) => {
      if (cup.status !== 'live') return;
      const r = advanceLiveCup(cup, now, { force });
      if (r) results.push(r);
    });
    if (results.length) saveCups(db);
    return { ok: true, at: now, results };
  }

  function archiveAndDelete(db, cup, reason) {
    const arch = loadArchive();
    arch.entries.unshift({
      id: cup.id,
      name: cup.name,
      size: cup.size,
      bracketLabel: cup.bracketLabel,
      reason,
      humans: (cup.entrants || []).filter((e) => !e.isBot).length,
      bots: (cup.entrants || []).filter((e) => e.isBot).length,
      status: cup.status,
      createdAt: cup.createdAt,
      startAt: cup.startAt,
      archivedAt: Date.now()
    });
    if (arch.entries.length > 200) arch.entries.length = 200;
    saveArchive(arch);
    delete db.cups[cup.id];
  }

  function tryStartCup(db, cup) {
    const humans = (cup.entrants || []).filter((e) => !e.isBot);
    if (humans.length < 1) {
      archiveAndDelete(db, cup, 'no_humans');
      return { action: 'archived', id: cup.id };
    }
    const need = cup.size - cup.entrants.length;
    if (need > 0) {
      const br = LEVEL_BRACKETS.find((b) => b.id === cup.bracketId) || LEVEL_BRACKETS[0];
      const exclude = new Set(cup.entrants.map((e) => e.userId));
      const bots = pickBots(br, need, exclude);
      cup.entrants.push(...bots);
    }
    let n = cup.entrants.length;
    if (n < 2) {
      archiveAndDelete(db, cup, 'not_enough_players');
      return { action: 'archived', id: cup.id };
    }
    let pow = 2;
    while (pow * 2 <= n) pow *= 2;
    if (pow < n) cup.entrants = cup.entrants.slice(0, pow);
    cup.size = cup.entrants.length;
    beginTournament(cup);
    return {
      action: 'started',
      id: cup.id,
      status: cup.status,
      round: cup.round,
      champion: cup.champion || null
    };
  }

  function tick() {
    ensureBotPool();
    const db = loadCups();
    const now = Date.now();
    const results = [];
    Object.values(db.cups).forEach((cup) => {
      if (cup.status !== 'open') return;
      if (now < cup.startAt) return;
      results.push(tryStartCup(db, cup));
    });
    Object.values(db.cups).forEach((cup) => {
      if (cup.status === 'live') {
        const r = advanceLiveCup(cup, now);
        if (r) results.push(r);
      }
    });
    Object.values(db.cups).forEach((cup) => {
      if (cup.status === 'finished' && cup.finishedAt && now - cup.finishedAt > 2 * 3600e3) {
        archiveAndDelete(db, cup, 'finished_expired');
        results.push({ action: 'expired', id: cup.id });
      }
    });
    ensureOpenCups(db);
    db.meta.lastTick = now;
    db.meta.nextTick = now + TICK_MS;
    db.meta.liveRoundMs = LIVE_ROUND_MS;
    saveCups(db);
    return { ok: true, at: now, results, open: Object.values(db.cups).filter((c) => c.status === 'open').length };
  }

  function listCups({ status } = {}) {
    const db = loadCups();
    let list = Object.values(db.cups).map(publicCup);
    if (status) list = list.filter((c) => c.status === status);
    list.sort((a, b) => (a.startAt || 0) - (b.startAt || 0));
    return list;
  }

  function getCup(id) {
    const db = loadCups();
    const c = db.cups[id];
    return c ? publicCup(c) : null;
  }

  function joinCup(cupId, user, clubName, opts = {}) {
    ensureUserProgress(user);
    const db = loadCups();
    const cup = db.cups[cupId];
    if (!cup) return { ok: false, error: 'Кубок не найден' };
    if (cup.status !== 'open') return { ok: false, error: 'Кубок уже закрыт' };
    const isAdmin = user.role === 'admin' || user.login === 'admin';
    if (!isAdmin && (user.level < cup.minLevel || user.level > cup.maxLevel)) {
      return { ok: false, error: `Нужен уровень ${cup.minLevel}–${cup.maxLevel} (у вас ${user.level})` };
    }
    if (cup.entrants.some((e) => e.userId === user.id)) {
      return { ok: false, error: 'Вы уже в этом кубке' };
    }
    const already = Object.values(db.cups).some(
      (c) => c.status === 'open' && c.entrants.some((e) => e.userId === user.id && !e.isBot)
    );
    if (already) return { ok: false, error: 'Сначала выйдите из другого открытого кубка' };
    if (cup.entrants.length >= cup.size) return { ok: false, error: 'Мест нет' };

    let strength = Number(opts.strength) || 0;
    let resolvedClub = clubName;
    try {
      const saveFile = path.join(dataDir, 'saves', `user_${user.id}.json`);
      if (fs.existsSync(saveFile)) {
        const payload = JSON.parse(fs.readFileSync(saveFile, 'utf8'));
        const st = payload.state;
        const me = (st?.clubs || []).find((c) => c.id === st.clubId);
        if (me?.squad?.length) {
          resolvedClub = resolvedClub || me.name;
          const xi = (me.lineup || []).filter(Boolean);
          const pool = xi.length >= 11 ? xi.slice(0, 11) : [...me.squad].sort((a, b) => (b.ovr || 0) - (a.ovr || 0)).slice(0, 11);
          if (!strength && pool.length) {
            strength = Math.round(pool.reduce((s, p) => s + (p.ovr || 60), 0) / pool.length);
          }
        }
      }
    } catch {}
    if (!strength) strength = 58 + (user.level || 1) * 2;

    cup.entrants.push({
      userId: user.id,
      name: user.name,
      clubName: resolvedClub || `${user.name} FC`,
      level: user.level || 1,
      isBot: false,
      strength,
      joinedAt: Date.now()
    });
    if (cup.entrants.length >= cup.size) {
      const r = tryStartCup(db, cup);
      saveCups(db);
      return { ok: true, started: r.action === 'started', cup: publicCup(db.cups[cupId] || cup) };
    }
    saveCups(db);
    return { ok: true, started: false, cup: publicCup(cup) };
  }

  function leaveCup(cupId, userId) {
    const db = loadCups();
    const cup = db.cups[cupId];
    if (!cup) return { ok: false, error: 'Кубок не найден' };
    if (cup.status !== 'open') return { ok: false, error: 'Нельзя выйти — кубок уже стартовал' };
    const before = cup.entrants.length;
    cup.entrants = cup.entrants.filter((e) => e.userId !== userId);
    if (cup.entrants.length === before) return { ok: false, error: 'Вас нет в кубке' };
    saveCups(db);
    return { ok: true, cup: publicCup(cup) };
  }

  function adminCreateCup({ size, bracketId, startInMs }) {
    const br = LEVEL_BRACKETS.find((b) => b.id === bracketId) || LEVEL_BRACKETS[0];
    const sz = CUP_SIZES.includes(Number(size)) ? Number(size) : 8;
    const db = loadCups();
    const cup = createOpenCup(sz, br);
    if (startInMs != null) cup.startAt = Date.now() + Number(startInMs);
    db.cups[cup.id] = cup;
    saveCups(db);
    return publicCup(cup);
  }

  function adminForceStart(cupId) {
    const db = loadCups();
    const cup = db.cups[cupId];
    if (!cup) return { ok: false, error: 'Нет кубка' };
    if (cup.status !== 'open') return { ok: false, error: 'Кубок не open' };
    const r = tryStartCup(db, cup);
    saveCups(db);
    return { ok: true, ...r, cup: publicCup(db.cups[cupId] || cup) };
  }

  function adminAdvanceCup(cupId) {
    const db = loadCups();
    const cup = db.cups[cupId];
    if (!cup) return { ok: false, error: 'Нет кубка' };
    if (cup.status !== 'live') return { ok: false, error: 'Кубок не live' };
    const r = advanceLiveCup(cup, Date.now(), { force: true });
    saveCups(db);
    return { ok: true, ...(r || { action: 'noop' }), cup: publicCup(db.cups[cupId] || cup) };
  }

  function adminFinishCup(cupId) {
    const db = loadCups();
    const cup = db.cups[cupId];
    if (!cup) return { ok: false, error: 'Нет кубка' };
    if (cup.status === 'open') {
      const r = tryStartCup(db, cup);
      if (r.action === 'archived') {
        saveCups(db);
        return { ok: true, ...r, cup: null };
      }
    }
    let guard = 0;
    while (db.cups[cupId] && db.cups[cupId].status === 'live' && guard++ < 12) {
      advanceLiveCup(db.cups[cupId], Date.now(), { force: true });
    }
    saveCups(db);
    return { ok: true, action: 'finished', cup: publicCup(db.cups[cupId]) };
  }

  function adminDeleteCup(cupId) {
    const db = loadCups();
    const cup = db.cups[cupId];
    if (!cup) return { ok: false, error: 'Нет кубка' };
    archiveAndDelete(db, cup, 'admin_delete');
    saveCups(db);
    return { ok: true };
  }

  function stats() {
    const db = loadCups();
    const users = usersDb().users;
    const list = Object.values(db.cups);
    return {
      users: Object.keys(users).length,
      bots: Object.values(users).filter((u) => u.isBot).length,
      humans: Object.values(users).filter((u) => !u.isBot).length,
      cupsOpen: list.filter((c) => c.status === 'open').length,
      cupsLive: list.filter((c) => c.status === 'live').length,
      cupsFinished: list.filter((c) => c.status === 'finished').length,
      archive: loadArchive().entries.length,
      lastTick: db.meta?.lastTick || 0,
      nextTick: db.meta?.nextTick || 0,
      tickMs: TICK_MS,
      liveRoundMs: LIVE_ROUND_MS,
      xpThresholds: XP_THRESHOLDS,
      brackets: LEVEL_BRACKETS,
      sizes: CUP_SIZES
    };
  }

  function startScheduler() {
    ensureBotPool();
    const db = loadCups();
    ensureOpenCups(db);
    saveCups(db);
    setTimeout(() => {
      try { tick(); } catch (e) { console.error('[EYE cups] tick', e); }
      setInterval(() => {
        try { tick(); } catch (e) { console.error('[EYE cups] tick', e); }
      }, TICK_MS);
      setInterval(() => {
        try { advanceLiveCups(); } catch (e) { console.error('[EYE cups] live', e); }
      }, LIVE_POLL_MS);
    }, 3000);
    console.log(`[EYE cups] scheduler every ${TICK_MS / 1000}s · live round ${LIVE_ROUND_MS / 1000}s · sizes ${CUP_SIZES.join('/')} · brackets ${LEVEL_BRACKETS.length}`);
  }

  return {
    LEVEL_BRACKETS,
    CUP_SIZES,
    XP_THRESHOLDS,
    levelFromXp,
    xpToNext,
    bracketForLevel,
    ensureUserProgress,
    enrichPublic,
    awardXp,
    ensureBotPool,
    tick,
    advanceLiveCups,
    listCups,
    getCup,
    joinCup,
    leaveCup,
    adminCreateCup,
    adminForceStart,
    adminAdvanceCup,
    adminFinishCup,
    adminDeleteCup,
    stats,
    startScheduler,
    loadArchive,
    publicCup
  };
}

module.exports = { createCupsModule, LEVEL_BRACKETS, CUP_SIZES, levelFromXp, XP_THRESHOLDS };
