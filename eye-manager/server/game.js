'use strict';

/**
 * 11x11-style club / players / matches engine for EYE.
 */

const crypto = require('crypto');

const POSITIONS = ['Gk', 'Ld', 'Cd', 'Rd', 'Lm', 'Cm', 'Rm', 'Lf', 'Cf', 'Rf', 'Dm', 'Am'];
const FIELD_XI = ['Gk', 'Ld', 'Cd', 'Cd', 'Rd', 'Lm', 'Cm', 'Cm', 'Rm', 'Cf', 'Cf'];
const FIRST = ['Артём', 'Илья', 'Максим', 'Кирилл', 'Данил', 'Роман', 'Егор', 'Павел', 'Никита', 'Лев', 'Марк', 'Тимур', 'Ян', 'Олег', 'Сергей'];
const LAST = ['Волков', 'Орлов', 'Соколов', 'Морозов', 'Новиков', 'Козлов', 'Лебедев', 'Кузнецов', 'Попов', 'Васильев', 'Смирнов', 'Фёдоров', 'Михайлов', 'Алексеев'];
const CLUB_ADJ = ['Северный', 'Алый', 'Синий', 'Зелёный', 'Чёрный', 'Белый', 'Уральский', 'Волжский', 'Балтийский', 'Таёжный'];
const CLUB_NOUN = ['Шторм', 'Горизонт', 'Ястреб', 'Парк', 'Орёл', 'Рубин', 'Факел', 'Сапфир', 'Метеор', 'Авангард'];

const FORMATIONS = {
  '4-4-2': ['Gk', 'Ld', 'Cd', 'Cd', 'Rd', 'Lm', 'Cm', 'Cm', 'Rm', 'Cf', 'Cf'],
  '4-3-3': ['Gk', 'Ld', 'Cd', 'Cd', 'Rd', 'Cm', 'Cm', 'Cm', 'Lf', 'Cf', 'Rf'],
  '3-5-2': ['Gk', 'Cd', 'Cd', 'Cd', 'Lm', 'Cm', 'Cm', 'Cm', 'Rm', 'Cf', 'Cf'],
  '4-2-3-1': ['Gk', 'Ld', 'Cd', 'Cd', 'Rd', 'Dm', 'Dm', 'Lm', 'Am', 'Rm', 'Cf']
};

const STYLES = ['balance', 'attack', 'defend', 'press', 'counter'];

function uid(prefix) {
  return prefix + '_' + crypto.randomBytes(5).toString('hex');
}

function rnd(a, b) {
  return a + Math.floor(Math.random() * (b - a + 1));
}

function pick(arr) {
  return arr[rnd(0, arr.length - 1)];
}

function levelFromXp(xp) {
  const thr = [0, 0, 100, 250, 500, 900, 1500, 2400, 3600, 5200, 7500];
  let lvl = 1;
  for (let i = 2; i <= 10; i++) if ((xp || 0) >= thr[i]) lvl = i;
  return lvl;
}

function skillForPos(pos, base) {
  const s = {
    tackle: base, mark: base, dribble: base, control: base,
    stamina: base, pass: base, shotPower: base, shotAcc: base
  };
  if (pos === 'Gk') {
    return { save: base + rnd(2, 8), aerial: base, distribution: base, reflex: base + rnd(0, 5) };
  }
  if (pos.includes('d') || pos === 'Dm') {
    s.tackle += rnd(3, 8); s.mark += rnd(2, 6); s.shotAcc -= 2;
  }
  if (pos.includes('m') || pos === 'Am') {
    s.pass += rnd(3, 8); s.control += rnd(1, 5);
  }
  if (pos.includes('f') || pos === 'Cf') {
    s.shotAcc += rnd(3, 8); s.shotPower += rnd(2, 6); s.dribble += rnd(1, 4);
  }
  Object.keys(s).forEach((k) => { s[k] = Math.max(8, Math.min(30, s[k])); });
  return s;
}

