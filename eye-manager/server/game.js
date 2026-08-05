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

const INSTRUCTIONS = [
  { id: 'high_press', label: 'Высокий прессинг', att: 1.04, def: 0.97, fit: 1.08 },
  { id: 'low_block', label: 'Низкий блок', att: 0.94, def: 1.08, fit: 0.92 },
  { id: 'wide_play', label: 'Игра в ширину', att: 1.03, def: 0.99, fit: 1.02 },
  { id: 'through_balls', label: 'Передачи вразрез', att: 1.05, def: 0.98, fit: 1.0 },
  { id: 'long_balls', label: 'Длинные передачи', att: 1.02, def: 1.01, fit: 0.98 },
  { id: 'keep_ball', label: 'Контроль мяча', att: 0.98, def: 1.04, fit: 0.95 },
  { id: 'man_mark', label: 'Персональная опека', att: 0.97, def: 1.05, fit: 1.05 },
  { id: 'counter_fast', label: 'Быстрый отрыв', att: 1.06, def: 0.96, fit: 1.06 }
];

const FORMATION_BIAS = {
  '4-4-2': { att: 1.0, def: 1.0 },
  '4-3-3': { att: 1.06, def: 0.96 },
  '3-5-2': { att: 1.02, def: 0.98 },
  '4-2-3-1': { att: 1.04, def: 1.02 }
};

const POS_GROUP = {
  Gk: 'GK',
  Ld: 'DEF', Cd: 'DEF', Rd: 'DEF',
  Lm: 'MID', Cm: 'MID', Rm: 'MID', Dm: 'MID', Am: 'MID',
  Lf: 'ATT', Cf: 'ATT', Rf: 'ATT'
};

const TRAITS = {
  finisher: { label: 'Снайпер', shot: 1.12 },
  engine: { label: 'Мотор', fit: 0.9, power: 1.03 },
  brittle: { label: 'Хрупкий', injury: 1.6 },
  leader: { label: 'Лидер', morale: 1.08, power: 1.02 },
  rock: { label: 'Скала', def: 1.06, injury: 0.7 },
  playmaker: { label: 'Диспетчер', assist: 1.25, shot: 0.95 },
  hothead: { label: 'Горячая голова', card: 1.8, tackle: 1.05 },
  prospect: { label: 'Талант', xp: 1.25 }
};

const INJURY_TYPES = {
  knock: { label: 'Ушиб', hoursMul: 0.65 },
  muscle: { label: 'Мышцы', hoursMul: 1.0 },
  sprain: { label: 'Растяжение', hoursMul: 1.35 },
  fracture: { label: 'Перелом', hoursMul: 2.1 }
};

const CUP_ROUND_RANK = {
  R32: 1, R16: 1, '1/8': 2, '1/4': 3, '1/2': 4, Финал: 5, Чемпион: 6
};

function inflictInjury(p, medic = 0, { prefer } = {}) {
  if (!p) return null;
  let type = prefer;
  if (!type) {
    const roll = Math.random();
    if (roll < 0.12) type = 'fracture';
    else if (roll < 0.38) type = 'sprain';
    else if (roll < 0.72) type = 'muscle';
    else type = 'knock';
  }
  if (!INJURY_TYPES[type]) type = 'muscle';
  const cfg = INJURY_TYPES[type];
  const base = rnd(6, Math.max(8, 36 - medic * 6));
  const hours = Math.max(4, Math.round(base * cfg.hoursMul * traitMul(p, 'injury', 1)));
  p.injuredHours = Math.max(p.injuredHours || 0, hours);
  p.injuryType = type;
  p.injuryLabel = cfg.label;
  return {
    id: p.id,
    name: p.name,
    hours: p.injuredHours,
    type,
    label: cfg.label
  };
}

function clearInjury(p) {
  if (!p) return;
  p.injuredHours = 0;
  p.injuryType = null;
  p.injuryLabel = null;
}

function targetForClub(club, user) {
  const str = clubStrength(club);
  const lvl = user?.level || 1;
  const stadium = club?.stadiumLevel || 1;
  const score = str / 10 + lvl * 2 + stadium;
  if (score >= 28) return { place: 2, label: 'Топ-2 / повышение', cup: 'semi' };
  if (score >= 22) return { place: 3, label: 'Топ-3', cup: 'quarter' };
  if (score >= 16) return { place: 4, label: 'Верхняя четвёрка', cup: 'quarter' };
  if (score >= 12) return { place: 6, label: 'Верхняя шестёрка', cup: null };
  return { place: 8, label: 'Середина таблицы', cup: null };
}

function createBoard(club, user) {
  const t = targetForClub(club, user);
  return {
    confidence: 65,
    targetPlace: t.place,
    targetLabel: t.label,
    cupTarget: t.cup,
    cupReached: null,
    warnings: 0,
    sacked: false,
    createdAt: Date.now()
  };
}

function ensureBoard(club, user) {
  if (!club) return null;
  if (!club.board || typeof club.board.confidence !== 'number') {
    club.board = createBoard(club, user);
  }
  if (club.board.cupReached === undefined) club.board.cupReached = null;
  return club.board;
}

function applyMatchConfidence(club, { won, drew, competition, round } = {}) {
  const board = ensureBoard(club);
  if (!board || board.sacked) return board;
  let d = 0;
  if (competition === 'friendly') d = won ? 1 : drew ? 0 : -1;
  else if (competition === 'cup') d = won ? 5 : -4;
  else if (competition === 'league') d = won ? 4 : drew ? 1 : -5;
  else d = won ? 3 : drew ? 1 : -4;
  board.confidence = Math.max(0, Math.min(100, board.confidence + d));
  if (competition === 'cup' && won && round) {
    const nextRank = CUP_ROUND_RANK[round] || 0;
    const curRank = CUP_ROUND_RANK[board.cupReached] || 0;
    if (nextRank >= curRank) board.cupReached = round;
  }
  if (!won && !drew && competition !== 'friendly' && board.confidence < 22) {
    board.sacked = true;
  }
  return board;
}

function applyBoardAfterMatch(club, match, isHome) {
  if (!club || !match) return null;
  const [hg, ag] = match.score || [0, 0];
  const my = isHome ? hg : ag;
  const opp = isHome ? ag : hg;
  return applyMatchConfidence(club, {
    won: my > opp,
    drew: my === opp,
    competition: match.competition || 'friendly',
    round: match.round || null
  });
}

function seasonBoardReview(club, place, { user, cupReached } = {}) {
  const board = ensureBoard(club, user);
  if (!board) return { ok: false, sacked: false, board: null };
  const reached = cupReached || board.cupReached || '';
  let ok = Number(place) <= board.targetPlace;
  let bonus = ok ? 1 : 0;
  if (board.cupTarget === 'quarter' && ['1/4', '1/2', 'Финал', 'Чемпион'].includes(reached)) bonus++;
  if (board.cupTarget === 'semi' && ['1/2', 'Финал', 'Чемпион'].includes(reached)) bonus++;
  if (ok) board.confidence = Math.min(100, board.confidence + 12 + bonus * 4);
  else {
    board.confidence = Math.max(0, board.confidence - 15);
    board.warnings = (board.warnings || 0) + 1;
  }
  board.sacked = board.confidence < 22 || (board.warnings || 0) >= 3;
  board.cupReached = null;
  const next = createBoard(club, user);
  if (!board.sacked) {
    // Soft roll into next season targets while keeping confidence/warnings
    board.targetPlace = next.targetPlace;
    board.targetLabel = next.targetLabel;
    board.cupTarget = next.cupTarget;
  }
  return { ok, sacked: board.sacked, bonus, board, reached };
}

function midSeasonBoardReview(club, place, { user, season } = {}) {
  const board = ensureBoard(club, user);
  if (!board || board.sacked) return { ok: false, skipped: true, board };
  const seasonKey = season || 1;
  if (board.midReviewDone === seasonKey) return { ok: false, skipped: true, board };
  board.midReviewDone = seasonKey;
  const placeNum = Number(place) || 99;
  const target = board.targetPlace || 8;
  let delta = 0;
  let verdict = 'on_track';
  if (placeNum <= target) {
    delta = placeNum <= Math.max(1, target - 2) ? 8 : 4;
    verdict = 'ahead';
  } else if (placeNum <= target + 2) {
    delta = -3;
    verdict = 'behind';
  } else {
    delta = -8;
    verdict = 'crisis';
    board.warnings = (board.warnings || 0) + (placeNum > target + 3 ? 1 : 0);
  }
  board.confidence = Math.max(0, Math.min(100, board.confidence + delta));
  if (board.confidence < 22 || (board.warnings || 0) >= 3) board.sacked = true;
  return {
    ok: true,
    board,
    place: placeNum,
    target,
    delta,
    verdict,
    sacked: board.sacked,
    label: verdict === 'ahead'
      ? 'Совет доволен ходом сезона'
      : verdict === 'on_track'
        ? 'Промежуточная оценка: норма'
        : verdict === 'behind'
          ? 'Совет ждёт рывок во второй половине'
          : 'Жёсткий разговор с советом'
  };
}

function applyPlayerMatchForms(club, mappedXi) {
  if (!club || !mappedXi?.length) return;
  const byId = new Map((club.players || []).map((p) => [p.id, p]));
  mappedXi.forEach((row) => {
    const p = byId.get(row.id);
    if (!p) return;
    const rating = Number(row.rating) || 6.5;
    // Map 4–10 rating → form delta around 60 baseline
    const target = Math.max(30, Math.min(95, Math.round(40 + (rating - 4) * 10)));
    const cur = p.form == null ? 60 : p.form;
    p.form = Math.round(cur * 0.65 + target * 0.35);
    p.lastRating = Math.round(rating * 10) / 10;
    p.ratingLog = Array.isArray(p.ratingLog) ? p.ratingLog : [];
    p.ratingLog.unshift(p.lastRating);
    if (p.ratingLog.length > 12) p.ratingLog.length = 12;
  });
  // unused / bench drift toward 58
  (club.players || []).forEach((p) => {
    if (mappedXi.some((r) => r.id === p.id)) return;
    if (p.loanUntil) return;
    p.form = Math.max(30, Math.min(95, Math.round((p.form == null ? 60 : p.form) * 0.92 + 58 * 0.08)));
  });
}

function slotFitScore(playerPos, slotPos) {
  if (!playerPos || !slotPos) return 0;
  if (playerPos === slotPos) return 100;
  if (POS_GROUP[playerPos] === POS_GROUP[slotPos]) return 65;
  // adjacent groups
  const order = ['GK', 'DEF', 'MID', 'ATT'];
  const a = order.indexOf(POS_GROUP[playerPos]);
  const b = order.indexOf(POS_GROUP[slotPos]);
  if (a >= 0 && b >= 0 && Math.abs(a - b) === 1) return 35;
  return 15;
}

function lineupFitMap(club) {
  ensureLineup(club);
  const slots = FORMATIONS[club?.formation] || FORMATIONS['4-4-2'];
  const byId = new Map((club.players || []).map((p) => [p.id, p]));
  return (club.lineupIds || []).slice(0, 11).map((id, i) => {
    const p = byId.get(id);
    const slot = slots[i] || p?.pos;
    const fit = p ? slotFitScore(p.pos, slot) : 0;
    return {
      id,
      name: p?.name || '—',
      pos: p?.pos || '?',
      slot,
      fit,
      fitLabel: fit >= 90 ? 'идеал' : fit >= 60 ? 'близко' : fit >= 30 ? 'терпимо' : 'не в своей',
      effective: p ? effectiveMastery(p) : 0,
      form: p?.form ?? 60
    };
  });
}

