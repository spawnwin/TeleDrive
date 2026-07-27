const PROFILES_KEY = 'futbolx_profiles_v1';
const SAVE_PREFIX = 'futbolx_save_';

/* Профили менеджеров живут только в этом браузере: сервера у игры нет,
   поэтому это разделение сохранений на устройстве, а не облачный аккаунт.
   PIN защищает от чужих рук за тем же телефоном, не более того. */
const Profiles = {
  read() {
    try {
      const raw = localStorage.getItem(PROFILES_KEY);
      const reg = raw ? JSON.parse(raw) : null;
      if (reg && Array.isArray(reg.profiles)) return reg;
    } catch (e) {}
    return { profiles: [], activeId: null };
  },

  write(reg) {
    try { localStorage.setItem(PROFILES_KEY, JSON.stringify(reg)); } catch (e) {}
  },

  list() { return this.read().profiles; },

  activeId() { return this.read().activeId; },

  find(id) { return this.list().find(p => p.id === id) || null; },

  nameTaken(name) {
    return this.list().some(p => p.name.toLowerCase() === name.trim().toLowerCase());
  },

  create(name, pin) {
    const reg = this.read();
    const profile = {
      id: 'u' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
      name: name.trim(),
      pin: pin || '',
      clubName: '',
      created: Date.now(),
      lastPlayed: Date.now()
    };
    reg.profiles.push(profile);
    this.write(reg);
    return profile;
  },

  update(id, patch) {
    const reg = this.read();
    const p = reg.profiles.find(x => x.id === id);
    if (!p) return;
    Object.assign(p, patch);
    this.write(reg);
  },

  remove(id) {
    const reg = this.read();
    reg.profiles = reg.profiles.filter(p => p.id !== id);
    if (reg.activeId === id) reg.activeId = null;
    this.write(reg);
    try { localStorage.removeItem(SAVE_PREFIX + id); } catch (e) {}
  },

  setActive(id) {
    const reg = this.read();
    reg.activeId = id;
    this.write(reg);
  },

  checkPin(id, pin) {
    const p = this.find(id);
    if (!p) return false;
    return !p.pin || p.pin === pin;
  }
};

function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp01to100(v) { return Math.max(0, Math.min(100, v)); }
let uidCounter = 1;
function uid() { return 'p' + (uidCounter++) + '_' + Math.floor(Math.random() * 1e6); }

function genPlayer(pos, basePower) {
  const name = choice(DATA.firstNames) + ' ' + choice(DATA.lastNames);
  let att, def, skill;
  if (pos === 'GK') { def = basePower + rand(-5, 12); att = rand(20, 35); skill = basePower + rand(-12, 5); }
  else if (pos === 'DEF') { def = basePower + rand(-5, 14); att = rand(28, 45); skill = basePower + rand(-12, 8); }
  else if (pos === 'MID') { def = basePower + rand(-10, 8); att = basePower + rand(-10, 8); skill = basePower + rand(-5, 12); }
  else { att = basePower + rand(-5, 14); def = rand(20, 35); skill = basePower + rand(-8, 12); }
  return {
    id: uid(), name, pos,
    att: Math.round(clamp01to100(att)),
    def: Math.round(clamp01to100(def)),
    skill: Math.round(clamp01to100(skill)),
    age: randInt(18, 33),
    fitness: 100,
    morale: randInt(65, 90),
    goals: 0,          // за текущий сезон
    careerGoals: 0,
    apps: 0,
    injuredFor: 0,     // матчей вне игры
    suspendedFor: 0,
    yellows: 0         // в пределах одного матча
  };
}

/* Сейвы, сделанные до появления карточек и травм, донабирают поля. */
function normalizePlayer(p) {
  ['goals', 'careerGoals', 'apps', 'injuredFor', 'suspendedFor', 'yellows']
    .forEach(k => { if (typeof p[k] !== 'number') p[k] = 0; });
  return p;
}

function overall(p) {
  if (p.pos === 'GK') return Math.round(p.def * 0.55 + p.skill * 0.35 + p.att * 0.1);
  if (p.pos === 'DEF') return Math.round(p.def * 0.55 + p.skill * 0.25 + p.att * 0.2);
  if (p.pos === 'FWD') return Math.round(p.att * 0.55 + p.skill * 0.25 + p.def * 0.2);
  return Math.round((p.att + p.def + p.skill) / 3);
}

