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
  const players = club.players || [];
  const validIds = new Set(players.map((p) => p.id));
  const healthy = (id) => {
    const p = players.find((x) => x.id === id);
    return p && !(p.injuredHours > 0);
  };
  let kept = (club.lineupIds || []).filter((id) => validIds.has(id) && healthy(id));
  const hasGk = kept.some((id) => players.find((p) => p.id === id)?.pos === 'Gk');
  const needRebuild = force || kept.length !== 11 || !hasGk;
  if (!needRebuild) {
    club.lineupIds = kept;
    const rest = players.filter((p) => !kept.includes(p.id)).slice(0, 7);
    club.benchIds = (club.benchIds || []).filter((id) => validIds.has(id) && !kept.includes(id));
    if (club.benchIds.length < rest.length) club.benchIds = rest.map((p) => p.id);
    return club;
  }
  club.lineupIds = [];
  const xi = resolveXi(club);
  club.lineupIds = xi.map((p) => p.id);
  // ensure GK present if any healthy GK exists
  if (!club.lineupIds.some((id) => players.find((p) => p.id === id)?.pos === 'Gk')) {
    const gk = players.find((p) => p.pos === 'Gk' && !(p.injuredHours > 0));
    if (gk && club.lineupIds.length) {
      club.lineupIds[club.lineupIds.length - 1] = gk.id;
      club.lineupIds = [...new Set(club.lineupIds)].slice(0, 11);
    }
  }
  const rest = players.filter((p) => !club.lineupIds.includes(p.id)).slice(0, 7);
  club.benchIds = rest.map((p) => p.id);
  return club;
}

function publicClub(club, user) {
  if (!club) return null;
  ensureLineup(club);
  const healthyXi = (club.lineupIds || []).length;
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
    understrength: healthyXi < 11,
    manager: user ? { id: user.id, login: user.login, name: user.name, level: user.level } : null
  };
}

function styleFitnessMul(style) {
  if (style === 'attack' || style === 'press') return 1.25;
  if (style === 'defend') return 0.85;
  if (style === 'counter') return 0.95;
  return 1;
}