function quoteLoanOut(club, playerId, days = 7) {
  const p = (club.players || []).find((x) => x.id === playerId);
  if (!p) return { ok: false, error: 'Игрок не найден' };
  if ((club.lineupIds || []).includes(playerId)) return { ok: false, error: 'Сначала уберите из основы' };
  if ((club.players || []).length <= 16) return { ok: false, error: 'В составе минимум 16' };
  if (p.loanUntil) return { ok: false, error: 'Уже в аренде' };
  if ((p.injuredHours || 0) > 0) return { ok: false, error: 'Травмирован' };
  const d = Math.max(3, Math.min(14, Math.round(Number(days) || 7)));
  const fee = Math.round(playerValue(p) * 0.04 + (p.wage || 1000) * (d / 7) * 0.5);
  const wageSave = Math.round((p.wage || 1000) * (d / 7));
  return { ok: true, days: d, fee, wageSave, player: p };
}

function loanOutPlayer(club, playerId, days = 7) {
  const q = quoteLoanOut(club, playerId, days);
  if (!q.ok) return q;
  const p = q.player;
  p.loanUntil = Date.now() + q.days * 24 * 3600e3;
  p.loanDays = q.days;
  p.loanFee = q.fee;
  p.onLoan = true;
  club.lineupIds = (club.lineupIds || []).filter((id) => id !== playerId);
  club.benchIds = (club.benchIds || []).filter((id) => id !== playerId);
  ensureLineup(club, true);
  pushLedger(club, q.fee, `Аренда · ${p.name} (${q.days} дн.)`);
  return {
    ok: true,
    fee: q.fee,
    days: q.days,
    player: { ...p, mastery: masteryOf(p), effective: effectiveMastery(p) },
    label: `В аренду · ${p.name}`
  };
}

function tickLoans(club, now = Date.now()) {
  if (!club?.players?.length) return { returned: [] };
  const returned = [];
  club.players.forEach((p) => {
    if (!p.loanUntil) return;
    if (now >= p.loanUntil) {
      returned.push({ id: p.id, name: p.name });
      delete p.loanUntil;
      delete p.loanDays;
      delete p.loanFee;
      delete p.onLoan;
      p.morale = Math.min(25, (p.morale || 0) + 2);
      p.fitness = Math.min(100, (p.fitness || 100) + 8);
    }
  });
  return { returned };
}

function loansStatus(club) {
  const now = Date.now();
  const out = (club.players || [])
    .filter((p) => p.loanUntil)
    .map((p) => ({
      id: p.id,
      name: p.name,
      pos: p.pos,
      until: p.loanUntil,
      daysLeft: Math.max(0, Math.ceil((p.loanUntil - now) / (24 * 3600e3))),
      fee: p.loanFee || 0,
      mastery: masteryOf(p)
    }));
  return { out };
}

function publicProfile(user, club) {
  if (!user) return null;
  ensureLineup(club);
  ensureSponsor(club, user);
  ensureBoard(club, user);
  const form = clubFormGuide(club);
  const top = [...(club?.players || [])]
    .filter((p) => !p.loanUntil)
    .sort((a, b) => effectiveMastery(b) - effectiveMastery(a))
    .slice(0, 5)
    .map((p) => ({
      name: p.name,
      pos: p.pos,
      mastery: masteryOf(p),
      effective: effectiveMastery(p),
      form: p.form ?? 60
    }));
  return {
    login: user.login,
    name: user.name,
    level: user.level || 1,
    xp: user.xp || 0,
    fame: user.fame || 0,
    prestige: user.prestige || 0,
    points: user.points || 0,
    fans: user.fans || 0,
    cupsWon: user.cupsWon || 0,
    cupsPlayed: user.cupsPlayed || 0,
    club: club ? {
      name: club.name,
      short: club.short,
      color: club.color,
      stadium: club.stadium,
      stadiumLevel: club.stadiumLevel || 1,
      formation: club.formation,
      style: club.style,
      strength: clubStrength(club),
      chemistry: formationChemistry(club, resolveXi(club)),
      form,
      sponsor: club.sponsor ? { name: club.sponsor.name, weekly: club.sponsor.weekly } : null,
      board: club.board ? {
        confidence: club.board.confidence,
        targetLabel: club.board.targetLabel,
        mood: boardStatus(club, user)?.moodLabel
      } : null,
      top
    } : null
  };
}

function takeNewJob(club, user) {
  const board = ensureBoard(club, user);
  if (!board?.sacked) return { ok: false, error: 'Совет директоров вас не увольнял' };
  club.board = createBoard(club, user);
  club.board.confidence = 55;
  return { ok: true, board: club.board, prestigeCost: 2, label: 'Новый контракт с советом' };
}

function boardStatus(club, user, { place, leagueName, week, season } = {}) {
  const board = ensureBoard(club, user);
  if (!board) return null;
  const placeNum = place != null ? Number(place) : null;
  const onTrack = placeNum == null ? null : placeNum <= board.targetPlace;
  const mood = board.sacked
    ? 'sacked'
    : board.confidence >= 70
      ? 'strong'
      : board.confidence >= 45
        ? 'ok'
        : board.confidence >= 25
          ? 'worried'
          : 'crisis';
  return {
    ...board,
    place: placeNum,
    leagueName: leagueName || null,
    week: week || null,
    season: season || null,
    onTrack,
    mood,
    moodLabel: {
      sacked: 'Увольнение',
      strong: 'Доверие высоко',
      ok: 'Стабильно',
      worried: 'Совет нервничает',
      crisis: 'Кризис доверия'
    }[mood],
    cupTargetLabel: board.cupTarget === 'semi'
      ? 'Полуфинал кубка'
      : board.cupTarget === 'quarter'
        ? '1/4 кубка'
        : null
  };
}

function rollTraits(pos, talent = 5) {
  const pool = Object.keys(TRAITS);
  const n = Math.random() < 0.35 + talent * 0.03 ? (Math.random() < 0.25 ? 2 : 1) : 0;
  const out = [];
  const copy = pool.slice().sort(() => Math.random() - 0.5);
  for (let i = 0; i < n && i < copy.length; i++) {
    if (pos === 'Gk' && ['finisher', 'playmaker'].includes(copy[i])) continue;
    out.push(copy[i]);
  }
  return out;
}

function playerAvailable(p) {
  return p && !(p.injuredHours > 0) && !(p.suspendedMatches > 0) && !p.loanUntil && !p.onLoan;
}

function traitMul(p, key, fallback = 1) {
  let m = fallback;
  (p.specials || []).forEach((id) => {
    const t = TRAITS[id];
    if (t && t[key] != null) m *= t[key];
  });
  return m;
}

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
  const form = 1 + ((((p.form || 60) - 60) / 100) * 0.1);
  return Math.round(m * fit * morale * form);
}

