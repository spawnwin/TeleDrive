const STORAGE_KEY = 'futbolx_save_v1';

function defaultSave() {
  return {
    clubName: 'FC Аврора',
    level: 1,
    xp: 0,
    coins: 200,
    kit: 'cyan',
    ball: 'classic',
    ownedKits: ['cyan'],
    ownedBalls: ['classic'],
    ownedStadiums: ['city'],
    ownedAbilities: ['fireshot'],
    equippedAbility: 'fireshot',
    careerIndex: 0,
    careerWins: 0,
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
    const key = { kits: 'ownedKits', balls: 'ownedBalls', stadiums: 'ownedStadiums', abilities: 'ownedAbilities' }[category];
    return this.data[key].includes(id);
  },

  buy(category, id, cost) {
    if (!this.spendCoins(cost)) return false;
    const key = { kits: 'ownedKits', balls: 'ownedBalls', stadiums: 'ownedStadiums', abilities: 'ownedAbilities' }[category];
    this.data[key].push(id);
    this.persist();
    return true;
  },

  unlockAchievement(id) {
    if (this.data.achievements[id]) return false;
    this.data.achievements[id] = true;
    this.persist();
    return true;
  }
};
