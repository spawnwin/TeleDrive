/* Game state, career loop, persistence */
window.EYE_STATE = (() => {
  const KEY = 'eye_manager_v1';
  let state = null;

  const D = () => window.EYE_DATA;
  const E = () => window.EYE_ENGINE;

  function money(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.00$/, '') + ' млн ₽';
    if (n >= 1e3) return Math.round(n / 1e3) + ' тыс ₽';
    return Math.round(n) + ' ₽';
  }

  function emptySeasonTable(clubs) {
    const t = {};
    clubs.forEach(c => {
      t[c.id] = { id: c.id, name: c.name, color: c.color, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
    });
    return t;
  }

  function buildFixtures(clubIds) {
    // double round-robin
    const ids = [...clubIds];
    const fixtures = [];
    const n = ids.length;
    // circle method
    const arr = ids.slice(1);
    const rounds = n - 1;
    for (let r = 0; r < rounds; r++) {
      const round = [];
      const left = [ids[0], ...arr.slice(0, (n / 2) - 1)];
      const right = arr.slice((n / 2) - 1).reverse();
      for (let i = 0; i < left.length; i++) {
        if (r % 2 === 0) round.push({ home: left[i], away: right[i] });
        else round.push({ home: right[i], away: left[i] });
      }
      fixtures.push(round);
      arr.unshift(arr.pop());
    }
    // second leg
    const second = fixtures.map(round => round.map(m => ({ home: m.away, away: m.home })));
    return [...fixtures, ...second].map((round, i) => ({
      round: i + 1,
      matches: round.map(m => ({ ...m, played: false, score: null }))
    }));
  }

  function createCareer({ managerName, clubName, color, formation, style, leagueId }) {
    const league = D().LEAGUES.find(l => l.id === leagueId) || D().LEAGUES[1];
    const baseOvr = league.tier === 1 ? 74 : league.tier === 2 ? 66 : 58;
    const player = D().genClub(clubName, color, baseOvr, league.id);
    player.formation = formation || '4-3-3';
    player.style = style || 'balance';
    player.budget = league.tier === 1 ? 8e6 : league.tier === 2 ? 3.2e6 : 1.1e6;
    player.isPlayer = true;

    const others = D().genLeagueClubs(league, clubName);
    const clubs = [player, ...others];
    const fixtures = buildFixtures(clubs.map(c => c.id));

    state = {
      version: 1,
      createdAt: Date.now(),
      managerName,
      season: 1,
      week: 1,
      day: 1,
      phase: 'season', // season | offseason
      clubId: player.id,
      clubs,
      leagueId: league.id,
      table: emptySeasonTable(clubs),
      fixtures,
      inbox: [
        { id: D().uid('m'), type: 'welcome', title: 'Добро пожаловать в EYE', body: `Контракт с «${clubName}» подписан. Сезон ${1} открыт. Глаз видит всё — управляй остро.`, read: false, at: Date.now() }
      ],
      history: [],
      transferList: generateMarket(clubs, player),
      news: [],
      settings: { sfx: true, speed: 1 },
      lastResult: null,
      cup: createCup(clubs)
    };
    save();
    return state;
  }

  function createCup(clubs) {
    const ids = clubs.map(c => c.id).sort(() => Math.random() - 0.5).slice(0, 8);
    return {
      round: '1/4',
      bracket: ids.map((id, i) => i % 2 === 0 ? { home: id, away: ids[i + 1], played: false, score: null } : null).filter(Boolean),
      champion: null
    };
  }

  function generateMarket(clubs, playerClub) {
    const list = [];
    // free agents
    for (let i = 0; i < 18; i++) {
      const pos = D().pick(['GK','CB','RB','LB','CM','CDM','CAM','ST','RW','LW']);
      const p = D().genPlayer(pos, D().rnd(58, 82));
      p.listed = true;
      p.ask = Math.round(p.value * (1.05 + Math.random() * 0.35));
      list.push({ type: 'free', player: p, clubId: null });
    }
    // listed from other clubs
    clubs.filter(c => c.id !== playerClub.id).forEach(c => {
      c.squad.slice().sort((a, b) => a.ovr - b.ovr).slice(0, 2).forEach(p => {
        list.push({ type: 'transfer', player: p, clubId: c.id, ask: Math.round(p.value * 1.15) });
      });
    });
    return list;
  }

  function get() { return state; }
  function club() { return state?.clubs.find(c => c.id === state.clubId); }
  function clubById(id) { return state?.clubs.find(c => c.id === id); }

  function save() {
    if (!state) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn(e); }
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      state = JSON.parse(raw);
      return state;
    } catch { return null; }
  }

  function clear() {
    localStorage.removeItem(KEY);
    state = null;
  }

  function currentFixture() {
    if (!state) return null;
    return state.fixtures.find(r => r.matches.some(m => !m.played)) || null;
  }

  function playerMatch() {
    const round = currentFixture();
    if (!round) return null;
    return round.matches.find(m => (m.home === state.clubId || m.away === state.clubId) && !m.played) || null;
  }

  function simulateAIMatch(home, away) {
    return E().simulateMatch(home, away);
  }

  function applyResultToTable(homeId, awayId, score) {
    const ht = state.table[homeId];
    const at = state.table[awayId];
    const [hg, ag] = score;
    ht.played++; at.played++;
    ht.gf += hg; ht.ga += ag; at.gf += ag; at.ga += hg;
    if (hg > ag) { ht.w++; at.l++; ht.pts += 3; }
    else if (hg < ag) { at.w++; ht.l++; at.pts += 3; }
    else { ht.d++; at.d++; ht.pts++; at.pts++; }
  }

  function finishRoundExcept(playerMatchKey) {
    const round = currentFixture();
    if (!round) return;
    round.matches.forEach(m => {
      if (m.played) return;
      if (playerMatchKey && m.home === playerMatchKey.home && m.away === playerMatchKey.away) return;
      const home = clubById(m.home);
      const away = clubById(m.away);
      const res = simulateAIMatch(home, away);
      m.played = true;
      m.score = res.score;
      applyResultToTable(m.home, m.away, res.score);
    });
  }

  function recordPlayerMatch(match, result) {
    match.played = true;
    match.score = result.score;
    applyResultToTable(match.home, match.away, result.score);

    const me = club();
    const [hg, ag] = result.score;
    const isHome = match.home === me.id;
    const myGoals = isHome ? hg : ag;
    const oppGoals = isHome ? ag : hg;
    let prize = 0;
    if (myGoals > oppGoals) { prize = 180000; me.morale = Math.min(100, me.morale + 4); }
    else if (myGoals === oppGoals) { prize = 70000; me.morale = Math.min(100, me.morale + 1); }
    else { prize = 25000; me.morale = Math.max(20, me.morale - 3); }
    // attendance income
    const income = Math.round(me.fans * (0.8 + me.facilities.stadium * 0.25) * (12 + Math.random() * 8));
    me.budget += prize + income;

    state.lastResult = {
      ...result,
      prize, income,
      opponent: isHome ? clubById(match.away).name : clubById(match.home).name
    };
    state.history.unshift({
      at: Date.now(), season: state.season, week: state.week,
      home: result.home, away: result.away, score: result.score
    });
    state.news.unshift({
      id: D().uid('n'),
      title: myGoals > oppGoals ? 'Победа!' : myGoals === oppGoals ? 'Ничья' : 'Поражение',
      body: `${result.home} ${result.score[0]}:${result.score[1]} ${result.away}`,
      at: Date.now()
    });

    finishRoundExcept(match);
    advanceWeek();
    save();
  }

  function advanceWeek() {
    state.week++;
    const me = club();
    // wages
    const wages = me.squad.reduce((s, p) => s + (p.wage || 0), 0);
    me.budget -= wages;
    // recovery
    me.squad.forEach(p => {
      if (p.injured > 0) {
        p.injured = Math.max(0, p.injured - 1);
      } else {
        p.condition = Math.min(100, (p.condition || 70) + 6 + me.facilities.medical);
        p.energy = Math.min(100, (p.energy || 70) + 10);
      }
      p.form = Math.max(30, Math.min(95, (p.form || 60) + D().rnd(-2, 2)));
    });
    // age / season end
    const allPlayed = state.fixtures.every(r => r.matches.every(m => m.played));
    if (allPlayed) endSeason();
  }

  function sortedTable() {
    return Object.values(state.table).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
  }

  function endSeason() {
    const table = sortedTable();
    const me = club();
    const pos = table.findIndex(t => t.id === me.id) + 1;
    const league = D().LEAGUES.find(l => l.id === state.leagueId);
    const prize = Math.round(league.prize * (1.15 - (pos - 1) * 0.07));
    me.budget += prize;

    // aging
    state.clubs.forEach(c => {
      c.squad.forEach(p => {
        p.age++;
        if (p.age > 32 && Math.random() < 0.35) p.ovr = Math.max(45, p.ovr - 1);
        if (p.age < 24 && p.ovr < p.pot && Math.random() < 0.55) p.ovr = Math.min(p.pot, p.ovr + 1);
        p.seasonGoals = 0; p.seasonApps = 0;
      });
    });

    state.inbox.unshift({
      id: D().uid('m'), type: 'season',
      title: `Сезон ${state.season} завершён`,
      body: `Место: ${pos}. Призовые: ${money(prize)}. Новый сезон стартует.`,
      read: false, at: Date.now()
    });

    state.season++;
    state.week = 1;
    state.table = emptySeasonTable(state.clubs);
    state.fixtures = buildFixtures(state.clubs.map(c => c.id));
    state.transferList = generateMarket(state.clubs, me);
    state.cup = createCup(state.clubs);
    save();
  }

  function train(typeId) {
    const me = club();
    const t = D().TRAINING.find(x => x.id === typeId);
    if (!t) return { ok: false, msg: 'Нет такой тренировки' };
    const cost = 8000 + me.facilities.training * 2000;
    if (me.budget < cost) return { ok: false, msg: 'Не хватает бюджета' };
    me.budget -= cost;
    const boost = t.boost + me.facilities.training;
    me.squad.forEach(p => {
      if (p.injured) return;
      if (t.focus === 'condition') {
        p.condition = Math.min(100, p.condition + boost);
        p.energy = Math.min(100, p.energy + boost);
      } else {
        p[t.focus] = Math.min(99, (p[t.focus] || 60) + (Math.random() < 0.55 ? 1 : 0));
        if (Math.random() < 0.12 + me.facilities.training * 0.02) p.ovr = Math.min(p.pot, p.ovr + 1);
        p.condition = Math.max(45, p.condition - 3);
        p.form = Math.min(99, p.form + 1);
      }
    });
    save();
    return { ok: true, msg: `Тренировка «${t.name}» проведена (−${money(cost)})` };
  }

  function buyPlayer(entryId) {
    const me = club();
    const entry = state.transferList.find(e => e.player.id === entryId || (e.player.id + e.clubId) === entryId);
    // find by player id
    const item = state.transferList.find(e => e.player.id === entryId);
    if (!item) return { ok: false, msg: 'Игрок снят с рынка' };
    const price = item.ask || item.player.ask || item.player.value;
    if (me.budget < price) return { ok: false, msg: 'Недостаточно средств' };
    if (me.squad.length >= 28) return { ok: false, msg: 'Лимит состава 28' };
    me.budget -= price;
    const p = { ...item.player, listed: false };
    if (item.clubId) {
      const seller = clubById(item.clubId);
      if (seller) {
        seller.squad = seller.squad.filter(x => x.id !== p.id);
        seller.budget += price;
      }
    }
    me.squad.push(p);
    state.transferList = state.transferList.filter(e => e.player.id !== p.id);
    save();
    return { ok: true, msg: `${p.name} в составе (−${money(price)})` };
  }

  function sellPlayer(playerId) {
    const me = club();
    const p = me.squad.find(x => x.id === playerId);
    if (!p) return { ok: false, msg: 'Нет игрока' };
    if (me.squad.length <= 16) return { ok: false, msg: 'Слишком мало игроков' };
    const offer = Math.round(p.value * (0.85 + Math.random() * 0.25));
    me.squad = me.squad.filter(x => x.id !== playerId);
    me.budget += offer;
    save();
    return { ok: true, msg: `${p.name} продан за ${money(offer)}` };
  }

  function upgradeFacility(id) {
    const me = club();
    const f = D().FACILITIES.find(x => x.id === id);
    if (!f) return { ok: false, msg: 'Нет объекта' };
    const level = me.facilities[id] || 1;
    if (level >= f.max) return { ok: false, msg: 'Максимум' };
    const cost = Math.round(f.base * Math.pow(1.65, level - 1));
    if (me.budget < cost) return { ok: false, msg: 'Нужно ' + money(cost) };
    me.budget -= cost;
    me.facilities[id] = level + 1;
    if (id === 'stadium') me.fans = Math.round(me.fans * 1.12);
    save();
    return { ok: true, msg: `${f.name} → ур. ${level + 1}` };
  }

  function promoteYouth() {
    const me = club();
    const cost = 120000 - me.facilities.youth * 15000;
    if (me.budget < cost) return { ok: false, msg: 'Нужно ' + money(cost) };
    if (me.squad.length >= 28) return { ok: false, msg: 'Состав полон' };
    me.budget -= cost;
    const pos = D().pick(['CB','CM','ST','RW','LW','RB','LB','CAM']);
    const base = 52 + me.facilities.youth * 4 + D().rnd(0, 6);
    const p = D().genPlayer(pos, base, D().rnd(16, 19));
    p.pot = Math.min(94, p.ovr + D().rnd(8, 18));
    me.squad.push(p);
    save();
    return { ok: true, msg: `Академия: ${p.name} (${D().POS_LABEL[pos]}, ${p.ovr})`, player: p };
  }

  function setTactics(formation, style) {
    const me = club();
    if (formation && D().FORMATIONS[formation]) me.formation = formation;
    if (style) me.style = style;
    save();
  }

  function setLineup(ids) {
    const me = club();
    const map = Object.fromEntries(me.squad.map(p => [p.id, p]));
    const ordered = ids.map(id => map[id]).filter(Boolean);
    const rest = me.squad.filter(p => !ids.includes(p.id));
    me.squad = [...ordered, ...rest];
    me.lineup = ordered.slice(0, 11);
    save();
  }

  function autoLineup() {
    const me = club();
    const slots = D().FORMATIONS[me.formation].slots;
    const used = new Set();
    const xi = slots.map(slot => {
      const g = D().POS_GROUP[slot];
      const pool = me.squad
        .filter(p => !used.has(p.id) && !p.injured)
        .map(p => {
          const pg = D().POS_GROUP[p.pos];
          let score = p.ovr + (p.form || 0) / 10 + (p.condition || 0) / 20;
          if (pg === g) score += 12;
          if (p.pos === slot) score += 8;
          return { p, score };
        })
        .sort((a, b) => b.score - a.score);
      const pick = pool[0]?.p || me.squad.find(p => !used.has(p.id));
      if (pick) used.add(pick.id);
      return pick;
    }).filter(Boolean);
    setLineup(xi.map(p => p.id));
    return xi;
  }

  return {
    KEY, money, createCareer, get, club, clubById, save, load, clear,
    currentFixture, playerMatch, recordPlayerMatch, sortedTable,
    train, buyPlayer, sellPlayer, upgradeFacility, promoteYouth,
    setTactics, setLineup, autoLineup, finishRoundExcept
  };
})();
