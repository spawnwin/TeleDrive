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

function createCupsModule({ dataDir, usersDb, saveUsers, publicUser, store }) {
  const CUPS_FILE = path.join(dataDir, 'cups.json');
  const ARCHIVE_FILE = path.join(dataDir, 'cups_archive.json');
  const TICK_MS = Number(process.env.EYE_CUP_TICK_MS || 5 * 60 * 1000);
  const OPEN_WINDOW_MS = Number(process.env.EYE_CUP_OPEN_MS || 5 * 60 * 1000);
  const LIVE_ROUND_MS = Number(process.env.EYE_CUP_LIVE_MS || 20 * 1000);
  const LIVE_POLL_MS = Math.min(5000, Math.max(1000, Math.floor(LIVE_ROUND_MS / 4)));

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

  function loadCups() {
    if (store?.loadCups) {
      const db = store.loadCups();
      if (!db.cups) db.cups = {};
      if (!db.meta) db.meta = { lastTick: 0 };
      return db;
    }
    const db = load(CUPS_FILE, { cups: {}, meta: { lastTick: 0 } });
    if (!db.cups) db.cups = {};
    if (!db.meta) db.meta = { lastTick: 0 };
    return db;
  }

  function saveCups(db) {
    if (store?.saveCups) return store.saveCups(db);
    save(CUPS_FILE, db);
  }

  function loadArchive() {
    if (store?.loadArchive) {
      const db = store.loadArchive();
      if (!Array.isArray(db.entries)) db.entries = [];
      return db;
    }
    const db = load(ARCHIVE_FILE, { entries: [] });
    if (!Array.isArray(db.entries)) db.entries = [];
    return db;
  }

  function saveArchive(db) {
    if (store?.saveArchive) return store.saveArchive(db);
    save(ARCHIVE_FILE, db);
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
      isBot: !!u.isBot,
      teamBound: !!u.teamBound
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
        const clubName = CLUB_NAMES[botCount % CLUB_NAMES.length];
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
          clubName,
          strength: 52 + level * 3 + (botCount % 5),
          money: 300000,
          fans: 8000,
          boosters: 0,
          fame: 0,
          prestige: 0,
          points: 0
        };
        if (store?.ensureBotClub) {
          try {
            const str = store.ensureBotClub(db.users[id], clubName);
            if (str) db.users[id].strength = str;
          } catch {}
        }
        changed = true;
      }
    });
    if (store?.ensureBotClub) {
      Object.values(db.users).filter((u) => u.isBot).forEach((u) => {
        if (store.hasClub && store.hasClub(u.id)) return;
        try {
          const str = store.ensureBotClub(u, u.clubName);
          if (str) {
            u.strength = str;
            changed = true;
          }
        } catch {}
      });
    }
    if (changed) saveUsers(db);
    return Object.values(db.users).filter((u) => u.isBot);
  }

  function publicCup(c) {
    const aliveIds = new Set((c.alive || []).map((e) => e.userId));
    const hasStarted = c.status === 'live' || c.status === 'finished';
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
      entrantsCount: (c.entrants || []).length,
      humans: (c.entrants || []).filter((e) => !e.isBot).length,
      bots: (c.entrants || []).filter((e) => e.isBot).length,
      entrants: (c.entrants || []).map((e) => ({
        userId: e.userId,
        name: e.name,
        clubName: e.clubName,
        level: e.level,
        isBot: !!e.isBot,
        strength: e.strength,
        out: hasStarted && !aliveIds.has(e.userId)
      })),
      aliveIds: [...aliveIds],
      champion: c.champion || null,
      round: c.round || null,
      nextRoundAt: c.nextRoundAt || null,
      aliveCount: Array.isArray(c.alive) ? c.alive.length : null,
      xpAwards: c.xpAwards || null,
      moneyAwards: c.moneyAwards || null,
      bracket: c.bracket || [],
      history: c.history || []
    };
  }

  function readCareerClub(userId) {
    try {
      if (store?.readCareerClub) return store.readCareerClub(userId);
      const saveFile = path.join(dataDir, 'saves', `user_${userId}.json`);
      if (!fs.existsSync(saveFile)) return null;
      const payload = JSON.parse(fs.readFileSync(saveFile, 'utf8'));
      const st = payload.state;
      const me = (st?.clubs || []).find((c) => c.id === st.clubId);
      if (!me) return null;
      return { payload, st, me, saveFile };
    } catch {
      return null;
    }
  }

  function writeCareerClub(userId, payload) {
    if (store?.writeCareer) return store.writeCareer(userId, payload);
    const saveFile = path.join(dataDir, 'saves', `user_${userId}.json`);
    fs.mkdirSync(path.dirname(saveFile), { recursive: true });
    fs.writeFileSync(saveFile, JSON.stringify(payload, null, 2));
  }

  function playerPower(p) {
    if (!p) return 0;
    if (typeof p.effective === 'number') return p.effective;
    if (typeof p.mastery === 'number') return p.mastery;
    if (typeof p.ovr === 'number') return p.ovr;
    const sk = p.skills || {};
    const vals = Object.values(sk).filter((n) => typeof n === 'number');
    if (vals.length) return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    return 50;
  }

  function xiStrengthFromClub(me) {
    if (!me?.squad?.length) return null;
    const rawLineup = me.lineupIds || me.lineup || [];
    let pool = rawLineup
      .map((idOrP) => (typeof idOrP === 'string' ? me.squad.find((p) => p.id === idOrP) : idOrP))
      .filter(Boolean);
    if (pool.length < 11) {
      pool = [...me.squad].sort((a, b) => playerPower(b) - playerPower(a)).slice(0, 11);
    } else {
      pool = pool.slice(0, 11);
    }
    if (!pool.length) return null;
    return Math.round(pool.reduce((s, p) => s + playerPower(p), 0) / pool.length);
  }

  function refreshEntrantStrength(entrant) {
    if (!entrant || entrant.isBot) return entrant;
    if (store?.clubStrength) {
      const str = store.clubStrength(entrant.userId);
      if (str) entrant.strength = str;
    }
    const career = readCareerClub(entrant.userId);
    if (!career) return entrant;
    const str = xiStrengthFromClub(career.me);
    if (str) entrant.strength = str;
    if (career.me.name) entrant.clubName = entrant.clubName || career.me.name;
    return entrant;
  }

  function pushCupEvent(userId, ev) {
    const db = usersDb();
    const u = db.users[userId];
    if (!u || u.isBot) return;
    ensureUserProgress(u);
    u.cupEvents = Array.isArray(u.cupEvents) ? u.cupEvents : [];
    u.cupEvents.unshift({
      id: uid('ev'),
      at: Date.now(),
      read: false,
      ...ev
    });
    if (u.cupEvents.length > 40) u.cupEvents.length = 40;
    saveUsers(db);
  }

  function listCupEvents(userId, { unreadOnly = false, limit = 20 } = {}) {
    const db = usersDb();
    const u = db.users[userId];
    if (!u) return [];
    let list = Array.isArray(u.cupEvents) ? u.cupEvents : [];
    if (unreadOnly) list = list.filter((e) => !e.read);
    return list.slice(0, limit);
  }

  function markCupEventsRead(userId, ids) {
    const db = usersDb();
    const u = db.users[userId];
    if (!u || !Array.isArray(u.cupEvents)) return { ok: true, updated: 0 };
    let updated = 0;
    u.cupEvents.forEach((e) => {
      if (!ids || !ids.length || ids.includes(e.id)) {
        if (!e.read) updated++;
        e.read = true;
      }
    });
    saveUsers(db);
    return { ok: true, updated };
  }

  function applyCareerMoney(userId, amount, label, body) {
    const career = readCareerClub(userId);
    if (!career || !amount) return null;
    const { payload, st, me } = career;
    me.budget = Math.round((me.budget || 0) + amount);
    st.ledger = Array.isArray(st.ledger) ? st.ledger : [];
    st.ledger.unshift({
      id: uid('led'),
      at: Date.now(),
      delta: amount,
      label,
      week: st.week,
      season: st.season
    });
    if (st.ledger.length > 100) st.ledger.length = 100;
    st.inbox = Array.isArray(st.inbox) ? st.inbox : [];
    st.inbox.unshift({
      id: uid('mail'),
      type: 'online_cup',
      title: label,
      body: body || label,
      read: false,
      at: Date.now(),
      week: st.week
    });
    if (st.inbox.length > 80) st.inbox.length = 80;
    writeCareerClub(userId, payload);
    return amount;
  }

  function moneyForResult(cup, userId) {
    const size = cup.size || 8;
    if (cup.champion && cup.champion.userId === userId) return 120000 * size;
    if (cup.history.some((h) => h.round === '1/2' && h.ties.some((t) => t.winnerId === userId))) {
      return 40000 * size;
    }
    if (cup.history.some((h) => h.ties.some((t) => t.home.userId === userId || t.away.userId === userId))) {
      return 12000 * size;
    }
    return 8000 * size;
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

  function pruneDuplicateOpenCups(db) {
    // Keep one newest open cup per size×bracket; archive the rest.
    const groups = new Map();
    Object.values(db.cups).forEach((c) => {
      if (c.status !== 'open') return;
      const key = `${c.bracketId}|${c.size}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    });
    groups.forEach((list) => {
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      list.slice(1).forEach((c) => archiveAndDelete(db, c, 'duplicate_open'));
    });
  }

  function ensureOpenCups(db) {
    pruneDuplicateOpenCups(db);
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
      let score;
      let matchId = null;
      if (store?.playCupTie) {
        try {
          const r = store.playCupTie(m.home, m.away, { cupId: cup.id, cupName: cup.name, round: label });
          if (r?.score) {
            score = [r.score[0], r.score[1]];
            matchId = r.matchId || null;
            if (r.homeStrength) m.home.strength = r.homeStrength;
            if (r.awayStrength) m.away.strength = r.awayStrength;
          }
        } catch (e) {
          console.warn('[cups] playCupTie failed', e.message || e);
        }
      }
      if (!score) score = simScore(m.home.strength || 60, m.away.strength || 60);
      else score = [score[0], score[1]];
      // knockout cannot draw — extra-time / pens (copy, never mutate MatchRec.score)
      if (score[0] === score[1]) {
        const hs = m.home.strength || 60;
        const as = m.away.strength || 60;
        if (hs === as) {
          if (Math.random() < 0.5) score[0] += 1;
          else score[1] += 1;
        } else if (hs > as) score[0] += 1;
        else score[1] += 1;
        if (store?.annotateCupPens && matchId) {
          try { store.annotateCupPens(matchId, score); } catch {}
        }
      }
      m.score = score;
      m.matchId = matchId;
      m.played = true;
      m.winnerId = score[0] > score[1] ? m.home.userId : m.away.userId;
      winners.push(m.winnerId === m.home.userId ? m.home : m.away);
    });
    cup.history.push({
      round: label,
      ties: ties.map((m) => ({
        id: m.id,
        matchId: m.matchId || null,
        home: { userId: m.home.userId, name: m.home.name, clubName: m.home.clubName, isBot: m.home.isBot, strength: m.home.strength },
        away: { userId: m.away.userId, name: m.away.name, clubName: m.away.clubName, isBot: m.away.isBot, strength: m.away.strength },
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
    cup.moneyAwards = {};

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
      const won = cup.champion && cup.champion.userId === e.userId;
      if (won) {
        u.cupsWon = (u.cupsWon || 0) + 1;
        xpGain += 40 + cup.size * 2;
      } else if (cup.history.some((h) => h.round === '1/2' && h.ties.some((t) => t.winnerId === e.userId))) {
        xpGain += 20;
      }
      u.xp = (u.xp || 0) + xpGain;
      u.level = levelFromXp(u.xp);
      u.points = (u.points || 0) + (won ? 10 : 3);
      u.fame = (u.fame || 0) + (won ? 5 : 1);
      if (won) u.prestige = (u.prestige || 0) + 3;
      else u.prestige = (u.prestige || 0) + 1;
      cup.xpAwards[e.userId] = xpGain;
      dirty = true;

      const money = moneyForResult(cup, e.userId);
      const applied = applyCareerMoney(
        e.userId,
        money,
        won ? `Победа в ${cup.name}` : `Приз · ${cup.name}`,
        won
          ? `Чемпион онлайн-кубка! На счёт клуба зачислено ${money.toLocaleString('ru-RU')} ¤.`
          : `Участие в ${cup.name}: +${money.toLocaleString('ru-RU')} ¤ и +${xpGain} XP.`
      );
      if (applied) cup.moneyAwards[e.userId] = applied;

      pushCupEvent(e.userId, {
        type: won ? 'cup_won' : 'cup_done',
        cupId: cup.id,
        cupName: cup.name,
        xp: xpGain,
        money: applied || 0,
        champion: cup.champion
      });
    });
    if (dirty) saveUsers(udb);
  }

  function beginTournament(cup) {
    (cup.entrants || []).forEach((e) => refreshEntrantStrength(e));
    cup.history = [];
    cup.status = 'live';
    cup.startedAt = Date.now();
    cup.champion = null;
    cup.xpAwards = {};
    cup.moneyAwards = {};
    cup.alive = [...cup.entrants];
    const tiesCount = Math.max(1, Math.floor(cup.alive.length / 2));
    cup.round = roundLabel(cup.size || cup.alive.length, tiesCount);
    cup.bracket = [];
    cup.nextRoundAt = Date.now() + LIVE_ROUND_MS;
    (cup.entrants || []).filter((e) => !e.isBot).forEach((e) => {
      pushCupEvent(e.userId, {
        type: 'cup_started',
        cupId: cup.id,
        cupName: cup.name,
        round: cup.round,
        nextRoundAt: cup.nextRoundAt
      });
    });
  }

  function notifyEliminations(cup, previousAlive, winners) {
    const winIds = new Set(winners.map((w) => w.userId));
    previousAlive.forEach((e) => {
      if (e.isBot || winIds.has(e.userId)) return;
      pushCupEvent(e.userId, {
        type: 'cup_out',
        cupId: cup.id,
        cupName: cup.name,
        round: cup.round
      });
    });
  }

  function advanceLiveCup(cup, now = Date.now(), { force = false } = {}) {
    if (cup.status !== 'live') return null;
    if (!force && cup.nextRoundAt && now < cup.nextRoundAt) return null;
    if (!cup.alive || cup.alive.length < 2) {
      finalizeCup(cup);
      return { action: 'finished', id: cup.id, champion: cup.champion };
    }
    const previous = [...cup.alive];
    const winners = playRound(cup, cup.alive);
    cup.alive = winners;
    notifyEliminations(cup, previous, winners);
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
      finishedAt: cup.finishedAt || null,
      champion: cup.champion || null,
      history: (cup.history || []).slice(-6),
      bracket: cup.bracket || [],
      entrants: (cup.entrants || []).map((e) => ({
        userId: e.userId, name: e.name, clubName: e.clubName, isBot: !!e.isBot, level: e.level
      })),
      archivedAt: Date.now()
    });
    if (arch.entries.length > 300) arch.entries.length = 300;
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
      // keep finished cups queryable for a week
      if (cup.status === 'finished' && cup.finishedAt && now - cup.finishedAt > 7 * 24 * 3600e3) {
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

  function listCups({ status, bracketId, mineFor } = {}) {
    const db = loadCups();
    let list = Object.values(db.cups).map(publicCup);
    if (status) list = list.filter((c) => c.status === status);
    if (bracketId) list = list.filter((c) => c.bracketId === bracketId);
    if (mineFor) {
      list = list.filter((c) => (c.entrants || []).some((e) => e.userId === mineFor));
    }
    list.sort((a, b) => {
      const order = { live: 0, open: 1, finished: 2 };
      const d = (order[a.status] ?? 9) - (order[b.status] ?? 9);
      if (d) return d;
      return (a.startAt || 0) - (b.startAt || 0);
    });
    return list;
  }

  function leaderboard({ limit = 30, bracketId } = {}) {
    const br = bracketId ? LEVEL_BRACKETS.find((b) => b.id === bracketId) : null;
    let list = Object.values(usersDb().users).filter((u) => !u.isBot);
    if (br) list = list.filter((u) => (u.level || 1) >= br.min && (u.level || 1) <= br.max);
    list.sort((a, b) =>
      (b.cupsWon || 0) - (a.cupsWon || 0) ||
      (b.xp || 0) - (a.xp || 0) ||
      (b.level || 0) - (a.level || 0)
    );
    return list.slice(0, limit).map((u, i) => ({
      rank: i + 1,
      ...enrichPublic(u)
    }));
  }

  function findMyLiveCup(userId) {
    const db = loadCups();
    const cup = Object.values(db.cups).find((c) => {
      if (c.status !== 'live') return false;
      return (c.entrants || []).some((e) => e.userId === userId && !e.isBot);
    });
    if (!cup) return null;
    const pub = publicCup(cup);
    const aliveList = cup.alive || [];
    pub.stillAlive = !aliveList.length || aliveList.some((e) => e.userId === userId);
    return pub;
  }

  function getCup(id) {
    const db = loadCups();
    const c = db.cups[id];
    if (c) return publicCup(c);
    const arch = loadArchive().entries.find((e) => e.id === id);
    const hasReplay = !!(arch?.champion || (arch?.history && arch.history.length) || (arch?.bracket && arch.bracket.length));
    if (arch && hasReplay) {
      return publicCup({
        ...arch,
        status: 'finished',
        entrants: arch.entrants || [],
        history: arch.history || [],
        bracket: arch.bracket || [],
        alive: arch.champion ? [arch.champion] : [],
        minLevel: arch.minLevel || 1,
        maxLevel: arch.maxLevel || 10
      });
    }
    return null;
  }

  async function getCupAsync(id) {
    const live = getCup(id);
    if (live) return live;
    if (store?.loadCupById) {
      try {
        const raw = await store.loadCupById(id);
        if (raw) return publicCup(raw);
      } catch {}
    }
    return null;
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
      (c) =>
        (c.status === 'open' || c.status === 'live') &&
        c.entrants.some((e) => e.userId === user.id && !e.isBot) &&
        (c.status !== 'live' || (c.alive || []).some((a) => a.userId === user.id) || !(c.alive || []).length)
    );
    if (already) {
      const live = Object.values(db.cups).find(
        (c) => c.status === 'live' && (c.alive || []).some((e) => e.userId === user.id)
      );
      if (live) return { ok: false, error: 'Вы уже играете в другом кубке' };
      return { ok: false, error: 'Сначала выйдите из другого открытого кубка' };
    }
    if (cup.entrants.length >= cup.size) return { ok: false, error: 'Мест нет' };

    let strength = Number(opts.strength) || 0;
    let resolvedClub = clubName;
    if (!strength && store?.clubStrength) {
      strength = store.clubStrength(user.id) || 0;
    }
    const career = readCareerClub(user.id);
    if (career) {
      resolvedClub = resolvedClub || career.me.name;
      if (!strength) {
        const str = xiStrengthFromClub(career.me);
        if (str) strength = str;
      }
    }
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
    getCupAsync,
    joinCup,
    leaveCup,
    leaderboard,
    findMyLiveCup,
    listCupEvents,
    markCupEventsRead,
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
