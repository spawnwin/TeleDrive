/* Game state — real world leagues, transfers, stats */
window.EYE_STATE = (() => {
  const KEY = 'eye_manager_v2';
  let state = null;

  const D = () => window.EYE_DATA;
  const E = () => window.EYE_ENGINE;
  const W = () => window.EYE_WORLD;
  const I18N = () => window.EYE_I18N;

  /** Все суммы внутри — в евро. Отображение: EUR / RUB / USD */
  function currencyInfo(code) {
    const id = code || getCurrency();
    return I18N().CURRENCIES[id] || I18N().CURRENCIES.RUB;
  }

  function getCurrency() {
    if (state?.displayCurrency) return state.displayCurrency;
    try { return localStorage.getItem('eye_currency') || 'RUB'; } catch { return 'RUB'; }
  }

  function setCurrency(code) {
    if (!I18N().CURRENCIES[code]) return false;
    try { localStorage.setItem('eye_currency', code); } catch {}
    if (state) { state.displayCurrency = code; save(); }
    return true;
  }

  function money(n, forceCode) {
    const cur = currencyInfo(forceCode);
    const val = (Number(n) || 0) * cur.rate;
    const abs = Math.abs(val);
    const sign = val < 0 ? '−' : '';
    const sym = cur.symbol;
    if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2).replace(/\.00$/, '') + ' млрд ' + sym;
    if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2).replace(/\.00$/, '') + ' млн ' + sym;
    if (abs >= 1e3) return sign + Math.round(abs / 1e3).toLocaleString('ru-RU') + ' тыс ' + sym;
    return sign + Math.round(abs).toLocaleString('ru-RU') + ' ' + sym;
  }

  function moneyHint(n) {
    return `${money(n, 'RUB')} · ${money(n, 'USD')} · ${money(n, 'EUR')}`;
  }

  function emptySeasonTable(clubs) {
    const t = {};
    clubs.forEach(c => {
      t[c.id] = { id: c.id, name: c.name, short: c.short, color: c.color, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
    });
    return t;
  }

  function buildFixtures(clubIds) {
    const ids = [...clubIds];
    const fixtures = [];
    const n = ids.length;
    if (n < 2) return [];
    const arr = ids.slice(1);
    const rounds = n - 1;
    for (let r = 0; r < rounds; r++) {
      const round = [];
      const left = [ids[0], ...arr.slice(0, (n / 2) - 1)];
      const right = arr.slice((n / 2) - 1).reverse();
      for (let i = 0; i < left.length; i++) {
        if (!left[i] || !right[i]) continue;
        if (r % 2 === 0) round.push({ home: left[i], away: right[i] });
        else round.push({ home: right[i], away: left[i] });
      }
      fixtures.push(round);
      arr.unshift(arr.pop());
    }
    const second = fixtures.map(round => round.map(m => ({ home: m.away, away: m.home })));
    return [...fixtures, ...second].map((round, i) => ({
      round: i + 1,
      matches: round.map(m => ({ ...m, played: false, score: null }))
    }));
  }

  function createCareer({ managerName, clubId, formation, style }) {
    const tpl = W().clubTemplate(clubId);
    if (!tpl) throw new Error('club not found');
    const league = W().leagueById(tpl.leagueId);
    const allClubs = D().buildWorldClubs();
    const me = allClubs.find(c => c.id === clubId);
    me.isPlayer = true;
    me.formation = formation || me.formation;
    me.style = style || 'balance';
    // starter budget boost for player
    me.budget = Math.round(me.budget * 1.05);

    const leagueClubs = allClubs.filter(c => c.leagueId === league.id);
    const fixtures = buildFixtures(leagueClubs.map(c => c.id));

    state = {
      version: 2,
      createdAt: Date.now(),
      managerName,
      season: 1,
      week: 1,
      day: 1,
      phase: 'season',
      clubId: me.id,
      clubs: allClubs,
      leagueId: league.id,
      leagueName: league.name,
      displayCurrency: getCurrency(),
      table: emptySeasonTable(leagueClubs),
      fixtures,
      inbox: [{
        id: D().uid('m'), type: 'welcome', title: 'Добро пожаловать в EYE',
        body: `Вы возглавили «${me.name}» (${league.name}). В мире ${allClubs.length} клубов — трансферы открыты. Валюту можно сменить в настройках.`,
        read: false, at: Date.now()
      }],
      history: [],
      transferList: [],
      transferOffers: [],
      news: [],
      settings: { sfx: true, speed: 1 },
      lastResult: null,
      cup: createCup(leagueClubs),
      stats: { scorers: {}, assisters: {} }
    };
    refreshTransferMarket();
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

  function refreshTransferMarket() {
    if (!state) return;
    const me = club();
    const list = [];
    // Free agents
    for (let i = 0; i < 24; i++) {
      const pos = D().pick(['GK','CB','RB','LB','CM','CDM','CAM','ST','RW','LW']);
      const p = D().genPlayer(pos, D().rnd(62, 84));
      p.listed = true;
      p.ask = Math.round(p.value * (0.9 + Math.random() * 0.25));
      list.push({ id: D().uid('t'), type: 'free', player: p, clubId: null, ask: p.ask, wageAsk: Math.round(p.wage * 1.1) });
    }
    // Listed / available from every other club
    state.clubs.forEach(c => {
      if (c.id === me.id) return;
      const sorted = [...c.squad].sort((a, b) => a.ovr - b.ovr);
      // weaker / aging more likely listed
      sorted.forEach((p, idx) => {
        const listChance = p.age >= 30 ? 0.35 : p.ovr < c.reputation - 8 ? 0.28 : idx < 3 ? 0.4 : 0.08;
        if (Math.random() < listChance) {
          const ask = Math.round(p.value * (1.05 + Math.random() * 0.4));
          list.push({
            id: D().uid('t'), type: 'transfer', player: p, clubId: c.id,
            clubName: c.name, leagueId: c.leagueId, ask, wageAsk: Math.round(p.wage * 1.15)
          });
        }
      });
    });
    // Always expose some stars as "hard to get"
    state.clubs.filter(c => c.id !== me.id).forEach(c => {
      const stars = c.squad.filter(p => p.real && p.ovr >= 84).slice(0, 2);
      stars.forEach(p => {
        if (list.some(x => x.player.id === p.id)) return;
        list.push({
          id: D().uid('t'), type: 'star', player: p, clubId: c.id,
          clubName: c.name, leagueId: c.leagueId,
          ask: Math.round(p.value * (1.4 + Math.random() * 0.5)),
          wageAsk: Math.round(p.wage * 1.35)
        });
      });
    });
    state.transferList = list;
  }

  function filterMarket({ pos, maxPrice, minOvr, maxAge, leagueId, q } = {}) {
    let list = [...(state?.transferList || [])];
    if (pos && pos !== 'ALL') list = list.filter(e => e.player.pos === pos || D().POS_GROUP[e.player.pos] === pos);
    if (maxPrice) list = list.filter(e => e.ask <= maxPrice);
    if (minOvr) list = list.filter(e => e.player.ovr >= minOvr);
    if (maxAge) list = list.filter(e => e.player.age <= maxAge);
    if (leagueId && leagueId !== 'ALL') list = list.filter(e => e.leagueId === leagueId || e.type === 'free');
    if (q) {
      const s = q.toLowerCase();
      list = list.filter(e => e.player.name.toLowerCase().includes(s) || (e.clubName || '').toLowerCase().includes(s));
    }
    return list.sort((a, b) => b.player.ovr - a.player.ovr);
  }

  function get() { return state; }
  function club() { return state?.clubs.find(c => c.id === state.clubId); }
  function clubById(id) { return state?.clubs.find(c => c.id === id); }
  function leagueClubs() { return state?.clubs.filter(c => c.leagueId === state.leagueId) || []; }

  function save() {
    if (!state) return;
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) { console.warn('save', e); }
  }

  function load() {
    try {
      if (typeof localStorage === 'undefined') return null;
      let raw = localStorage.getItem(KEY);
      if (!raw) {
        raw = localStorage.getItem('eye_manager_v1');
        if (!raw) return null;
      }
      state = JSON.parse(raw);
      if (!state.displayCurrency) state.displayCurrency = getCurrency();
      if (!state.transferList?.length) refreshTransferMarket();
      return state;
    } catch { return null; }
  }

  function clear() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(KEY);
      localStorage.removeItem('eye_manager_v1');
    }
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

  function trackStats(result) {
    (result.scorersH || []).forEach(s => {
      state.stats.scorers[s.player.id] = state.stats.scorers[s.player.id] || { id: s.player.id, name: s.player.name, club: result.home, goals: 0, assists: 0 };
      state.stats.scorers[s.player.id].goals++;
      if (s.assist) {
        state.stats.scorers[s.assist.id] = state.stats.scorers[s.assist.id] || { id: s.assist.id, name: s.assist.name, club: result.home, goals: 0, assists: 0 };
        state.stats.scorers[s.assist.id].assists++;
        s.assist.seasonAssists = (s.assist.seasonAssists || 0) + 1;
      }
    });
    (result.scorersA || []).forEach(s => {
      state.stats.scorers[s.player.id] = state.stats.scorers[s.player.id] || { id: s.player.id, name: s.player.name, club: result.away, goals: 0, assists: 0 };
      state.stats.scorers[s.player.id].goals++;
      if (s.assist) {
        state.stats.scorers[s.assist.id] = state.stats.scorers[s.assist.id] || { id: s.assist.id, name: s.assist.name, club: result.away, goals: 0, assists: 0 };
        state.stats.scorers[s.assist.id].assists++;
        s.assist.seasonAssists = (s.assist.seasonAssists || 0) + 1;
      }
    });
  }

  function applyResultToTable(homeId, awayId, score) {
    const ht = state.table[homeId];
    const at = state.table[awayId];
    if (!ht || !at) return;
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
      if (!home || !away) { m.played = true; m.score = [0, 0]; return; }
      const res = simulateAIMatch(home, away);
      m.played = true;
      m.score = res.score;
      applyResultToTable(m.home, m.away, res.score);
      trackStats(res);
    });
  }

  function recordPlayerMatch(match, result) {
    match.played = true;
    match.score = result.score;
    applyResultToTable(match.home, match.away, result.score);
    trackStats(result);

    const me = club();
    const [hg, ag] = result.score;
    const isHome = match.home === me.id;
    const myGoals = isHome ? hg : ag;
    const oppGoals = isHome ? ag : hg;
    let prize = 0;
    if (myGoals > oppGoals) { prize = 250000; me.morale = Math.min(100, me.morale + 4); }
    else if (myGoals === oppGoals) { prize = 100000; me.morale = Math.min(100, me.morale + 1); }
    else { prize = 40000; me.morale = Math.max(20, me.morale - 3); }
    const income = Math.round(me.fans * (0.9 + me.facilities.stadium * 0.3) * (14 + Math.random() * 10));
    me.budget += prize + income;

    state.lastResult = {
      ...result, prize, income,
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
    // lightly sim other leagues for form/news
    simOtherLeaguesWeek();
    advanceWeek();
    save();
  }

  function simOtherLeaguesWeek() {
    const other = state.clubs.filter(c => c.leagueId !== state.leagueId);
    // random friendly results affecting form only
    for (let i = 0; i < Math.min(8, Math.floor(other.length / 2)); i++) {
      const a = other[D().rnd(0, other.length - 1)];
      const b = other[D().rnd(0, other.length - 1)];
      if (a.id === b.id) continue;
      const res = simulateAIMatch(a, b);
      // only form tick already applied inside sim
      if (Math.random() < 0.15) {
        state.news.unshift({
          id: D().uid('n'), title: `${a.leagueName || a.leagueId}`,
          body: `${res.home} ${res.score[0]}:${res.score[1]} ${res.away}`,
          at: Date.now()
        });
      }
    }
  }

  function advanceWeek() {
    state.week++;
    const me = club();
    const wages = me.squad.reduce((s, p) => s + (p.wage || 0), 0);
    me.budget -= wages;
    me.squad.forEach(p => {
      if (p.injured > 0) p.injured = Math.max(0, p.injured - 1);
      else {
        p.condition = Math.min(100, (p.condition || 70) + 6 + me.facilities.medical);
        p.energy = Math.min(100, (p.energy || 70) + 10);
      }
      p.form = Math.max(30, Math.min(95, (p.form || 60) + D().rnd(-2, 2)));
    });
    // AI clubs wage + recovery
    state.clubs.forEach(c => {
      if (c.id === me.id) return;
      c.squad.forEach(p => {
        if (p.injured > 0) p.injured--;
        else p.condition = Math.min(100, (p.condition || 70) + 5);
        p.form = Math.max(30, Math.min(95, (p.form || 60) + D().rnd(-2, 2)));
      });
    });
    if (state.week % 4 === 0) refreshTransferMarket();
    processIncomingOffers();
    const allPlayed = state.fixtures.every(r => r.matches.every(m => m.played));
    if (allPlayed) endSeason();
  }

  function sortedTable() {
    return Object.values(state.table).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
  }

  function topScorers(limit = 20) {
    return Object.values(state.stats.scorers || {})
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
      .slice(0, limit);
  }

  function endSeason() {
    const table = sortedTable();
    const me = club();
    const pos = table.findIndex(t => t.id === me.id) + 1;
    const league = W().leagueById(state.leagueId);
    const prize = Math.round((league?.prize || 1e6) * (1.1 - (pos - 1) * 0.06));
    me.budget += prize;

    state.clubs.forEach(c => {
      c.squad.forEach(p => {
        p.age++;
        if (p.age > 32 && Math.random() < 0.35) p.ovr = Math.max(45, p.ovr - 1);
        if (p.age < 24 && p.ovr < p.pot && Math.random() < 0.55) p.ovr = Math.min(p.pot, p.ovr + 1);
        p.seasonGoals = 0; p.seasonAssists = 0; p.seasonApps = 0;
      });
    });

    state.inbox.unshift({
      id: D().uid('m'), type: 'season',
      title: `Сезон ${state.season} завершён — ${state.leagueName}`,
      body: `Место: ${pos}. Призовые: ${money(prize)}. Новый сезон.`,
      read: false, at: Date.now()
    });

    state.season++;
    state.week = 1;
    const lc = leagueClubs();
    state.table = emptySeasonTable(lc);
    state.fixtures = buildFixtures(lc.map(c => c.id));
    state.stats = { scorers: {}, assisters: {} };
    state.cup = createCup(lc);
    refreshTransferMarket();
    save();
  }

  function train(typeId) {
    const me = club();
    const t = D().TRAINING.find(x => x.id === typeId);
    if (!t) return { ok: false, msg: 'Нет такой тренировки' };
    const cost = 12000 + me.facilities.training * 3000;
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
    return { ok: true, msg: `Тренировка «${t.name}» (−${money(cost)})` };
  }

  function makeOffer(entryId, bid, loan = false) {
    const me = club();
    const item = state.transferList.find(e => e.id === entryId || e.player.id === entryId);
    if (!item) return { ok: false, msg: 'Игрок снят с рынка' };
    const ask = item.ask;
    const offer = bid || ask;
    if (!loan && me.budget < offer) return { ok: false, msg: 'Недостаточно средств' };
    if (me.squad.length >= 30) return { ok: false, msg: 'Лимит состава 30' };

    // acceptance logic
    let accept = false;
    if (item.type === 'free') accept = offer >= ask * 0.85;
    else if (loan) accept = Math.random() < 0.55 + me.facilities.scout * 0.05;
    else {
      const ratio = offer / ask;
      const reluct = item.type === 'star' ? 0.25 : 0.1;
      accept = ratio >= 1 + reluct ? true : ratio >= 0.95 && Math.random() < 0.45 + me.reputation / 200;
    }

    if (!accept) {
      const counter = Math.round(ask * (1.05 + Math.random() * 0.15));
      state.inbox.unshift({
        id: D().uid('m'), type: 'transfer',
        title: `Отказ: ${item.player.name}`,
        body: `${item.clubName || 'Агент'} отклонил предложение ${money(offer)}. Контрпредложение: ${money(counter)}.`,
        read: false, at: Date.now()
      });
      save();
      return { ok: false, msg: `Отклонено. Хотят ~${money(counter)}`, counter };
    }

    return finalizeBuy(item, offer, loan);
  }

  function finalizeBuy(item, price, loan) {
    const me = club();
    const p = { ...item.player, listed: false, ask: 0, clubId: me.id };
    if (loan) {
      p.loan = true;
      p.loanFrom = item.clubId;
      me.budget -= Math.round((item.wageAsk || p.wage) * 0.5);
    } else {
      me.budget -= price;
      if (item.clubId) {
        const seller = clubById(item.clubId);
        if (seller) {
          seller.squad = seller.squad.filter(x => x.id !== p.id);
          seller.budget += price;
        }
      }
    }
    if (item.clubId && loan) {
      const seller = clubById(item.clubId);
      if (seller) seller.squad = seller.squad.filter(x => x.id !== p.id);
    }
    me.squad.push(p);
    state.transferList = state.transferList.filter(e => e.player.id !== item.player.id);
    state.news.unshift({
      id: D().uid('n'),
      title: loan ? 'Аренда' : 'Трансфер',
      body: `${p.name} → ${me.name}${loan ? ' (аренда)' : ' за ' + money(price)}`,
      at: Date.now()
    });
    save();
    return { ok: true, msg: loan ? `${p.name} арендован` : `${p.name} куплен за ${money(price)}` };
  }

  function buyPlayer(entryId) {
    return makeOffer(entryId, null, false);
  }

  function sellPlayer(playerId, minPrice) {
    const me = club();
    const p = me.squad.find(x => x.id === playerId);
    if (!p) return { ok: false, msg: 'Нет игрока' };
    if (me.squad.length <= 16) return { ok: false, msg: 'Слишком мало игроков' };
    const offer = minPrice || Math.round(p.value * (0.85 + Math.random() * 0.3));
    // find AI buyer
    const buyers = state.clubs.filter(c => c.id !== me.id && c.budget > offer && c.squad.length < 28);
    if (!buyers.length) {
      // list on market
      p.listed = true;
      p.ask = Math.round(p.value * 1.1);
      state.transferList.unshift({
        id: D().uid('t'), type: 'transfer', player: p, clubId: me.id,
        clubName: me.name, leagueId: me.leagueId, ask: p.ask, wageAsk: p.wage
      });
      save();
      return { ok: true, msg: `${p.name} выставлен за ${money(p.ask)}` };
    }
    const buyer = D().pick(buyers);
    me.squad = me.squad.filter(x => x.id !== playerId);
    me.budget += offer;
    buyer.squad.push({ ...p, clubId: buyer.id, listed: false });
    buyer.budget -= offer;
    state.news.unshift({
      id: D().uid('n'), title: 'Продажа',
      body: `${p.name}: ${me.name} → ${buyer.name} (${money(offer)})`,
      at: Date.now()
    });
    save();
    return { ok: true, msg: `${p.name} продан в ${buyer.name} за ${money(offer)}` };
  }

  function processIncomingOffers() {
    const me = club();
    if (Math.random() > 0.35) return;
    const targets = me.squad.filter(p => p.ovr >= 75).sort((a, b) => b.ovr - a.ovr).slice(0, 5);
    if (!targets.length) return;
    const p = D().pick(targets);
    const bidder = D().pick(state.clubs.filter(c => c.id !== me.id));
    const bid = Math.round(p.value * (0.9 + Math.random() * 0.5));
    state.transferOffers = state.transferOffers || [];
    state.transferOffers.push({
      id: D().uid('o'), playerId: p.id, playerName: p.name,
      fromId: bidder.id, fromName: bidder.name, bid, at: Date.now()
    });
    state.inbox.unshift({
      id: D().uid('m'), type: 'offer',
      title: `Предложение по ${p.name}`,
      body: `${bidder.name} предлагает ${money(bid)}. Ответьте во вкладке «Предложения».`,
      read: false, at: Date.now()
    });
  }

  function respondOffer(offerId, accept) {
    const offer = (state.transferOffers || []).find(o => o.id === offerId);
    if (!offer) return { ok: false, msg: 'Нет предложения' };
    const me = club();
    const p = me.squad.find(x => x.id === offer.playerId);
    state.transferOffers = state.transferOffers.filter(o => o.id !== offerId);
    if (!accept || !p) {
      save();
      return { ok: true, msg: 'Отказ отправлен' };
    }
    if (me.squad.length <= 16) return { ok: false, msg: 'Состав слишком мал' };
    const buyer = clubById(offer.fromId);
    me.squad = me.squad.filter(x => x.id !== p.id);
    me.budget += offer.bid;
    if (buyer) {
      buyer.squad.push({ ...p, clubId: buyer.id });
      buyer.budget -= offer.bid;
    }
    save();
    return { ok: true, msg: `${p.name} продан за ${money(offer.bid)}` };
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
    if (id === 'stadium') me.fans = Math.round(me.fans * 1.08);
    save();
    return { ok: true, msg: `${f.name} → ур. ${level + 1}` };
  }

  function promoteYouth() {
    const me = club();
    const cost = 150000 - me.facilities.youth * 18000;
    if (me.budget < cost) return { ok: false, msg: 'Нужно ' + money(cost) };
    if (me.squad.length >= 30) return { ok: false, msg: 'Состав полон' };
    me.budget -= cost;
    const pos = D().pick(['CB','CM','ST','RW','LW','RB','LB','CAM']);
    const base = 54 + me.facilities.youth * 4 + D().rnd(0, 6);
    const p = D().genPlayer(pos, base, D().rnd(16, 19), me.id);
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
    const slots = D().FORMATIONS[me.formation]?.slots || D().FORMATIONS['4-3-3'].slots;
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
    KEY, money, moneyHint, getCurrency, setCurrency, currencyInfo,
    createCareer, get, club, clubById, leagueClubs, save, load, clear,
    currentFixture, playerMatch, recordPlayerMatch, sortedTable, topScorers,
    train, buyPlayer, makeOffer, sellPlayer, respondOffer, filterMarket, refreshTransferMarket,
    upgradeFacility, promoteYouth, setTactics, setLineup, autoLineup
  };
})();
