/* Game state — real world leagues, transfers, stats */
window.EYE_STATE = (() => {
  const KEY = 'eye_manager_v2';
  let state = null;

  const D = () => window.EYE_DATA;
  const E = () => window.EYE_ENGINE;
  const W = () => window.EYE_WORLD;
  const I18N = () => window.EYE_I18N;
  const B = () => window.EYE_BOARD;

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
    const board = B().createBoard(me);

    state = {
      version: 3,
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
      board,
      scoutReports: {},
      ucl: createUcl(allClubs),
      inbox: [{
        id: D().uid('m'), type: 'welcome', title: 'Добро пожаловать в EYE',
        body: `Вы возглавили «${me.name}» (${league.name}). Задача совета: ${board.targetLabel}. Уверенность: ${board.confidence}%.`,
        read: false, at: Date.now()
      }, {
        id: D().uid('m'), type: 'board', title: 'Цели сезона',
        body: `Совет директоров ждёт: ${board.targetLabel} в лиге${board.cupTarget ? ' и кубковый путь' : ''}. Провал снизит доверие.`,
        read: false, at: Date.now()
      }],
      history: [],
      transferList: [],
      transferOffers: [],
      news: [],
      settings: { sfx: true, speed: 1 },
      lastResult: null,
      cup: createCup(leagueClubs),
      cupBest: '',
      uclBest: '',
      stats: { scorers: {}, assisters: {} },
      sacked: false,
      pendingPress: null
    };
    ensureClubExtras(me);
    refillYouth(me, true);
    refreshTransferMarket();
    save();
    return state;
  }

  function ensureClubExtras(c) {
    if (!c) return;
    c.staff = c.staff || { coach: 1, physio: 1, scoutDir: 1 };
    c.youth = c.youth || [];
    c.facilities = c.facilities || { stadium: 1, training: 1, youth: 1, medical: 1, scout: 1 };
  }

  function refillYouth(clubObj, force = false) {
    ensureClubExtras(clubObj);
    const target = 4 + (clubObj.facilities.youth || 1);
    if (!force && clubObj.youth.length >= Math.min(3, target)) return;
    while (clubObj.youth.length < target) {
      const pos = D().pick(['CB', 'CM', 'ST', 'RW', 'LW', 'RB', 'LB', 'CAM', 'CDM']);
      const base = 48 + (clubObj.facilities.youth || 1) * 3 + D().rnd(0, 5);
      const p = D().genPlayer(pos, base, D().rnd(15, 18), clubObj.id);
      p.pot = Math.min(94, p.ovr + D().rnd(10, 20) + (clubObj.facilities.youth || 1));
      p.youth = true;
      p.wage = Math.max(500, Math.round(p.wage * 0.25));
      clubObj.youth.push(p);
    }
  }

  function createUcl(allClubs) {
    // 16 clubs: top reputation from each league + fillers
    const byLeague = {};
    allClubs.forEach(c => {
      byLeague[c.leagueId] = byLeague[c.leagueId] || [];
      byLeague[c.leagueId].push(c);
    });
    let seeds = [];
    Object.values(byLeague).forEach(list => {
      seeds.push(...list.sort((a, b) => b.reputation - a.reputation).slice(0, 3));
    });
    seeds = seeds.sort((a, b) => b.reputation - a.reputation).slice(0, 16);
    if (seeds.length < 16) {
      const extra = allClubs.filter(c => !seeds.includes(c)).sort((a, b) => b.reputation - a.reputation);
      seeds = seeds.concat(extra).slice(0, 16);
    }
    const ids = seeds.map(c => c.id).sort(() => Math.random() - 0.5);
    return {
      name: 'Лига чемпионов EYE',
      round: '1/8',
      bracket: ids.map((id, i) => i % 2 === 0 ? { home: id, away: ids[i + 1], played: false, score: null } : null).filter(Boolean),
      champion: null
    };
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
      if (!state.board && club()) state.board = B().createBoard(club());
      if (!state.scoutReports) state.scoutReports = {};
      if (!state.ucl) state.ucl = createUcl(state.clubs || []);
      if (state.sacked == null) state.sacked = false;
      if (!state.cup && leagueClubs().length) state.cup = createCup(leagueClubs());
      if (state.cupBest == null) state.cupBest = '';
      if (state.uclBest == null) state.uclBest = '';
      state.clubs?.forEach(ensureClubExtras);
      if (club()) refillYouth(club());
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
    const bump = (s, clubName) => {
      state.stats.scorers[s.player.id] = state.stats.scorers[s.player.id] || {
        id: s.player.id, name: s.player.name, club: clubName, goals: 0, assists: 0
      };
      state.stats.scorers[s.player.id].goals++;
      s.player.seasonGoals = (s.player.seasonGoals || 0) + 1;
      s.player.goals = (s.player.goals || 0) + 1;
      s.player.careerGoals = (s.player.careerGoals || 0) + 1;
      if (s.assist) {
        state.stats.scorers[s.assist.id] = state.stats.scorers[s.assist.id] || {
          id: s.assist.id, name: s.assist.name, club: clubName, goals: 0, assists: 0
        };
        state.stats.scorers[s.assist.id].assists++;
        s.assist.seasonAssists = (s.assist.seasonAssists || 0) + 1;
        s.assist.assists = (s.assist.assists || 0) + 1;
        s.assist.careerAssists = (s.assist.careerAssists || 0) + 1;
      }
    };
    (result.scorersH || []).forEach(s => bump(s, result.home));
    (result.scorersA || []).forEach(s => bump(s, result.away));
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
    const won = myGoals > oppGoals;
    const drew = myGoals === oppGoals;
    let prize = 0;
    if (won) { prize = 250000; me.morale = Math.min(100, me.morale + 4); }
    else if (drew) { prize = 100000; me.morale = Math.min(100, me.morale + 1); }
    else { prize = 40000; me.morale = Math.max(20, me.morale - 3); }
    const income = Math.round(me.fans * (0.9 + me.facilities.stadium * 0.3) * (14 + Math.random() * 10));
    me.budget += prize + income;

    if (state.board) {
      B().applyMatchConfidence(state.board, won, drew, false);
      if (state.board.confidence < 30 && !won) {
        const recent = state.inbox.find(m => m.type === 'board' && m.title === 'Совет недоволен' && state.week - (m.week || 0) < 3);
        if (!recent) {
          state.inbox.unshift({
            id: D().uid('m'), type: 'board', title: 'Совет недоволен',
            body: `Уверенность совета: ${state.board.confidence}%. Нужны результаты.`,
            read: false, at: Date.now(), week: state.week
          });
        }
      }
    }

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
      title: won ? 'Победа!' : drew ? 'Ничья' : 'Поражение',
      body: `${result.home} ${result.score[0]}:${result.score[1]} ${result.away}`,
      at: Date.now()
    });

    finishRoundExcept(match);
    simOtherLeaguesWeek();
    maybePlayCupAiWeek();
    maybePlayUclAiWeek();
    queuePressConference(won, drew, false);
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
    ensureClubExtras(me);
    const wages = me.squad.reduce((s, p) => s + (p.wage || 0), 0);
    const staffWage = ((me.staff.coach || 1) + (me.staff.physio || 1) + (me.staff.scoutDir || 1)) * 12000;
    me.budget -= wages + staffWage;
    const xiIds = new Set((me.lineup || me.squad.slice(0, 11)).map(p => p.id));
    const heal = 1 + Math.floor(((me.facilities.medical || 1) + (me.staff.physio || 1)) / 3);
    me.squad.forEach(p => {
      if (p.suspended > 0) p.suspended = Math.max(0, p.suspended - 1);
      if (p.injured > 0) p.injured = Math.max(0, p.injured - heal);
      else {
        p.condition = Math.min(100, (p.condition || 70) + 6 + me.facilities.medical + (me.staff.physio || 1));
        p.energy = Math.min(100, (p.energy || 70) + 10);
      }
      p.form = Math.max(30, Math.min(95, (p.form || 60) + D().rnd(-2, 2)));
      p.red = 0;
      p.matchYellows = 0;
      if (xiIds.has(p.id)) p.morale = Math.min(100, (p.morale || 60) + 1);
      else if ((p.seasonApps || 0) < state.week / 3 && p.ovr >= me.reputation - 5) {
        p.morale = Math.max(25, (p.morale || 60) - 2);
      }
    });
    (me.youth || []).forEach(p => {
      if (Math.random() < 0.25 + me.facilities.youth * 0.05) {
        if (p.ovr < p.pot) p.ovr = Math.min(p.pot, p.ovr + 1);
        p.form = Math.min(95, (p.form || 60) + 2);
      }
    });
    state.clubs.forEach(c => {
      if (c.id === me.id) return;
      ensureClubExtras(c);
      c.squad.forEach(p => {
        if (p.suspended > 0) p.suspended--;
        if (p.injured > 0) p.injured = Math.max(0, p.injured - 1);
        else p.condition = Math.min(100, (p.condition || 70) + 5);
        p.form = Math.max(30, Math.min(95, (p.form || 60) + D().rnd(-2, 2)));
        p.red = 0;
        p.matchYellows = 0;
      });
    });
    if (state.week % 4 === 0) refreshTransferMarket();
    processIncomingOffers();
    maybePlayCupAiWeek();
    maybePlayUclAiWeek();
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
        // return loans
        if (p.loan && p.loanFrom) {
          const origin = clubById(p.loanFrom);
          if (origin && c.id === state.clubId) {
            // handled below
          }
        }
      });
    });
    // return loans to origin
    const returning = me.squad.filter(p => p.loan && p.loanFrom);
    returning.forEach(p => {
      const origin = clubById(p.loanFrom);
      me.squad = me.squad.filter(x => x.id !== p.id);
      if (origin) {
        delete p.loan; delete p.loanFrom;
        origin.squad.push(p);
      }
    });
    if (returning.length) {
      state.inbox.unshift({
        id: D().uid('m'), type: 'loan',
        title: 'Конец аренды',
        body: 'Вернулись: ' + returning.map(p => p.name).join(', '),
        read: false, at: Date.now()
      });
    }

    tickContracts();

    // Board season review
    if (!state.board) state.board = B().createBoard(me);
    const cupReached = state.cup?.champion === me.id ? 'Чемпион' : (state.cupBest || '');
    const review = B().seasonReview(state.board, pos, cupReached);
    let boardMsg = review.ok
      ? `Цели выполнены (${state.board.targetLabel}). Уверенность: ${state.board.confidence}%.`
      : `Цели не достигнуты. Уверенность: ${state.board.confidence}%. Предупреждений: ${state.board.warnings}.`;
    if (review.sacked) {
      state.sacked = true;
      boardMsg += ' Вас уволили.';
    }

    // Promotion / relegation
    const ladderMsg = applyLadderMove(pos, table.length);

    state.inbox.unshift({
      id: D().uid('m'), type: 'season',
      title: `Сезон ${state.season} завершён — ${state.leagueName}`,
      body: `Место: ${pos}. Призовые: ${money(prize)}. ${boardMsg} ${ladderMsg}`,
      read: false, at: Date.now()
    });

    if (state.sacked) {
      save();
      return;
    }

    state.season++;
    state.week = 1;
    state.board = B().createBoard(me);
    state.cupBest = '';
    state.uclBest = '';
    const lc = leagueClubs();
    state.table = emptySeasonTable(lc);
    state.fixtures = buildFixtures(lc.map(c => c.id));
    state.stats = { scorers: {}, assisters: {} };
    state.cup = createCup(lc);
    state.ucl = createUcl(state.clubs);
    refillYouth(me, true);
    me.squad.forEach(p => { p.seasonYellows = 0; p.yellow = 0; p.suspended = 0; });
    state.inbox.unshift({
      id: D().uid('m'), type: 'board', title: 'Новые цели совета',
      body: `${state.board.targetLabel}. Уверенность: ${state.board.confidence}%.`,
      read: false, at: Date.now()
    });
    refreshTransferMarket();
    save();
  }

  function applyLadderMove(pos, tableSize) {
    const me = club();
    let dir = 0;
    if (pos <= 2) dir = -1; // up ladder (better league)
    else if (pos >= tableSize - 1) dir = 1; // down
    if (!dir) return '';
    const targetId = B().neighborLeague(state.leagueId, dir);
    if (!targetId) return dir < 0 ? 'Вы на вершине лестницы лиг.' : 'Ниже лиг нет.';
    const targetLeague = W().leagueById(targetId);
    const targetClubs = state.clubs.filter(c => c.leagueId === targetId && c.id !== me.id);
    if (!targetClubs.length) return '';
    // swap with weakest/strongest
    const swap = dir < 0
      ? targetClubs.sort((a, b) => a.reputation - b.reputation)[0]
      : targetClubs.sort((a, b) => b.reputation - a.reputation)[0];
    const oldLeague = state.leagueId;
    me.leagueId = targetId;
    me.leagueName = targetLeague.name;
    swap.leagueId = oldLeague;
    swap.leagueName = W().leagueById(oldLeague).name;
    state.leagueId = targetId;
    state.leagueName = targetLeague.name;
    me.budget += dir < 0 ? 2e6 : -5e5;
    return dir < 0
      ? `Повышение в «${targetLeague.name}»! (обмен с ${swap.name})`
      : `Вылет в «${targetLeague.name}». (обмен с ${swap.name})`;
  }

  function train(typeId) {
    const me = club();
    ensureClubExtras(me);
    const t = D().TRAINING.find(x => x.id === typeId);
    if (!t) return { ok: false, msg: 'Нет такой тренировки' };
    const cost = 12000 + me.facilities.training * 3000;
    if (me.budget < cost) return { ok: false, msg: 'Не хватает бюджета' };
    me.budget -= cost;
    const boost = t.boost + me.facilities.training + Math.floor((me.staff.coach || 1) / 2);
    me.squad.forEach(p => {
      if (p.injured || p.suspended) return;
      if (t.focus === 'condition') {
        p.condition = Math.min(100, p.condition + boost);
        p.energy = Math.min(100, p.energy + boost);
      } else {
        p[t.focus] = Math.min(99, (p[t.focus] || 60) + (Math.random() < 0.55 ? 1 : 0));
        if (Math.random() < 0.12 + me.facilities.training * 0.02 + (me.staff.coach || 1) * 0.01) {
          p.ovr = Math.min(p.pot, p.ovr + 1);
        }
        p.condition = Math.max(45, p.condition - 3);
        p.form = Math.min(99, p.form + 1);
      }
    });
    save();
    return { ok: true, msg: `Тренировка «${t.name}» (−${money(cost)})` };
  }

  function makeOffer(entryId, bid, loan = false, wageOffer = null) {
    const me = club();
    const item = state.transferList.find(e => e.id === entryId || e.player.id === entryId);
    if (!item) return { ok: false, msg: 'Игрок снят с рынка' };
    const ask = item.ask;
    const offer = bid || ask;
    const wageAsk = item.wageAsk || item.player.wage || 10000;
    const wage = wageOffer != null ? wageOffer : wageAsk;
    if (!loan && me.budget < offer) return { ok: false, msg: 'Недостаточно средств' };
    if (me.squad.length >= 30) return { ok: false, msg: 'Лимит состава 30' };

    let accept = false;
    const wageOk = wage >= wageAsk * 0.9;
    if (item.type === 'free') accept = offer >= ask * 0.85 && wageOk;
    else if (loan) accept = Math.random() < 0.55 + me.facilities.scout * 0.05;
    else {
      const ratio = offer / ask;
      const reluct = item.type === 'star' ? 0.25 : 0.1;
      accept = wageOk && (ratio >= 1 + reluct ? true : ratio >= 0.95 && Math.random() < 0.45 + me.reputation / 200);
    }

    if (!accept) {
      const counter = Math.round(ask * (1.05 + Math.random() * 0.15));
      state.pendingCounters = state.pendingCounters || {};
      state.pendingCounters[item.id] = counter;
      state.pendingWage = state.pendingWage || {};
      state.pendingWage[item.id] = Math.round(wageAsk * 1.1);
      const reason = !wageOk ? `Хотят зарплату ~${money(wageAsk)}/нед. ` : '';
      state.inbox.unshift({
        id: D().uid('m'), type: 'transfer',
        title: `Отказ: ${item.player.name}`,
        body: `${reason}${item.clubName || 'Агент'} отклонил ${money(offer)}. Контр: ${money(counter)}.`,
        read: false, at: Date.now()
      });
      save();
      return { ok: false, msg: `Отклонено. Хотят ~${money(counter)}`, counter, wageAsk, entryId: item.id };
    }

    return finalizeBuy(item, offer, loan, wage);
  }

  function finalizeBuy(item, price, loan, wage) {
    const me = club();
    const p = { ...item.player, listed: false, ask: 0, clubId: me.id };
    if (wage) p.wage = wage;
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
    if (state.pendingCounters) delete state.pendingCounters[item.id];
    state.news.unshift({
      id: D().uid('n'),
      title: loan ? 'Аренда' : 'Трансфер',
      body: `${p.name} → ${me.name}${loan ? ' (аренда)' : ' за ' + money(price)} · ${money(p.wage)}/нед`,
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

  function promoteYouth(playerId = null) {
    const me = club();
    ensureClubExtras(me);
    refillYouth(me);
    if (me.squad.length >= 30) return { ok: false, msg: 'Состав полон' };
    let p;
    if (playerId) {
      p = me.youth.find(x => x.id === playerId);
      if (!p) return { ok: false, msg: 'Нет в академии' };
      me.youth = me.youth.filter(x => x.id !== playerId);
    } else {
      const cost = Math.max(40000, 150000 - me.facilities.youth * 18000);
      if (me.budget < cost) return { ok: false, msg: 'Нужно ' + money(cost) };
      if (!me.youth.length) refillYouth(me, true);
      me.youth.sort((a, b) => b.pot - a.pot);
      p = me.youth.shift();
      me.budget -= cost;
    }
    delete p.youth;
    p.clubId = me.id;
    p.contract = Math.max(p.contract || 1, 2);
    me.squad.push(p);
    save();
    return { ok: true, msg: `В основу: ${p.name} (${D().POS_LABEL[p.pos]}, ${p.ovr} / пот. ${p.pot})`, player: p };
  }

  function hireStaff(roleId) {
    const me = club();
    ensureClubExtras(me);
    const role = D().STAFF_ROLES.find(r => r.id === roleId);
    if (!role) return { ok: false, msg: 'Нет роли' };
    const level = me.staff[roleId] || 1;
    if (level >= role.max) return { ok: false, msg: 'Максимум' };
    const cost = Math.round(role.base * Math.pow(1.55, level - 1));
    if (me.budget < cost) return { ok: false, msg: 'Нужно ' + money(cost) };
    me.budget -= cost;
    me.staff[roleId] = level + 1;
    save();
    return { ok: true, msg: `${role.name} → ур. ${level + 1} (−${money(cost)})` };
  }

  function queuePressConference(won, drew, isCup) {
    const pool = D().PRESS_OPTIONS.filter(o => {
      if (won) return ['confident', 'humble', 'defend_squad', 'silent'].includes(o.id);
      if (drew) return ['humble', 'promise', 'defend_squad', 'silent'].includes(o.id);
      return ['promise', 'defend_squad', 'attack_board', 'silent', 'humble'].includes(o.id);
    });
    const picked = pool.sort(() => Math.random() - 0.5).slice(0, 3);
    state.pendingPress = {
      title: won ? 'Пресс-конференция: победа' : drew ? 'Пресс-конференция: ничья' : 'Пресс-конференция: поражение',
      context: isCup ? 'Кубковый матч' : 'Матч лиги',
      options: picked
    };
  }

  function answerPress(optionId) {
    if (!state?.pendingPress) return { ok: false, msg: 'Нет вопросов' };
    const opt = (state.pendingPress.options || []).find(o => o.id === optionId)
      || D().PRESS_OPTIONS.find(o => o.id === optionId);
    if (!opt) return { ok: false, msg: 'Нет варианта' };
    const me = club();
    me.morale = Math.max(20, Math.min(100, me.morale + (opt.morale || 0)));
    if (state.board) {
      state.board.confidence = Math.max(0, Math.min(100, state.board.confidence + (opt.board || 0)));
    }
    state.news.unshift({
      id: D().uid('n'), title: 'Пресса',
      body: `Вы сказали: «${opt.label}». Мораль ${me.morale}%, совет ${state.board?.confidence ?? '—'}%.`,
      at: Date.now()
    });
    state.pendingPress = null;
    save();
    return { ok: true, msg: `Ответ: ${opt.label}` };
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
        .filter(p => !used.has(p.id) && !(p.injured > 0) && !(p.suspended > 0) && !p.red)
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

  function ensureLineup() {
    const me = club();
    if (!me.lineup || me.lineup.length < 11) autoLineup();
    return me.lineup;
  }

  function swapIntoXi(benchPlayerId, slotIndex) {
    const me = club();
    ensureLineup();
    const xi = [...me.lineup];
    const bench = me.squad.find(p => p.id === benchPlayerId);
    if (!bench || bench.injured || bench.suspended) return { ok: false, msg: 'Игрок недоступен' };
    if (slotIndex < 0 || slotIndex > 10) return { ok: false, msg: 'Слот' };
    const out = xi[slotIndex];
    xi[slotIndex] = bench;
    const ids = xi.map(p => p.id);
    // keep rest of squad after XI
    const rest = me.squad.filter(p => !ids.includes(p.id));
    if (out && !ids.includes(out.id)) rest.unshift(out);
    me.squad = [...xi, ...rest.filter((p, i, a) => a.findIndex(x => x.id === p.id) === i)];
    me.lineup = xi;
    save();
    return { ok: true, msg: `${bench.name} в основе` };
  }

  function financeSummary() {
    const me = club();
    const wages = me.squad.reduce((s, p) => s + (p.wage || 0), 0);
    const values = me.squad.reduce((s, p) => s + (p.value || 0), 0);
    return {
      budget: me.budget,
      weeklyWages: wages,
      squadValue: values,
      fans: me.fans,
      incomePerMatch: Math.round(me.fans * (0.9 + me.facilities.stadium * 0.3) * 16)
    };
  }

  function renewContract(playerId, years = 2) {
    const me = club();
    const p = me.squad.find(x => x.id === playerId);
    if (!p) return { ok: false, msg: 'Нет игрока' };
    const cost = Math.round(p.wage * 8 * years);
    const newWage = Math.round(p.wage * (1.08 + Math.random() * 0.12));
    if (me.budget < cost) return { ok: false, msg: 'Нужен бонус ' + money(cost) };
    me.budget -= cost;
    p.contract = Math.max(p.contract || 0, 0) + years;
    p.wage = newWage;
    p.morale = Math.min(100, (p.morale || 60) + 8);
    save();
    return { ok: true, msg: `Контракт ${p.name}: +${years} г, зарплата ${money(newWage)}/нед (−${money(cost)})` };
  }

  function tickContracts() {
    const me = club();
    const left = [];
    me.squad = me.squad.filter(p => {
      p.contract = Math.max(0, (p.contract || 1) - 1);
      if (p.contract > 0) return true;
      if (Math.random() < 0.4) {
        p.contract = 1;
        return true;
      }
      left.push(p.name);
      p.listed = true;
      p.ask = Math.round(p.value * 0.35);
      state.transferList = state.transferList || [];
      state.transferList.unshift({
        id: D().uid('t'), type: 'free', player: p, clubId: null, ask: p.ask, wageAsk: p.wage
      });
      return false;
    });
    if (left.length) {
      state.inbox.unshift({
        id: D().uid('m'), type: 'contract',
        title: 'Свободные агенты',
        body: 'Покинули клуб по окончании контракта: ' + left.join(', '),
        read: false, at: Date.now()
      });
    }
    // AI clubs: silently decrement
    state.clubs.forEach(c => {
      if (c.id === me.id) return;
      c.squad.forEach(p => { p.contract = Math.max(1, (p.contract || 2) - 1); });
    });
  }

  function playerCupMatch() {
    if (!state?.cup || state.cup.champion) return null;
    return (state.cup.bracket || []).find(m =>
      !m.played && (m.home === state.clubId || m.away === state.clubId)
    ) || null;
  }

  function playerUclMatch() {
    if (!state?.ucl || state.ucl.champion) return null;
    return (state.ucl.bracket || []).find(m =>
      !m.played && (m.home === state.clubId || m.away === state.clubId)
    ) || null;
  }

  function nextMatch() {
    const canKo = state.knockoutPlayedWeek !== state.week;
    const ucl = playerUclMatch();
    const cup = playerCupMatch();
    if (canKo && ucl && state.week % 5 === 1) return { type: 'ucl', match: ucl };
    if (canKo && cup && state.week % 3 === 0) return { type: 'cup', match: cup };
    const lg = playerMatch();
    if (lg) return { type: 'league', match: lg };
    if (canKo && ucl) return { type: 'ucl', match: ucl };
    if (canKo && cup) return { type: 'cup', match: cup };
    return null;
  }

  function advanceKnockout(comp, title, winPrize) {
    if (!comp || comp.champion) return;
    if (!comp.bracket.every(m => m.played)) return;
    const winners = comp.bracket.map(m => m.score[0] > m.score[1] ? m.home : m.away);
    if (winners.length === 1) {
      comp.champion = winners[0];
      const champ = clubById(winners[0]);
      state.news.unshift({ id: D().uid('n'), title, body: `Победитель: ${champ?.name}`, at: Date.now() });
      if (winners[0] === state.clubId) {
        club().budget += winPrize;
        state.inbox.unshift({ id: D().uid('m'), type: 'cup', title: title + ' — победа!', body: `Призовые ${money(winPrize)}`, read: false, at: Date.now() });
      }
      return;
    }
    const next = [];
    for (let i = 0; i < winners.length; i += 2) {
      next.push({ home: winners[i], away: winners[i + 1], played: false, score: null });
    }
    comp.bracket = next;
    comp.round = next.length === 4 ? '1/4' : next.length === 2 ? '1/2' : next.length === 1 ? 'Финал' : '1/' + (next.length * 2);
  }

  function resolveCompAI(comp, exceptMatch) {
    if (!comp || comp.champion) return;
    comp.bracket.forEach(m => {
      if (m.played) return;
      if (exceptMatch && m.home === exceptMatch.home && m.away === exceptMatch.away) return;
      if (m.home === state.clubId || m.away === state.clubId) return;
      const home = clubById(m.home);
      const away = clubById(m.away);
      if (!home || !away) { m.played = true; m.score = [1, 0]; return; }
      const res = simulateAIMatch(home, away);
      let score = res.score;
      if (score[0] === score[1]) score = Math.random() < 0.5 ? [score[0] + 1, score[1]] : [score[0], score[1] + 1];
      m.played = true;
      m.score = score;
    });
  }

  function resolveCupRoundAI(exceptMatch) {
    resolveCompAI(state.cup, exceptMatch);
    maybeAdvanceCup();
  }

  function maybeAdvanceCup() {
    advanceKnockout(state.cup, 'Кубок EYE', 800000);
  }

  function maybePlayCupAiWeek() {
    if (!state.cup || state.cup.champion) return;
    const pending = playerCupMatch();
    if (pending) return;
    resolveCompAI(state.cup, null);
    advanceKnockout(state.cup, 'Кубок EYE', 800000);
  }

  function maybePlayUclAiWeek() {
    if (!state.ucl || state.ucl.champion) return;
    const pending = playerUclMatch();
    if (pending) return;
    resolveCompAI(state.ucl, null);
    advanceKnockout(state.ucl, 'ЛЧ EYE', 2500000);
  }

  function recordCupMatch(match, result) {
    return recordKnockoutMatch(match, result, 'cup', 'Кубок EYE', 180000);
  }

  function recordUclMatch(match, result) {
    return recordKnockoutMatch(match, result, 'ucl', 'Лига чемпионов EYE', 350000);
  }

  function noteKnockoutProgress(kind, won, roundLabel) {
    const order = ['1/8', '1/4', '1/2', 'Финал', 'Чемпион'];
    const key = kind === 'ucl' ? 'uclBest' : 'cupBest';
    if (won) {
      const next = roundLabel === 'Финал' ? 'Чемпион' : roundLabel;
      const cur = state[key] || '';
      if (order.indexOf(next) >= order.indexOf(cur)) state[key] = next || roundLabel;
    } else {
      const cur = state[key] || '';
      if (!cur) state[key] = roundLabel || '1/8';
    }
  }

  function recordKnockoutMatch(match, result, kind, label, prizeWin) {
    match.played = true;
    let score = result.score;
    if (score[0] === score[1]) {
      score = Math.random() < 0.5 ? [score[0] + 1, score[1]] : [score[0], score[1] + 1];
      result.score = score;
      result.events.push({ minute: 95, type: 'goal', text: 'Победитель в доп. времени!', score });
    }
    match.score = score;
    trackStats(result);
    const roundBefore = kind === 'cup' ? state.cup?.round : state.ucl?.round;
    if (kind === 'cup') {
      resolveCupRoundAI(match);
      maybeAdvanceCup();
    } else {
      resolveCompAI(state.ucl, match);
      advanceKnockout(state.ucl, 'ЛЧ EYE', 2500000);
    }

    const me = club();
    const isHome = match.home === me.id;
    const myGoals = isHome ? score[0] : score[1];
    const oppGoals = isHome ? score[1] : score[0];
    const won = myGoals > oppGoals;
    noteKnockoutProgress(kind, won, roundBefore);
    const prize = won ? prizeWin : 50000;
    me.budget += prize;
    me.morale = Math.min(100, me.morale + (won ? 5 : -2));
    if (state.board) B().applyMatchConfidence(state.board, won, false, true);
    state.lastResult = { ...result, prize, income: 0, competition: label };
    state.history.unshift({
      at: Date.now(), season: state.season, week: state.week, cup: kind === 'cup', ucl: kind === 'ucl',
      home: result.home, away: result.away, score
    });
    state.news.unshift({
      id: D().uid('n'), title: won ? `${label}: победа` : `${label}: поражение`,
      body: `${result.home} ${score[0]}:${score[1]} ${result.away}`,
      at: Date.now()
    });
    queuePressConference(won, false, true);
    // Кубок/ЛЧ — midweek: не крутим лиговый advanceWeek (зарплаты уже списаны за тур)
    state.knockoutPlayedWeek = state.week;
    save();
  }

  function scoutPlayer(entryId) {
    const me = club();
    const item = state.transferList.find(e => e.id === entryId);
    if (!item) return { ok: false, msg: 'Нет на рынке' };
    const cost = Math.max(10000, 80000 - me.facilities.scout * 10000 - (me.staff?.scoutDir || 1) * 8000);
    if (me.budget < cost) return { ok: false, msg: 'Нужно ' + money(cost) };
    me.budget -= cost;
    const p = item.player;
    const noise = Math.max(0, 6 - me.facilities.scout - Math.floor((me.staff?.scoutDir || 1) / 2));
    const report = {
      id: p.id,
      name: p.name,
      pot: Math.max(40, Math.min(95, p.pot + D().rnd(-noise, noise))),
      age: p.age,
      injuryRisk: p.age > 30 ? 'высокий' : p.stamina < 65 ? 'средний' : 'низкий',
      hiddenForm: Math.max(30, Math.min(95, (p.form || 60) + D().rnd(-noise, noise))),
      recommendation: p.pot - p.ovr >= 8 ? 'Перспектива' : p.ovr >= 84 ? 'Топ сейчас' : 'Рабочая лошадка',
      at: Date.now(),
      cost
    };
    state.scoutReports = state.scoutReports || {};
    state.scoutReports[p.id] = report;
    save();
    return { ok: true, msg: `Отчёт по ${p.name} (−${money(cost)})`, report };
  }

  function takeNewJob(clubId) {
    if (!state?.sacked) return { ok: false, msg: 'Вы не уволены' };
    const tpl = W().clubTemplate(clubId);
    if (!tpl) return { ok: false, msg: 'Клуб не найден' };
    // clear old player flag
    const old = club();
    if (old) old.isPlayer = false;
    const next = state.clubs.find(c => c.id === clubId);
    if (!next) return { ok: false, msg: 'Нет клуба' };
    next.isPlayer = true;
    state.clubId = next.id;
    state.leagueId = next.leagueId;
    state.leagueName = next.leagueName;
    state.sacked = false;
    state.board = B().createBoard(next);
    const lc = leagueClubs();
    state.table = emptySeasonTable(lc);
    state.fixtures = buildFixtures(lc.map(c => c.id));
    state.week = 1;
    state.cup = createCup(lc);
    state.stats = { scorers: {}, assisters: {} };
    state.inbox.unshift({
      id: D().uid('m'), type: 'welcome', title: 'Новый контракт',
      body: `Вы возглавили «${next.name}». Цель: ${state.board.targetLabel}.`,
      read: false, at: Date.now()
    });
    refreshTransferMarket();
    save();
    return { ok: true, msg: `Контракт с «${next.name}»` };
  }

  function storeCounter(entryId, counter) {
    state.pendingCounters = state.pendingCounters || {};
    state.pendingCounters[entryId] = counter;
    save();
  }

  return {
    KEY, money, moneyHint, getCurrency, setCurrency, currencyInfo,
    createCareer, get, club, clubById, leagueClubs, save, load, clear,
    currentFixture, playerMatch, nextMatch, playerCupMatch, playerUclMatch,
    recordPlayerMatch, recordCupMatch, recordUclMatch, sortedTable, topScorers,
    train, buyPlayer, makeOffer, sellPlayer, respondOffer, filterMarket, refreshTransferMarket,
    storeCounter, pendingCounters: () => state?.pendingCounters || {},
    pendingWage: () => state?.pendingWage || {},
    upgradeFacility, promoteYouth, setTactics, setLineup, autoLineup, ensureLineup, swapIntoXi,
    renewContract, financeSummary, resolveCupRoundAI, scoutPlayer, takeNewJob,
    hireStaff, answerPress, refillYouth, pendingPress: () => state?.pendingPress || null
  };
})();
