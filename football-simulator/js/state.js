const STORAGE_KEY = 'futbolx_manager_save_v1';

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
    morale: randInt(65, 90)
  };
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

function generateFixtures() {
  const teamIds = ['user'].concat(DATA.clubs.map(c => c.id));
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

function defaultSave() {
  const basePower = 62;
  return {
    clubName: 'FC Аврора',
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
    fixtures: generateFixtures(),
    table: ['user'].concat(DATA.clubs.map(c => c.id)).map(id =>
      id === 'user' ? emptyTableRow('user', 'FC Аврора', '#22d3ee')
        : emptyTableRow(id, DATA.clubs.find(c => c.id === id).name, DATA.clubs.find(c => c.id === id).color)
    ),
    achievements: {},
    stats: { goals: 0, wins: 0, matches: 0 }
  };
}

const Save = {
  data: null,

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      this.data = raw ? Object.assign(defaultSave(), JSON.parse(raw)) : defaultSave();
    } catch (e) {
      this.data = defaultSave();
    }
    if (!this.data.squad || !this.data.squad.length) this.data.squad = genSquad(62);
    if (!this.data.fixtures || !this.data.fixtures.length) this.data.fixtures = generateFixtures();
    if (!this.data.table || !this.data.table.length) {
      this.data.table = ['user'].concat(DATA.clubs.map(c => c.id)).map(id =>
        id === 'user' ? emptyTableRow('user', this.data.clubName, '#22d3ee')
          : emptyTableRow(id, DATA.clubs.find(c => c.id === id).name, DATA.clubs.find(c => c.id === id).color)
      );
    }
    this.data.table.find(r => r.id === 'user').name = this.data.clubName;
    return this.data;
  },

  persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); } catch (e) {}
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
  bestXI() {
    const f = DATA.formations[this.data.formation];
    const squad = this.data.squad;
    const byPos = pos => squad.filter(p => p.pos === pos).sort((a, b) => effectiveRating(b) - effectiveRating(a));
    const gk = byPos('GK').slice(0, 1);
    const def = byPos('DEF').slice(0, f.def);
    const mid = byPos('MID').slice(0, f.mid);
    const fwd = byPos('FWD').slice(0, f.fwd);
    return { gk, def, mid, fwd, all: gk.concat(def, mid, fwd) };
  },

  teamStrength() {
    const xi = this.bestXI();
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
      defense: baseDef * tactic.defMul * weather.defMul,
      xi
    };
  },

  applyFatigue(xi) {
    xi.all.forEach(p => {
      p.fitness = clamp01to100(p.fitness - randInt(6, 16));
      p.morale = clamp01to100(p.morale + randInt(-3, 6));
    });
    this.data.squad.forEach(p => {
      if (!xi.all.includes(p)) p.fitness = clamp01to100(p.fitness + randInt(4, 10));
    });
    this.persist();
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
    const c = DATA.clubs.find(x => x.id === id);
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

  advanceRound() {
    this.data.round++;
    if (this.data.round >= this.data.fixtures.length) {
      this.endSeason();
    }
    this.persist();
  },

  endSeason() {
    const sorted = this.data.table.slice().sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
    const rank = sorted.findIndex(r => r.id === 'user') + 1;
    if (rank === 1) this.unlockAchievement('league_complete');
    this.data.season++;
    this.data.round = 0;
    this.data.fixtures = generateFixtures();
    this.data.table = ['user'].concat(DATA.clubs.map(c => c.id)).map(id =>
      id === 'user' ? emptyTableRow('user', this.data.clubName, '#22d3ee')
        : emptyTableRow(id, DATA.clubs.find(c => c.id === id).name, DATA.clubs.find(c => c.id === id).color)
    );
    DATA.clubs.forEach(c => { c.power = clampNum(c.power + randInt(-2, 4), 45, 96); });
    this.persist();
    return rank;
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