function genSquad(basePower) {
  const list = [];
  for (let i = 0; i < 2; i++) list.push(genPlayer('GK', basePower));
  for (let i = 0; i < 6; i++) list.push(genPlayer('DEF', basePower));
  for (let i = 0; i < 6; i++) list.push(genPlayer('MID', basePower));
  for (let i = 0; i < 4; i++) list.push(genPlayer('FWD', basePower));
  return list;
}

function emptyTableRow(id, name, color) {
  return { id, name, color, pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, played: 0 };
}

function generateFixtures(division) {
  const teamIds = ['user'].concat(DATA.leagueClubs(division).map(c => c.id));
  const n = teamIds.length;
  const arr = teamIds.slice(1); // rotate all but fixed index 0
  const fixed = teamIds[0];
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const roundArr = [fixed].concat(arr);
    const pairings = [];
    for (let i = 0; i < n / 2; i++) {
      const home = roundArr[i], away = roundArr[n - 1 - i];
      pairings.push(r % 2 === 0 ? [home, away] : [away, home]);
    }
    rounds.push(pairings);
    arr.unshift(arr.pop());
  }
  return rounds;
}

function buildTable(division, clubName) {
  return ['user'].concat(DATA.leagueClubs(division).map(c => c.id)).map(id => {
    if (id === 'user') return emptyTableRow('user', clubName, '#22d3ee');
    const c = DATA.findClub(id);
    return emptyTableRow(id, c.name, c.color);
  });
}

/* Календарь сезона: туры чемпионата вперемешку со стадиями кубка, а раз в
   четыре сезона — ещё и чемпионат мира. Один сквозной список избавляет
   интерфейс от вопроса «какой матч следующий». */
function buildCalendar(season) {
  const worlds = season % 4 === 0;
  const events = [];
  let cup = 0, world = 0;
  for (let r = 0; r < 7; r++) {
    events.push({ type: 'league', round: r });
    if ((r === 1 || r === 3 || r === 5) && cup < 3) events.push({ type: 'cup', stage: cup++ });
    if (worlds && (r === 2 || r === 4 || r === 6) && world < 3) {
      events.push({ type: 'world', stage: world++ });
    }
  }
  return events;
}

function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Сетка на восемь участников: 1/4 → 1/2 → финал. Одна и та же машинерия
   обслуживает Кубок страны и чемпионат мира. */
function makeBracket(teamIds) {
  const order = shuffled(teamIds);
  const ties = [];
  for (let i = 0; i < order.length; i += 2) ties.push([order[i], order[i + 1]]);
  return { stage: 0, ties: [ties], results: [], winner: null, userOut: false };
}

function buildCup(division) {
  const pool = DATA.leagueClubs(division === 1 ? 2 : 1).slice(0, 4)
    .concat(DATA.leagueClubs(division).slice(0, 3))
    .map(c => c.id);
  return makeBracket(['user'].concat(pool.slice(0, 7)));
}

function buildWorld() {
  return makeBracket(['user'].concat(DATA.worldClubs.map(c => c.id)));
}

function defaultSave() {
  const basePower = 62;
  const division = 2;
  return {
    clubName: 'FC Аврора',
    created: false,          // команда ещё не собрана мастером создания
    division,
    level: 1,
    xp: 0,
    coins: 300,
    kit: 'cyan',
    ball: 'classic',
    ownedKits: ['cyan'],
    ownedBalls: ['classic'],
    ownedStadiums: ['city'],
    ownedInterventions: ['speech'],
    stadiumId: 'city',
    weatherId: 'clear',
    formation: '4-4-2',
    tacticStyle: 'balance',
    squad: genSquad(basePower),
    transferPool: [],
    season: 1,
    round: 0,
    calendar: buildCalendar(1),
    calendarIndex: 0,
    fixtures: generateFixtures(division),
    table: buildTable(division, 'FC Аврора'),
    cup: buildCup(division),
    world: null,
    trophies: [],
    history: [],
    rating: 0,
    achievements: {},
    stats: { goals: 0, wins: 0, matches: 0 }
  };
}