function masteryOf(p) {
  if (p.pos === 'Gk') {
    const sk = p.skills;
    return Math.round(((sk.save || 12) + (sk.reflex || 12) + (sk.aerial || 12) + (sk.distribution || 12)) / 4);
  }
  const sk = p.skills;
  const vals = [sk.tackle, sk.mark, sk.dribble, sk.control, sk.stamina, sk.pass, sk.shotPower, sk.shotAcc];
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function effectiveMastery(p) {
  const m = masteryOf(p);
  const fit = (p.fitness || 100) / 100;
  const morale = 1 + ((p.morale || 0) / 100) * 0.12;
  return Math.round(m * fit * morale);
}

function makePlayer(pos, quality = 14) {
  const base = quality + rnd(-2, 3);
  const age = rnd(18, 32);
  return {
    id: uid('pl'),
    name: pick(FIRST) + ' ' + pick(LAST),
    pos,
    age,
    talent: rnd(3, 9),
    fitness: rnd(88, 100),
    morale: rnd(-5, 12),
    wage: rnd(800, 4000) * Math.max(1, Math.round(base / 10)),
    skills: skillForPos(pos, base),
    specials: [],
    xpPool: 0,
    injuredHours: 0
  };
}

function generateSquad(quality = 14) {
  const need = [...FIELD_XI, 'Gk', 'Cd', 'Cm', 'Cf', 'Lm', 'Rd', 'Dm'];
  return need.map((pos) => makePlayer(pos, quality));
}

function clubStrength(club) {
  const xi = resolveXi(club);
  if (!xi.length) return 50;
  return Math.round(xi.reduce((s, p) => s + effectiveMastery(p), 0) / xi.length);
}

function resolveXi(club) {
  const byId = new Map((club.players || []).map((p) => [p.id, p]));
  const fromLineup = (club.lineupIds || [])
    .map((id) => byId.get(id))
    .filter((p) => p && !(p.injuredHours > 0));
  if (fromLineup.length >= 11) return fromLineup.slice(0, 11);

  const form = FORMATIONS[club.formation] || FORMATIONS['4-4-2'];
  const used = new Set(fromLineup.map((p) => p.id));
  const xi = [...fromLineup];
  for (const slot of form) {
    if (xi.length >= 11) break;
    let best = null;
    let bestScore = -1;
    for (const p of club.players) {
      if (used.has(p.id) || p.injuredHours > 0) continue;
      const posOk = p.pos === slot || (slot === 'Cd' && p.pos === 'Cd') || (slot.endsWith('d') && p.pos.includes('d'));
      const score = effectiveMastery(p) + (p.pos === slot ? 8 : 0) + (posOk ? 3 : -6);
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (best) { used.add(best.id); xi.push(best); }
  }
  if (xi.length < 11) {
    for (const p of [...club.players].sort((a, b) => effectiveMastery(b) - effectiveMastery(a))) {
      if (xi.length >= 11) break;
      if (used.has(p.id) || p.injuredHours > 0) continue;
      used.add(p.id);
      xi.push(p);
    }
  }
  return xi.slice(0, 11);
}

function defaultClub(user, opts = {}) {
  const name = opts.name || `${pick(CLUB_ADJ)} ${pick(CLUB_NOUN)}`;
  const short = (opts.short || name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3) || 'EYE').toUpperCase();
  const quality = 12 + Math.min(6, (user.level || 1));
  const players = generateSquad(quality);
  return {
    name: String(name).slice(0, 32),
    short: String(short).slice(0, 4),
    color: opts.color || pick(['#1FA65A', '#C8102E', '#1D4ED8', '#F59E0B', '#111827', '#7C3AED']),
    stadium: opts.stadium || 'Арена клуба',
    stadiumLevel: 1,
    capacity: 8000,
    formation: '4-4-2',
    style: 'balance',
    instructions: [],
    lineupIds: [],
    benchIds: [],
    players,
    staff: { coach: 1, gkCoach: 1, scout: 0, medic: 0 },
    history: [],
    ledger: [],
    createdAt: Date.now()
  };
}

function ensureLineup(club, force = false) {
  const validIds = new Set((club.players || []).map((p) => p.id));
  const kept = (club.lineupIds || []).filter((id) => validIds.has(id));
  if (!force && kept.length === 11) {
    club.lineupIds = kept;
    const rest = club.players.filter((p) => !kept.includes(p.id)).slice(0, 7);
    club.benchIds = (club.benchIds || []).filter((id) => validIds.has(id) && !kept.includes(id));
    if (club.benchIds.length < rest.length) club.benchIds = rest.map((p) => p.id);
    return club;
  }
  // temporary clear so resolveXi rebuilds from formation
  if (force) club.lineupIds = [];
  else club.lineupIds = kept;
  const xi = resolveXi(club);
  club.lineupIds = xi.map((p) => p.id);
  const rest = club.players.filter((p) => !club.lineupIds.includes(p.id)).slice(0, 7);
  club.benchIds = rest.map((p) => p.id);
  return club;
}

function publicClub(club, user) {
  if (!club) return null;
  ensureLineup(club);
  return {
    name: club.name,
    short: club.short,
    color: club.color,
    stadium: club.stadium,
    stadiumLevel: club.stadiumLevel || 1,
    capacity: club.capacity || 8000,
    formation: club.formation,
    style: club.style,
    instructions: club.instructions || [],
    players: club.players.map((p) => ({
      ...p,
      mastery: masteryOf(p),
      effective: effectiveMastery(p)
    })),
    lineupIds: club.lineupIds,
    benchIds: club.benchIds,
    staff: club.staff,
    strength: clubStrength(club),
    history: (club.history || []).slice(0, 20),
    ledger: (club.ledger || []).slice(0, 40),
    skillCap: skillCap(club, false),
    gkSkillCap: skillCap(club, true),
    manager: user ? { id: user.id, login: user.login, name: user.name, level: user.level } : null
  };
}

function applyFitnessAfterMatch(club, playedIds) {
  const set = new Set(playedIds);
  club.players.forEach((p) => {
    if (set.has(p.id)) {
      const loss = rnd(10, 22) + (p.age > 28 ? 3 : 0);
      p.fitness = Math.max(45, (p.fitness || 100) - loss);
      if (Math.random() < 0.06) p.injuredHours = rnd(6, 36);
      p.xpPool = (p.xpPool || 0) + rnd(4, 14) + (p.talent || 5);
    } else {
      p.fitness = Math.min(100, (p.fitness || 100) + rnd(4, 10));
      if (p.injuredHours > 0) p.injuredHours = Math.max(0, p.injuredHours - 8);
    }
    p.morale = Math.max(-20, Math.min(25, (p.morale || 0) + rnd(-2, 2)));
  });
}

function simulateMatch(homeClub, awayClub, meta = {}) {
  const homeXi = resolveXi(homeClub);
  const awayXi = resolveXi(awayClub);
  const hStr = Math.max(40, clubStrength({ ...homeClub, players: homeXi.length ? homeClub.players : homeClub.players }));
  const aStr = Math.max(40, clubStrength(awayClub));
  const styleMul = { attack: 1.08, press: 1.05, balance: 1, counter: 0.98, defend: 0.9 };
  const hs = hStr * (styleMul[homeClub.style] || 1);
  const as = aStr * (styleMul[awayClub.style] || 1);

  let hg = 0;
  let ag = 0;
  const events = [];
  const minutes = [];
  for (let m = 1; m <= 90; m++) {
    if (Math.random() < 0.045) {
      const homeChance = hs / (hs + as);
      const homeAtt = Math.random() < homeChance;
      const scorerPool = (homeAtt ? homeXi : awayXi).filter((p) => p.pos !== 'Gk');
      const scorer = pick(scorerPool.length ? scorerPool : (homeAtt ? homeXi : awayXi));
      if (homeAtt) hg++; else ag++;
      const ev = {
        minute: m,
        type: 'goal',
        side: homeAtt ? 'home' : 'away',
        player: scorer?.name || 'Игрок',
        score: [hg, ag]
      };
      events.push(ev);
      minutes.push(ev);
    }
  }
  // avoid too many 0-0
  if (hg + ag === 0 && Math.random() < 0.7) {
    const homeAtt = Math.random() < hs / (hs + as);
    if (homeAtt) hg = 1; else ag = 1;
    events.push({ minute: rnd(50, 88), type: 'goal', side: homeAtt ? 'home' : 'away', player: 'Стандарт', score: [hg, ag] });
  }

  applyFitnessAfterMatch(homeClub, homeXi.map((p) => p.id));
  applyFitnessAfterMatch(awayClub, awayXi.map((p) => p.id));

  const result = {
    id: uid('m'),
    createdAt: Date.now(),
    status: 'done',
    competition: meta.competition || 'friendly',
    home: {
      userId: meta.homeUserId,
      name: homeClub.name,
      short: homeClub.short,
      color: homeClub.color,
      strength: Math.round(hs)
    },
    away: {
      userId: meta.awayUserId,
      name: awayClub.name,
      short: awayClub.short,
      color: awayClub.color,
      strength: Math.round(as)
    },
    score: [hg, ag],
    events,
    homeXi: homeXi.map((p) => ({ id: p.id, name: p.name, pos: p.pos, effective: effectiveMastery(p) })),
    awayXi: awayXi.map((p) => ({ id: p.id, name: p.name, pos: p.pos, effective: effectiveMastery(p) }))
  };

  homeClub.history = homeClub.history || [];
  awayClub.history = awayClub.history || [];
  const hRec = { id: result.id, at: result.createdAt, opp: awayClub.name, score: [hg, ag], home: true, competition: result.competition };
  const aRec = { id: result.id, at: result.createdAt, opp: homeClub.name, score: [ag, hg], home: false, competition: result.competition };
  homeClub.history.unshift(hRec);
  awayClub.history.unshift(aRec);
  if (homeClub.history.length > 40) homeClub.history.length = 40;
  if (awayClub.history.length > 40) awayClub.history.length = 40;

  return result;
}

function trainPlayer(club, playerId, skillKey, amount = 1) {
  const p = club.players.find((x) => x.id === playerId);
  if (!p) return { ok: false, error: 'Игрок не найден' };
  const cost = 8 * amount;
  if ((p.xpPool || 0) < cost) return { ok: false, error: 'Недостаточно опыта игрока' };
  if (p.pos === 'Gk') {
    if (!['save', 'aerial', 'distribution', 'reflex'].includes(skillKey)) {
      return { ok: false, error: 'Неверный навык вратаря' };
    }
  } else if (!['tackle', 'mark', 'dribble', 'control', 'stamina', 'pass', 'shotPower', 'shotAcc'].includes(skillKey)) {
    return { ok: false, error: 'Неверный навык' };
  }
  const cap = skillCap(club, p.pos === 'Gk');
  const cur = p.skills[skillKey] || 10;
  if (cur >= cap) return { ok: false, error: `Потолок умения ${cap}. Улучшите персонал в Бонусе.` };
  p.skills[skillKey] = Math.min(cap, cur + amount);
  p.xpPool -= cost;
  return { ok: true, player: { ...p, mastery: masteryOf(p), effective: effectiveMastery(p) } };
}

function recoverSquad(club) {
  club.players.forEach((p) => {
    p.fitness = Math.min(100, (p.fitness || 100) + rnd(8, 16));
    if (p.injuredHours > 0) p.injuredHours = Math.max(0, p.injuredHours - 12);
  });
  return club;
}

function pushLedger(club, delta, label) {
  club.ledger = Array.isArray(club.ledger) ? club.ledger : [];
  club.ledger.unshift({ id: uid('led'), at: Date.now(), delta, label });
  if (club.ledger.length > 80) club.ledger.length = 80;
}

function hireStaff(club, role) {
  const roles = {
    coach: { key: 'coach', label: 'Тренер', max: 5, cost: 80000 },
    gkCoach: { key: 'gkCoach', label: 'Тренер вратарей', max: 5, cost: 60000 },
    scout: { key: 'scout', label: 'Скаут', max: 3, cost: 50000 },
    medic: { key: 'medic', label: 'Врач', max: 3, cost: 45000 }
  };
  const conf = roles[role];
  if (!conf) return { ok: false, error: 'Неизвестная роль' };
  club.staff = club.staff || { coach: 1, gkCoach: 1, scout: 0, medic: 0 };
  const cur = club.staff[conf.key] || 0;
  if (cur >= conf.max) return { ok: false, error: `${conf.label}: максимум ур. ${conf.max}` };
  const cost = conf.cost * (cur + 1);
  club.staff[conf.key] = cur + 1;
  return { ok: true, cost, label: `${conf.label} → ур. ${cur + 1}`, staff: club.staff };
}

function upgradeStadium(club) {
  const level = club.stadiumLevel || 1;
  if (level >= 8) return { ok: false, error: 'Стадион уже максимального уровня' };
  const cost = 100000 * level;
  club.stadiumLevel = level + 1;
  club.capacity = Math.round((club.capacity || 8000) * 1.35);
  return { ok: true, cost, label: `Стадион ур. ${club.stadiumLevel}`, stadiumLevel: club.stadiumLevel, capacity: club.capacity };
}

function setLineup(club, lineupIds, benchIds) {
  const ids = new Set(club.players.map((p) => p.id));
  const xi = (lineupIds || []).filter((id) => ids.has(id)).slice(0, 11);
  if (xi.length !== 11) return { ok: false, error: 'Нужно ровно 11 игроков в основе' };
  const bench = (benchIds || []).filter((id) => ids.has(id) && !xi.includes(id)).slice(0, 7);
  club.lineupIds = xi;
  club.benchIds = bench;
  return { ok: true, club };
}

function skillCap(club, isGk = false) {
  const staff = club.staff || {};
  if (isGk) return 15 + (staff.gkCoach || 0) * 5;
  return 15 + (staff.coach || 0) * 5;
}

module.exports = {
  FORMATIONS,
  STYLES,
  POSITIONS,
  uid,
  levelFromXp,
  masteryOf,
  effectiveMastery,
  clubStrength,
  resolveXi,
  defaultClub,
  ensureLineup,
  publicClub,
  simulateMatch,
  trainPlayer,
  recoverSquad,
  makePlayer,
  pushLedger,
  hireStaff,
  upgradeStadium,
  setLineup,
  skillCap
};