function makePlayer(pos, quality = 14) {
  const base = quality + rnd(-2, 3);
  const age = rnd(18, 32);
  const talent = rnd(3, 9);
  return {
    id: uid('pl'),
    name: pick(FIRST) + ' ' + pick(LAST),
    pos,
    age,
    talent,
    fitness: rnd(88, 100),
    morale: rnd(-5, 12),
    wage: rnd(800, 4000) * Math.max(1, Math.round(base / 10)),
    contractYears: rnd(1, 4),
    skills: skillForPos(pos, base),
    specials: rollTraits(pos, talent),
    xpPool: 0,
    injuredHours: 0,
    yellows: 0,
    suspendedMatches: 0,
    form: rnd(55, 70),
    seasonApps: 0
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
    .filter((p) => playerAvailable(p));
  if (fromLineup.length >= 11) return fromLineup.slice(0, 11);

  const form = FORMATIONS[club.formation] || FORMATIONS['4-4-2'];
  const used = new Set(fromLineup.map((p) => p.id));
  const xi = [...fromLineup];
  for (const slot of form) {
    if (xi.length >= 11) break;
    let best = null;
    let bestScore = -1;
    for (const p of club.players) {
      if (used.has(p.id) || !playerAvailable(p)) continue;
      const posOk = p.pos === slot || (slot === 'Cd' && p.pos === 'Cd') || (slot.endsWith('d') && p.pos.includes('d'));
      const score = effectiveMastery(p) + (p.pos === slot ? 8 : 0) + (posOk ? 3 : -6);
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (best) { used.add(best.id); xi.push(best); }
  }
  if (xi.length < 11) {
    for (const p of [...club.players].sort((a, b) => effectiveMastery(b) - effectiveMastery(a))) {
      if (xi.length >= 11) break;
      if (used.has(p.id) || !playerAvailable(p)) continue;
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
    ticketPrice: 10,
    formation: '4-4-2',
    style: 'balance',
    instructions: [],
    lineupIds: [],
    benchIds: [],
    userId: user?.id || null,
    players,
    staff: { coach: 1, gkCoach: 1, scout: 0, medic: 0 },
    academyLevel: 1,
    trainingLevel: 1,
    youth: [],
    board: null,
    form: [],
    rivals: [],
    sponsor: null,
    transferOffers: [],
    seasonArchive: [],
    history: [],
    ledger: [],
    createdAt: Date.now()
  };
}

function normalizeContracts(club) {
  if (!club?.players) return club;
  club.players.forEach((p) => {
    if (p.contractYears == null || p.contractYears === undefined) {
      p.contractYears = 1 + Math.floor(Math.random() * 3);
    }
  });
  return club;
}

function ensureLineup(club, force = false) {
  if (!club) return club;
  normalizeContracts(club);
  const players = club.players || [];
  const validIds = new Set(players.map((p) => p.id));
  const healthy = (id) => {
    const p = players.find((x) => x.id === id);
    return playerAvailable(p);
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
    const gk = players.find((p) => p.pos === 'Gk' && playerAvailable(p));
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
    ticketPrice: club.ticketPrice || 10,
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
    lastPressAt: club.lastPressAt || null,
    pressBuff: club.pressBuff && club.pressBuff.until > Date.now() ? club.pressBuff : null,
    chemistry: formationChemistry(club, resolveXi(club)),
    youthCount: Array.isArray(club.youth) ? club.youth.length : 0,
    academyLevel: club.academyLevel || 1,
    trainingLevel: club.trainingLevel || 1,
    board: boardStatus(club, user),
    form: clubFormGuide(club),
    sponsor: club.sponsor || null,
    tvWeekly: weeklyTvIncome(club, user),
    seasonArchive: (club.seasonArchive || []).slice(0, 4),
    playtimeRequests: (club.players || []).filter((p) => p.request === 'playtime').map((p) => ({
      id: p.id, name: p.name, pos: p.pos, apps: p.seasonApps || 0, mastery: masteryOf(p)
    })),
    transferOffers: (club.transferOffers || []).filter((o) => !o.resolved).slice(0, 8),
    loans: loansStatus(club),
    lineupFit: lineupFitMap(club),
    manager: user ? { id: user.id, login: user.login, name: user.name, level: user.level } : null
  };
}

function styleFitnessMul(style) {
  if (style === 'attack' || style === 'press') return 1.25;
  if (style === 'defend') return 0.85;
  if (style === 'counter') return 0.95;
  return 1;
}

function instructionMods(instructions) {
  const ids = Array.isArray(instructions) ? instructions : [];
  let att = 1;
  let def = 1;
  let fit = 1;
  INSTRUCTIONS.forEach((ins) => {
    if (!ids.includes(ins.id)) return;
    att *= ins.att;
    def *= ins.def;
    fit *= ins.fit;
  });
  return { att, def, fit };
}

function formationChemistry(club, xi) {
  const slots = FORMATIONS[club?.formation] || FORMATIONS['4-4-2'];
  const list = xi || [];
  if (!list.length) return 50;
  let pts = 0;
  list.forEach((p, i) => {
    const slot = slots[i] || p.pos;
    if (p.pos === slot) pts += 10;
    else if (POS_GROUP[p.pos] === POS_GROUP[slot]) pts += 6;
    else pts += 2;
  });
  return Math.round((pts / list.length) * 10); // ~20–100
}

function teamMatchPower(club, xi, { home = false, derby = false } = {}) {
  const base = Math.max(40, clubStrength({ ...club, players: club.players }));
  const styleMul = { attack: 1.08, press: 1.05, balance: 1, counter: 0.98, defend: 0.9 };
  const form = FORMATION_BIAS[club.formation] || FORMATION_BIAS['4-4-2'];
  const ins = instructionMods(club.instructions);
  let power = base * (styleMul[club.style] || 1) * form.att * ins.att;
  // defensive solidity slightly reduces opponent chance via separate field
  const solidity = form.def * ins.def * (derby ? 0.98 : 1);
  if (home) power *= 1.05;
  if (derby) power *= 1.05;
  if (club.pressBuff && club.pressBuff.until > Date.now()) {
    power *= Number(club.pressBuff.fitness || 1);
  }
  // XI quality vs full squad
  if (xi?.length) {
    const xiStr = xi.reduce((s, p) => s + effectiveMastery(p), 0);
    const avg = xiStr / Math.max(1, xi.length);
    power = power * 0.55 + avg * 11 * 0.45;
  }
  const chemistry = formationChemistry(club, xi);
  const chemMod = 0.92 + Math.min(0.12, (chemistry / 100) * 0.12);
  power *= chemMod;
  return {
    power: Math.max(35, power),
    solidity,
    fitMul: styleFitnessMul(club.style) * ins.fit,
    chemistry,
    derby: !!derby
  };
}

function applyFitnessAfterMatch(club, playedIds, opts = {}) {
  const set = new Set(playedIds);
  const styleMul = (opts.fitMul != null ? opts.fitMul : styleFitnessMul(opts.style || club.style));
  const medic = (club.staff && club.staff.medic) || 0;
  const injuryChance = Math.max(0.02, 0.07 - medic * 0.015);
  const resultDelta = opts.resultDelta || 0;
  const injuries = [];
  club.players.forEach((p) => {
    if (set.has(p.id)) {
      const loss = Math.round((rnd(10, 22) + (p.age > 28 ? 3 : 0)) * styleMul);
      p.fitness = Math.max(45, (p.fitness || 100) - loss);
      if (Math.random() < injuryChance * traitMul(p, 'injury', 1)) {
        const inj = inflictInjury(p, medic);
        if (inj) injuries.push(inj);
      }
      p.xpPool = (p.xpPool || 0) + rnd(4, 14) + (p.talent || 5);
      p.morale = Math.max(-20, Math.min(25, (p.morale || 0) + resultDelta + rnd(-1, 1)));
    } else {
      p.fitness = Math.min(100, (p.fitness || 100) + rnd(4, 10) + medic);
      if (p.injuredHours > 0) {
        p.injuredHours = Math.max(0, p.injuredHours - (8 + medic * 4));
        if (p.injuredHours <= 0) clearInjury(p);
      }
      p.morale = Math.max(-20, Math.min(25, (p.morale || 0) + rnd(-1, 1)));
    }
  });
  return injuries;
}

function resolveBench(club, xiIds) {
  const used = new Set(xiIds);
  const byId = new Map((club.players || []).map((p) => [p.id, p]));
  let bench = (club.benchIds || []).map((id) => byId.get(id)).filter((p) => p && playerAvailable(p) && !used.has(p.id));
  if (bench.length < 7) {
    const rest = (club.players || [])
      .filter((p) => playerAvailable(p) && !used.has(p.id) && !bench.some((b) => b.id === p.id))
      .sort((a, b) => effectiveMastery(b) - effectiveMastery(a));
    bench = bench.concat(rest).slice(0, 7);
  }
  return bench.slice(0, 7);
}

function groupStrength(players) {
  if (!players?.length) return 0;
  return Math.round(players.reduce((s, p) => s + effectiveMastery(p), 0) / players.length);
}

function playerBoardRow(p) {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    pos: p.pos,
    mastery: masteryOf(p),
    effective: effectiveMastery(p),
    fitness: p.fitness || 100,
    morale: p.morale || 0,
    injuredHours: p.injuredHours || 0,
    suspendedMatches: p.suspendedMatches || 0,
    available: playerAvailable(p)
  };
}

const STYLE_LABELS = {
  balance: 'Баланс',
  attack: 'Атака',
  defend: 'Оборона',
  press: 'Прессинг',
  counter: 'Контратака'
};

function prematchBoard(club) {
  if (!club) return null;
  ensureLineup(club);
  const xi = resolveXi(club);
  const bench = resolveBench(club, xi.map((p) => p.id));
  return {
    formation: club.formation || '4-4-2',
    style: club.style || 'balance',
    styleLabel: STYLE_LABELS[club.style] || club.style || 'Баланс',
    xi: xi.map(playerBoardRow),
    bench: bench.map(playerBoardRow),
    xiStrength: groupStrength(xi),
    benchStrength: groupStrength(bench),
    chemistry: formationChemistry(club, xi),
    understrength: xi.length < 11,
    unavailable: (club.players || []).filter((p) => !playerAvailable(p)).map(playerBoardRow)
  };
}

function opponentBrief(oppClub, { scoutLevel = 0 } = {}) {
  if (!oppClub) return null;
  ensureLineup(oppClub);
  const lvl = Math.max(0, Math.min(3, Number(scoutLevel) || 0));
  const strength = clubStrength(oppClub);
  const threats = [...(oppClub.players || [])]
    .filter((p) => playerAvailable(p))
    .sort((a, b) => effectiveMastery(b) - effectiveMastery(a))
    .slice(0, lvl >= 2 ? 3 : 1)
    .map((p) => ({
      name: p.name,
      pos: p.pos,
      effective: effectiveMastery(p),
      mastery: masteryOf(p)
    }));
  const out = [...(oppClub.players || [])]
    .filter((p) => !playerAvailable(p))
    .sort((a, b) => masteryOf(b) - masteryOf(a))
    .slice(0, 4)
    .map((p) => ({
      name: p.name,
      reason: (p.injuredHours || 0) > 0
        ? `травма ${p.injuredHours}ч`
        : `дискв. ${p.suspendedMatches || 1}`,
      mastery: masteryOf(p)
    }));
  const recent = (oppClub.history || []).slice(0, 3).map((h) => ({
    opp: h.opp,
    score: h.score,
    competition: h.competition,
    home: !!h.home
  }));
  return {
    name: oppClub.name,
    scoutLevel: lvl,
    locked: lvl < 1,
    strength: lvl >= 1 ? strength : Math.round(strength / 10) * 10,
    formation: lvl >= 1 ? (oppClub.formation || '4-4-2') : '?',
    style: lvl >= 2 ? (oppClub.style || 'balance') : null,
    styleLabel: lvl >= 2 ? (STYLE_LABELS[oppClub.style] || oppClub.style) : null,
    threats: lvl >= 1 ? threats : [],
    out: lvl >= 2 ? out : (lvl >= 1 ? out.slice(0, 1) : []),
    recent: lvl >= 3 ? recent : [],
    instructions: lvl >= 3 ? (oppClub.instructions || []).slice(0, 4) : [],
    hint: lvl < 1
      ? 'Наймите скаута в «Бонусе», чтобы открыть досье соперника'
      : null
  };
}

function creditLimit(user, club) {
  const squadVal = (club?.players || []).reduce((s, p) => s + playerValue(p), 0);
  const fans = user?.fans || 10000;
  const stadium = club?.stadiumLevel || 1;
  const fame = user?.fame || 0;
  const limit = squadVal * 0.07 + fans * 45 + stadium * 180000 + fame * 8000;
  return Math.round(Math.max(120000, Math.min(6e6, limit)));
}

function financeSnapshot(user, club) {
  const money = Math.round(user?.money || 0);
  const credit = creditLimit(user, club);
  const debt = Math.max(0, -money);
  const weekWages = weeklyWages(club);
  const dayWages = Math.round(weekWages / 7);
  ensureSponsor(club, user);
  const sponsorWeekly = club.sponsor?.weekly || 0;
  const sponsorDaily = Math.round(sponsorWeekly / 7);
  const tvWeekly = weeklyTvIncome(club, user);
  const tvDaily = Math.round(tvWeekly / 7);
  let status = 'healthy';
  if (money < 0 && debt >= credit) status = 'insolvent';
  else if (money < 0 && debt >= credit * 0.55) status = 'critical';
  else if (money < 0) status = 'debt';
  else if (money < dayWages * 3) status = 'tight';
  return {
    money,
    credit,
    debt,
    status,
    weekWages,
    dayWages,
    sponsorWeekly,
    sponsorDaily,
    tvWeekly,
    tvDaily,
    sponsor: club.sponsor || null,
    squadValue: (club?.players || []).reduce((s, p) => s + playerValue(p), 0),
    embargo: status === 'insolvent',
    statusLabel: ({
      healthy: 'Стабильно',
      tight: 'Напряжённо',
      debt: 'Долг',
      critical: 'Кризис',
      insolvent: 'Банкротство'
    })[status]
  };
}

const SPONSOR_TIERS = [
  { id: 'local', name: 'Городской банк', base: 22000 },
  { id: 'region', name: 'Регион Спорт', base: 52000 },
  { id: 'nation', name: 'Национальный бренд', base: 110000 },
  { id: 'global', name: 'EYE Global', base: 260000 }
];

function sponsorTierIndex(club, user) {
  const stadium = club?.stadiumLevel || 1;
  const fame = user?.fame || 0;
  const level = user?.level || 1;
  const str = club ? clubStrength(club) : 100;
  let idx = 0;
  if (fame >= 20 || stadium >= 3 || level >= 3) idx = 1;
  if (fame >= 50 || stadium >= 4 || level >= 5 || str >= 140) idx = 2;
  if (fame >= 100 || stadium >= 6 || level >= 8) idx = 3;
  return idx;
}

function pickSponsor(club, user, { force = false } = {}) {
  if (!club) return null;
  if (club.sponsor && !force) return club.sponsor;
  const t = SPONSOR_TIERS[sponsorTierIndex(club, user)];
  const stadium = club.stadiumLevel || 1;
  const level = user?.level || 1;
  const formPts = clubFormGuide(club).pts || 0;
  const weekly = Math.round(
    t.base * (0.85 + stadium * 0.1) * (0.9 + level * 0.04) * (1 + Math.min(0.12, formPts * 0.01))
  );
  club.sponsor = {
    id: t.id,
    name: t.name,
    weekly,
    signedAt: Date.now()
  };
  return club.sponsor;
}

function ensureSponsor(club, user) {
  if (!club) return null;
  if (!club.sponsor || !club.sponsor.weekly) return pickSponsor(club, user, { force: true });
  return club.sponsor;
}

function weeklyTvIncome(club, user) {
  const stadium = club?.stadiumLevel || 1;
  const level = user?.level || 1;
  const fame = user?.fame || 0;
  const fans = user?.fans || 10000;
  const formPts = clubFormGuide(club).pts || 0;
  const base = 18000 + stadium * 9000 + level * 4500 + Math.min(40000, fame * 180) + Math.round(fans * 0.08);
  return Math.round(base * (1 + Math.min(0.15, formPts * 0.012)));
}

function quoteTraining(club) {
  const lvl = club.trainingLevel || 1;
  if (lvl >= 5) return { ok: false, error: 'База уже максимального уровня' };
  const stadium = club.stadiumLevel || 1;
  if (lvl >= stadium + 1) return { ok: false, error: 'Сначала улучшите стадион' };
  return { ok: true, cost: 70000 * lvl, nextLevel: lvl + 1, label: `База → ур. ${lvl + 1}` };
}

function upgradeTraining(club) {
  const q = quoteTraining(club);
  if (!q.ok) return q;
  club.trainingLevel = q.nextLevel;
  return { ok: true, cost: q.cost, label: q.label, trainingLevel: club.trainingLevel };
}

const BUYER_CLUBS = [
  'Динамо Север', 'Крылья Волги', 'Металлург', 'Авангард Сити',
  'Рубин Порт', 'Энергия', 'Спарта Урал', 'Олимп Юг'
];

function maybeGenerateTransferOffers(club, { force = false } = {}) {
  if (!club) return [];
  club.transferOffers = Array.isArray(club.transferOffers) ? club.transferOffers : [];
  club.transferOffers = club.transferOffers.filter((o) => !o.resolved && (o.expiresAt || 0) > Date.now());
  const now = Date.now();
  if (!force && club.lastOfferAt && now - club.lastOfferAt < 18 * 3600e3) return [];
  if (!force && Math.random() > 0.55) {
    club.lastOfferAt = now;
    return [];
  }
  const xi = new Set(club.lineupIds || []);
  const pool = (club.players || [])
    .filter((p) =>
      !p.loanUntil &&
      !(p.injuredHours > 0) &&
      masteryOf(p) >= 12 &&
      (club.players.length > 16 || !xi.has(p.id))
    )
    .sort((a, b) => effectiveMastery(b) - effectiveMastery(a));
  if (!pool.length) return [];
  const created = [];
  const n = force ? 1 : (Math.random() < 0.35 ? 2 : 1);
  for (let i = 0; i < n && i < pool.length; i++) {
    const p = pool[i];
    if (club.transferOffers.some((o) => o.playerId === p.id)) continue;
    const fair = playerValue(p);
    const bid = Math.round(fair * (0.85 + Math.random() * 0.45));
    const offer = {
      id: uid('off'),
      playerId: p.id,
      playerName: p.name,
      pos: p.pos,
      mastery: masteryOf(p),
      buyer: pick(BUYER_CLUBS),
      bid,
      fair,
      at: now,
      expiresAt: now + 48 * 3600e3,
      resolved: false
    };
    club.transferOffers.unshift(offer);
    created.push(offer);
  }
  if (club.transferOffers.length > 12) club.transferOffers.length = 12;
  club.lastOfferAt = now;
  return created;
}

function resolveTransferOffer(club, offerId, decision) {
  club.transferOffers = Array.isArray(club.transferOffers) ? club.transferOffers : [];
  const offer = club.transferOffers.find((o) => o.id === offerId && !o.resolved);
  if (!offer) return { ok: false, error: 'Предложение не найдено или истекло' };
  if ((offer.expiresAt || 0) < Date.now()) {
    offer.resolved = true;
    return { ok: false, error: 'Предложение истекло' };
  }
  if (decision !== 'accept') {
    offer.resolved = true;
    offer.decision = 'reject';
    return { ok: true, decision: 'reject', offer, label: `Отказ · ${offer.buyer}` };
  }
  if ((club.lineupIds || []).includes(offer.playerId)) {
    return { ok: false, error: 'Сначала уберите игрока из основы' };
  }
  if ((club.players || []).length <= 16) {
    return { ok: false, error: 'В составе минимум 16' };
  }
  const taken = takeListedPlayer(club, offer.playerId);
  if (!taken.ok) return taken;
  offer.resolved = true;
  offer.decision = 'accept';
  pushLedger(club, offer.bid, `Продажа · ${offer.playerName} → ${offer.buyer}`);
  return {
    ok: true,
    decision: 'accept',
    offer,
    player: taken.player,
    value: offer.bid,
    label: `Продано в ${offer.buyer} · ${offer.playerName}`
  };
}

function playerCard(club, playerId) {
  const p = (club.players || []).find((x) => x.id === playerId);
  if (!p) return null;
  const ratings = Array.isArray(p.ratingLog) ? p.ratingLog.slice(0, 8) : [];
  const avg = ratings.length
    ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10
    : (p.lastRating || null);
  return {
    ...p,
    mastery: masteryOf(p),
    effective: effectiveMastery(p),
    value: playerValue(p),
    form: p.form ?? 60,
    avgRating: avg,
    ratingLog: ratings,
    traits: (p.specials || []).map((id) => ({ id, label: TRAITS[id]?.label || id })),
    onLoan: !!p.loanUntil,
    loanDaysLeft: p.loanUntil ? Math.max(0, Math.ceil((p.loanUntil - Date.now()) / (24 * 3600e3))) : 0
  };
}

function renegotiateSponsor(club, user) {
  if (!club) return { ok: false, error: 'Нет клуба' };
  const now = Date.now();
  if (club.lastSponsorAt && now - club.lastSponsorAt < 5 * 24 * 3600e3) {
    const left = Math.ceil((5 * 24 * 3600e3 - (now - club.lastSponsorAt)) / 3600e3);
    return { ok: false, error: `Переподписание через ~${left} ч` };
  }
  const prev = club.sponsor?.weekly || 0;
  const next = pickSponsor(club, user, { force: true });
  club.lastSponsorAt = now;
  return {
    ok: true,
    sponsor: next,
    delta: (next.weekly || 0) - prev,
    label: `Спонсор: ${next.name}`
  };
}

function pushForm(club, letter) {
  if (!club || !letter) return;
  club.form = Array.isArray(club.form) ? club.form : [];
  club.form.unshift(letter);
  if (club.form.length > 10) club.form.length = 10;
}

function clubFormGuide(club) {
  const form = Array.isArray(club?.form) ? club.form.slice(0, 5) : [];
  const pts = form.reduce((s, r) => s + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);
  let streak = 0;
  let kind = null;
  for (const r of form) {
    if (!kind) kind = r;
    if (r !== kind) break;
    streak++;
  }
  return {
    form,
    formStr: form.join('') || '—',
    pts,
    streak,
    streakKind: kind
  };
}

function detectDerby(homeClub, awayClub, meta = {}) {
  if (meta.derby === true) return { derby: true, label: meta.derbyLabel || 'Дерби' };
  if (meta.derby === false) return { derby: false, label: null };
  const rivalsH = homeClub?.rivals || [];
  const rivalsA = awayClub?.rivals || [];
  if (homeClub?.userId && rivalsA.includes(homeClub.userId)) {
    return { derby: true, label: 'Принципиальный матч' };
  }
  if (awayClub?.userId && rivalsH.includes(awayClub.userId)) {
    return { derby: true, label: 'Принципиальный матч' };
  }
  const hw = String(homeClub?.name || '').split(/\s+/)[0];
  const aw = String(awayClub?.name || '').split(/\s+/)[0];
  if (hw && aw && hw.length > 3 && hw === aw) {
    return { derby: true, label: `Дерби · ${hw}` };
  }
  if (meta.competition === 'league' && meta.challenge !== false) {
    const hs = clubStrength(homeClub);
    const as = clubStrength(awayClub);
    if (Math.abs(hs - as) <= 12 && (meta.round || 0) >= 1) {
      // heated league clash between close sides — light derby
      if (Math.random() < 0.22) return { derby: true, label: 'Горячий матч тура' };
    }
  }
  if (meta.challenge && meta.competition === 'friendly') {
    const hs = clubStrength(homeClub);
    const as = clubStrength(awayClub);
    if (Math.abs(hs - as) <= 18) return { derby: true, label: 'Принципиальный вызов' };
  }
  return { derby: false, label: null };
}

function rememberRival(club, otherUserId) {
  if (!club || !otherUserId) return;
  club.rivals = Array.isArray(club.rivals) ? club.rivals : [];
  if (!club.rivals.includes(otherUserId)) club.rivals.unshift(otherUserId);
  if (club.rivals.length > 8) club.rivals.length = 8;
}

function bumpSeasonApps(club, playerIds) {
  const set = new Set(playerIds || []);
  (club.players || []).forEach((p) => {
    if (!set.has(p.id)) return;
    p.seasonApps = (p.seasonApps || 0) + 1;
  });
}

function processPlaytimeRequests(club) {
  if (!club?.players?.length) return { created: [], cleared: [] };
  const xi = new Set(club.lineupIds || []);
  const cleared = [];
  club.players.forEach((p) => {
    if (p.request === 'playtime' && xi.has(p.id)) {
      delete p.request;
      p.morale = Math.min(25, (p.morale || 0) + 4);
      cleared.push(p);
    }
  });
  const created = [];
  const now = Date.now();
  if (club.lastRequestAt && now - club.lastRequestAt < 2 * 24 * 3600e3) {
    return { created, cleared };
  }
  const pending = club.players.some((p) => p.request === 'playtime');
  if (pending) return { created, cleared };
  const appsFloor = Math.max(1, Math.floor(((club.form || []).length || 1) * 0.35));
  const pool = club.players
    .filter((p) =>
      !xi.has(p.id) &&
      !p.request &&
      !(p.injuredHours > 0) &&
      masteryOf(p) >= 48 &&
      (p.seasonApps || 0) < appsFloor
    )
    .sort((a, b) => masteryOf(b) - masteryOf(a));
  if (pool.length && Math.random() < 0.45) {
    const p = pool[0];
    p.request = 'playtime';
    p.morale = Math.max(-20, (p.morale || 0) - 3);
    club.lastRequestAt = now;
    created.push(p);
  }
  return { created, cleared };
}

function resolvePlaytimeRequest(club, playerId, decision) {
  const p = (club.players || []).find((x) => x.id === playerId);
  if (!p) return { ok: false, error: 'Игрок не найден' };
  if (p.request !== 'playtime') return { ok: false, error: 'Нет активной просьбы' };
  if (decision === 'promise') {
    p.morale = Math.min(25, (p.morale || 0) + 5);
    return { ok: true, decision: 'promise', player: p, label: `Обещали минуты · ${p.name}` };
  }
  if (decision === 'list') {
    p.request = null;
    p.morale = Math.max(-20, (p.morale || 0) - 2);
    return { ok: true, decision: 'list', player: p, label: `На рынок · ${p.name}` };
  }
  // dismiss
  p.request = null;
  p.morale = Math.max(-20, (p.morale || 0) - 8);
  return { ok: true, decision: 'dismiss', player: p, label: `Отказ · ${p.name}` };
}

function snapshotSeasonAwards(club, { season = 1, rank = null, leagueName = null } = {}) {
  if (!club) return null;
  const rows = (club.players || []).map((p) => ({
    id: p.id,
    name: p.name,
    pos: p.pos,
    goals: p.seasonGoals || 0,
    assists: p.seasonAssists || 0,
    motm: p.seasonMotm || 0,
    apps: p.seasonApps || 0
  }));
  const entry = {
    season,
    leagueName,
    rank,
    at: Date.now(),
    scorers: rows.filter((r) => r.goals).sort((a, b) => b.goals - a.goals || b.assists - a.assists).slice(0, 5),
    assists: rows.filter((r) => r.assists).sort((a, b) => b.assists - a.assists || b.goals - a.goals).slice(0, 5),
    motm: rows.filter((r) => r.motm).sort((a, b) => b.motm - a.motm || b.goals - a.goals).slice(0, 5)
  };
  club.seasonArchive = Array.isArray(club.seasonArchive) ? club.seasonArchive : [];
  club.seasonArchive.unshift(entry);
  if (club.seasonArchive.length > 8) club.seasonArchive.length = 8;
  (club.players || []).forEach((p) => {
    p.seasonGoals = 0;
    p.seasonAssists = 0;
    p.seasonMotm = 0;
    p.seasonApps = 0;
    if (p.request === 'playtime') delete p.request;
  });
  return entry;
}

function trySub(liveXi, bench, outPlayer, events, minute, side, score, reason) {
  if (!outPlayer) return null;
  const idx = liveXi.findIndex((p) => p.id === outPlayer.id);
  if (idx < 0) return null;
  const sub = bench.find((p) => playerAvailable(p) && !liveXi.some((x) => x.id === p.id));
  if (!sub) {
    liveXi.splice(idx, 1);
    return null;
  }
  const bi = bench.findIndex((p) => p.id === sub.id);
  if (bi >= 0) bench.splice(bi, 1);
  liveXi[idx] = sub;
  events.push({
    minute,
    type: 'sub',
    side,
    player: `${outPlayer.name} → ${sub.name}`,
    score: [...score],
    out: outPlayer.name,
    inn: sub.name
  });
  return sub;
}

function applyDiscipline(club, cardLog) {
  const bans = [];
  (cardLog || []).forEach((c) => {
    const p = (club.players || []).find((x) => x.id === c.playerId);
    if (!p) return;
    if (c.type === 'yellow') {
      p.yellows = (p.yellows || 0) + 1;
      if (p.yellows >= 5) {
        p.yellows = 0;
        p.suspendedMatches = (p.suspendedMatches || 0) + 1;
        bans.push({ id: p.id, name: p.name, matches: 1, reason: '5 ЖК' });
      }
    }
    if (c.type === 'red') {
      p.suspendedMatches = (p.suspendedMatches || 0) + 1;
      bans.push({ id: p.id, name: p.name, matches: 1, reason: 'КК' });
    }
  });
  return bans;
}

function serveSuspensions(club, startedBannedIds) {
  (club.players || []).forEach((p) => {
    if (startedBannedIds.has(p.id) && (p.suspendedMatches || 0) > 0) {
      p.suspendedMatches = Math.max(0, (p.suspendedMatches || 0) - 1);
    }
  });
}

function simulateMatch(homeClub, awayClub, meta = {}) {
  const homeBanned = new Set((homeClub.players || []).filter((p) => (p.suspendedMatches || 0) > 0).map((p) => p.id));
  const awayBanned = new Set((awayClub.players || []).filter((p) => (p.suspendedMatches || 0) > 0).map((p) => p.id));

  let homeXi = resolveXi(homeClub).slice();
  let awayXi = resolveXi(awayClub).slice();
  let homeBench = resolveBench(homeClub, homeXi.map((p) => p.id));
  let awayBench = resolveBench(awayClub, awayXi.map((p) => p.id));

  const derbyInfo = detectDerby(homeClub, awayClub, meta);
  const homePow = teamMatchPower(homeClub, homeXi, { home: true, derby: derbyInfo.derby });
  const awayPow = teamMatchPower(awayClub, awayXi, { home: false, derby: derbyInfo.derby });
  // leaders boost
  homeXi.forEach((p) => { homePow.power *= Math.pow(traitMul(p, 'power', 1), 0.3); });
  awayXi.forEach((p) => { awayPow.power *= Math.pow(traitMul(p, 'power', 1), 0.3); });
  let hs = homePow.power / Math.max(0.85, awayPow.solidity);
  let as = awayPow.power / Math.max(0.85, homePow.solidity);

  let hg = 0, ag = 0, hShots = 0, aShots = 0, hOn = 0, aOn = 0, hCorners = 0, aCorners = 0, hPoss = 50;
  const events = [];
  if (derbyInfo.derby) {
    events.push({
      minute: 1,
      type: 'derby',
      side: 'home',
      player: derbyInfo.label || 'Дерби',
      score: [0, 0]
    });
  }
  const cards = { home: 0, away: 0 };
  const matchYellows = { home: Object.create(null), away: Object.create(null) };
  const cardLog = { home: [], away: [] };
  const ratings = { home: Object.create(null), away: Object.create(null) };
  const bumpRating = (side, pid, delta) => {
    if (!pid) return;
    ratings[side][pid] = (ratings[side][pid] || 6.4) + delta;
  };
  homeXi.forEach((p) => { ratings.home[p.id] = 6.5; });
  awayXi.forEach((p) => { ratings.away[p.id] = 6.5; });

  for (let m = 1; m <= 90; m++) {
    if (m % 9 === 0) {
      const bias = hs / (hs + as);
      hPoss = Math.max(35, Math.min(65, Math.round(bias * 100 + rnd(-4, 4))));
    }
    // mid-match injury → auto sub
    if (Math.random() < 0.004) {
      const homeSide = Math.random() < 0.5;
      const live = homeSide ? homeXi : awayXi;
      const bench = homeSide ? homeBench : awayBench;
      const victim = pick(live.filter((p) => p.pos !== 'Gk').concat(live));
      if (victim) {
        const brittle = traitMul(victim, 'injury', 1);
        if (Math.random() < brittle * 0.7) {
          const medic = ((homeSide ? homeClub : awayClub).staff && (homeSide ? homeClub : awayClub).staff.medic) || 0;
          const inj = inflictInjury(victim, medic);
          events.push({
            minute: m,
            type: 'injury',
            side: homeSide ? 'home' : 'away',
            player: victim.name,
            injuryType: inj?.type,
            injuryLabel: inj?.label,
            score: [hg, ag]
          });
          trySub(live, bench, victim, events, m, homeSide ? 'home' : 'away', [hg, ag], inj?.label || 'травма');
          if (homeSide) hs *= 0.97; else as *= 0.97;
        }
      }
    }
    if (Math.random() < 0.085) {
      const homeChance = (hs * (hPoss / 50)) / (hs * (hPoss / 50) + as * ((100 - hPoss) / 50));
      const homeAtt = Math.random() < homeChance;
      if (homeAtt) hShots++; else aShots++;
      const attXi = homeAtt ? homeXi : awayXi;
      const defXi = homeAtt ? awayXi : homeXi;
      const scorerPool = attXi.filter((p) => p.pos !== 'Gk');
      const shooter = pick(scorerPool.length ? scorerPool : attXi);
      const shotChance = 0.42 + (homeAtt ? hs : as) / ((hs + as) * 4);
      const onTarget = Math.random() < shotChance * traitMul(shooter, 'shot', 1);
      if (onTarget) {
        if (homeAtt) hOn++; else aOn++;
        const gk = defXi.find((p) => p.pos === 'Gk');
        const saveChance = 0.55 + (gk?.skills?.save || 14) / 120;
        const isGoal = Math.random() > saveChance * 0.85;
        if (isGoal) {
          const assistPool = attXi.filter((p) => p.id !== shooter?.id && p.pos !== 'Gk');
          let assist = null;
          if (assistPool.length && Math.random() < 0.65) {
            assist = assistPool.slice().sort((a, b) => traitMul(b, 'assist', 1) - traitMul(a, 'assist', 1))[0];
            if (Math.random() > traitMul(assist, 'assist', 1) * 0.55) assist = pick(assistPool);
          }
          if (homeAtt) hg++; else ag++;
          const side = homeAtt ? 'home' : 'away';
          bumpRating(side, shooter?.id, 0.9);
          if (assist) bumpRating(side, assist.id, 0.45);
          if (gk) bumpRating(homeAtt ? 'away' : 'home', gk.id, -0.25);
          events.push({
            minute: m, type: 'goal', side,
            player: shooter?.name || 'Игрок',
            playerId: shooter?.id || null,
            assist: assist?.name || null,
            assistId: assist?.id || null,
            score: [hg, ag]
          });
        } else {
          events.push({ minute: m, type: 'shot', side: homeAtt ? 'home' : 'away', player: shooter?.name || 'Удар в створ', score: [hg, ag] });
          bumpRating(homeAtt ? 'home' : 'away', shooter?.id, 0.08);
          const gk = defXi.find((p) => p.pos === 'Gk');
          if (gk) bumpRating(homeAtt ? 'away' : 'home', gk.id, 0.15);
        }
      } else if (Math.random() < 0.25) {
        if (homeAtt) hCorners++; else aCorners++;
        events.push({ minute: m, type: 'corner', side: homeAtt ? 'home' : 'away', player: 'Угловой', score: [hg, ag] });
      }
    }
    if (Math.random() < 0.012) {
      const homeSide = Math.random() < 0.5;
      const live = homeSide ? homeXi : awayXi;
      const bench = homeSide ? homeBench : awayBench;
      const side = homeSide ? 'home' : 'away';
      const pl = pick(live.filter((p) => p.pos !== 'Gk').concat(live));
      if (!pl) continue;
      const cardChance = traitMul(pl, 'card', 1);
      let red = Math.random() < 0.08 * cardChance;
      matchYellows[side][pl.id] = (matchYellows[side][pl.id] || 0) + 1;
      if (!red && matchYellows[side][pl.id] >= 2) red = true;
      cards[side]++;
      if (red) {
        events.push({ minute: m, type: 'red', side, player: pl.name, score: [hg, ag] });
        cardLog[side].push({ type: 'red', playerId: pl.id });
        trySub(live, bench, pl, events, m, side, [hg, ag], 'удаление');
        if (homeSide) hs *= 0.9; else as *= 0.9;
        bumpRating(side, pl.id, -1.2);
      } else {
        events.push({ minute: m, type: 'yellow', side, player: pl.name, score: [hg, ag] });
        cardLog[side].push({ type: 'yellow', playerId: pl.id });
        bumpRating(side, pl.id, -0.2);
      }
    }
  }

  if (hg + ag === 0 && Math.random() < 0.75) {
    const homeAtt = Math.random() < hs / (hs + as);
    if (homeAtt) { hg = 1; hShots++; hOn++; } else { ag = 1; aShots++; aOn++; }
    events.push({ minute: rnd(55, 88), type: 'goal', side: homeAtt ? 'home' : 'away', player: 'Стандарт', assist: null, score: [hg, ag] });
  }
  events.sort((a, b) => a.minute - b.minute);

  const homeResult = hg > ag ? 3 : hg === ag ? 1 : -2;
  const awayResult = ag > hg ? 3 : hg === ag ? 1 : -2;
  const playedHome = new Set([...homeXi.map((p) => p.id), ...Object.keys(ratings.home)]);
  const playedAway = new Set([...awayXi.map((p) => p.id), ...Object.keys(ratings.away)]);
  // fitness uses original starters + those who played via tracking ratings keys
  const homeInj = applyFitnessAfterMatch(homeClub, [...playedHome], {
    style: homeClub.style, fitMul: homePow.fitMul * 0.5 + 0.5 * (homeXi.reduce((s, p) => s + traitMul(p, 'fit', 1), 0) / Math.max(1, homeXi.length)),
    resultDelta: homeResult
  });
  const awayInj = applyFitnessAfterMatch(awayClub, [...playedAway], {
    style: awayClub.style, fitMul: awayPow.fitMul,
    resultDelta: awayResult
  });
  // xp trait
  (homeClub.players || []).forEach((p) => {
    if (playedHome.has(p.id) && (p.specials || []).includes('prospect')) p.xpPool = (p.xpPool || 0) + 4;
  });
  (awayClub.players || []).forEach((p) => {
    if (playedAway.has(p.id) && (p.specials || []).includes('prospect')) p.xpPool = (p.xpPool || 0) + 4;
  });

  const homeBans = applyDiscipline(homeClub, cardLog.home);
  const awayBans = applyDiscipline(awayClub, cardLog.away);
  serveSuspensions(homeClub, homeBanned);
  serveSuspensions(awayClub, awayBanned);

  homeInj.forEach((inj) => {
    if (!events.some((e) => e.type === 'injury' && e.player === inj.name)) {
      events.push({ minute: rnd(60, 90), type: 'injury', side: 'home', player: inj.name, score: [hg, ag] });
    }
  });
  awayInj.forEach((inj) => {
    if (!events.some((e) => e.type === 'injury' && e.player === inj.name)) {
      events.push({ minute: rnd(60, 90), type: 'injury', side: 'away', player: inj.name, score: [hg, ag] });
    }
  });
  events.sort((a, b) => a.minute - b.minute);

  const mapXi = (club, side) => {
    const ids = Object.keys(ratings[side]);
    const byId = new Map((club.players || []).map((p) => [p.id, p]));
    const slots = FORMATIONS[club.formation] || FORMATIONS['4-4-2'];
    const live = side === 'home' ? homeXi : awayXi;
    return ids.map((id) => {
      const p = byId.get(id);
      if (!p) return null;
      const slotIdx = live.findIndex((x) => x.id === id);
      return {
        id: p.id, name: p.name, pos: p.pos,
        slot: slotIdx >= 0 ? slots[slotIdx] : p.pos,
        effective: effectiveMastery(p),
        rating: Math.max(4, Math.min(9.8, Math.round((ratings[side][id] || 6.5) * 10) / 10)),
        specials: p.specials || []
      };
    }).filter(Boolean).sort((a, b) => b.rating - a.rating);
  };

  const homeMapped = mapXi(homeClub, 'home');
  const awayMapped = mapXi(awayClub, 'away');
  const motmRow = [...homeMapped, ...awayMapped].sort((a, b) => b.rating - a.rating)[0] || null;
  const motm = motmRow
    ? {
        ...motmRow,
        side: homeMapped.some((p) => p.id === motmRow.id) ? 'home' : 'away',
        clubName: homeMapped.some((p) => p.id === motmRow.id) ? homeClub.name : awayClub.name
      }
    : null;

  const result = {
    id: uid('m'),
    createdAt: Date.now(),
    status: 'done',
    competition: meta.competition || 'friendly',
    round: meta.round || null,
    cupId: meta.cupId || null,
    leagueId: meta.leagueId || null,
    home: {
      userId: meta.homeUserId, name: homeClub.name, short: homeClub.short, color: homeClub.color,
      strength: Math.round(hs), formation: homeClub.formation, style: homeClub.style,
      chemistry: homePow.chemistry || formationChemistry(homeClub, homeXi)
    },
    away: {
      userId: meta.awayUserId, name: awayClub.name, short: awayClub.short, color: awayClub.color,
      strength: Math.round(as), formation: awayClub.formation, style: awayClub.style,
      chemistry: awayPow.chemistry || formationChemistry(awayClub, awayXi)
    },
    score: [hg, ag],
    events,
    stats: {
      possession: [hPoss, 100 - hPoss],
      shots: [hShots, aShots],
      shotsOn: [hOn, aOn],
      corners: [hCorners, aCorners],
      cards: [cards.home, cards.away]
    },
    injuries: { home: homeInj, away: awayInj },
    suspensions: { home: homeBans, away: awayBans },
    homeXi: homeMapped,
    awayXi: awayMapped,
    motm,
    derby: derbyInfo.derby ? (derbyInfo.label || 'Дерби') : null,
    chemistry: {
      home: homePow.chemistry || formationChemistry(homeClub, homeXi),
      away: awayPow.chemistry || formationChemistry(awayClub, awayXi)
    }
  };

  applyMatchAwards(homeClub, result, true);
  applyMatchAwards(awayClub, result, false);
  applyPlayerMatchForms(homeClub, homeMapped);
  applyPlayerMatchForms(awayClub, awayMapped);
  bumpSeasonApps(homeClub, homeXi.map((p) => p.id).concat(Object.keys(ratings.home)));
  bumpSeasonApps(awayClub, awayXi.map((p) => p.id).concat(Object.keys(ratings.away)));

  const homeLetter = hg > ag ? 'W' : hg === ag ? 'D' : 'L';
  const awayLetter = ag > hg ? 'W' : hg === ag ? 'D' : 'L';
  pushForm(homeClub, homeLetter);
  pushForm(awayClub, awayLetter);
  if (derbyInfo.derby) {
    if (awayClub.userId) rememberRival(homeClub, awayClub.userId);
    if (homeClub.userId) rememberRival(awayClub, homeClub.userId);
  }

  homeClub.history = homeClub.history || [];
  awayClub.history = awayClub.history || [];
  homeClub.history.unshift({
    id: result.id, at: result.createdAt, opp: awayClub.name, score: [hg, ag], home: true,
    competition: result.competition, result: homeLetter, derby: result.derby || null
  });
  awayClub.history.unshift({
    id: result.id, at: result.createdAt, opp: homeClub.name, score: [ag, hg], home: false,
    competition: result.competition, result: awayLetter, derby: result.derby || null
  });
  if (homeClub.history.length > 40) homeClub.history.length = 40;
  if (awayClub.history.length > 40) awayClub.history.length = 40;
  return result;
}

function applyMatchAwards(club, match, isHome) {
  if (!club || !match) return;
  const side = isHome ? 'home' : 'away';
  (match.events || []).forEach((e) => {
    if (e.type !== 'goal' || e.side !== side) return;
    if (e.playerId) {
      const scorer = (club.players || []).find((p) => p.id === e.playerId);
      if (scorer) scorer.seasonGoals = (scorer.seasonGoals || 0) + 1;
    }
    if (e.assistId) {
      const a = (club.players || []).find((p) => p.id === e.assistId);
      if (a) a.seasonAssists = (a.seasonAssists || 0) + 1;
    }
  });
  if (match.motm && match.motm.side === side && match.motm.id) {
    const p = (club.players || []).find((x) => x.id === match.motm.id);
    if (p) {
      p.seasonMotm = (p.seasonMotm || 0) + 1;
      p.morale = Math.min(25, (p.morale || 0) + 3);
      p.xpPool = (p.xpPool || 0) + 6;
    }
  }
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

const TRAIN_SESSIONS = {
  technical: { label: 'Техника', xpMin: 8, xpMax: 14, fitnessCost: 10, morale: 1, money: 0 },
  physical: { label: 'Физика', xpMin: 5, xpMax: 10, fitnessCost: 18, morale: 0, money: 2000 },
  tactics: { label: 'Тактика', xpMin: 6, xpMax: 12, fitnessCost: 8, morale: 2, money: 1500 },
  recovery: { label: 'Восстановление', xpMin: 0, xpMax: 3, fitnessCost: -22, morale: 2, money: 4000 }
};

function trainSession(club, playerId, session = 'technical', { spendUserMoney } = {}) {
  const p = (club.players || []).find((x) => x.id === playerId);
  if (!p) return { ok: false, error: 'Игрок не найден' };
  if ((p.injuredHours || 0) > 0) return { ok: false, error: 'Игрок травмирован' };
  if ((p.suspendedMatches || 0) > 0) return { ok: false, error: 'Игрок дисквалифицирован' };
  const kind = TRAIN_SESSIONS[session] ? session : 'technical';
  const cfg = TRAIN_SESSIONS[kind];
  const now = Date.now();
  if ((p.trainCdUntil || 0) > now) {
    return { ok: false, error: `Пауза до ${new Date(p.trainCdUntil).toLocaleTimeString('ru-RU')}`, until: p.trainCdUntil };
  }
  if (kind !== 'recovery' && (p.fitness || 100) < 35) {
    return { ok: false, error: 'Слишком устал — нужна сессия «Восстановление»' };
  }
  const coach = (club.staff && club.staff.coach) || 1;
  const trainLvl = club.trainingLevel || 1;
  const cost = cfg.money || 0;
  if (cost > 0 && typeof spendUserMoney === 'function') {
    const spent = spendUserMoney(cost);
    if (!spent) return { ok: false, error: `Нужно ${cost} ¤` };
  }
  const xpGain = rnd(cfg.xpMin, cfg.xpMax) + Math.max(0, coach - 1) + Math.max(0, trainLvl - 1);
  p.xpPool = (p.xpPool || 0) + xpGain;
  if (cfg.fitnessCost < 0) {
    p.fitness = Math.min(100, (p.fitness || 100) - cfg.fitnessCost + rnd(0, 4) + Math.max(0, trainLvl - 2));
  } else {
    p.fitness = Math.max(18, (p.fitness || 100) - (cfg.fitnessCost + rnd(0, 4) - Math.max(0, trainLvl - 2)));
  }
  p.morale = Math.max(-20, Math.min(25, (p.morale || 0) + (cfg.morale || 0)));
  p.trainCdUntil = now + Math.max(25, 40 - (trainLvl - 1) * 3) * 60 * 1000;
  p.lastTrain = { at: now, session: kind, xp: xpGain, trainingLevel: trainLvl };
  if (cost > 0) pushLedger(club, -cost, `Тренировка · ${cfg.label} · ${p.name}`);
  return {
    ok: true,
    session: kind,
    sessionLabel: cfg.label,
    xpGain,
    cost,
    trainingLevel: trainLvl,
    player: { ...p, mastery: masteryOf(p), effective: effectiveMastery(p) },
    cooldownMs: Math.max(25, 40 - (trainLvl - 1) * 3) * 60 * 1000
  };
}

function recoverSquad(club) {
  const medic = (club.staff && club.staff.medic) || 0;
  club.players.forEach((p) => {
    p.fitness = Math.min(100, (p.fitness || 100) + rnd(8, 16) + medic * 3);
    if (p.injuredHours > 0) {
      p.injuredHours = Math.max(0, p.injuredHours - (12 + medic * 6));
      if (p.injuredHours <= 0) clearInjury(p);
    }
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

function ticketIncome(club, user, won, opts = {}) {
  const fans = Math.max(1000, user?.fans || 10000);
  const cap = club?.capacity || 8000;
  const basePrice = club?.ticketPrice || (8 + ((club?.stadiumLevel || 1) - 1) * 3);
  const price = Math.max(5, Math.min(40, basePrice));
  // higher price → slightly lower attendance
  const priceFactor = Math.max(0.55, 1.15 - price / 50);
  let attendance = Math.min(cap, Math.round(fans * (won ? 0.85 : 0.55) * priceFactor));
  if (opts.derby) attendance = Math.min(cap, Math.round(attendance * 1.28));
  return Math.round(attendance * price);
}

function setTicketPrice(club, price) {
  const p = Math.round(Number(price) || 10);
  if (p < 5 || p > 40) return { ok: false, error: 'Цена билета 5–40 ¤' };
  club.ticketPrice = p;
  return { ok: true, ticketPrice: p };
}

function weeklyWages(club) {
  return (club.players || []).reduce((s, p) => {
    if (p.loanUntil || p.onLoan) return s; // wage covered by loan club
    return s + (p.wage || 0);
  }, 0);
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
  ensureSponsor(club, user);
  const sponsorDaily = Math.round((club.sponsor?.weekly || 0) / 7);
  const sponsorPay = sponsorDaily * days;
  const tvWeekly = weeklyTvIncome(club, user);
  const tvPay = Math.round(tvWeekly / 7) * days;
  const delta = grant + sponsorPay + tvPay - wages;
  user.money = Math.round((user.money || 0) + delta);
  const credit = creditLimit(user, club);
  if (user.money < -credit) user.money = -credit;
  let interest = 0;
  if (user.money < 0) {
    interest = Math.max(1500, Math.round((-user.money) * 0.01 * days));
    user.money -= interest;
    if (user.money < -credit) user.money = -credit;
    pushLedger(club, -interest, days === 1 ? 'Проценты по долгу' : `Проценты (${days} дн.)`);
  }
  user.lastWageAt = (user.lastWageAt || now) + days * DAY_MS;
  if (user.lastWageAt > now) user.lastWageAt = now;
  pushLedger(club, -wages, days === 1 ? 'Зарплаты (сутки)' : `Зарплаты (${days} дн.)`);
  pushLedger(club, grant, days === 1 ? 'Суточный доход (фанаты/стадион)' : `Доход за ${days} дн.`);
  if (sponsorPay > 0) {
    pushLedger(
      club,
      sponsorPay,
      days === 1
        ? `Спонсор · ${club.sponsor.name}`
        : `Спонсор · ${club.sponsor.name} (${days} дн.)`
    );
  }
  if (tvPay > 0) {
    pushLedger(club, tvPay, days === 1 ? 'ТВ-права' : `ТВ-права (${days} дн.)`);
  }
  club.contractDayAcc = (club.contractDayAcc || 0) + days;
  let contracts = null;
  if (club.contractDayAcc >= 5) {
    const ticks = Math.floor(club.contractDayAcc / 5);
    club.contractDayAcc -= ticks * 5;
    contracts = tickContracts(club, ticks);
  }
  tickYouthGrowth(club);
  const loans = tickLoans(club, now);
  const playtime = processPlaytimeRequests(club);
  const offers = maybeGenerateTransferOffers(club);
  const finance = financeSnapshot(user, club);
  return {
    wages, grant, sponsorPay, tvPay, delta, weekBill, days, at: now,
    contracts, interest, finance, playtime, loans, offers, sponsor: club.sponsor,
    tvWeekly
  };
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
  let changed = false;
  if (hours >= 1) {
    const medic = (club.staff && club.staff.medic) || 0;
    club.players.forEach((p) => {
      if (p.injuredHours > 0) {
        p.injuredHours = Math.max(0, Math.round(p.injuredHours - hours * (1 + medic * 0.5)));
        if (p.injuredHours <= 0) clearInjury(p);
      } else {
        p.fitness = Math.min(100, (p.fitness || 100) + hours);
      }
    });
    club.lastInjuryTick = now;
    changed = true;
  }
  // age players ~ every 7 real days
  const lastAge = club.lastAgeTick || club.createdAt || now;
  const ageDays = Math.floor((now - lastAge) / (24 * 3600e3));
  if (ageDays >= 7) {
    const steps = Math.min(4, Math.floor(ageDays / 7));
    club.players.forEach((p) => {
      p.age = (p.age || 20) + steps;
      if (p.age >= 31 && p.skills) {
        Object.keys(p.skills).forEach((k) => {
          if (Math.random() < 0.35 * steps) {
            p.skills[k] = Math.max(8, (p.skills[k] || 10) - 1);
          }
        });
      }
      if (p.age >= 36) p.wage = Math.max(500, Math.round((p.wage || 1000) * 0.92));
    });
    club.lastAgeTick = now;
    changed = true;
  }
  if (tickYouthGrowth(club)) changed = true;
  if (tickLoans(club).returned?.length) changed = true;
  return changed;
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
    id: listing.id.startsWith('pl_') ? listing.id : uid('pl'),
    name: listing.name,
    pos: listing.pos,
    age: listing.age,
    talent: listing.talent,
    fitness: listing.fitness || 95,
    morale: listing.morale || 5,
    wage: listing.wage || 2000,
    contractYears: listing.contractYears || rnd(2, 4),
    skills: listing.skills,
    specials: listing.specials || [],
    xpPool: listing.xpPool || 0,
    injuredHours: 0
  };
  club.players.push(player);
  return { ok: true, player, cost: listing.value || playerValue(player), label: `Трансфер · ${player.name}` };
}

/** Instant sell to agents at 70%. */
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
  return { ok: true, value, player: p, label: `Продажа агентам · ${p.name}` };
}

/** List player on club↔club market at asking price (default 90% value). */
function listPlayer(club, playerId, askingPrice) {
  if ((club.lineupIds || []).includes(playerId)) {
    return { ok: false, error: 'Сначала уберите игрока из основы' };
  }
  if ((club.players || []).length <= 16) return { ok: false, error: 'Нельзя выставить — в составе минимум 16' };
  const p = (club.players || []).find((x) => x.id === playerId);
  if (!p) return { ok: false, error: 'Игрок не найден' };
  const fair = playerValue(p);
  const value = Math.max(Math.round(fair * 0.5), Math.min(Math.round(fair * 1.4), Math.round(askingPrice || fair * 0.9)));
  return {
    ok: true,
    listing: {
      id: p.id,
      name: p.name,
      pos: p.pos,
      age: p.age,
      talent: p.talent,
      fitness: p.fitness,
      morale: p.morale,
      wage: p.wage,
      contractYears: p.contractYears || 1,
      skills: p.skills,
      specials: p.specials || [],
      xpPool: p.xpPool || 0,
      mastery: masteryOf(p),
      effective: effectiveMastery(p),
      value,
      fair,
      source: 'club',
      sellerUserId: club.userId || null,
      sellerClub: club.name,
      listedAt: Date.now()
    },
    player: p
  };
}

function takeListedPlayer(club, playerId) {
  const idx = (club.players || []).findIndex((p) => p.id === playerId);
  if (idx < 0) return { ok: false, error: 'Игрок уже ушёл' };
  const p = club.players[idx];
  club.players.splice(idx, 1);
  club.lineupIds = (club.lineupIds || []).filter((id) => id !== playerId);
  club.benchIds = (club.benchIds || []).filter((id) => id !== playerId);
  ensureLineup(club, true);
  return { ok: true, player: p };
}

function quoteYouth(club) {
  if ((club.players || []).length >= 25) return { ok: false, error: 'Состав полон (макс. 25)' };
  const lvl = club.stadiumLevel || 1;
  if (lvl < 2) return { ok: false, error: 'Нужен стадион ур. 2+ для академии' };
  const now = Date.now();
  const acLvl = club.academyLevel || 1;
  const cdMs = Math.max(12, 24 - (acLvl - 1) * 2) * 3600e3;
  if (club.lastYouthAt && now - club.lastYouthAt < cdMs) {
    const wait = Math.ceil((cdMs - (now - club.lastYouthAt)) / 3600e3);
    return { ok: false, error: `Следующий выпуск через ~${wait} ч`, waitMs: cdMs - (now - club.lastYouthAt) };
  }
  const cost = 20000 + (lvl - 2) * 5000 + (acLvl - 1) * 3000;
  return { ok: true, cost, stadiumLevel: lvl, academyLevel: acLvl };
}

function makeYouthProspect(club) {
  const lvl = club.stadiumLevel || 1;
  const ac = club.academyLevel || 1;
  const pos = pick(POSITIONS.filter((p) => p !== 'Dm' && p !== 'Am').concat(['Cm', 'Cf', 'Cd']));
  const quality = 9 + Math.min(6, lvl) + Math.min(3, ac - 1) + rnd(-1, 2);
  const p = makePlayer(pos, quality);
  p.age = rnd(15, 18);
  p.talent = Math.min(10, (p.talent || 5) + rnd(1, 2) + Math.max(0, ac - 2));
  p.wage = Math.round(playerValue(p) / 120);
  p.contractYears = rnd(2, 4);
  p.pot = Math.min(99, masteryOf(p) + p.talent * 3 + rnd(2, 8) + ac);
  p.youth = true;
  return p;
}

function ensureYouthPool(club, { refill = false } = {}) {
  if (!club) return [];
  club.youth = Array.isArray(club.youth) ? club.youth : [];
  if (club.academyLevel == null) club.academyLevel = 1;
  const stadium = club.stadiumLevel || 1;
  const ac = club.academyLevel || 1;
  const max = Math.min(8, 2 + ac + Math.max(0, stadium - 1));
  const now = Date.now();
  const stale = !club.lastYouthRefill || (now - club.lastYouthRefill > 12 * 3600e3);
  if (refill || stale || club.youth.length === 0) {
    while (club.youth.length < max) club.youth.push(makeYouthProspect(club));
    club.lastYouthRefill = now;
  }
  return club.youth;
}

function publicYouth(p) {
  if (!p) return null;
  return {
    ...p,
    mastery: masteryOf(p),
    effective: effectiveMastery(p),
    pot: p.pot || (masteryOf(p) + (p.talent || 5) * 2)
  };
}

function quoteAcademy(club) {
  const lvl = club.academyLevel || 1;
  if (lvl >= 5) return { ok: false, error: 'Академия уже максимального уровня' };
  const stadium = club.stadiumLevel || 1;
  if (stadium < 2) return { ok: false, error: 'Нужен стадион ур. 2+' };
  if (lvl >= stadium) return { ok: false, error: 'Уровень академии не выше стадиона' };
  return { ok: true, cost: 55000 * lvl, nextLevel: lvl + 1, label: `Академия → ур. ${lvl + 1}` };
}

function upgradeAcademy(club) {
  const q = quoteAcademy(club);
  if (!q.ok) return q;
  club.academyLevel = q.nextLevel;
  ensureYouthPool(club, { refill: true });
  return { ok: true, cost: q.cost, label: q.label, academyLevel: club.academyLevel };
}

function academyStatus(club) {
  ensureYouthPool(club);
  const q = quoteYouth(club);
  const up = quoteAcademy(club);
  return {
    stadiumLevel: club.stadiumLevel || 1,
    academyLevel: club.academyLevel || 1,
    squadSize: (club.players || []).length,
    youth: (club.youth || []).map(publicYouth),
    canPromote: q.ok,
    promoteCost: q.ok ? q.cost : null,
    promoteError: q.ok ? null : q.error,
    waitMs: q.waitMs || 0,
    lastYouthAt: club.lastYouthAt || null,
    upgrade: up.ok ? up : { ok: false, error: up.error }
  };
}

function promoteYouth(club, youthId = null) {
  const q = quoteYouth(club);
  if (!q.ok) return q;
  ensureYouthPool(club);
  let idx = -1;
  if (youthId) idx = (club.youth || []).findIndex((p) => p.id === youthId);
  if (idx < 0) idx = 0;
  if (!(club.youth || []).length) {
    club.youth.push(makeYouthProspect(club));
    idx = 0;
  }
  const p = club.youth[idx];
  club.youth.splice(idx, 1);
  delete p.youth;
  p.wage = Math.round(playerValue(p) / 100);
  club.players.push(p);
  club.lastYouthAt = Date.now();
  return {
    ok: true,
    player: { ...p, mastery: masteryOf(p), effective: effectiveMastery(p) },
    cost: q.cost,
    label: `Академия · ${p.name}`
  };
}

function releaseYouth(club, youthId) {
  ensureYouthPool(club);
  const idx = (club.youth || []).findIndex((p) => p.id === youthId);
  if (idx < 0) return { ok: false, error: 'Воспитанник не найден' };
  const p = club.youth[idx];
  club.youth.splice(idx, 1);
  return { ok: true, player: p, label: `Отпущен из академии · ${p.name}` };
}

function tickYouthGrowth(club) {
  if (!club?.youth?.length) return false;
  const ac = club.academyLevel || 1;
  let changed = false;
  club.youth.forEach((p) => {
    if (!p.skills) return;
    if (Math.random() < 0.28 + (p.talent || 5) * 0.04 + ac * 0.05) {
      const keys = Object.keys(p.skills);
      const k = pick(keys);
      const cap = Math.min(28, (p.pot || 40) / 2 + ac);
      if ((p.skills[k] || 10) < cap) {
        p.skills[k] = Math.min(cap, (p.skills[k] || 10) + 1);
        changed = true;
      }
    }
  });
  return changed;
}

function medicalBay(club) {
  const medic = (club.staff && club.staff.medic) || 0;
  const injured = (club.players || [])
    .filter((p) => (p.injuredHours || 0) > 0)
    .map((p) => {
      const type = p.injuryType || 'muscle';
      const label = p.injuryLabel || INJURY_TYPES[type]?.label || 'Травма';
      const treatCost = 8000 + Math.round((p.injuredHours || 0) * 400);
      return {
        id: p.id,
        name: p.name,
        pos: p.pos,
        hours: p.injuredHours,
        etaHours: Math.max(1, Math.ceil(p.injuredHours / (1 + medic * 0.5))),
        type,
        label,
        treatCost,
        mastery: masteryOf(p)
      };
    })
    .sort((a, b) => b.hours - a.hours);
  const suspended = (club.players || [])
    .filter((p) => (p.suspendedMatches || 0) > 0)
    .map((p) => ({
      id: p.id,
      name: p.name,
      pos: p.pos,
      matches: p.suspendedMatches,
      mastery: masteryOf(p)
    }));
  const tired = (club.players || [])
    .filter((p) => (p.fitness || 100) < 70 && !(p.injuredHours > 0))
    .map((p) => ({
      id: p.id,
      name: p.name,
      pos: p.pos,
      fitness: p.fitness,
      mastery: masteryOf(p)
    }))
    .sort((a, b) => a.fitness - b.fitness)
    .slice(0, 8);
  return { medic, injured, suspended, tired };
}

function treatInjury(club, playerId, { spendUserMoney } = {}) {
  const p = (club.players || []).find((x) => x.id === playerId);
  if (!p) return { ok: false, error: 'Игрок не найден' };
  if (!(p.injuredHours > 0)) return { ok: false, error: 'Игрок здоров' };
  const medic = (club.staff && club.staff.medic) || 0;
  const cost = 8000 + Math.round(p.injuredHours * 400) - medic * 1500;
  const pay = Math.max(4000, cost);
  if (typeof spendUserMoney === 'function') {
    if (!spendUserMoney(pay)) return { ok: false, error: `Нужно ${pay} ¤ на лечение` };
  }
  const before = p.injuredHours;
  p.injuredHours = Math.max(0, Math.ceil(p.injuredHours / 2) - (4 + medic * 2));
  if (p.injuredHours <= 0) clearInjury(p);
  pushLedger(club, -pay, `Лечение · ${p.name}`);
  return {
    ok: true,
    cost: pay,
    hoursBefore: before,
    hours: p.injuredHours || 0,
    player: { ...p, mastery: masteryOf(p), effective: effectiveMastery(p) },
    label: p.injuredHours > 0
      ? `Лечение · ${p.name}: осталось ~${p.injuredHours}ч`
      : `Выписан · ${p.name}`
  };
}

function releasePlayer(club, playerId) {
  if ((club.lineupIds || []).includes(playerId)) {
    return { ok: false, error: 'Сначала уберите игрока из основы' };
  }
  if ((club.players || []).length <= 16) return { ok: false, error: 'Минимум 16 игроков в составе' };
  const idx = (club.players || []).findIndex((p) => p.id === playerId);
  if (idx < 0) return { ok: false, error: 'Игрок не найден' };
  const p = club.players[idx];
  club.players.splice(idx, 1);
  club.benchIds = (club.benchIds || []).filter((id) => id !== playerId);
  return { ok: true, player: p, label: `Отчислен · ${p.name}` };
}

function renegotiateWage(club, playerId, direction) {
  const p = (club.players || []).find((x) => x.id === playerId);
  if (!p) return { ok: false, error: 'Игрок не найден' };
  if (p.contractYears == null) p.contractYears = 2;
  const dir = direction === 'cut' ? 'cut' : 'raise';
  if (dir === 'raise') {
    p.wage = Math.round((p.wage || 1000) * 1.12);
    p.morale = Math.min(25, (p.morale || 0) + 6);
    return { ok: true, player: p, label: `Повышение · ${p.name}`, wage: p.wage };
  }
  // Strong players refuse deep cuts near expiry
  const mastery = masteryOf(p);
  if (mastery >= 55 && (p.contractYears || 0) <= 1 && Math.random() < 0.45) {
    p.morale = Math.max(-20, (p.morale || 0) - 4);
    return { ok: false, error: `${p.name} отказался снижать зарплату` };
  }
  p.wage = Math.max(400, Math.round((p.wage || 1000) * 0.9));
  p.morale = Math.max(-20, (p.morale || 0) - 8);
  return { ok: true, player: p, label: `Снижение · ${p.name}`, wage: p.wage };
}

function quoteRenew(club, playerId, years = 2) {
  const p = (club.players || []).find((x) => x.id === playerId);
  if (!p) return { ok: false, error: 'Игрок не найден' };
  const y = Math.max(1, Math.min(4, Math.round(Number(years) || 2)));
  const cur = p.contractYears == null ? 1 : p.contractYears;
  if (cur + y > 5) return { ok: false, error: 'Максимум контракта — 5 лет' };
  const bonus = Math.round((p.wage || 1000) * 3.5 * y);
  const wageBump = Math.round((p.wage || 1000) * (1 + 0.04 * y));
  return { ok: true, years: y, bonus, wage: wageBump, player: p, currentYears: cur };
}

function renewContract(club, playerId, years = 2, { spendUserMoney } = {}) {
  const q = quoteRenew(club, playerId, years);
  if (!q.ok) return q;
  if (typeof spendUserMoney === 'function') {
    if (!spendUserMoney(q.bonus)) return { ok: false, error: `Нужно ${q.bonus} ¤ на подписной бонус` };
  }
  const p = q.player;
  p.contractYears = (p.contractYears == null ? 1 : p.contractYears) + q.years;
  p.wage = q.wage;
  p.morale = Math.min(25, (p.morale || 0) + 4 + q.years);
  p.wantsRenew = false;
  pushLedger(club, -q.bonus, `Контракт · ${p.name} (+${q.years} г.)`);
  return {
    ok: true,
    player: { ...p, mastery: masteryOf(p), effective: effectiveMastery(p) },
    bonus: q.bonus,
    years: q.years,
    label: `Контракт · ${p.name}`
  };
}

/**
 * Advance contract clocks. Returns { renewedAsks, left }.
 */
function tickContracts(club, years = 1) {
  const y = Math.max(1, Math.round(years || 1));
  const left = [];
  const asks = [];
  const keep = [];
  (club.players || []).forEach((p) => {
    if (p.contractYears == null) p.contractYears = rnd(1, 3);
    p.contractYears = Math.max(0, (p.contractYears || 0) - y);
    if (p.contractYears > 0) {
      keep.push(p);
      return;
    }
    // Expired
    const inXi = (club.lineupIds || []).includes(p.id);
    const mastery = masteryOf(p);
    if (inXi || mastery >= 50) {
      p.wantsRenew = true;
      p.morale = Math.max(-20, (p.morale || 0) - 6);
      p.contractYears = 0;
      keep.push(p);
      asks.push(p);
      return;
    }
    // Free agent leave
    left.push(p);
  });
  if (left.length) {
    const leftIds = new Set(left.map((p) => p.id));
    club.players = keep;
    club.lineupIds = (club.lineupIds || []).filter((id) => !leftIds.has(id));
    club.benchIds = (club.benchIds || []).filter((id) => !leftIds.has(id));
    ensureLineup(club, true);
  } else {
    club.players = keep;
  }
  return { left, asks, years: y };
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
  const banned = players.filter((p) => (p.suspendedMatches || 0) > 0);
  if (banned.length) {
    return { ok: false, error: `Дисквалифицированы: ${banned.map((p) => p.name).join(', ')}` };
  }
  const bench = (benchIds || []).filter((id) => byId.has(id) && !xi.includes(id)).slice(0, 7);
  club.lineupIds = xi;
  club.benchIds = bench;
  return { ok: true, club };
}

function skillCap(club, isGk = false) {
  const staff = club.staff || {};
  const train = Math.max(0, (club.trainingLevel || 1) - 1);
  if (isGk) return 15 + (staff.gkCoach || 0) * 5 + train;
  return 15 + (staff.coach || 0) * 5 + train;
}

module.exports = {
  FORMATIONS,
  STYLES,
  INSTRUCTIONS,
  TRAITS,
  INJURY_TYPES,
  POSITIONS,
  STAFF_ROLES,
  uid,
  levelFromXp,
  masteryOf,
  effectiveMastery,
  clubStrength,
  resolveXi,
  resolveBench,
  prematchBoard,
  opponentBrief,
  financeSnapshot,
  creditLimit,
  groupStrength,
  defaultClub,
  ensureLineup,
  normalizeContracts,
  publicClub,
  simulateMatch,
  trainPlayer,
  trainSession,
  TRAIN_SESSIONS,
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
  sellPlayer,
  listPlayer,
  takeListedPlayer,
  formationChemistry,
  applyMatchAwards,
  promoteYouth,
  quoteYouth,
  ensureYouthPool,
  academyStatus,
  quoteAcademy,
  upgradeAcademy,
  releaseYouth,
  tickYouthGrowth,
  medicalBay,
  treatInjury,
  inflictInjury,
  clearInjury,
  ensureBoard,
  createBoard,
  applyMatchConfidence,
  applyBoardAfterMatch,
  seasonBoardReview,
  takeNewJob,
  boardStatus,
  targetForClub,
  POS_GROUP,
  releasePlayer,
  renegotiateWage,
  quoteRenew,
  renewContract,
  tickContracts,
  setTicketPrice,
  playerAvailable,
  SPONSOR_TIERS,
  pickSponsor,
  ensureSponsor,
  renegotiateSponsor,
  pushForm,
  clubFormGuide,
  detectDerby,
  rememberRival,
  processPlaytimeRequests,
  resolvePlaytimeRequest,
  snapshotSeasonAwards,
  bumpSeasonApps,
  midSeasonBoardReview,
  applyPlayerMatchForms,
  slotFitScore,
  lineupFitMap,
  quoteLoanOut,
  loanOutPlayer,
  tickLoans,
  loansStatus,
  publicProfile,
  weeklyTvIncome,
  quoteTraining,
  upgradeTraining,
  maybeGenerateTransferOffers,
  resolveTransferOffer,
  playerCard
};