const Save = {
  data: null,
  profileId: null,

  /* Загружает сохранение активного профиля. Без профиля возвращает null —
     интерфейс в этом случае показывает вход. */
  load() {
    const id = Profiles.activeId();
    if (!id || !Profiles.find(id)) { this.data = null; this.profileId = null; return null; }
    return this.loadProfile(id);
  },

  loadProfile(id) {
    this.profileId = id;
    try {
      const raw = localStorage.getItem(SAVE_PREFIX + id);
      this.data = raw ? Object.assign(defaultSave(), JSON.parse(raw)) : defaultSave();
    } catch (e) {
      this.data = defaultSave();
    }
    this.repair();
    return this.data;
  },

  /* Достраивает поля, которых не было в сохранениях прежних версий. */
  repair() {
    const d = this.data;
    if (!d.squad || !d.squad.length) d.squad = genSquad(62);
    d.squad.forEach(normalizePlayer);
    (d.transferPool || []).forEach(normalizePlayer);
    if (!d.division) d.division = 2;
    if (!d.trophies) d.trophies = [];
    if (!d.history) d.history = [];
    if (!d.fixtures || !d.fixtures.length) d.fixtures = generateFixtures(d.division);
    if (!d.table || !d.table.length) d.table = buildTable(d.division, d.clubName);
    if (!d.calendar || !d.calendar.length) {
      d.calendar = buildCalendar(d.season || 1);
      d.calendarIndex = 0;
    }
    if (typeof d.calendarIndex !== 'number') d.calendarIndex = 0;
    if (!d.cup) d.cup = buildCup(d.division);
    if (!d.world && d.calendar.some(e => e.type === 'world')) d.world = buildWorld();
    const me = d.table.find(r => r.id === 'user');
    if (me) me.name = d.clubName;
  },

  persist() {
    if (!this.profileId || !this.data) return;
    try {
      localStorage.setItem(SAVE_PREFIX + this.profileId, JSON.stringify(this.data));
      Profiles.update(this.profileId, {
        clubName: this.data.clubName,
        lastPlayed: Date.now()
      });
    } catch (e) {}
  },

  logout() {
    this.persist();
    Profiles.setActive(null);
    this.data = null;
    this.profileId = null;
  },

  /* Мастер создания команды: имя, цвет, схема и стиль. */
  createTeam({ clubName, kit, formation, tacticStyle }) {
    const d = this.data;
    d.clubName = clubName;
    d.kit = kit;
    if (!d.ownedKits.includes(kit)) d.ownedKits.push(kit);
    d.formation = formation;
    d.tacticStyle = tacticStyle;
    d.created = true;
    d.table = buildTable(d.division, clubName);
    this.persist();
  },

  xpForNextLevel(level) { return 100 + (level - 1) * 60; },

  addXp(amount) {
    const d = this.data;
    d.xp += amount;
    let leveledUp = false;
    while (d.xp >= this.xpForNextLevel(d.level)) {
      d.xp -= this.xpForNextLevel(d.level);
      d.level += 1;
      leveledUp = true;
    }
    this.persist();
    return leveledUp;
  },

  addCoins(n) { this.data.coins += n; this.persist(); },

  spendCoins(n) {
    if (this.data.coins < n) return false;
    this.data.coins -= n; this.persist(); return true;
  },

  owns(category, id) {
    const key = { kits: 'ownedKits', balls: 'ownedBalls', stadiums: 'ownedStadiums', interventions: 'ownedInterventions' }[category];
    return this.data[key].includes(id);
  },

  buy(category, id, cost) {
    if (!this.spendCoins(cost)) return false;
    const key = { kits: 'ownedKits', balls: 'ownedBalls', stadiums: 'ownedStadiums', interventions: 'ownedInterventions' }[category];
    this.data[key].push(id);
    this.persist();
    return true;
  },

  unlockAchievement(id) {
    if (this.data.achievements[id]) return false;
    this.data.achievements[id] = true;
    this.persist();
    return true;
  },

  // ---------------- SQUAD / TACTICS ----------------
  isAvailable(p) { return !p.injuredFor && !p.suspendedFor; },

  /* Травмированные и дисквалифицированные в состав не попадают. Если линия
     не набирается (продали всех вратарей, эпидемия травм), её добирают
     лучшие из оставшихся — не по позиции, зато состав всегда полный. */
  bestXI() {
    const f = DATA.formations[this.data.formation];
    const pool = this.data.squad.filter(p => this.isAvailable(p));
    const used = new Set();
    const rank = (a, b) => effectiveRating(b) - effectiveRating(a);

    const take = (pos, n) => {
      const list = pool.filter(p => p.pos === pos && !used.has(p.id)).sort(rank).slice(0, n);
      list.forEach(p => used.add(p.id));
      return list;
    };
    const fill = (arr, n) => {
      while (arr.length < n) {
        const sub = pool.filter(p => !used.has(p.id)).sort(rank)[0];
        if (!sub) break;
        used.add(sub.id);
        arr.push(sub);
      }
      return arr;
    };

    const gk = fill(take('GK', 1), 1);
    const def = fill(take('DEF', f.def), f.def);
    const mid = fill(take('MID', f.mid), f.mid);
    const fwd = fill(take('FWD', f.fwd), f.fwd);
    return { gk, def, mid, fwd, all: gk.concat(def, mid, fwd) };
  },

  teamStrength() {
    const xi = this.bestXI();
    return Object.assign(this.strengthOfXI(xi), { xi });
  },

  /* Считает силу конкретного состава. Матч держит свой XI (замены, травмы,
     удаления), поэтому сила должна считаться от него, а не от bestXI. */
  strengthOfXI(xi) {
    const tactic = DATA.tacticStyles.find(t => t.id === this.data.tacticStyle);
    const weather = DATA.weathers.find(w => w.id === this.data.weatherId) || DATA.weathers[0];
    let atkSum = 0, atkW = 0, defSum = 0, defW = 0;
    xi.fwd.forEach(p => { atkSum += effectiveRating(p) * 1.0; atkW += 1.0; });
    xi.mid.forEach(p => { atkSum += effectiveRating(p) * 0.55; atkW += 0.55; defSum += effectiveRating(p) * 0.45; defW += 0.45; });
    xi.def.forEach(p => { defSum += effectiveRating(p) * 1.0; defW += 1.0; });
    xi.gk.forEach(p => { defSum += effectiveRating(p) * 0.7; defW += 0.7; });
    const baseAtk = atkW ? atkSum / atkW : 50;
    const baseDef = defW ? defSum / defW : 50;
    return {
      attack: baseAtk * tactic.atkMul * weather.atkMul,
      defense: baseDef * tactic.defMul * weather.defMul
    };
  },

  applyPostMatch(xi, won) {
    xi.all.forEach(p => {
      p.fitness = clamp01to100(p.fitness - randInt(6, 16));
      p.morale = clamp01to100(p.morale + (won ? randInt(1, 9) : randInt(-6, 3)));
      p.apps++;
    });
    this.data.squad.forEach(p => {
      if (!xi.all.includes(p)) p.fitness = clamp01to100(p.fitness + randInt(4, 10));
      if (p.injuredFor) p.injuredFor--;
      if (p.suspendedFor) p.suspendedFor--;
      p.yellows = 0;
    });
    this.persist();
  },

  // ---------------- ТРЕНИРОВКИ ----------------
  /* Чем сильнее игрок, тем дороже занятие. Молодёжь вдобавок дешевле в
     работе и прибавляет охотнее, поэтому растить своих юниоров выгоднее,
     чем доводить возрастного середняка. */
  trainingAgeFactor(age) { return age <= 21 ? 0.65 : age <= 28 ? 1 : 1.45; },

  trainingCost(p) {
    return Math.round(overall(p) * overall(p) / 20 * this.trainingAgeFactor(p.age));
  },

  restCost(p) { return Math.round((100 - p.fitness) * 2); },

  /* Молодые прибавляют охотно, ветеранам расти уже почти некуда — но
     занятие никогда не проходит совсем впустую. */
  trainingGain(age) {
    if (age <= 21) return randInt(2, 3);
    if (age <= 26) return randInt(1, 2);
    return 1;
  },

  trainingOutlook(age) {
    if (age <= 21) return 'быстрый рост';
    if (age <= 26) return 'растёт';
    if (age <= 30) return 'медленно';
    return 'почти предел';
  },

  trainPlayer(id) {
    const p = this.data.squad.find(x => x.id === id);
    if (!p) return false;
    const cost = this.trainingCost(p);
    if (!this.spendCoins(cost)) return false;

    const primary = p.pos === 'FWD' ? 'att' : p.pos === 'MID' ? 'skill' : 'def';
    const before = overall(p);
    const gain = this.trainingGain(p.age);
    p[primary] = clamp01to100(p[primary] + gain);
    if (Math.random() < 0.4) p.skill = clamp01to100(p.skill + 1);
    p.morale = clamp01to100(p.morale + randInt(1, 4));
    this.persist();
    return { name: p.name, delta: overall(p) - before, cost };
  },

  restPlayer(id) {
    const p = this.data.squad.find(x => x.id === id);
    if (!p || p.fitness >= 100) return false;
    const cost = this.restCost(p);
    if (!this.spendCoins(cost)) return false;
    p.fitness = 100;
    this.persist();
    return { name: p.name, cost };
  },

  /* История матчей: последние результаты нужны и игроку (что было), и
     экрану подготовки (в какой форме команды подходят к матчу). */
  recordMatch(entry) {
    this.data.history.unshift({
      season: this.data.season,
      competition: entry.competition || 'friendly',
      opponent: entry.opponent,
      opponentColor: entry.opponentColor || '#879A8E',
      gf: entry.gf,
      ga: entry.ga,
      result: entry.gf > entry.ga ? 'w' : entry.gf === entry.ga ? 'd' : 'l'
    });
    // Держим окно в 60 матчей: дальше история не нужна, а сохранение пухнет.
    if (this.data.history.length > 60) this.data.history.length = 60;
    this.persist();
  },

  formGuide(n) {
    return this.data.history.slice(0, n || 5).map(h => h.result).reverse();
  },

  /* Форма соперника выводится из его силы: у клуба нет своей истории,
     поэтому показываем правдоподобную серию, устойчивую для этого клуба
     в этом сезоне — иначе она бы менялась при каждом заходе на экран. */
  rivalForm(clubId, n) {
    const club = DATA.findClub(clubId);
    if (!club) return [];
    let seed = (this.data.season * 31 + clubId.length * 17 +
                clubId.charCodeAt(0) * 7 + club.power) >>> 0;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const strong = (club.power - 45) / 45;      // 0…1
    const out = [];
    for (let i = 0; i < (n || 5); i++) {
      const r = rnd();
      out.push(r < 0.25 + strong * 0.4 ? 'w' : r < 0.55 + strong * 0.25 ? 'd' : 'l');
    }
    return out;
  },

  topScorers(limit) {
    return this.data.squad
      .filter(p => p.goals > 0)
      .sort((a, b) => b.goals - a.goals || b.apps - a.apps)
      .slice(0, limit || 5);
  },

  unavailableCount() {
    return this.data.squad.filter(p => !this.isAvailable(p)).length;
  },

  // ---------------- LEAGUE ----------------
  currentRoundFixtures() { return this.data.fixtures[this.data.round] || null; },

  userFixtureThisRound() {
    const round = this.currentRoundFixtures();
    if (!round) return null;
    for (const [h, a] of round) {
      if (h === 'user' || a === 'user') return { home: h, away: a };
    }
    return null;
  },

  clubPower(id) {
    if (id === 'user') return this.teamStrength();
    const c = DATA.findClub(id);
    if (!c) return { attack: 60, defense: 60 };
    return { attack: c.power + rand(-4, 4), defense: c.power + rand(-4, 4) };
  },

  recordResult(homeId, awayId, gh, ga) {
    const t = this.data.table;
    const home = t.find(r => r.id === homeId), away = t.find(r => r.id === awayId);
    home.played++; away.played++;
    home.gf += gh; home.ga += ga; away.gf += ga; away.ga += gh;
    if (gh > ga) { home.pts += 3; home.w++; away.l++; }
    else if (gh < ga) { away.pts += 3; away.w++; home.l++; }
    else { home.pts++; away.pts++; home.d++; away.d++; }
  },

  simulateQuickMatch(idHome, idAway) {
    const ph = this.clubPower(idHome), pa = this.clubPower(idAway);
    const xgHome = clampNum(1.25 + (ph.attack - pa.defense) / 55 + 0.15, 0.15, 4.2);
    const xgAway = clampNum(1.05 + (pa.attack - ph.defense) / 55, 0.1, 4.2);
    return { gh: poisson(xgHome), ga: poisson(xgAway) };
  },

  playOtherFixturesThisRound() {
    const round = this.currentRoundFixtures();
    if (!round) return;
    for (const [h, a] of round) {
      if (h === 'user' || a === 'user') continue;
      const { gh, ga } = this.simulateQuickMatch(h, a);
      this.recordResult(h, a, gh, ga);
    }
  },

  // ---------------- КАЛЕНДАРЬ И ТУРНИРЫ ----------------
  currentEvent() { return this.data.calendar[this.data.calendarIndex] || null; },

  bracketFor(type) { return type === 'cup' ? this.data.cup : this.data.world; },

  /* Ближайший матч менеджера: тур чемпионата или стадия плей-офф. Если из
     кубка вылетели, событие пропускается автоматически. */
  nextFixture() {
    let guard = 0;
    while (guard++ < 40) {
      const ev = this.currentEvent();
      if (!ev) return null;

      if (ev.type === 'league') {
        this.data.round = ev.round;
        const round = this.currentRoundFixtures();
        if (round) {
          for (const [h, a] of round) {
            if (h === 'user' || a === 'user') {
              return { kind: 'league', home: h, away: a, label: DATA.competitions.league.name };
            }
          }
        }
      } else {
        const br = this.bracketFor(ev.type);
        const tie = br && !br.userOut && (br.ties[ev.stage] || [])
          .find(t => t[0] === 'user' || t[1] === 'user');
        if (tie) {
          return {
            kind: ev.type, home: tie[0], away: tie[1], stage: ev.stage,
            label: `${DATA.competitions[ev.type].name} · ${DATA.knockoutStages[ev.stage]}`
          };
        }
      }
      // событие не про нас — доигрываем его без участия менеджера
      this.resolveEventWithoutUser(ev);
      this.data.calendarIndex++;
    }
    return null;
  },

  resolveEventWithoutUser(ev) {
    if (ev.type === 'league') {
      this.data.round = ev.round;
      this.playOtherFixturesThisRound();
    } else {
      const br = this.bracketFor(ev.type);
      if (br) this.resolveBracketStage(br, ev.stage, null);
    }
  },

  /* Разыгрывает стадию сетки. Матч менеджера приходит готовым счётом,
     остальные пары считаются быстрым симулятором. Ничья в плей-офф
     решается серией пенальти со смещением в сторону более сильных. */
  resolveBracketStage(br, stage, userResult) {
    const ties = br.ties[stage];
    if (!ties) return;
    const results = [];
    const winners = [];

    ties.forEach(([a, b]) => {
      let ga, gb;
      const isUserTie = a === 'user' || b === 'user';
      if (isUserTie && userResult) {
        ga = a === 'user' ? userResult.userGoals : userResult.oppGoals;
        gb = b === 'user' ? userResult.userGoals : userResult.oppGoals;
      } else {
        const r = this.simulateQuickMatch(a, b);
        ga = r.gh; gb = r.ga;
      }
      let winner, shootout = false;
      if (ga === gb) {
        shootout = true;
        const pa = this.clubPower(a).attack, pb = this.clubPower(b).attack;
        winner = Math.random() < pa / (pa + pb) ? a : b;
      } else {
        winner = ga > gb ? a : b;
      }
      results.push({ a, b, ga, gb, winner, shootout });
      winners.push(winner);
    });

    br.results[stage] = results;
    if (winners.length > 1) {
      const next = [];
      for (let i = 0; i < winners.length; i += 2) next.push([winners[i], winners[i + 1]]);
      br.ties[stage + 1] = next;
      br.stage = stage + 1;
    } else {
      br.winner = winners[0];
      br.stage = stage + 1;
    }
    if (!winners.includes('user')) br.userOut = true;
  },

  /* Двигает календарь после матча менеджера. Возвращает итоги сезона,
     если он на этом закончился. */
  advanceAfterUserMatch(ev, userResult) {
    if (ev.type === 'league') {
      this.playOtherFixturesThisRound();
    } else {
      const br = this.bracketFor(ev.type);
      if (br) {
        this.resolveBracketStage(br, ev.stage, userResult);
        if (br.winner === 'user') this.awardTrophy(ev.type);
      }
    }
    this.data.calendarIndex++;

    let summary = null;
    if (this.data.calendarIndex >= this.data.calendar.length) summary = this.endSeason();
    this.persist();
    return summary;
  },

  awardTrophy(type) {
    this.data.trophies.push({
      type, season: this.data.season,
      division: type === 'league' ? this.data.division : null
    });
    if (type === 'cup') this.unlockAchievement('cup_win');
    if (type === 'world') this.unlockAchievement('world_win');
  },

  /* Призовые за место: сезон должен окупаться, иначе тренировкам и
     трансферам не на что жить. */
  seasonPrize(rank) {
    const table = [800, 550, 400, 300, 240, 190, 150, 110];
    return table[rank - 1] || 100;
  },

  /* Межсезонье: все на год старше, молодые прибавляют, ветераны сдают,
     а самые возрастные вешают бутсы на гвоздь. */
  ageSquad() {
    const grew = [], declined = [], retired = [];
    const survivors = [];

    this.data.squad.forEach(p => {
      p.age++;
      if (p.age >= 36 && this.data.squad.length - retired.length > 14) {
        retired.push({ name: p.name, age: p.age, goals: p.careerGoals + p.goals });
        return;
      }
      const before = overall(p);
      if (p.age <= 23) {
        const primary = p.pos === 'FWD' ? 'att' : p.pos === 'MID' ? 'skill' : 'def';
        p[primary] = clamp01to100(p[primary] + randInt(1, 4));
        p.skill = clamp01to100(p.skill + randInt(0, 2));
      } else if (p.age >= 31) {
        p.att = clamp01to100(p.att - randInt(1, 3));
        p.def = clamp01to100(p.def - randInt(1, 3));
        p.skill = clamp01to100(p.skill - randInt(0, 2));
      }
      const delta = overall(p) - before;
      if (delta > 0) grew.push({ name: p.name, age: p.age, delta });
      if (delta < 0) declined.push({ name: p.name, age: p.age, delta });
      survivors.push(p);
    });

    this.data.squad = survivors;

    /* Ушедших замещает молодёжь. Минимумы по линиям держат запас даже под
       формации с пятью защитниками или пятью полузащитниками. */
    const MIN_BY_POS = { GK: 2, DEF: 6, MID: 6, FWD: 4 };
    let guard = 0;
    while (this.data.squad.length < 18 && guard++ < 40) {
      const need = ['GK', 'DEF', 'MID', 'FWD'].find(pos =>
        this.data.squad.filter(p => p.pos === pos).length < MIN_BY_POS[pos]);
      if (!need) break;
      const kid = genPlayer(need, rand(50, 62));
      kid.age = randInt(17, 20);
      this.data.squad.push(kid);
      grew.push({ name: kid.name, age: kid.age, delta: 0, youth: true });
    }

    grew.sort((a, b) => b.delta - a.delta);
    declined.sort((a, b) => a.delta - b.delta);
    return { grew: grew.slice(0, 3), declined: declined.slice(0, 3), retired };
  },

  endSeason() {
    const d = this.data;
    const sorted = d.table.slice().sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
    const rank = sorted.findIndex(r => r.id === 'user') + 1;
    if (rank === 1) {
      this.unlockAchievement('league_complete');
      this.awardTrophy('league');
    }

    const me = sorted.find(r => r.id === 'user');
    const scorer = this.topScorers(1)[0] || null;
    const division = DATA.divisions.find(x => x.id === d.division);
    const summary = {
      season: d.season,
      rank,
      divisionName: division.name,
      champion: sorted[0].name,
      championIsUser: sorted[0].id === 'user',
      standings: sorted.map(r => ({ id: r.id, name: r.name, color: r.color, pts: r.pts })),
      record: { w: me.w, d: me.d, l: me.l, gf: me.gf, ga: me.ga },
      topScorer: scorer ? { name: scorer.name, goals: scorer.goals } : null,
      cupWinner: d.cup && d.cup.winner ? this.teamName(d.cup.winner) : null,
      cupIsUser: d.cup && d.cup.winner === 'user',
      worldWinner: d.world && d.world.winner ? this.teamName(d.world.winner) : null,
      worldIsUser: d.world && d.world.winner === 'user'
    };

    /* Первые два места выводят в Высшую лигу, два последних отправляют
       обратно — путь наверх и есть основная дуга карьеры. */
    summary.movement = null;
    if (d.division === 2 && rank <= 2) {
      d.division = 1;
      summary.movement = 'up';
      this.unlockAchievement('promoted');
    } else if (d.division === 1 && rank >= sorted.length - 1) {
      d.division = 2;
      summary.movement = 'down';
    }
    summary.newDivisionName = DATA.divisions.find(x => x.id === d.division).name;

    summary.prize = this.seasonPrize(rank) * (d.division === 1 || summary.movement === 'up' ? 1.5 : 1);
    summary.prize = Math.round(summary.prize);
    this.addCoins(summary.prize);
    Object.assign(summary, this.ageSquad());

    // Голы копятся в карьерный итог, сезонный счётчик стартует заново.
    d.squad.forEach(p => { p.careerGoals += p.goals; p.goals = 0; });
    d.season++;
    d.round = 0;
    d.fixtures = generateFixtures(d.division);
    d.table = buildTable(d.division, d.clubName);
    d.calendar = buildCalendar(d.season);
    d.calendarIndex = 0;
    d.cup = buildCup(d.division);
    d.world = d.calendar.some(e => e.type === 'world') ? buildWorld() : null;

    // Новый сезон: соперники подрастают, состав выходит из отпуска здоровым.
    DATA.everyClub.forEach(c => { c.power = clampNum(c.power + randInt(-2, 3), 45, 92); });
    d.squad.forEach(p => {
      p.injuredFor = 0; p.suspendedFor = 0; p.yellows = 0;
      p.fitness = 100;
    });
    this.persist();
    return summary;
  },

  teamName(id) {
    if (id === 'user') return this.data.clubName;
    const c = DATA.findClub(id);
    return c ? c.name : '—';
  },

  teamColor(id) {
    if (id === 'user') {
      const k = DATA.kitColors.find(x => x.id === this.data.kit);
      return k ? k.color : '#22d3ee';
    }
    const c = DATA.findClub(id);
    return c ? c.color : '#879A8E';
  },

  // ---------------- TRANSFER MARKET ----------------
  refreshTransferPool() {
    const pool = [];
    for (let i = 0; i < 6; i++) {
      const pos = choice(['GK', 'DEF', 'MID', 'FWD']);
      const p = genPlayer(pos, rand(55, 82));
      p.price = Math.round(overall(p) * 14 * rand(0.9, 1.15));
      pool.push(p);
    }
    this.data.transferPool = pool;
    this.persist();
  },

  buyPlayer(playerId) {
    const idx = this.data.transferPool.findIndex(p => p.id === playerId);
    if (idx === -1) return false;
    const p = this.data.transferPool[idx];
    if (!this.spendCoins(p.price)) return false;
    delete p.price;
    this.data.squad.push(p);
    this.data.transferPool.splice(idx, 1);
    this.unlockAchievement('transfer_done');
    this.persist();
    return true;
  },

  sellPlayer(playerId) {
    if (this.data.squad.length <= 13) return false;
    const idx = this.data.squad.findIndex(p => p.id === playerId);
    if (idx === -1) return false;
    const refund = Math.round(overall(this.data.squad[idx]) * 9);
    this.data.squad.splice(idx, 1);
    this.addCoins(refund);
    return refund;
  }
};

function effectiveRating(p) {
  return overall(p) * (0.7 + 0.3 * p.fitness / 100) * (0.85 + 0.15 * p.morale / 100);
}

function clampNum(v, a, b) { return Math.max(a, Math.min(b, v)); }

function poisson(lambda) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}