function applyFitnessAfterMatch(club, playedIds, opts = {}) {
  const set = new Set(playedIds);
  const styleMul = styleFitnessMul(opts.style || club.style);
  const medic = (club.staff && club.staff.medic) || 0;
  const injuryChance = Math.max(0.02, 0.07 - medic * 0.015);
  const resultDelta = opts.resultDelta || 0;
  club.players.forEach((p) => {
    if (set.has(p.id)) {
      const loss = Math.round((rnd(10, 22) + (p.age > 28 ? 3 : 0)) * styleMul);
      p.fitness = Math.max(45, (p.fitness || 100) - loss);
      if (Math.random() < injuryChance) p.injuredHours = rnd(6, Math.max(8, 36 - medic * 6));
      p.xpPool = (p.xpPool || 0) + rnd(4, 14) + (p.talent || 5);
      p.morale = Math.max(-20, Math.min(25, (p.morale || 0) + resultDelta + rnd(-1, 1)));
    } else {
      p.fitness = Math.min(100, (p.fitness || 100) + rnd(4, 10) + medic);
      if (p.injuredHours > 0) p.injuredHours = Math.max(0, p.injuredHours - (8 + medic * 4));
      p.morale = Math.max(-20, Math.min(25, (p.morale || 0) + rnd(-1, 1)));
    }
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

  const homeResult = hg > ag ? 3 : hg === ag ? 1 : -2;
  const awayResult = ag > hg ? 3 : hg === ag ? 1 : -2;
  applyFitnessAfterMatch(homeClub, homeXi.map((p) => p.id), { style: homeClub.style, resultDelta: homeResult });
  applyFitnessAfterMatch(awayClub, awayXi.map((p) => p.id), { style: awayClub.style, resultDelta: awayResult });

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
  const medic = (club.staff && club.staff.medic) || 0;
  club.players.forEach((p) => {
    p.fitness = Math.min(100, (p.fitness || 100) + rnd(8, 16) + medic * 3);
    if (p.injuredHours > 0) p.injuredHours = Math.max(0, p.injuredHours - (12 + medic * 6));
  });
  return club;
}

function pushLedger(club, delta, label) {
  club.ledger = Array.isArray(club.ledger) ? club.ledger : [];
  club.ledger.unshift({ id: uid('led'), at: Date.now(), delta, label });
  if (club.ledger.length > 80) club.ledger.length = 80;
}

const STAFF_ROLES = {
  coach: { key: 'coach', label: 'Тренер', max: 5, cost: 80000 },
  gkCoach: { key: 'gkCoach', label: 'Тренер вратарей', max: 5, cost: 60000 },
  scout: { key: 'scout', label: 'Скаут', max: 3, cost: 50000 },
  medic: { key: 'medic', label: 'Врач', max: 3, cost: 45000 }
};

function quoteStaff(club, role) {
  const conf = STAFF_ROLES[role];
  if (!conf) return { ok: false, error: 'Неизвестная роль' };
  const staff = club.staff || { coach: 1, gkCoach: 1, scout: 0, medic: 0 };
  const cur = staff[conf.key] || 0;
  if (cur >= conf.max) return { ok: false, error: `${conf.label}: максимум ур. ${conf.max}` };
  const cost = conf.cost * (cur + 1);
  return { ok: true, cost, label: `${conf.label} → ур. ${cur + 1}`, key: conf.key, next: cur + 1 };
}

function hireStaff(club, role) {
  const q = quoteStaff(club, role);
  if (!q.ok) return q;
  club.staff = club.staff || { coach: 1, gkCoach: 1, scout: 0, medic: 0 };
  club.staff[q.key] = q.next;
  return { ok: true, cost: q.cost, label: q.label, staff: club.staff };
}

function quoteStadium(club) {
  const level = club.stadiumLevel || 1;
  if (level >= 8) return { ok: false, error: 'Стадион уже максимального уровня' };
  return { ok: true, cost: 100000 * level, nextLevel: level + 1, nextCapacity: Math.round((club.capacity || 8000) * 1.35) };
}

function upgradeStadium(club) {
  const q = quoteStadium(club);
  if (!q.ok) return q;
  club.stadiumLevel = q.nextLevel;
  club.capacity = q.nextCapacity;
  return { ok: true, cost: q.cost, label: `Стадион ур. ${club.stadiumLevel}`, stadiumLevel: club.stadiumLevel, capacity: club.capacity };
}

function ticketIncome(club, user, won) {
  const fans = Math.max(1000, user?.fans || 10000);
  const cap = club?.capacity || 8000;
  const attendance = Math.min(cap, Math.round(fans * (won ? 0.85 : 0.55)));
  const price = 8 + ((club?.stadiumLevel || 1) - 1) * 3;
  return Math.round(attendance * price);
}

function weeklyWages(club) {
  return (club.players || []).reduce((s, p) => s + (p.wage || 0), 0);
}

/** Pure wage settle: multi-day catch-up capped at 7. Mutates user.money + lastWageAt + club ledger. */
function settleWageDay(user, club, now = Date.now()) {
  if (!user || user.isBot || !club) return null;
  const DAY_MS = 24 * 3600e3;
  if (!user.lastWageAt) {
    user.lastWageAt = now;
    return null;
  }
  let days = Math.floor((now - user.lastWageAt) / DAY_MS);
  if (days < 1) return null;
  days = Math.min(days, 7);
  const weekBill = weeklyWages(club);
  const wagesPerDay = Math.round(weekBill / 7);
  const grantPerDay = Math.round((user.fans || 10000) * (0.35 + (club.stadiumLevel || 1) * 0.12));
  const wages = wagesPerDay * days;
  const grant = grantPerDay * days;
  const delta = grant - wages;
  user.money = Math.max(0, (user.money || 0) + delta);
  user.lastWageAt = (user.lastWageAt || now) + days * DAY_MS;
  if (user.lastWageAt > now) user.lastWageAt = now;
  pushLedger(club, -wages, days === 1 ? 'Зарплаты (сутки)' : `Зарплаты (${days} дн.)`);
  pushLedger(club, grant, days === 1 ? 'Суточный доход (фанаты/стадион)' : `Доход за ${days} дн.`);
  return { wages, grant, delta, weekBill, days, at: now };
}

function playerValue(p) {
  const m = masteryOf(p);
  return Math.round(m * 4500 + (p.talent || 5) * 8000 + Math.max(0, 32 - (p.age || 24)) * 3000);
}

function generateTransferList(scoutLevel = 0, count = 6) {
  const n = Math.min(12, count + scoutLevel * 2);
  const quality = 11 + scoutLevel * 2;
  const list = [];
  for (let i = 0; i < n; i++) {
    const pos = pick(POSITIONS.filter((p) => p !== 'Dm' && p !== 'Am').concat(['Dm', 'Am', 'Cf', 'Cm']));
    const p = makePlayer(pos, quality + rnd(-1, 2));
    p.age = rnd(17, 29);
    p.wage = Math.round(playerValue(p) / 80);
    list.push({
      ...p,
      mastery: masteryOf(p),
      effective: effectiveMastery(p),
      value: playerValue(p),
      listedAt: Date.now()
    });
  }
  return list.sort((a, b) => b.value - a.value);
}

function tickClubClock(club) {
  if (!club) return false;
  const now = Date.now();
  const last = club.lastInjuryTick || club.createdAt || now;
  const hours = Math.floor((now - last) / 3600e3);
  if (hours < 1) return false;
  const medic = (club.staff && club.staff.medic) || 0;
  club.players.forEach((p) => {
    if (p.injuredHours > 0) {
      p.injuredHours = Math.max(0, Math.round(p.injuredHours - hours * (1 + medic * 0.5)));
    } else {
      p.fitness = Math.min(100, (p.fitness || 100) + hours);
    }
  });
  club.lastInjuryTick = now;
  return true;
}

function refreshClubMarket(club, force = false) {
  const scout = (club.staff && club.staff.scout) || 0;
  const age = Date.now() - (club.transferRefreshedAt || 0);
  if (!force && Array.isArray(club.transferList) && club.transferList.length && age < 60 * 60e3) {
    return club.transferList;
  }
  club.transferList = generateTransferList(scout, 8);
  club.transferRefreshedAt = Date.now();
  return club.transferList;
}

function buyPlayer(club, listing) {
  if (!listing?.id) return { ok: false, error: 'Игрок не найден на рынке' };
  if ((club.players || []).length >= 25) return { ok: false, error: 'Состав полон (макс. 25)' };
  if ((club.players || []).some((p) => p.id === listing.id)) return { ok: false, error: 'Уже в клубе' };
  const player = {
    id: listing.id,
    name: listing.name,
    pos: listing.pos,
    age: listing.age,
    talent: listing.talent,
    fitness: listing.fitness || 95,
    morale: listing.morale || 5,
    wage: listing.wage || 2000,
    skills: listing.skills,
    specials: [],
    xpPool: 0,
    injuredHours: 0
  };
  club.players.push(player);
  return { ok: true, player, cost: listing.value || playerValue(player), label: `Трансфер · ${player.name}` };
}

function sellPlayer(club, playerId) {
  if ((club.lineupIds || []).includes(playerId)) {
    return { ok: false, error: 'Сначала уберите игрока из основы' };
  }
  if ((club.players || []).length <= 16) return { ok: false, error: 'Нельзя продать — в составе минимум 16' };
  const idx = (club.players || []).findIndex((p) => p.id === playerId);
  if (idx < 0) return { ok: false, error: 'Игрок не найден' };
  const p = club.players[idx];
  const value = Math.round(playerValue(p) * 0.7);
  club.players.splice(idx, 1);
  club.benchIds = (club.benchIds || []).filter((id) => id !== playerId);
  return { ok: true, value, player: p, label: `Продажа · ${p.name}` };
}

function setLineup(club, lineupIds, benchIds) {
  const byId = new Map((club.players || []).map((p) => [p.id, p]));
  const xi = (lineupIds || []).filter((id) => byId.has(id)).slice(0, 11);
  if (xi.length !== 11) return { ok: false, error: 'Нужно ровно 11 игроков в основе' };
  const players = xi.map((id) => byId.get(id));
  if (!players.some((p) => p.pos === 'Gk')) return { ok: false, error: 'В основе должен быть вратарь' };
  const injured = players.filter((p) => p.injuredHours > 0);
  if (injured.length) {
    return { ok: false, error: `Травмированы: ${injured.map((p) => p.name).join(', ')}` };
  }
  const bench = (benchIds || []).filter((id) => byId.has(id) && !xi.includes(id)).slice(0, 7);
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
  STAFF_ROLES,
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
  quoteStaff,
  hireStaff,
  quoteStadium,
  upgradeStadium,
  setLineup,
  skillCap,
  ticketIncome,
  weeklyWages,
  settleWageDay,
  playerValue,
  generateTransferList,
  tickClubClock,
  refreshClubMarket,
  buyPlayer,
  sellPlayer
};
