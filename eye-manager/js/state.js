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

  function createCareer({ managerName, clubId, formation, style, custom }) {
    const allClubs = D().buildWorldClubs();
    let me;
    let league;
    let replacedName = '';

    if (custom && custom.leagueId) {
      league = W().leagueById(custom.leagueId);
      if (!league) throw new Error('league not found');
      const pool = allClubs.filter(c => c.leagueId === league.id);
      const victim = [...pool].sort((a, b) => a.reputation - b.reputation || a.budget - b.budget)[0];
      if (!victim) throw new Error('no club slot');
      replacedName = victim.name;
      me = D().createStarterClub({
        name: custom.name,
        short: custom.short,
        color: custom.color,
        stadium: custom.stadium,
        leagueId: league.id,
        formation: formation || '4-3-3',
        style: style || 'balance'
      });
      const idx = allClubs.findIndex(c => c.id === victim.id);
      allClubs[idx] = me;
    } else {
      const tpl = W().clubTemplate(clubId);
      if (!tpl) throw new Error('club not found');
      league = W().leagueById(tpl.leagueId);
      me = allClubs.find(c => c.id === clubId);
      if (!me) throw new Error('club not found');
      me.formation = formation || me.formation;
      me.style = style || 'balance';
      me.budget = Math.round(me.budget * 1.05);
    }

    me.isPlayer = true;
    refreshClubLevel(me);

    const leagueClubs = allClubs.filter(c => c.leagueId === league.id);
    const fixtures = buildFixtures(leagueClubs.map(c => c.id));
    const board = B().createBoard(me);
    const avg = Math.round(me.squad.reduce((s, p) => s + p.ovr, 0) / Math.max(1, me.squad.length));

    const welcomeBody = me.customClub
      ? `Вы основали «${me.name}» в лиге «${league.name}». Состав из ${me.squad.length} игроков (ср. OVR ${avg}) выдан автоматически. Развивайте базу, академию и тренировки — как в классическом менеджере.`
      : `Вы возглавили «${me.name}» (${league.name}). Задача совета: ${board.targetLabel}. Уверенность: ${board.confidence}%.`;

    state = {
      version: 5,
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
      otherLeagues: buildOtherLeagues(allClubs, league.id),
      board,
      scoutReports: {},
      ucl: null,
      inbox: [{
        id: D().uid('m'), type: 'welcome', title: me.customClub ? 'Команда создана' : 'Добро пожаловать в EYE',
        body: welcomeBody + (replacedName ? ` Слот в лиге освободил клуб «${replacedName}».` : ''),
        read: false, at: Date.now()
      }, {
        id: D().uid('m'), type: 'board', title: 'Цели сезона',
        body: `Совет директоров ждёт: ${board.targetLabel} в лиге${board.cupTarget ? ' и кубковый путь' : ''}. Провал снизит доверие.`,
        read: false, at: Date.now()
      }],
      history: [],
      seasonLog: [],
      ledger: [],
      sponsor: null,
      finance: {
        debtWeeks: 0,
        wageArrears: 0,
        embargo: false,
        emergencyLoanSeason: 0,
        lastStatus: 'healthy',
        unpaidStreak: 0
      },
      transferList: [],
      transferOffers: [],
      news: [],
      settings: { sfx: true, speed: 1 },
      lastResult: null,
      cup: null,
      cupBest: '',
      uclBest: '',
      stats: { scorers: {}, assisters: {}, motm: {} },
      sacked: false,
      pendingPress: null
    };
    // Кубок — домашнее участие; ЛЧ/ЧМ — только через зону/рейтинг (свой клуб не в ЛЧ с нуля)
    state.cup = createCup(leagueClubs, me.id);
    state.ucl = createUcl(allClubs, me.id, { forcePlayer: false });
    state.cwc = createCwc(allClubs, me.id);
    state.nextUclSeeds = null;
    state.lastUclChampion = null;
    state.cwcBest = '';
    const inUcl = (state.ucl.bracket || []).some(m => m.home === me.id || m.away === me.id);
    if (inUcl) {
      const seed = (state.ucl.seeds || []).find(s => s.id === me.id);
      state.inbox.unshift({
        id: D().uid('m'), type: 'ucl', title: 'Лига чемпионов',
        body: `Вы в сетке ЛЧ (${seed?.reason || 'путёвка'}). Иначе путёвку дают только по итогам сезона.`,
        read: false, at: Date.now()
      });
    } else {
      state.inbox.unshift({
        id: D().uid('m'), type: 'ucl', title: 'Путь в Лигу чемпионов',
        body: me.customClub
          ? `Свой клуб стартует вне ЛЧ. Займите зону квалификации по итогам сезона (топ лиги) — и попадёте в сетку следующего сезона.`
          : `Сейчас вы вне сетки ЛЧ. Путёвка — через зону по итогам сезона или высокий рейтинг клуба.`,
        read: false, at: Date.now()
      });
    }
    if (isClubInCwc(me.id)) {
      const seed = (state.cwc.seeds || []).find(s => s.id === me.id);
      state.inbox.unshift({
        id: D().uid('m'), type: 'cwc', title: 'Клубный чемпионат мира',
        body: `Вы в сетке клубного ЧМ (${seed?.reason || 'приглашение'}). Группы — туры 7, 9 и 11; полуфинал — 13; финал — 15.`,
        read: false, at: Date.now()
      });
    }
    if (me.customClub) {
      state.inbox.unshift({
        id: D().uid('m'), type: 'dev', title: 'План развития клуба',
        body: '1) Тренируйте состав каждую неделю. 2) Вкладывайте в базу и академию. 3) Поднимайте молодёжь. 4) Копите на трансферы. Победы растят болельщиков и уровень клуба. ЛЧ — только после квалификации сезоном.',
        read: false, at: Date.now()
      });
    }
    ensureClubExtras(me);
    ensureMeta();
    pickSponsor(me);
    refillYouth(me, true);
    refreshTransferMarket();
    save();
    return state;
  }

  function refreshClubLevel(clubObj) {
    if (!clubObj) return 1;
    const fac = clubObj.facilities || {};
    const facSum = ['stadium', 'training', 'youth', 'medical', 'scout']
      .reduce((s, k) => s + (fac[k] || 1), 0);
    const staff = clubObj.staff || {};
    const staffSum = (staff.coach || 1) + (staff.physio || 1) + (staff.scoutDir || 1);
    const avg = clubObj.squad?.length
      ? clubObj.squad.reduce((s, p) => s + p.ovr, 0) / clubObj.squad.length
      : 55;
    const fansScore = Math.min(5, Math.floor((clubObj.fans || 0) / 12000));
    const raw = Math.round((facSum + staffSum) / 4 + (avg - 50) / 8 + fansScore);
    clubObj.clubLevel = Math.max(1, Math.min(10, raw));
    clubObj.avgOvr = Math.round(avg);
    return clubObj.clubLevel;
  }

  function teamDevSummary() {
    const me = club();
    if (!me) return null;
    refreshClubLevel(me);
    const fac = me.facilities || {};
    return {
      level: me.clubLevel || 1,
      avgOvr: me.avgOvr || 0,
      fans: me.fans || 0,
      training: fac.training || 1,
      youth: fac.youth || 1,
      stadium: fac.stadium || 1,
      medical: fac.medical || 1,
      scout: fac.scout || 1,
      custom: !!me.customClub,
      squadSize: me.squad?.length || 0
    };
  }

  function applyMatchDevelopment(won, drew) {
    const me = club();
    if (!me) return;
    if (won) {
      me.fans = Math.min(95000, (me.fans || 4000) + D().rnd(me.customClub ? 60 : 25, me.customClub ? 140 : 70));
      me.reputation = Math.min(92, (me.reputation || 60) + (me.customClub ? 0.15 : 0.05));
    } else if (drew) {
      me.fans = Math.min(95000, (me.fans || 4000) + D().rnd(8, 25));
    } else {
      me.fans = Math.max(2000, (me.fans || 4000) - D().rnd(5, 20));
    }
    const xi = (me.lineup || []).filter(Boolean);
    xi.forEach(p => {
      if (p.injured) return;
      const chance = (me.customClub ? 0.1 : 0.05) + (won ? 0.04 : drew ? 0.02 : 0);
      if (Math.random() < chance && p.ovr < (p.pot || 90)) {
        p.ovr = Math.min(p.pot || 90, p.ovr + 1);
        const attrs = D().attrsFromOvr(p.pos, p.ovr, p.age);
        Object.assign(p, attrs);
        p.value = D().valueOf(p.ovr, p.pot || p.ovr, p.age);
        p.form = Math.min(95, (p.form || 60) + 2);
      }
    });
    refreshClubLevel(me);
  }

  function ensureMeta() {
    if (!state) return;
    state.seasonLog = state.seasonLog || [];
    state.ledger = state.ledger || [];
    state.version = Math.max(state.version || 3, 6);
    ensureFinance();
  }

  function ensureFinance() {
    if (!state) return;
    state.finance = state.finance || {};
    const f = state.finance;
    if (f.debtWeeks == null) f.debtWeeks = 0;
    if (f.wageArrears == null) f.wageArrears = 0;
    if (f.embargo == null) f.embargo = false;
    if (f.emergencyLoanSeason == null) f.emergencyLoanSeason = 0;
    if (f.lastStatus == null) f.lastStatus = 'healthy';
    if (f.unpaidStreak == null) f.unpaidStreak = 0;
  }

  function pushLedger(amount, label) {
    if (!state) return;
    state.ledger = state.ledger || [];
    const me = club();
    state.ledger.unshift({
      id: D().uid('led'),
      at: Date.now(),
      season: state.season,
      week: state.week,
      amount: Math.round(amount),
      label,
      balance: me ? Math.round(me.budget) : 0
    });
    if (state.ledger.length > 100) state.ledger.length = 100;
  }

  function squadValueOf(me = club()) {
    return (me?.squad || []).reduce((s, p) => s + (p.value || 0), 0);
  }

  function weeklyPlayerWages(me = club()) {
    return (me?.squad || []).reduce((s, p) => s + (p.wage || 0), 0);
  }

  function weeklyStaffWages(me = club()) {
    ensureClubExtras(me);
    const staff = me.staff || {};
    return ((staff.coach || 1) + (staff.physio || 1) + (staff.scoutDir || 1)) * 12000;
  }

  function weeklyUpkeep(me = club()) {
    ensureClubExtras(me);
    const f = me.facilities || {};
    const levels = (f.stadium || 1) + (f.training || 1) + (f.youth || 1) + (f.medical || 1) + (f.scout || 1);
    const rate = me.customClub ? 4200 : 6500;
    return levels * rate;
  }

  function weeklyTvIncome(me = club()) {
    const league = W().LEAGUES.find(l => l.id === (me?.leagueId || state?.leagueId));
    const prize = league?.prize || 8e6;
    const weeks = Math.max(20, state?.fixtures?.length || 38);
    const base = prize / weeks / Math.max(10, leagueClubs().length || 16);
    const row = state?.table?.[me.id];
    const played = row?.played || 0;
    const pts = row?.pts || 0;
    const formBoost = played ? 0.85 + Math.min(0.45, (pts / Math.max(1, played * 3)) * 0.6) : 1;
    const customBoost = me.customClub ? 2.1 : 1;
    const lowRepBoost = (me.reputation || 70) < 65 ? 1.35 : 1;
    return Math.round(base * 4.2 * formBoost * ((me.reputation || 70) / 78) * customBoost * lowRepBoost);
  }

  function matchGateIncome(me, isHome) {
    const fans = me.fans || 8000;
    const stadium = me.facilities?.stadium || 1;
    const base = fans * (0.9 + stadium * 0.3);
    if (isHome) return Math.round(base * (14 + Math.random() * 10));
    return Math.round(base * (3.5 + Math.random() * 2.5)); // away share
  }

  /** Кредитный лимит: сколько клуб может уйти в минус */
  function creditLimit(me = club()) {
    if (!me) return 250000;
    const value = squadValueOf(me);
    const fans = me.fans || 8000;
    const rep = me.reputation || 70;
    const stadium = me.facilities?.stadium || 1;
    let limit = value * 0.07 + fans * 55 + rep * 90000 + stadium * 280000;
    if (me.customClub) limit *= 0.55;
    return Math.round(Math.max(180000, Math.min(45e6, limit)));
  }

  function debtInterestDue(me = club()) {
    const debt = Math.max(0, -(me?.budget || 0));
    if (debt <= 0) return 0;
    // ~1.1%/нед от долга, минимум 3к
    return Math.max(3000, Math.round(debt * 0.011));
  }

  function cashflowForecast(me = club()) {
    ensureFinance();
    if (!state.sponsor) pickSponsor(me);
    const wages = weeklyPlayerWages(me);
    const staff = weeklyStaffWages(me);
    const upkeep = weeklyUpkeep(me);
    const interest = debtInterestDue(me);
    const arrearsPlan = Math.min(state.finance.wageArrears || 0, Math.round(wages * 0.35));
    const sponsor = state.sponsor?.weekly || 0;
    const tv = weeklyTvIncome(me);
    const income = sponsor + tv;
    const expenses = wages + staff + upkeep + interest + arrearsPlan;
    return {
      wages, staff, upkeep, interest, arrearsPlan,
      sponsor, tv, income, expenses,
      net: income - expenses,
      gateHomeEst: Math.round((me.fans || 8000) * (0.9 + (me.facilities?.stadium || 1) * 0.3) * 16),
      gateAwayEst: Math.round((me.fans || 8000) * (0.9 + (me.facilities?.stadium || 1) * 0.3) * 4.5)
    };
  }

  function financeStatus(me = club()) {
    ensureFinance();
    if (!me) {
      return { id: 'healthy', label: 'Стабильно', level: 0 };
    }
    const budget = me.budget || 0;
    const credit = creditLimit(me);
    const debt = Math.max(0, -budget);
    const cf = cashflowForecast(me);
    const runway = cf.expenses > 0 ? budget / cf.expenses : 99;
    const f = state.finance;
    let id = 'healthy';
    let label = 'Стабильно';
    let level = 0;
    if (debt >= credit || f.wageArrears > wagesSoftCap(me) || f.debtWeeks >= 6) {
      id = 'insolvent'; label = 'Банкротство'; level = 4;
    } else if (debt >= credit * 0.55 || f.debtWeeks >= 3 || f.wageArrears > 0 || f.unpaidStreak >= 2) {
      id = 'critical'; label = 'Кризис'; level = 3;
    } else if (budget < 0) {
      id = 'deficit'; label = 'Дефицит'; level = 2;
    } else if (runway < 4 || cf.net < 0) {
      id = 'tight'; label = 'Напряжённо'; level = 1;
    }
    return {
      id, label, level,
      budget, debt, credit,
      creditLeft: Math.max(0, credit - debt),
      runwayWeeks: Math.max(0, Math.round(runway * 10) / 10),
      embargo: !!f.embargo || id === 'insolvent' || id === 'critical',
      wageArrears: f.wageArrears || 0,
      debtWeeks: f.debtWeeks || 0
    };
  }

  function wagesSoftCap(me = club()) {
    return weeklyPlayerWages(me) * 3;
  }

  /**
   * Discretionary spend gate. Wages/interest always apply via settle.
   * kind: transfer|facility|staff|youth|train|scout|contract
   */
  function canAfford(amount, kind = 'spend') {
    const me = club();
    if (!me) return { ok: false, msg: 'Нет клуба' };
    ensureFinance();
    const cost = Math.max(0, Math.round(Number(amount) || 0));
    const st = financeStatus(me);
    const after = (me.budget || 0) - cost;
    const debtAfter = Math.max(0, -after);

    if (cost <= 0) return { ok: true, msg: '' };

    if (st.id === 'insolvent') {
      return { ok: false, msg: 'Касса закрыта: клуб фактически банкрот. Продавайте игроков или ждите помощи совета.' };
    }
    if ((kind === 'transfer' || kind === 'facility' || kind === 'staff') && st.embargo) {
      return { ok: false, msg: 'Финансовое эмбарго: покупки и стройки заморожены до выхода из кризиса' };
    }
    if (kind === 'transfer' && st.id === 'deficit' && cost > Math.max(150000, st.credit * 0.08)) {
      return { ok: false, msg: 'В дефиците крупные трансферы запрещены советом' };
    }
    if (debtAfter > st.credit) {
      return { ok: false, msg: `Превышен кредитный лимит (${money(st.credit)}). Нужно ${money(cost)}, доступно с овердрафтом ${money(me.budget + st.credit)}` };
    }
    if (after < 0 && (kind === 'facility' || kind === 'staff') && st.level >= 2) {
      return { ok: false, msg: 'В минусе нельзя расширять инфраструктуру и штаб' };
    }
    if (me.budget < cost && st.id === 'healthy' && debtAfter > st.credit * 0.35) {
      // soft warn still allow within credit
    }
    return { ok: true, msg: after < 0 ? `Платёж уведёт кассу в минус (${money(after)})` : '' };
  }

  function adjustBudget(delta, label) {
    const me = club();
    if (!me) return 0;
    ensureFinance();
    me.budget = Math.round((me.budget || 0) + delta);
    pushLedger(delta, label);
    if (!state._settlingFinance) refreshFinanceFlags(me);
    return me.budget;
  }

  function refreshFinanceFlags(me = club()) {
    ensureFinance();
    if (!me) return;
    const f = state.finance;
    const st = financeStatus(me);
    f.embargo = st.id === 'critical' || st.id === 'insolvent';
    if (me.budget >= 0) {
      if (f.holdDebtWeeks) f.holdDebtWeeks = false;
      else f.debtWeeks = 0;
    }
    // status transition mail
    if (f.lastStatus !== st.id) {
      const worse = st.level > (STATUS_LEVEL[f.lastStatus] || 0);
      if (worse && st.level >= 2) {
        state.inbox.unshift({
          id: D().uid('m'), type: 'finance',
          title: `Финансы: ${st.label}`,
          body: financeStatusMessage(st),
          read: false, at: Date.now(), week: state.week
        });
      } else if (st.id === 'healthy' && (STATUS_LEVEL[f.lastStatus] || 0) >= 2) {
        state.inbox.unshift({
          id: D().uid('m'), type: 'finance',
          title: 'Финансы стабилизированы',
          body: 'Касса снова в плюсе. Эмбарго снято — можно планировать трансферы и стройки.',
          read: false, at: Date.now(), week: state.week
        });
      }
      f.lastStatus = st.id;
    }
  }

  const STATUS_LEVEL = { healthy: 0, tight: 1, deficit: 2, critical: 3, insolvent: 4 };

  function financeStatusMessage(st) {
    if (st.id === 'insolvent') {
      return `Долг ${money(st.debt)} при лимите ${money(st.credit)}. Покупки закрыты. Совет требует распродажи и может уволить при провале результатов.`;
    }
    if (st.id === 'critical') {
      return `Кризис: долг ${money(st.debt)}, недель в минусе: ${st.debtWeeks}. Трансферное эмбарго и запрет строек.`;
    }
    if (st.id === 'deficit') {
      return `Касса в минусе (${money(-st.debt)}). Идут проценты по овердрафту. Крупные покупки ограничены.`;
    }
    return `Бюджет под давлением. Запас хода ~${st.runwayWeeks} нед.`;
  }

  /** Недельный расчёт: доходы, зарплаты (с недоплатой), проценты, кризис */
  function settleWeeklyFinances() {
    const me = club();
    if (!me) return;
    ensureFinance();
    ensureClubExtras(me);
    if (!state.sponsor) pickSponsor(me);
    const f = state.finance;
    const cf = cashflowForecast(me);
    state._settlingFinance = true;

    // 1) Income first
    if (cf.sponsor) adjustBudget(cf.sponsor, 'Спонсор: ' + (state.sponsor?.name || 'партнёр'));
    if (cf.tv) adjustBudget(cf.tv, 'ТВ-пул лиги');

    // 2) Soft costs
    if (cf.upkeep) adjustBudget(-cf.upkeep, 'Содержание базы');

    // 3) Debt interest on opening debt after income/upkeep
    const interest = debtInterestDue(me);
    if (interest > 0) adjustBudget(-interest, 'Проценты по долгу');

    // 4) Wages — may partially pay if beyond credit
    const wagesDue = cf.wages + cf.staff;
    const credit = creditLimit(me);
    const room = me.budget + credit; // how much we can still go down
    let paid = wagesDue;
    let deferred = 0;
    if (wagesDue > 0 && room < wagesDue) {
      paid = Math.max(0, Math.floor(room));
      deferred = wagesDue - paid;
      f.wageArrears = (f.wageArrears || 0) + deferred;
      f.unpaidStreak = (f.unpaidStreak || 0) + 1;
      adjustBudget(-paid, paid > 0 ? 'Зарплаты (частично)' : 'Зарплаты не выплачены');
      if (deferred > 0) {
        pushLedger(0, `Задолженность по зарплате +${money(deferred)}`);
        me.morale = Math.max(15, (me.morale || 60) - (8 + Math.min(10, Math.floor(deferred / Math.max(1, wagesDue) * 12))));
        me.squad.forEach(p => {
          p.morale = Math.max(15, (p.morale || 60) - D().rnd(3, 9));
        });
        state.inbox.unshift({
          id: D().uid('m'), type: 'finance',
          title: 'Задержка зарплат',
          body: `Выплачено ${money(paid)} из ${money(wagesDue)}. Долг по зарплате: ${money(f.wageArrears)}. Мораль падает.`,
          read: false, at: Date.now(), week: state.week
        });
        if (state.board) state.board.confidence = Math.max(0, state.board.confidence - 6);
      }
    } else {
      adjustBudget(-wagesDue, 'Зарплаты состава и штаба');
      f.unpaidStreak = 0;
      if (f.wageArrears > 0 && me.budget > 0) {
        const repay = Math.min(f.wageArrears, Math.round(me.budget * 0.4), Math.round(cf.wages * 0.5));
        if (repay > 0) {
          adjustBudget(-repay, 'Погашение долга по зарплате');
          f.wageArrears = Math.max(0, f.wageArrears - repay);
          me.morale = Math.min(100, (me.morale || 60) + 3);
        }
      }
    }

    // 5) Debt week counter
    if (me.budget < 0) f.debtWeeks = (f.debtWeeks || 0) + 1;
    else f.debtWeeks = 0;

    state._settlingFinance = false;
    refreshFinanceFlags(me);
    processFinancialCrisis(me);
  }

  function processFinancialCrisis(me = club()) {
    ensureFinance();
    const st = financeStatus(me);
    const f = state.finance;
    if (!st || st.level < 3) return;

    // Board pressure
    if (state.board) {
      const hit = st.id === 'insolvent' ? 8 : 4;
      state.board.confidence = Math.max(0, state.board.confidence - hit);
      if (st.id === 'insolvent' && state.board.confidence < 28) {
        state.board.warnings = (state.board.warnings || 0) + 1;
      }
    }

    // Emergency loan once per season when insolvent/critical
    if ((st.id === 'insolvent' || (st.id === 'critical' && f.debtWeeks >= 4))
      && f.emergencyLoanSeason !== state.season) {
      const loan = Math.round(Math.min(st.credit * 0.35, Math.max(250000, st.debt * 0.55)));
      f.emergencyLoanSeason = state.season;
      const weeksBefore = f.debtWeeks || 0;
      adjustBudget(loan, 'Экстренный кредит совета');
      f.debtWeeks = Math.max(weeksBefore, 1);
      f.holdDebtWeeks = true;
      if (state.board) state.board.confidence = Math.max(0, state.board.confidence - 10);
      state.inbox.unshift({
        id: D().uid('m'), type: 'finance',
        title: 'Экстренный кредит совета',
        body: `Совет влил ${money(loan)} под жёсткий контроль. Уверенность совета падает. Продайте лишних и режьте ФОТ.`,
        read: false, at: Date.now(), week: state.week
      });
    }

    // Forced listing of expensive players when insolvent
    if (st.id === 'insolvent' || (st.id === 'critical' && f.debtWeeks >= 3)) {
      const xiIds = new Set((me.lineup || []).map(x => x?.id).filter(Boolean));
      const pool = [...(me.squad || [])].filter(p => p && !p.listed);
      const benchFirst = [
        ...pool.filter(p => !xiIds.has(p.id)).sort((a, b) => (b.wage || 0) - (a.wage || 0)),
        ...pool.filter(p => xiIds.has(p.id)).sort((a, b) => (b.wage || 0) - (a.wage || 0))
      ];
      const targets = benchFirst.slice(0, 2);
      let listed = 0;
      targets.forEach(p => {
        if (p.listed) return;
        p.listed = true;
        p.ask = Math.round((p.value || 0) * 0.85);
        state.transferList = state.transferList || [];
        if (!state.transferList.some(e => e.player?.id === p.id && e.clubId === me.id)) {
          state.transferList.unshift({
            id: D().uid('t'), type: 'transfer', player: p, clubId: me.id,
            clubName: me.name, leagueId: me.leagueId, ask: p.ask, wageAsk: p.wage
          });
        }
        listed++;
      });
      if (listed) {
        state.news.unshift({
          id: D().uid('n'), title: 'Распродажа',
          body: 'Финансовый контроль выставил игроков на трансфер.',
          at: Date.now()
        });
      }
    }

    // Sack on prolonged insolvency
    if (st.id === 'insolvent' && f.debtWeeks >= 5 && state.board && state.board.confidence < 25 && !state.sacked) {
      state.sacked = true;
      state.board.sacked = true;
      state.inbox.unshift({
        id: D().uid('m'), type: 'board',
        title: 'Увольнение · финансы',
        body: 'Совет не выдержал долговой ямы. Вас уволили. Найдите новый клуб.',
        read: false, at: Date.now(), week: state.week
      });
    }
  }

  function pickSponsor(me) {
    const clubObj = me || club();
    if (!clubObj) return null;
    const tiers = [
      { id: 'local', name: 'Городской банк', base: 38000 },
      { id: 'region', name: 'Регион Спорт', base: 72000 },
      { id: 'nation', name: 'Национальный бренд', base: 130000 },
      { id: 'global', name: 'EYE Global', base: 280000 }
    ];
    const rep = clubObj.reputation || 70;
    const stadium = clubObj.facilities?.stadium || 1;
    let idx = 0;
    if (rep >= 78 || stadium >= 3) idx = 1;
    if (rep >= 84 || stadium >= 4) idx = 2;
    if (rep >= 90 || stadium >= 5) idx = 3;
    if (clubObj.customClub && idx === 0) idx = 0; // keep local but higher base above
    const t = tiers[idx];
    // Debt-stressed clubs get worse sponsor terms
    const stress = Math.max(0, -(clubObj.budget || 0));
    const stressCut = stress > 0 ? Math.max(0.72, 1 - Math.min(0.28, stress / Math.max(1, creditLimit(clubObj)))) : 1;
    const customBoost = clubObj.customClub ? 1.25 : 1;
    state.sponsor = {
      id: t.id,
      name: t.name,
      weekly: Math.round(t.base * (0.85 + stadium * 0.1) * (rep / 82) * stressCut * customBoost)
    };
    return state.sponsor;
  }

  function ensureClubExtras(c) {
    if (!c) return;
    c.staff = c.staff || { coach: 1, physio: 1, scoutDir: 1 };
    c.youth = c.youth || [];
    c.facilities = c.facilities || { stadium: 1, training: 1, youth: 1, medical: 1, scout: 1 };
    (c.squad || []).forEach(p => {
      D().ensureTraits(p);
      // Heal broken starter wage bills (value-based wages were ~100× too high)
      if (c.customClub && !p.real && (p.ovr || 0) <= 70 && (p.wage || 0) > 14000) {
        p.wage = Math.max(450, Math.round(700 + Math.max(0, p.ovr - 48) * 260 + (p.age < 21 ? -100 : 150)));
      }
    });
    (c.youth || []).forEach(p => D().ensureTraits(p));
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

  function buildOtherLeagues(allClubs, myLeagueId) {
    const map = {};
    (W().LEAGUES || []).forEach(l => {
      if (l.id === myLeagueId) return;
      const clubs = allClubs.filter(c => c.leagueId === l.id);
      if (clubs.length < 2) return;
      const name = (window.EYE_I18N?.leagueRu(l.id, l)?.name) || l.name;
      map[l.id] = {
        id: l.id,
        name,
        table: emptySeasonTable(clubs),
        fixtures: buildFixtures(clubs.map(c => c.id))
      };
    });
    return map;
  }

  function applyToAnyTable(table, homeId, awayId, score) {
    const ht = table[homeId];
    const at = table[awayId];
    if (!ht || !at) return;
    const [hg, ag] = score;
    ht.played++; at.played++;
    ht.gf += hg; ht.ga += ag; at.gf += ag; at.ga += hg;
    if (hg > ag) { ht.w++; at.l++; ht.pts += 3; }
    else if (hg < ag) { at.w++; ht.l++; at.pts += 3; }
    else { ht.d++; at.d++; ht.pts++; at.pts++; }
  }

  function ensureSeeded(seeds, allClubs, ensureId, size) {
    const mustId = ensureId || state?.clubId;
    if (!mustId) return seeds.slice(0, size);
    if (seeds.some(c => c.id === mustId)) return seeds.slice(0, size);
    const mine = allClubs.find(c => c.id === mustId);
    if (!mine) return seeds.slice(0, size);
    const room = seeds.filter(c => c.id !== mustId).sort((a, b) => b.reputation - a.reputation).slice(0, size - 1);
    room.push(mine);
    return room;
  }

  const UCL_SLOTS = { epl: 3, laliga: 3, seriea: 3, bundesliga: 3, ligue1: 2, rpl: 2 };
  const KO_ORDER = ['Группы', '1/8', '1/4', '1/2', 'Финал', 'Чемпион'];
  const CWC_WEEKS_GROUPS = [7, 9, 11];
  const CWC_WEEK_SEMI = 13;
  const CWC_WEEK_FINAL = 15;

  function nextKoStage(round) {
    const map = { '1/8': '1/4', '1/4': '1/2', '1/2': 'Финал', 'Финал': 'Чемпион', 'Группы': '1/2' };
    return map[round] || round;
  }

  function makeKoComp(name, round, ids, meta = {}) {
    const bracket = ids.map((id, i) => (i % 2 === 0
      ? { home: id, away: ids[i + 1], played: false, score: null }
      : null)).filter(Boolean);
    return {
      name,
      round,
      bracket,
      champion: null,
      history: [],
      seeds: meta.seeds || [],
      qualified: meta.qualified || false,
      ...meta
    };
  }

  function snapshotUclQualifiers() {
    const out = [];
    const seen = new Set();
    const push = (id, leagueId, place, reason) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push({ id, leagueId, place, reason });
    };

    (W().LEAGUES || []).forEach(l => {
      const n = UCL_SLOTS[l.id] || 2;
      const table = sortedTable(l.id) || [];
      const short = l.short || l.name;
      table.slice(0, n).forEach((row, i) => {
        push(row.id, l.id, i + 1, `${short} · ${i + 1}-е место`);
      });
    });

    // Действующий чемпион ЛЧ — отдельная путёвка, если не прошёл по таблице
    const champId = state?.ucl?.champion || state?.lastUclChampion || null;
    if (champId) {
      const c = clubById(champId);
      push(champId, c?.leagueId || '', 0, 'чемпион ЛЧ');
    }

    return out.slice(0, 16);
  }

  function reputationUclSeeds(allClubs) {
    const byLeague = {};
    allClubs.forEach(c => {
      byLeague[c.leagueId] = byLeague[c.leagueId] || [];
      byLeague[c.leagueId].push(c);
    });
    let seeds = [];
    Object.entries(byLeague).forEach(([lid, list]) => {
      const n = UCL_SLOTS[lid] || 2;
      seeds.push(...[...list].sort((a, b) => b.reputation - a.reputation).slice(0, n).map((c, i) => ({
        id: c.id, leagueId: lid, place: i + 1,
        reason: `рейтинг · ${i + 1}-й в лиге`
      })));
    });
    seeds = seeds.sort((a, b) => {
      const ca = allClubs.find(c => c.id === a.id);
      const cb = allClubs.find(c => c.id === b.id);
      return (cb?.reputation || 0) - (ca?.reputation || 0);
    }).slice(0, 16);
    return seeds;
  }

  function createUcl(allClubs, ensureId, opts = {}) {
    // Wildcard только если явно запрошен — иначе путёвка по таблице/рейтингу
    const forcePlayer = opts.forcePlayer === true;
    let seedMeta = (opts.seeds && opts.seeds.length)
      ? opts.seeds
      : (state?.nextUclSeeds?.length ? state.nextUclSeeds : reputationUclSeeds(allClubs));

    let clubs = seedMeta.map(s => allClubs.find(c => c.id === s.id)).filter(Boolean);
    if (clubs.length < 16) {
      const have = new Set(clubs.map(c => c.id));
      const extra = allClubs.filter(c => !have.has(c.id)).sort((a, b) => b.reputation - a.reputation);
      for (const c of extra) {
        if (clubs.length >= 16) break;
        clubs.push(c);
        seedMeta.push({ id: c.id, leagueId: c.leagueId, place: 0, reason: 'добор по рейтингу' });
      }
    }
    clubs = clubs.slice(0, 16);
    seedMeta = seedMeta.filter(s => clubs.some(c => c.id === s.id)).slice(0, 16);

    const mustId = ensureId || state?.clubId;
    let wildcard = false;
    if (forcePlayer && mustId && !clubs.some(c => c.id === mustId)) {
      clubs = ensureSeeded(clubs, allClubs, mustId, 16);
      seedMeta = seedMeta.filter(s => s.id !== mustId).slice(0, 15);
      seedMeta.push({ id: mustId, leagueId: clubs.find(c => c.id === mustId)?.leagueId, place: 0, reason: 'wildcard менеджера' });
      wildcard = true;
    }

    const ids = clubs.map(c => c.id).sort(() => Math.random() - 0.5);
    return makeKoComp('Лига чемпионов EYE', '1/8', ids, {
      seeds: seedMeta,
      wildcard,
      qualified: !wildcard && mustId ? seedMeta.some(s => s.id === mustId) : true
    });
  }

  function createCup(clubs, ensureId) {
    const mustId = ensureId || state?.clubId;
    let pool = [...clubs].sort(() => Math.random() - 0.5);
    if (mustId) {
      const mine = pool.find(c => c.id === mustId);
      pool = pool.filter(c => c.id !== mustId);
      if (mine) pool.unshift(mine);
    }
    const pick = pool.slice(0, 8);
    const ids = pick.map(c => c.id).sort(() => Math.random() - 0.5);
    return makeKoComp('Кубок EYE', '1/4', ids, {
      seeds: pick.map(c => ({ id: c.id, reason: 'участник кубка' }))
    });
  }

  function emptyGroupTable(clubIds) {
    const t = {};
    clubIds.forEach(id => {
      t[id] = { id, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
    });
    return t;
  }

  function roundRobinMatchdays(ids) {
    const [a, b, c, d] = ids;
    const days = [
      [{ home: a, away: b }, { home: c, away: d }],
      [{ home: a, away: c }, { home: b, away: d }],
      [{ home: a, away: d }, { home: b, away: c }]
    ];
    return days.map(day => day.map(m => ({ ...m, played: false, score: null })));
  }

  function pickCwcSeeds(allClubs) {
    const seeds = [];
    const used = new Set();
    const push = (id, reason) => {
      if (!id || used.has(id)) return;
      const c = allClubs.find(x => x.id === id);
      if (!c) return;
      used.add(id);
      seeds.push({ id, reason, leagueId: c.leagueId });
    };

    // League champions from last finish or current table / reputation
    (W().LEAGUES || []).forEach(l => {
      const table = sortedTable(l.id);
      if (table?.length) push(table[0].id, `чемпион ${l.short || l.name}`);
      else {
        const top = allClubs.filter(c => c.leagueId === l.id).sort((a, b) => b.reputation - a.reputation)[0];
        if (top) push(top.id, `лидер ${l.short || l.name}`);
      }
    });

    // UCL holder
    if (state?.lastUclChampion) push(state.lastUclChampion, 'победитель ЛЧ');
    if (state?.ucl?.champion) push(state.ucl.champion, 'победитель ЛЧ');

    // Fill to 8 by reputation
    [...allClubs].sort((a, b) => b.reputation - a.reputation).forEach(c => {
      if (seeds.length >= 8) return;
      push(c.id, 'рейтинг мира');
    });
    return seeds.slice(0, 8);
  }

  function isClubInUclBracket(clubId) {
    if (!clubId || !state?.ucl) return false;
    if (state.ucl.champion === clubId) return true;
    if ((state.ucl.seeds || []).some(s => s.id === clubId)) return true;
    if ((state.ucl.bracket || []).some(m => m.home === clubId || m.away === clubId)) return true;
    return (state.ucl.history || []).some(h =>
      (h.ties || []).some(m => m.home === clubId || m.away === clubId)
    );
  }

  function createCwc(allClubs, ensureId) {
    let seeds = pickCwcSeeds(allClubs);
    const mustId = ensureId || state?.clubId;
    if (mustId && !seeds.some(s => s.id === mustId)) {
      const log = (state?.seasonLog || [])[0];
      const lastPlace = (log && log.clubId === mustId) ? (log.place || 0) : 0;
      const table = sortedTable(state?.leagueId);
      const livePlace = table.some(r => (r.played || 0) > 0)
        ? table.findIndex(r => r.id === mustId) + 1
        : 0;
      const place = lastPlace || livePlace;
      const inUcl = isClubInUclBracket(mustId);
      // Only sporting path: last season top-4 or active UCL — not raw reputation
      if ((place > 0 && place <= 4) || inUcl) {
        seeds = seeds.slice(0, 7);
        seeds.push({
          id: mustId,
          reason: inUcl
            ? 'участник ЛЧ'
            : `топ лиги · ${place}-е`,
          leagueId: state?.leagueId || allClubs.find(x => x.id === mustId)?.leagueId
        });
      }
    }
    const ids = seeds.map(s => s.id);
    const shuffled = [...ids].sort(() => Math.random() - 0.5);
    const gA = shuffled.slice(0, 4);
    const gB = shuffled.slice(4, 8);
    return {
      name: 'Клубный чемпионат мира',
      phase: 'groups',
      groupMatchday: 0,
      groups: {
        A: {
          name: 'Группа A',
          clubs: gA,
          table: emptyGroupTable(gA),
          matchdays: roundRobinMatchdays(gA)
        },
        B: {
          name: 'Группа B',
          clubs: gB,
          table: emptyGroupTable(gB),
          matchdays: roundRobinMatchdays(gB)
        }
      },
      bracket: [],
      round: 'Группы',
      history: [],
      champion: null,
      seeds,
      clubs: ids,
      best: ''
    };
  }

  function refreshTransferMarket() {
    if (!state) return;
    const me = club();
    // Keep player's own listings so weekly refresh doesn't wipe them
    const ownListings = (state.transferList || []).filter(e => e.clubId === me.id);
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
    state.transferList = [...ownListings, ...list];
  }

  function filterMarket({ pos, maxPrice, minOvr, maxAge, leagueId, q } = {}) {
    const meId = state?.clubId;
    let list = [...(state?.transferList || [])].filter(e => e.clubId !== meId);
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
    state.savedAt = Date.now();
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) { console.warn('save', e); }
    try { if (typeof window !== 'undefined' && window.EYE_ON_SAVE) window.EYE_ON_SAVE(state); } catch {}
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
      if (!state.ucl) state.ucl = createUcl(state.clubs || [], state.clubId, { forcePlayer: false });
      if (!state.cup) state.cup = createCup(leagueClubs(), state.clubId);
      if (!state.cwc) state.cwc = createCwc(state.clubs || [], state.clubId);
      if (state.sacked == null) state.sacked = false;
      if (state.cwcBest == null) state.cwcBest = '';
      // Кубок: если игрок выпал из неначатой сетки — вернуть
      if (state.cup && !state.cup.champion && state.clubId) {
        const inC = (state.cup.bracket || []).some(m => m.home === state.clubId || m.away === state.clubId);
        const started = (state.cup.bracket || []).some(m => m.played) || (state.cup.history || []).length;
        if (!inC && !started) state.cup = createCup(leagueClubs(), state.clubId);
      }
      // Убрать незаслуженный wildcard ЛЧ у своего клуба (если турнир ещё не начат)
      if (state.ucl && !state.ucl.champion && state.clubId && club()?.customClub) {
        const started = (state.ucl.bracket || []).some(m => m.played) || (state.ucl.history || []).length;
        const mySeed = (state.ucl.seeds || []).find(s => s.id === state.clubId);
        const undeserved = !!state.ucl.wildcard
          || (mySeed && String(mySeed.reason || '').includes('wildcard'));
        if (!started && undeserved) {
          state.ucl = createUcl(state.clubs || [], state.clubId, { forcePlayer: false });
          const cwcStarted = state.cwc && (
            (state.cwc.groupMatchday || 0) > 0
            || state.cwc.phase === 'ko'
            || state.cwc.champion
            || Object.values(state.cwc.groups || {}).some(g =>
              (g.matchdays || []).some(day => (day || []).some(m => m.played))
            )
          );
          if (state.cwc && !cwcStarted) {
            state.cwc = createCwc(state.clubs || [], state.clubId);
          }
          state.uclBest = '';
          state.cwcBest = '';
        }
      }
      if (state.cupBest == null) state.cupBest = '';
      if (state.uclBest == null) state.uclBest = '';
      if (!state.ucl.history) state.ucl.history = [];
      if (!state.cup.history) state.cup.history = [];
      if (state.cwc && !state.cwc.history) state.cwc.history = [];
      if (!state.otherLeagues) state.otherLeagues = buildOtherLeagues(state.clubs || [], state.leagueId);
      state.clubs?.forEach(ensureClubExtras);
      ensureMeta();
      if (!state.sponsor && club()) pickSponsor(club());
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
    const income = matchGateIncome(me, isHome);
    adjustBudget(prize, won ? 'Победа: призовые' : drew ? 'Ничья: призовые' : 'Поражение: призовые');
    adjustBudget(income, isHome ? 'Касса домашнего матча' : 'Гостевая доля кассы');

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
      opponent: isHome ? clubById(match.away).name : clubById(match.home).name,
      derby: result.derby || null,
      highlights: extractHighlights(result)
    };
    applyMatchAwards(result);
    applyMatchDevelopment(won, drew);
    state.history.unshift({
      at: Date.now(), season: state.season, week: state.week,
      home: result.home, away: result.away, score: result.score,
      motm: result.motm ? { id: result.motm.id, name: result.motm.name, rating: result.motm.rating } : null
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
    queuePressConference(won, drew, state.leagueName || 'Матч лиги');
    advanceWeek();
    save();
  }

  function extractHighlights(result) {
    const goals = [];
    (result.scorersH || []).forEach(s => {
      goals.push({ minute: s.minute, type: 'goal', side: 'home', text: `${s.player.name}${s.assist ? ' (п. ' + s.assist.name + ')' : ''}` });
    });
    (result.scorersA || []).forEach(s => {
      goals.push({ minute: s.minute, type: 'goal', side: 'away', text: `${s.player.name}${s.assist ? ' (п. ' + s.assist.name + ')' : ''}` });
    });
    const extras = (result.events || []).filter(e => e.type === 'red' || e.type === 'injury');
    return [...goals, ...extras]
      .sort((a, b) => (a.minute || 0) - (b.minute || 0))
      .slice(0, 14);
  }

  function applyMatchAwards(result) {
    if (!result) return;
    if (!result.ratings && result.xiHome) {
      Object.assign(result, E().rateMatch(result));
    }
    const list = result.ratings?.list || [];
    const byId = {};
    for (const c of state.clubs || []) {
      (c.squad || []).forEach(p => { byId[p.id] = p; });
    }
    list.forEach(r => {
      const p = byId[r.id];
      if (!p) return;
      const rating = Number(r.rating) || 6;
      p.seasonRatingSum = (p.seasonRatingSum || 0) + rating;
      p.seasonRatingApps = (p.seasonRatingApps || 0) + 1;
      // form/morale from performance
      const delta = (rating - 6.5) * 2.2;
      p.form = Math.max(30, Math.min(99, (p.form || 60) + delta));
      if (rating >= 7.5) p.morale = Math.min(100, (p.morale || 60) + 2);
      else if (rating <= 5.5) p.morale = Math.max(20, (p.morale || 60) - 2);
    });

    const motm = result.motm;
    if (!motm) return;
    state.stats = state.stats || { scorers: {}, assisters: {}, motm: {} };
    state.stats.motm = state.stats.motm || {};
    state.stats.motm[motm.id] = state.stats.motm[motm.id] || { id: motm.id, name: motm.name, count: 0 };
    state.stats.motm[motm.id].count++;
    state.stats.motm[motm.id].name = motm.name;
    const p = byId[motm.id];
    if (p) {
      p.form = Math.min(99, (p.form || 60) + 2);
      p.morale = Math.min(100, (p.morale || 60) + 2);
    }
  }

  function avgSeasonRating(p) {
    if (!p?.seasonRatingApps) return null;
    return Math.round((p.seasonRatingSum / p.seasonRatingApps) * 10) / 10;
  }

  function simOtherLeaguesWeek() {
    const map = state.otherLeagues || {};
    Object.values(map).forEach(lg => {
      const round = (lg.fixtures || []).find(r => r.round === state.week);
      if (!round) return;
      round.matches.forEach(m => {
        if (m.played) return;
        const home = clubById(m.home);
        const away = clubById(m.away);
        if (!home || !away) { m.played = true; m.score = [0, 0]; return; }
        const res = simulateAIMatch(home, away);
        m.played = true;
        m.score = res.score;
        applyToAnyTable(lg.table, m.home, m.away, res.score);
        if (Math.random() < 0.18) {
          const upset = Math.abs(res.score[0] - res.score[1]) >= 3 || (home.reputation > away.reputation + 8 && res.score[0] < res.score[1]);
          state.news.unshift({
            id: D().uid('n'),
            title: upset ? `${lg.name}: сенсация` : lg.name,
            body: `${res.home} ${res.score[0]}:${res.score[1]} ${res.away}`,
            at: Date.now()
          });
        }
      });
    });
  }

  function advanceWeek() {
    state.week++;
    const me = club();
    ensureClubExtras(me);
    settleWeeklyFinances();
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
      if (xiIds.has(p.id)) {
        p.morale = Math.min(100, (p.morale || 60) + 1);
        if (p.request === 'playtime') {
          delete p.request;
          p.morale = Math.min(100, (p.morale || 60) + 4);
        }
      } else if ((p.seasonApps || 0) < state.week / 3 && p.ovr >= me.reputation - 5) {
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
    processSquadRequests();
    processContractPressure();
    maybeYouthIntake();
    midSeasonBoardCheck();
    pulseWorldNews();
    maybePlayCupAiWeek();
    maybePlayUclAiWeek();
    maybePlayCwcAiWeek();
    state.trainCountWeek = 0;
    state.recoverCountWeek = 0;
    const allPlayed = state.fixtures.every(r => r.matches.every(m => m.played));
    if (allPlayed) {
      finishOutstandingKnockouts();
      endSeason();
    }
  }

  /** Доигрывает кубки/ЛЧ/ЧМ перед сменой сезона, чтобы матчи не сгорали */
  function finishOutstandingKnockouts() {
    let guard = 0;
    while (guard++ < 24) {
      const cwc = playerCwcMatch();
      const ucl = playerUclMatch();
      const cup = playerCupMatch();
      const pending = cwc || ucl || cup;
      if (!pending) break;
      const home = clubById(pending.home);
      const away = clubById(pending.away);
      if (!home || !away) {
        pending.played = true;
        pending.score = [1, 0];
        continue;
      }
      const res = simulateAIMatch(home, away);
      if (cwc) recordCwcMatch(pending, res);
      else if (ucl) recordUclMatch(pending, res);
      else recordCupMatch(pending, res);
    }
    for (let i = 0; i < 16; i++) {
      let progressed = false;
      if (state.cwc && !state.cwc.champion) {
        if (state.cwc.phase === 'groups') {
          const before = state.cwc.groupMatchday;
          resolveCwcGroupMatchdayAI(null);
          advanceCwcFromGroups();
          if (state.cwc.groupMatchday !== before || state.cwc.phase === 'ko') progressed = true;
        } else {
          const round = state.cwc.round;
          resolveCompAI(state.cwc, null);
          advanceKnockout(state.cwc, 'Клубный ЧМ', 1800000);
          if (state.cwc.round !== round || state.cwc.champion) progressed = true;
        }
      }
      if (state.ucl && !state.ucl.champion) {
        const round = state.ucl.round;
        resolveCompAI(state.ucl, null);
        advanceKnockout(state.ucl, 'ЛЧ EYE', 2500000);
        if (state.ucl.round !== round || state.ucl.champion) progressed = true;
      }
      if (state.cup && !state.cup.champion) {
        const round = state.cup.round;
        resolveCompAI(state.cup, null);
        advanceKnockout(state.cup, 'Кубок EYE', 800000);
        if (state.cup.round !== round || state.cup.champion) progressed = true;
      }
      if (!progressed) break;
    }
  }

  function maybeYouthIntake() {
    const me = club();
    if (!me) return;
    // набор: тур 2 и середина сезона
    const half = Math.max(8, Math.floor((state.fixtures?.length || 20) / 2));
    if (state.week !== 2 && state.week !== half) return;
    if (state.youthIntakeWeek === state.week && state.youthIntakeSeason === state.season) return;
    runYouthIntake();
  }

  function runYouthIntake() {
    const me = club();
    ensureClubExtras(me);
    const level = me.facilities.youth || 1;
    const n = Math.min(4, 1 + Math.floor(level / 2) + (Math.random() < 0.45 ? 1 : 0));
    const intake = [];
    for (let i = 0; i < n; i++) {
      const pos = D().pick(['CB', 'CM', 'ST', 'RW', 'LW', 'RB', 'LB', 'CAM', 'CDM', 'GK']);
      const base = 46 + level * 3 + D().rnd(0, 6);
      const p = D().genPlayer(pos, base, D().rnd(15, 18), me.id);
      p.pot = Math.min(94, p.ovr + D().rnd(10, 22) + level);
      p.youth = true;
      p.intake = true;
      D().ensureTraits(p);
      me.youth.push(p);
      intake.push(p);
    }
    state.youthIntakeWeek = state.week;
    state.youthIntakeSeason = state.season;
    state.inbox.unshift({
      id: D().uid('m'), type: 'youth_intake', title: 'Набор в академию',
      body: `Пришли ${intake.length}: ${intake.map(p => `${p.name} (${D().POS_LABEL[p.pos]}, пот. ${p.pot})`).join(', ')}. Можно выпустить лучшего или отчислить слабых.`,
      players: intake.map(p => p.id),
      read: false, at: Date.now(), week: state.week
    });
    state.news.unshift({
      id: D().uid('n'), title: 'Академия пополнилась',
      body: intake.map(p => p.name).join(', '),
      at: Date.now()
    });
    return intake;
  }

  function releaseYouth(playerId) {
    const me = club();
    ensureClubExtras(me);
    const p = me.youth.find(x => x.id === playerId);
    if (!p) return { ok: false, msg: 'Нет в академии' };
    me.youth = me.youth.filter(x => x.id !== playerId);
    save();
    return { ok: true, msg: `${p.name} отчислен из академии` };
  }

  function processContractPressure() {
    const me = club();
    if (!me || state.week % 4 !== 2) return;
    const recent = (state.inbox || []).some(m => m.type === 'contract_ask' && state.week - (m.week || 0) < 4);
    if (recent) return;
    const p = me.squad
      .filter(x => (x.contract || 1) <= 1 && x.ovr >= 72 && !x.loan)
      .sort((a, b) => b.ovr - a.ovr)[0];
    if (!p) return;
    const wantWage = Math.round(p.wage * (1.12 + Math.random() * 0.18));
    state.inbox.unshift({
      id: D().uid('m'), type: 'contract_ask', title: `${p.name}: новый контракт`,
      body: `Контракт истекает через ${p.contract} г. Хочет ~${money(wantWage)}/нед. Откройте карточку игрока для переговоров.`,
      playerId: p.id, wantWage, read: false, at: Date.now(), week: state.week
    });
  }

  function pulseWorldNews() {
    if (!state) return;
    const roll = Math.random();
    // title race / shock already partly from other leagues — add flavoured pulses
    if (roll < 0.35) {
      const leagues = Object.values(state.otherLeagues || {});
      if (!leagues.length) return;
      const lg = D().pick(leagues);
      const table = Object.values(lg.table || {}).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
      if (table.length < 2) return;
      const lead = table[0];
      const chase = table[1];
      const gap = (lead.pts || 0) - (chase.pts || 0);
      state.news.unshift({
        id: D().uid('n'),
        title: gap <= 3 ? `${lg.name}: интрига наверху` : `${lg.name}: ${lead.name} лидирует`,
        body: gap <= 3
          ? `${lead.name} ${lead.pts} очк., ${chase.name} ${chase.pts} — отрыв ${gap}.`
          : `${lead.name} уверенно ведёт (${lead.pts} очк., РМ ${(lead.gf - lead.ga) >= 0 ? '+' : ''}${lead.gf - lead.ga}).`,
        at: Date.now()
      });
    } else if (roll < 0.55) {
      const stars = state.transferList?.filter(e => e.type === 'star' || (e.player?.ovr || 0) >= 84) || [];
      if (stars.length) {
        const e = D().pick(stars);
        state.news.unshift({
          id: D().uid('n'), title: 'Трансферный слух',
          body: `${e.player.name} (${e.player.ovr}) из ${e.clubName || 'свободных'} может сменить клуб. Запрос ${money(e.ask)}.`,
          at: Date.now()
        });
      }
    } else if (roll < 0.7) {
      const me = club();
      const injured = me?.squad.filter(p => p.injured > 0)[0];
      if (injured) {
        state.news.unshift({
          id: D().uid('n'), title: 'Медкарта клуба',
          body: `${injured.name} вне игры ещё ~${injured.injured} тур(а).`,
          at: Date.now()
        });
      }
    }
    if (state.news.length > 40) state.news.length = 40;
  }

  function processSquadRequests() {
    const me = club();
    if (!me || state.week < 5 || state.week % 3 !== 0) return;
    const recent = (state.inbox || []).some(m => m.type === 'request' && state.week - (m.week || 0) < 3);
    if (recent) return;
    const xiIds = new Set((me.lineup || me.squad.slice(0, 11)).map(p => p.id));
    const pool = me.squad.filter(p =>
      !xiIds.has(p.id) &&
      !p.request &&
      !p.loan &&
      (p.seasonApps || 0) < Math.max(1, state.week * 0.22) &&
      p.ovr >= (me.reputation || 70) - 8 &&
      (p.morale || 60) <= 58
    ).sort((a, b) => b.ovr - a.ovr);
    if (!pool.length) return;
    const p = pool[0];
    p.request = 'playtime';
    state.inbox.unshift({
      id: D().uid('m'), type: 'request', title: `${p.name}: мало игрового времени`,
      body: `Хочет место в основе. Игр: ${p.seasonApps || 0}, мораль ${Math.round(p.morale || 0)}. Можно пообещать минуты, выставить на трансфер или отказать.`,
      playerId: p.id, action: 'playtime', read: false, at: Date.now(), week: state.week
    });
  }

  function resolvePlayerRequest(playerId, decision) {
    const me = club();
    const p = me?.squad.find(x => x.id === playerId);
    if (!p) return { ok: false, msg: 'Игрок не найден' };
    const mail = (state.inbox || []).find(m => m.type === 'request' && m.playerId === playerId && !m.resolved);
    if (decision === 'promise') {
      p.request = 'playtime';
      p.morale = Math.min(100, (p.morale || 60) + 6);
      if (mail) { mail.resolved = true; mail.body += ' · Обещали минуты.'; }
      save();
      return { ok: true, msg: `${p.name}: ждёт места в XI` };
    }
    if (decision === 'list') {
      p.listed = true;
      p.request = null;
      p.morale = Math.max(20, (p.morale || 60) - 4);
      const ask = Math.round(p.value * 1.05);
      state.transferList = state.transferList || [];
      state.transferList.unshift({
        id: D().uid('t'), type: 'listed', player: p, clubId: me.id,
        clubName: me.name, leagueId: me.leagueId, ask, wageAsk: p.wage
      });
      if (mail) { mail.resolved = true; mail.body += ' · Выставлен на трансфер.'; }
      save();
      return { ok: true, msg: `${p.name} на рынке · ${money(ask)}` };
    }
    // dismiss
    p.request = null;
    p.morale = Math.max(15, (p.morale || 60) - 10);
    if (mail) { mail.resolved = true; mail.body += ' · Отказ.'; }
    save();
    return { ok: true, msg: `${p.name} недоволен отказом` };
  }

  function midSeasonBoardCheck() {
    if (!state?.board || state.sacked) return;
    const half = Math.max(6, Math.floor((state.fixtures?.length || 20) / 2));
    if (state.week !== half + 1) return;
    if (state.board.midReviewDone === state.season) return;
    state.board.midReviewDone = state.season;
    const pos = sortedTable().findIndex(t => t.id === club().id) + 1;
    const target = state.board.targetPlace;
    let delta = 0;
    let tone = 'на курсе';
    if (pos <= target) { delta = 5; tone = 'опережаете план'; }
    else if (pos <= target + 2) { delta = 0; tone = 'в зоне риска'; }
    else { delta = -7; tone = 'отстаёте от цели'; state.board.warnings++; }
    state.board.confidence = Math.max(0, Math.min(100, state.board.confidence + delta));
    state.inbox.unshift({
      id: D().uid('m'), type: 'board', title: 'Промежуточный отчёт совета',
      body: `Середина сезона: ${pos}-е место (цель ≤${target}). Вы ${tone}. Уверенность: ${state.board.confidence}%.`,
      read: false, at: Date.now(), week: state.week
    });
    state.news.unshift({
      id: D().uid('n'), title: 'Совет подвёл итоги половины',
      body: `${club().name}: ${pos}-е · уверенность ${state.board.confidence}%`,
      at: Date.now()
    });
  }

  function sortedTable(leagueId) {
    const lid = leagueId || state.leagueId;
    if (lid === state.leagueId) {
      return Object.values(state.table).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
    }
    const lg = state.otherLeagues?.[lid];
    if (!lg) return [];
    return Object.values(lg.table).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
  }

  function listLeagueTables() {
    const mine = { id: state.leagueId, name: state.leagueName };
    const others = Object.values(state.otherLeagues || {}).map(l => ({ id: l.id, name: l.name }));
    return [mine, ...others];
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
    const myRow = table.find(t => t.id === me.id);
    const league = W().leagueById(state.leagueId);
    const prize = Math.round((league?.prize || 1e6) * (1.1 - (pos - 1) * 0.06));
    adjustBudget(prize, `Призовые лиги · ${pos}-е место`);

    const scorers = topScorers(5);
    const byAssists = [...scorers].sort((a, b) => b.assists - a.assists || b.goals - a.goals);
    ensureMeta();
    state.seasonLog.unshift({
      season: state.season,
      leagueId: state.leagueId,
      leagueName: state.leagueName,
      clubId: me.id,
      clubName: me.name,
      place: pos,
      pts: myRow?.pts || 0,
      gd: (myRow?.gf || 0) - (myRow?.ga || 0),
      gf: myRow?.gf || 0,
      ga: myRow?.ga || 0,
      prize,
      cupBest: state.cup?.champion === me.id ? 'Чемпион' : (state.cupBest || '—'),
      uclBest: state.ucl?.champion === me.id ? 'Чемпион' : (state.uclBest || '—'),
      cwcBest: state.cwc?.champion === me.id ? 'Чемпион' : (state.cwcBest || '—'),
      goldenBoot: scorers[0] ? { name: scorers[0].name, goals: scorers[0].goals } : null,
      topAssist: byAssists[0] ? { name: byAssists[0].name, assists: byAssists[0].assists } : null,
      boardTarget: state.board?.targetLabel || '',
      confidence: state.board?.confidence ?? null,
      at: Date.now()
    });
    if (state.seasonLog.length > 24) state.seasonLog.length = 24;

    state.clubs.forEach(c => {
      c.squad.forEach(p => {
        p.age++;
        if (p.age > 32 && Math.random() < 0.35) p.ovr = Math.max(45, p.ovr - 1);
        if (p.age < 24 && p.ovr < p.pot && Math.random() < 0.55) p.ovr = Math.min(p.pot, p.ovr + 1);
        p.seasonGoals = 0; p.seasonAssists = 0; p.seasonApps = 0;
        p.seasonRatingSum = 0; p.seasonRatingApps = 0;
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
    if (state.seasonLog[0]) {
      state.seasonLog[0].boardOk = !!review.ok;
      state.seasonLog[0].sacked = !!review.sacked;
      state.seasonLog[0].confidence = state.board.confidence;
    }
    let boardMsg = review.ok
      ? `Цели выполнены (${state.board.targetLabel}). Уверенность: ${state.board.confidence}%.`
      : `Цели не достигнуты. Уверенность: ${state.board.confidence}%. Предупреждений: ${state.board.warnings}.`;
    if (review.sacked) {
      state.sacked = true;
      boardMsg += ' Вас уволили.';
    }

    const seasonLeagueName = state.leagueName;

    // Snapshot UCL qualification from finished tables BEFORE promotion/relegation reshuffle
    const nextSeeds = snapshotUclQualifiers();
    const uclChamp = state.ucl?.champion || state.lastUclChampion || null;
    const inNextUcl = nextSeeds.some(s => s.id === me.id);
    const mySeed = nextSeeds.find(s => s.id === me.id);

    // Promotion / relegation (after UCL snapshot)
    const ladderMsg = applyLadderMove(pos, table.length);

    state.inbox.unshift({
      id: D().uid('m'), type: 'ucl',
      title: inNextUcl ? 'ЛЧ: квалификация' : 'ЛЧ: вне зоны',
      body: inNextUcl
        ? `Вы в Лиге чемпионов следующего сезона (${mySeed?.reason || 'путёвка'}). Сетка обновится с нового тура.`
        : `По итогам сезона вы не попали в зону ЛЧ. Путёвку даёт только место в таблице (или титул чемпиона ЛЧ).`,
      read: false, at: Date.now()
    });

    state.inbox.unshift({
      id: D().uid('m'), type: 'season',
      title: `Сезон ${state.season} завершён — ${seasonLeagueName}`,
      body: `Место: ${pos}. Призовые: ${money(prize)}. ${boardMsg} ${ladderMsg}`,
      read: false, at: Date.now()
    });

    if (state.sacked) {
      state.nextUclSeeds = nextSeeds;
      state.lastUclChampion = uclChamp;
      save();
      return;
    }

    state.season++;
    state.week = 1;
    state.board = B().createBoard(me);
    state.cupBest = '';
    state.uclBest = '';
    state.cwcBest = '';
    state.nextUclSeeds = nextSeeds;
    state.lastUclChampion = uclChamp;
    const lc = leagueClubs();
    state.table = emptySeasonTable(lc);
    state.fixtures = buildFixtures(lc.map(c => c.id));
    state.stats = { scorers: {}, assisters: {}, motm: {} };
    state.cup = createCup(lc, me.id);
    // Next UCL from table finishers — no free wildcard
    state.ucl = createUcl(state.clubs, me.id, {
      seeds: nextSeeds,
      forcePlayer: false
    });
    state.cwc = createCwc(state.clubs, me.id);
    state.otherLeagues = buildOtherLeagues(state.clubs, state.leagueId);
    refillYouth(me, true);
    me.squad.forEach(p => { p.seasonYellows = 0; p.yellow = 0; p.suspended = 0; });
    const uclIn = (state.ucl.bracket || []).some(m => m.home === me.id || m.away === me.id);
    const cwcIn = isClubInCwc(me.id);
    state.inbox.unshift({
      id: D().uid('m'), type: 'board', title: 'Новые цели совета',
      body: `${state.board.targetLabel}. Уверенность: ${state.board.confidence}%.${
        uclIn ? ' Вы в сетке ЛЧ.' : ' Вне ЛЧ — проход только через зону квалификации.'
      }${cwcIn ? ' Клубный ЧМ: группы на турах 7/9/11.' : ''}`,
      read: false, at: Date.now()
    });
    if (cwcIn) {
      const seed = (state.cwc.seeds || []).find(s => s.id === me.id);
      state.inbox.unshift({
        id: D().uid('m'), type: 'cwc', title: 'Клубный чемпионат мира',
        body: `Сид: ${seed?.reason || 'приглашение'}. Расписание: группы 7·9·11, 1/2 — 13, финал — 15.`,
        read: false, at: Date.now()
      });
    }
    refreshTransferMarket();
    save();
  }

  function applyLadderMove(pos, tableSize) {
    const me = club();
    let dir = 0;
    if (pos <= 2) dir = -1; // up ladder (better league)
    else if (pos >= tableSize - 1) dir = 1; // down — last two places (n-1 and n)
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
    adjustBudget(dir < 0 ? 2e6 : -5e5, dir < 0 ? 'Бонус повышения' : 'Штраф вылета');
    pickSponsor(me);
    return dir < 0
      ? `Повышение в «${targetLeague.name}»! (обмен с ${swap.name})`
      : `Вылет в «${targetLeague.name}». (обмен с ${swap.name})`;
  }

  function train(typeId) {
    const me = club();
    ensureClubExtras(me);
    const t = D().TRAINING.find(x => x.id === typeId);
    if (!t) return { ok: false, msg: 'Нет такой тренировки' };
    const used = state.trainCountWeek || 0;
    const limit = 2;
    const isRecovery = t.focus === 'condition';
    if (!isRecovery && used >= limit) {
      return { ok: false, msg: `Лимит развития на тур: ${limit}. Можно только «Восстановление».` };
    }
    if (isRecovery && (state.recoverCountWeek || 0) >= 1) {
      return { ok: false, msg: 'Восстановление уже проводили на этом туре' };
    }
    const cost = 12000 + me.facilities.training * 3000;
    const gate = canAfford(cost, 'train');
    if (!gate.ok) return { ok: false, msg: gate.msg };
    adjustBudget(-cost, `Тренировка «${t.name}»`);
    if (isRecovery) state.recoverCountWeek = (state.recoverCountWeek || 0) + 1;
    else state.trainCountWeek = used + 1;
    const boost = t.boost + me.facilities.training + Math.floor((me.staff.coach || 1) / 2)
      + (me.customClub ? 1 : 0);
    const gains = [];
    let recovered = 0;
    let skipped = 0;
    me.squad.forEach(p => {
      D().ensureTraits(p);
      if (p.injured || p.suspended) { skipped++; return; }
      if (t.focus === 'condition') {
        const before = Math.round((p.condition || 70) + (p.energy || 70));
        p.condition = Math.min(100, p.condition + boost);
        p.energy = Math.min(100, p.energy + boost);
        const after = Math.round((p.condition || 70) + (p.energy || 70));
        if (after > before) {
          recovered++;
          if (gains.length < 8) gains.push({ id: p.id, name: p.name, text: `+конд/энергия` });
        }
      } else {
        const focusHit = p.devFocus && D().DEV_FOCUS.find(f => f.id === p.devFocus)?.attr === t.focus;
        const beforeAttr = p[t.focus] || 60;
        const beforeOvr = p.ovr;
        p[t.focus] = Math.min(99, beforeAttr + (Math.random() < (focusHit ? 0.78 : 0.55) ? 1 : 0));
        if (focusHit && Math.random() < 0.35) {
          const alt = D().DEV_FOCUS.find(f => f.id === p.devFocus)?.attr;
          if (alt && alt !== t.focus) p[alt] = Math.min(99, (p[alt] || 60) + 1);
        }
        const growChance = 0.12 + me.facilities.training * 0.02 + (me.staff.coach || 1) * 0.01
          + (focusHit ? 0.06 : 0) + (me.customClub ? 0.05 : 0);
        if (Math.random() < growChance) {
          p.ovr = Math.min(p.pot, p.ovr + 1);
        }
        p.condition = Math.max(45, p.condition - 3);
        p.form = Math.min(99, p.form + 1);
        const bits = [];
        if ((p[t.focus] || 0) > beforeAttr) bits.push(`+${t.focus}`);
        if (p.ovr > beforeOvr) bits.push('+OVR');
        if (focusHit) bits.push('фокус');
        if (bits.length && gains.length < 10) gains.push({ id: p.id, name: p.name, text: bits.join(' · ') });
      }
    });
    refreshClubLevel(me);
    save();
    const ready = squadReadiness();
    return {
      ok: true,
      msg: `Тренировка «${t.name}» (−${money(cost)})`,
      training: t,
      cost,
      gains,
      recovered,
      skipped,
      readiness: ready
    };
  }

  function squadReadiness() {
    const me = club();
    if (!me) return null;
    const sq = me.squad || [];
    const n = sq.length || 1;
    const avgCond = Math.round(sq.reduce((s, p) => s + (p.condition || 70), 0) / n);
    const avgEnergy = Math.round(sq.reduce((s, p) => s + (p.energy || 70), 0) / n);
    const injured = sq.filter(p => p.injured > 0);
    const suspended = sq.filter(p => p.suspended > 0);
    const tired = sq.filter(p => !p.injured && !p.suspended && ((p.condition || 100) < 58 || (p.energy || 100) < 52));
    const cards = sq.filter(p => (p.seasonYellows || 0) >= 4 && !p.suspended);
    return { avgCond, avgEnergy, injured, suspended, tired, cards, size: sq.length };
  }

  function playerBoardRow(p, slotPos) {
    if (!p) return null;
    const cond = Math.round(p.condition || 70);
    const energy = Math.round(p.energy || 70);
    const form = Math.round(p.form || 60);
    const unfit = (p.injured > 0) || (p.suspended > 0);
    const tired = !unfit && (cond < 58 || energy < 52);
    return {
      id: p.id,
      name: p.name,
      pos: D().POS_LABEL[slotPos || p.pos] || slotPos || p.pos,
      rawPos: p.pos,
      ovr: p.ovr,
      form,
      condition: cond,
      energy,
      unfit,
      tired,
      status: p.injured > 0 ? `травма ${p.injured}` : p.suspended > 0 ? `бан ${p.suspended}` : tired ? 'усталость' : ''
    };
  }

  function groupStrength(players) {
    const list = (players || []).filter(Boolean);
    if (!list.length) return { avgOvr: 0, avgCond: 0, avgEnergy: 0, avgForm: 0, power: 0, n: 0 };
    const n = list.length;
    const avgOvr = Math.round(list.reduce((s, p) => s + (p.ovr || 0), 0) / n);
    const avgCond = Math.round(list.reduce((s, p) => s + (p.condition || 70), 0) / n);
    const avgEnergy = Math.round(list.reduce((s, p) => s + (p.energy || 70), 0) / n);
    const avgForm = Math.round(list.reduce((s, p) => s + (p.form || 60), 0) / n);
    // Effective power blends rating with fitness
    const power = Math.round(list.reduce((s, p) => {
      const fit = ((p.condition || 70) + (p.energy || 70)) / 200;
      const formMod = 0.85 + ((p.form || 60) / 100) * 0.3;
      const out = (p.injured > 0 || p.suspended > 0) ? 0.55 : 1;
      return s + (p.ovr || 0) * fit * formMod * out;
    }, 0) / n);
    return { avgOvr, avgCond, avgEnergy, avgForm, power, n };
  }

  /** Prematch board: starting XI + reserves with strength summary */
  function prematchSquadBoard() {
    const me = club();
    if (!me) return null;
    ensureLineup();
    const slots = D().FORMATIONS[me.formation]?.slots || D().FORMATIONS['4-3-3'].slots;
    const xiPlayers = (me.lineup || []).slice(0, 11);
    const xiIds = new Set(xiPlayers.map(p => p?.id).filter(Boolean));
    const reserves = (me.squad || [])
      .filter(p => p && !xiIds.has(p.id))
      .sort((a, b) => {
        const ua = (a.injured > 0 || a.suspended > 0) ? 1 : 0;
        const ub = (b.injured > 0 || b.suspended > 0) ? 1 : 0;
        if (ua !== ub) return ua - ub;
        return (b.ovr + (b.form || 0) / 10) - (a.ovr + (a.form || 0) / 10);
      });
    const bench = reserves.slice(0, 7);
    const xi = xiPlayers.map((p, i) => playerBoardRow(p, slots[i]));
    const reserveRows = reserves.map(p => playerBoardRow(p));
    const benchRows = bench.map(p => playerBoardRow(p));
    return {
      formation: me.formation,
      style: D().STYLES.find(s => s.id === me.style)?.name || me.style,
      xi,
      bench: benchRows,
      reserves: reserveRows,
      xiStrength: groupStrength(xiPlayers),
      benchStrength: groupStrength(bench),
      reserveStrength: groupStrength(reserves),
      reserveTotal: reserves.length
    };
  }

  function opponentBrief(oppId) {
    const opp = clubById(oppId);
    if (!opp) return null;
    const style = D().STYLES.find(s => s.id === opp.style)?.name || opp.style || 'Баланс';
    const threats = [...(opp.squad || [])]
      .filter(p => !p.injured && !p.suspended)
      .sort((a, b) => (b.seasonGoals || 0) * 3 + b.ovr - ((a.seasonGoals || 0) * 3 + a.ovr))
      .slice(0, 3)
      .map(p => ({
        id: p.id,
        name: p.name,
        pos: D().POS_LABEL[p.pos] || p.pos,
        ovr: p.ovr,
        goals: p.seasonGoals || 0,
        assists: p.seasonAssists || 0
      }));
    const out = [...(opp.squad || [])]
      .filter(p => p.injured > 0 || p.suspended > 0)
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, 4)
      .map(p => ({
        name: p.name,
        reason: p.injured > 0 ? `травма ${p.injured}` : `бан ${p.suspended}`,
        ovr: p.ovr
      }));
    const recent = (state.history || [])
      .filter(h => h.homeId === oppId || h.awayId === oppId || h.home === opp.name || h.away === opp.name)
      .slice(0, 3)
      .map(h => {
        const hs = h.score?.[0] ?? '?';
        const as = h.score?.[1] ?? '?';
        return `${h.home} ${hs}:${as} ${h.away}`;
      });
    const strength = E().teamStrength(opp, { home: false });
    return {
      id: opp.id,
      name: opp.name,
      formation: opp.formation || '4-3-3',
      style,
      strength: Math.round((strength.attack + strength.defense + strength.mid) / 3),
      chemistry: strength.chemistry,
      threats,
      out,
      recent
    };
  }

  function boardProgress() {
    const me = club();
    if (!state?.board || !me) return null;
    const rows = sortedTable();
    const idx = rows.findIndex(r => r.id === me.id);
    const place = idx >= 0 ? idx + 1 : null;
    const row = idx >= 0 ? rows[idx] : null;
    const target = state.board.targetPlace;
    const onTrack = place != null && place <= target;
    const gap = place != null ? place - target : null;
    return {
      place,
      target,
      onTrack,
      gap,
      pts: row?.pts || 0,
      played: row?.played || 0,
      gd: row ? (row.gf || 0) - (row.ga || 0) : 0,
      confidence: state.board.confidence,
      targetLabel: state.board.targetLabel,
      warnings: state.board.warnings || 0,
      cupTarget: state.board.cupTarget
    };
  }

  function setDevFocus(playerId, focusId) {
    const me = club();
    let p = me?.squad.find(x => x.id === playerId);
    if (!p) p = me?.youth?.find(x => x.id === playerId);
    if (!p) return { ok: false, msg: 'Нет игрока' };
    if (focusId && !D().DEV_FOCUS.some(f => f.id === focusId)) return { ok: false, msg: 'Нет фокуса' };
    p.devFocus = focusId || null;
    const label = focusId ? (D().DEV_FOCUS.find(f => f.id === focusId)?.name || focusId) : 'сброшен';
    save();
    return { ok: true, msg: `Фокус ${p.name}: ${label}` };
  }

  function negotiateContract(playerId, years = 2, wageOffer = null) {
    const me = club();
    const p = me?.squad.find(x => x.id === playerId);
    if (!p) return { ok: false, msg: 'Нет игрока' };
    years = Math.max(1, Math.min(4, Number(years) || 2));
    const ask = (state.inbox || []).find(m =>
      m.type === 'contract_ask' && m.playerId === playerId && !m.resolved
    );
    const wantWage = ask?.wantWage
      || Math.round(p.wage * (1.08 + years * 0.02 + Math.random() * 0.08));
    const wage = Math.round(Number(wageOffer) || wantWage);
    const bonus = Math.round(wage * 6 * years);
    const gate = canAfford(bonus, 'contract');
    if (!gate.ok) return { ok: false, msg: gate.msg };
    const wageOk = wage >= wantWage * 0.95;
    if (!wageOk) {
      return {
        ok: false,
        msg: `${p.name} хочет ~${money(wantWage)}/нед`,
        counterWage: wantWage,
        years
      };
    }
    adjustBudget(-bonus, `Контракт: ${p.name}`);
    p.contract = Math.max(p.contract || 0, 0) + years;
    p.wage = wage;
    p.morale = Math.min(100, (p.morale || 60) + 10);
    p.value = D().valueOf(p.ovr, p.pot, p.age);
    if (ask) { ask.resolved = true; ask.read = true; }
    (state.inbox || []).forEach(m => {
      if (m.type === 'contract_ask' && m.playerId === playerId) {
        m.resolved = true; m.read = true;
      }
    });
    save();
    return { ok: true, msg: `${p.name}: +${years} г, ${money(wage)}/нед (−${money(bonus)})` };
  }

  function makeOffer(entryId, bid, loan = false, wageOffer = null) {
    if (!transferWindowOpen() && !loan) {
      const info = transferWindowInfo();
      return { ok: false, msg: `Трансферное окно закрыто (открыто туры ${info.label})` };
    }
    const me = club();
    const item = state.transferList.find(e => e.id === entryId || e.player.id === entryId);
    if (!item) return { ok: false, msg: 'Игрок снят с рынка' };
    if (item.clubId === me.id) {
      return { ok: false, msg: 'Это ваш игрок — продажа только во вкладке «Продать»' };
    }
    const ask = item.ask;
    const offer = bid || ask;
    const wageAsk = item.wageAsk || item.player.wage || 10000;
    const wage = wageOffer != null ? wageOffer : wageAsk;
    if (!loan) {
      const gate = canAfford(offer, 'transfer');
      if (!gate.ok) return { ok: false, msg: gate.msg };
    } else {
      const loanFee = Math.round((item.wageAsk || item.player.wage || 10000) * 0.5);
      const gate = canAfford(loanFee, 'transfer');
      if (!gate.ok) return { ok: false, msg: gate.msg };
    }
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
    if (item.clubId && item.clubId === me.id) {
      return { ok: false, msg: 'Нельзя купить своего игрока — снимите с продажи или ждите покупателя' };
    }
    const p = { ...item.player, listed: false, ask: 0, clubId: me.id };
    if (wage) p.wage = wage;
    if (loan) {
      p.loan = true;
      p.loanFrom = item.clubId;
      adjustBudget(-Math.round((item.wageAsk || p.wage) * 0.5), `Аренда: ${p.name}`);
    } else {
      adjustBudget(-price, `Покупка: ${p.name}`);
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

  function purgeFromLineup(playerId) {
    const me = club();
    if (!me?.lineup) return;
    const before = me.lineup.length;
    me.lineup = me.lineup.filter(p => p && p.id !== playerId);
    if (me.lineup.length < 11 || me.lineup.length !== before) autoLineup();
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
      state.transferList = state.transferList || [];
      if (!state.transferList.some(e => e.player?.id === p.id && e.clubId === me.id)) {
        state.transferList.unshift({
          id: D().uid('t'), type: 'transfer', player: p, clubId: me.id,
          clubName: me.name, leagueId: me.leagueId, ask: p.ask, wageAsk: p.wage
        });
      }
      save();
      return { ok: true, msg: `${p.name} выставлен за ${money(p.ask)}` };
    }
    const buyer = D().pick(buyers);
    me.squad = me.squad.filter(x => x.id !== playerId);
    purgeFromLineup(playerId);
    adjustBudget(offer, `Продажа: ${p.name} → ${buyer.name}`);
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
    if (!accept || !p) {
      state.transferOffers = state.transferOffers.filter(o => o.id !== offerId);
      save();
      return { ok: true, msg: 'Отказ отправлен' };
    }
    if (me.squad.length <= 16) return { ok: false, msg: 'Состав слишком мал' };
    state.transferOffers = state.transferOffers.filter(o => o.id !== offerId);
    const buyer = clubById(offer.fromId);
    me.squad = me.squad.filter(x => x.id !== p.id);
    purgeFromLineup(p.id);
    adjustBudget(offer.bid, `Продажа: ${p.name}`);
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
    const gate = canAfford(cost, 'facility');
    if (!gate.ok) return { ok: false, msg: gate.msg };
    adjustBudget(-cost, `Инфраструктура: ${f.name}`);
    me.facilities[id] = level + 1;
    if (id === 'stadium') {
      me.fans = Math.round(me.fans * 1.08);
      pickSponsor(me);
    }
    refreshClubLevel(me);
    save();
    return { ok: true, msg: `${f.name} → ур. ${level + 1}` };
  }

  function youthPromoteCost(me = club()) {
    ensureClubExtras(me);
    return Math.max(40000, 150000 - (me.facilities?.youth || 1) * 18000);
  }

  function promoteYouth(playerId = null) {
    const me = club();
    ensureClubExtras(me);
    refillYouth(me);
    if (me.squad.length >= 30) return { ok: false, msg: 'Состав полон' };
    const cost = youthPromoteCost(me);
    const gate = canAfford(cost, 'youth');
    if (!gate.ok) return { ok: false, msg: gate.msg };
    let p;
    if (playerId) {
      p = me.youth.find(x => x.id === playerId);
      if (!p) return { ok: false, msg: 'Нет в академии' };
      me.youth = me.youth.filter(x => x.id !== playerId);
    } else {
      if (!me.youth.length) refillYouth(me, true);
      me.youth.sort((a, b) => b.pot - a.pot);
      p = me.youth.shift();
    }
    if (!p) return { ok: false, msg: 'Академия пуста' };
    adjustBudget(-cost, `Выпуск из академии: ${p.name}`);
    delete p.youth;
    p.clubId = me.id;
    p.contract = Math.max(p.contract || 1, 2);
    me.squad.push(p);
    save();
    return { ok: true, msg: `В основу: ${p.name} (${D().POS_LABEL[p.pos]}, ${p.ovr} / пот. ${p.pot}) · −${money(cost)}`, player: p };
  }

  function hireStaff(roleId) {
    const me = club();
    ensureClubExtras(me);
    const role = D().STAFF_ROLES.find(r => r.id === roleId);
    if (!role) return { ok: false, msg: 'Нет роли' };
    const level = me.staff[roleId] || 1;
    if (level >= role.max) return { ok: false, msg: 'Максимум' };
    const cost = Math.round(role.base * Math.pow(1.55, level - 1));
    const gate = canAfford(cost, 'staff');
    if (!gate.ok) return { ok: false, msg: gate.msg };
    adjustBudget(-cost, `Штаб: ${role.name}`);
    me.staff[roleId] = level + 1;
    save();
    return { ok: true, msg: `${role.name} → ур. ${level + 1} (−${money(cost)})` };
  }

  function queuePressConference(won, drew, competitionLabel) {
    const pool = D().PRESS_OPTIONS.filter(o => {
      if (won) return ['confident', 'humble', 'defend_squad', 'silent'].includes(o.id);
      if (drew) return ['humble', 'promise', 'defend_squad', 'silent'].includes(o.id);
      return ['promise', 'defend_squad', 'attack_board', 'silent', 'humble'].includes(o.id);
    });
    const picked = pool.sort(() => Math.random() - 0.5).slice(0, 3);
    const label = typeof competitionLabel === 'string' && competitionLabel
      ? competitionLabel
      : (competitionLabel === true ? 'Кубковый матч' : 'Матч лиги');
    state.pendingPress = {
      title: won ? 'Пресс-конференция: победа' : drew ? 'Пресс-конференция: ничья' : 'Пресс-конференция: поражение',
      context: label,
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

  function setTactics(formation, style, opts = {}) {
    const me = club();
    const formationChanged = formation && D().FORMATIONS[formation] && formation !== me.formation;
    if (formation && D().FORMATIONS[formation]) me.formation = formation;
    if (style) me.style = style;
    if (formationChanged) remapLineupToFormation({ stickToXi: !!opts.stickToXi });
    save();
  }

  /** Перекладывает текущий XI под новую схему, не вызывая полный автоподбор */
  function remapLineupToFormation(opts = {}) {
    const me = club();
    const slots = D().FORMATIONS[me.formation]?.slots || D().FORMATIONS['4-3-3'].slots;
    const current = (me.lineup || []).filter(Boolean);
    if (current.length < 8) {
      autoLineup();
      return;
    }
    const used = new Set();
    const xi = slots.map(slot => {
      const g = D().POS_GROUP[slot];
      let pick = current.find(p => !used.has(p.id) && p.pos === slot);
      if (!pick) pick = current.find(p => !used.has(p.id) && D().POS_GROUP[p.pos] === g);
      if (!pick) pick = current.find(p => !used.has(p.id) && !(g === 'GK' && D().POS_GROUP[p.pos] !== 'GK'));
      if (!pick && !opts.stickToXi) {
        pick = me.squad
          .filter(p => !used.has(p.id) && !(p.injured > 0) && !(p.suspended > 0))
          .filter(p => !(g === 'GK' && D().POS_GROUP[p.pos] !== 'GK'))
          .filter(p => !(D().POS_GROUP[p.pos] === 'GK' && g !== 'GK'))
          .sort((a, b) => {
            const sa = (D().POS_GROUP[a.pos] === g ? 20 : 0) + a.ovr;
            const sb = (D().POS_GROUP[b.pos] === g ? 20 : 0) + b.ovr;
            return sb - sa;
          })[0];
      }
      if (!pick) pick = current.find(p => !used.has(p.id));
      if (pick) used.add(pick.id);
      return pick;
    }).filter(Boolean);
    if (xi.length >= 11) setLineup(xi.map(p => p.id));
    else autoLineup();
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

  function autoLineup(preferFresh = false) {
    const me = club();
    const slots = D().FORMATIONS[me.formation]?.slots || D().FORMATIONS['4-3-3'].slots;
    const used = new Set();
    const xi = slots.map(slot => {
      const g = D().POS_GROUP[slot];
      const pool = me.squad
        .filter(p => !used.has(p.id) && !(p.injured > 0) && !(p.suspended > 0) && !p.red)
        .filter(p => {
          const pg = D().POS_GROUP[p.pos];
          if (g === 'GK') return pg === 'GK';
          if (pg === 'GK') return false;
          return true;
        })
        .map(p => {
          const pg = D().POS_GROUP[p.pos];
          let score = p.ovr + (p.form || 0) / 10 + (p.condition || 0) / 20;
          if (preferFresh) score += (p.condition || 0) / 8 + (p.energy || 0) / 10;
          if (pg === g) score += 12;
          if (p.pos === slot) score += 8;
          return { p, score };
        })
        .sort((a, b) => b.score - a.score);
      let pick = pool[0]?.p;
      if (!pick && g === 'GK') {
        pick = me.squad.find(p => !used.has(p.id) && D().POS_GROUP[p.pos] === 'GK');
      }
      if (!pick) pick = me.squad.find(p => !used.has(p.id) && D().POS_GROUP[p.pos] !== 'GK');
      if (pick) used.add(pick.id);
      return pick;
    }).filter(Boolean);
    setLineup(xi.map(p => p.id));
    return xi;
  }

  function transferWindowInfo() {
    const total = Math.max(8, state?.fixtures?.length || 38);
    const summerEnd = Math.min(8, Math.max(4, Math.ceil(total * 0.22)));
    const winterStart = Math.max(summerEnd + 2, Math.floor(total * 0.52));
    const winterEnd = Math.min(total, winterStart + Math.max(3, Math.floor(total * 0.18)));
    return {
      summerEnd,
      winterStart,
      winterEnd,
      total,
      label: `1–${summerEnd} и ${winterStart}–${winterEnd}`
    };
  }

  function transferWindowOpen() {
    const w = state?.week || 1;
    const { summerEnd, winterStart, winterEnd } = transferWindowInfo();
    return (w >= 1 && w <= summerEnd) || (w >= winterStart && w <= winterEnd);
  }

  function ensureLineup() {
    const me = club();
    if (!me) return [];
    const slots = D().FORMATIONS[me.formation]?.slots || D().FORMATIONS['4-3-3'].slots;
    const xi = me.lineup || [];
    const ghosts = xi.some(p => p && !me.squad.some(s => s.id === p.id));
    const gkSlot = slots.findIndex(s => D().POS_GROUP[s] === 'GK');
    const gkBad = gkSlot >= 0 && xi[gkSlot] && D().POS_GROUP[xi[gkSlot].pos] !== 'GK';
    const unavailable = xi.some(p => p && ((p.injured > 0) || (p.suspended > 0)));
    if (xi.length < 11 || ghosts || gkBad || unavailable) autoLineup();
    return me.lineup;
  }

  function xiStatus() {
    const me = club();
    ensureLineup();
    const slots = D().FORMATIONS[me.formation]?.slots || D().FORMATIONS['4-3-3'].slots;
    const unavailable = (me.lineup || []).filter(p => (p.injured > 0) || (p.suspended > 0));
    const tired = (me.lineup || []).filter(p =>
      !(p.injured > 0) && !(p.suspended > 0) && ((p.condition || 100) < 58 || (p.energy || 100) < 52)
    );
    const posIssues = [];
    (me.lineup || []).forEach((p, i) => {
      if (!p) return;
      const slot = slots[i];
      const sg = D().POS_GROUP[slot];
      const pg = D().POS_GROUP[p.pos];
      if (sg === 'GK' && pg !== 'GK') {
        posIssues.push({ id: p.id, name: p.name, reason: 'не вратарь на ВР' });
      } else if (pg === 'GK' && sg !== 'GK') {
        posIssues.push({ id: p.id, name: p.name, reason: 'вратарь не на ВР' });
      }
    });
    const allBad = [...unavailable.map(p => ({
      id: p.id,
      name: p.name,
      reason: p.injured > 0 ? `травма ${p.injured}` : `бан ${p.suspended}`
    })), ...posIssues];
    return {
      ok: allBad.length === 0 && (me.lineup || []).length >= 11 && posIssues.length === 0,
      unavailable: allBad,
      tired: tired.map(p => ({
        id: p.id,
        name: p.name,
        reason: `форма ${Math.round(p.condition || 0)} · энергия ${Math.round(p.energy || 0)}`
      })),
      loadWarn: tired.length >= 3,
      posIssues
    };
  }

  function fixXi() {
    const before = xiStatus();
    autoLineup();
    const after = xiStatus();
    return {
      ok: after.ok,
      msg: before.unavailable.length
        ? `Заменены: ${before.unavailable.map(u => u.name).join(', ')}`
        : 'Состав в порядке',
      status: after
    };
  }

  function matchRivalry(homeId, awayId) {
    return D().findRivalry(homeId, awayId);
  }

  function swapIntoXi(benchPlayerId, slotIndex) {
    const me = club();
    ensureLineup();
    const xi = [...me.lineup];
    const bench = me.squad.find(p => p.id === benchPlayerId);
    if (!bench || bench.injured || bench.suspended) return { ok: false, msg: 'Игрок недоступен' };
    if (slotIndex < 0 || slotIndex > 10) return { ok: false, msg: 'Слот' };
    const slots = D().FORMATIONS[me.formation]?.slots || D().FORMATIONS['4-3-3'].slots;
    const slotPos = slots[slotIndex];
    const slotGroup = D().POS_GROUP[slotPos];
    const playerGroup = D().POS_GROUP[bench.pos];
    if (slotGroup === 'GK' && playerGroup !== 'GK') {
      return { ok: false, msg: 'В ворота можно поставить только вратаря' };
    }
    if (playerGroup === 'GK' && slotGroup !== 'GK') {
      return { ok: false, msg: 'Вратарь играет только на позиции ВР' };
    }
    const out = xi[slotIndex];
    xi[slotIndex] = bench;
    const ids = xi.map(p => p.id);
    const rest = me.squad.filter(p => !ids.includes(p.id));
    if (out && !ids.includes(out.id)) rest.unshift(out);
    me.squad = [...xi, ...rest.filter((p, i, a) => a.findIndex(x => x.id === p.id) === i)];
    me.lineup = xi;
    save();
    const mismatch = slotGroup !== playerGroup;
    return {
      ok: true,
      msg: mismatch
        ? `${bench.name} в основе (неродная позиция ${D().POS_LABEL[slotPos] || slotPos})`
        : `${bench.name} в основе`
    };
  }

  function financeSummary() {
    const me = club();
    ensureMeta();
    ensureClubExtras(me);
    if (!state.sponsor) pickSponsor(me);
    const st = financeStatus(me);
    const cf = cashflowForecast(me);
    const values = squadValueOf(me);
    return {
      budget: me.budget,
      debt: st.debt,
      creditLimit: st.credit,
      creditLeft: st.creditLeft,
      status: st.id,
      statusLabel: st.label,
      statusLevel: st.level,
      embargo: st.embargo,
      debtWeeks: st.debtWeeks,
      wageArrears: st.wageArrears,
      runwayWeeks: st.runwayWeeks,
      weeklyWages: cf.wages,
      staffWages: cf.staff,
      upkeep: cf.upkeep,
      interest: cf.interest,
      tvWeekly: cf.tv,
      squadValue: values,
      fans: me.fans,
      incomePerMatch: cf.gateHomeEst,
      incomeAwayEst: cf.gateAwayEst,
      sponsor: state.sponsor,
      weeklyNet: cf.net,
      weekIn: cf.income,
      weekOut: cf.expenses,
      breakdown: {
        in: [
          { label: 'Спонсор', amount: cf.sponsor },
          { label: 'ТВ-пул', amount: cf.tv }
        ],
        out: [
          { label: 'Зарплаты игроков', amount: -cf.wages },
          { label: 'Штаб', amount: -cf.staff },
          { label: 'Содержание базы', amount: -cf.upkeep },
          { label: 'Проценты по долгу', amount: -cf.interest },
          { label: 'Погашение зарплатного долга (план)', amount: -cf.arrearsPlan }
        ].filter(x => x.amount)
      },
      restrictions: st.embargo
        ? 'Эмбарго: нельзя покупать игроков и строить инфраструктуру'
        : st.id === 'deficit'
          ? 'Дефицит: крупные трансферы ограничены, проценты растут'
          : st.id === 'tight'
            ? 'Касса напряжена — следите за ФОТ'
            : '',
      ledger: (state.ledger || []).slice(0, 30)
    };
  }

  function renewContract(playerId, years = 2) {
    const me = club();
    const p = me.squad.find(x => x.id === playerId);
    if (!p) return { ok: false, msg: 'Нет игрока' };
    const cost = Math.round(p.wage * 8 * years);
    const newWage = Math.round(p.wage * (1.08 + Math.random() * 0.12));
    const gate = canAfford(cost, 'contract');
    if (!gate.ok) return { ok: false, msg: gate.msg };
    adjustBudget(-cost, `Контракт: ${p.name}`);
    p.contract = Math.max(p.contract || 0, 0) + years;
    p.wage = newWage;
    p.morale = Math.min(100, (p.morale || 60) + 8);
    save();
    return { ok: true, msg: `Контракт ${p.name}: +${years} г, зарплата ${money(newWage)}/нед (−${money(cost)})` };
  }

  function tickContracts() {
    const me = club();
    const left = [];
    const leavers = [];
    me.squad = me.squad.filter(p => {
      p.contract = Math.max(0, (p.contract || 1) - 1);
      if (p.contract > 0) return true;
      if (Math.random() < 0.4) {
        p.contract = 1;
        return true;
      }
      left.push(p.name);
      leavers.push(p);
      return false;
    });
    leavers.forEach(p => {
      const free = { ...p, listed: true, ask: Math.round((p.value || 0) * 0.35), clubId: null };
      state.transferList = state.transferList || [];
      state.transferList.unshift({
        id: D().uid('t'), type: 'free', player: free, clubId: null, ask: free.ask, wageAsk: free.wage
      });
      purgeFromLineup(p.id);
    });
    if (leavers.length && (me.lineup || []).length < 11) autoLineup();
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

  function isClubInCwc(clubId) {
    const cwc = state?.cwc;
    if (!cwc || cwc.champion) return false;
    if (cwc.phase === 'groups') {
      return Object.values(cwc.groups || {}).some(g => (g.clubs || []).includes(clubId));
    }
    return (cwc.bracket || []).some(m => m.home === clubId || m.away === clubId);
  }

  function playerCwcMatch() {
    const cwc = state?.cwc;
    if (!cwc || cwc.champion) return null;
    if (cwc.phase === 'groups') {
      const md = cwc.groupMatchday || 0;
      for (const g of Object.values(cwc.groups || {})) {
        const day = (g.matchdays || [])[md];
        if (!day) continue;
        const m = day.find(x => !x.played && (x.home === state.clubId || x.away === state.clubId));
        if (m) return m;
      }
      return null;
    }
    return (cwc.bracket || []).find(m =>
      !m.played && (m.home === state.clubId || m.away === state.clubId)
    ) || null;
  }

  function nextMatch() {
    // Per-competition KO lock for the week (can play cup + UCL same week)
    const ko = state.koPlayed && state.koPlayed.week === state.week
      ? new Set(state.koPlayed.types || [])
      : new Set();
    // Migrate legacy single-flag saves
    if (!state.koPlayed && state.knockoutPlayedWeek === state.week) {
      ['cwc', 'ucl', 'cup'].forEach(t => ko.add(t));
    }
    const ucl = playerUclMatch();
    const cup = playerCupMatch();
    const cwc = playerCwcMatch();
    const week = state.week;
    const cwcDue = !!cwc && (CWC_WEEKS_GROUPS.includes(week) || week === CWC_WEEK_SEMI || week === CWC_WEEK_FINAL);
    const uclDue = !!ucl && week % 5 === 1;
    const cupDue = !!cup && week % 3 === 0;
    if (cwcDue && !ko.has('cwc')) return { type: 'cwc', match: cwc };
    if (uclDue && !ko.has('ucl')) return { type: 'ucl', match: ucl };
    if (cupDue && !ko.has('cup')) return { type: 'cup', match: cup };

    // Просроченные еврокубки — до лиги
    if (cwc && !ko.has('cwc') && isCwcOverdue()) return { type: 'cwc', match: cwc };
    if (ucl && !ko.has('ucl') && week > 1 && week % 5 !== 1) return { type: 'ucl', match: ucl };
    if (cup && !ko.has('cup') && week > 3 && week % 3 !== 0) return { type: 'cup', match: cup };

    const lg = playerMatch();
    if (lg) return { type: 'league', match: lg };
    if (cwc && !ko.has('cwc')) return { type: 'cwc', match: cwc };
    if (ucl && !ko.has('ucl')) return { type: 'ucl', match: ucl };
    if (cup && !ko.has('cup')) return { type: 'cup', match: cup };
    return null;
  }

  function markKnockoutPlayed(kind) {
    if (!state.koPlayed || state.koPlayed.week !== state.week) {
      state.koPlayed = { week: state.week, types: [] };
    }
    if (!state.koPlayed.types.includes(kind)) state.koPlayed.types.push(kind);
    state.knockoutPlayedWeek = state.week; // legacy mirror
  }

  function isCwcOverdue() {
    const cwc = state.cwc;
    if (!cwc || cwc.champion || !playerCwcMatch()) return false;
    const week = state.week;
    if (cwc.phase === 'groups') {
      const expected = CWC_WEEKS_GROUPS[cwc.groupMatchday || 0];
      return expected != null && week > expected;
    }
    if (cwc.round === '1/2') return week > CWC_WEEK_SEMI;
    if (cwc.round === 'Финал') return week > CWC_WEEK_FINAL;
    return week > CWC_WEEK_FINAL;
  }

  function pushCompHistory(comp, roundLabel) {
    if (!comp) return;
    comp.history = comp.history || [];
    comp.history.push({
      round: roundLabel,
      ties: (comp.bracket || []).map(m => ({
        home: m.home, away: m.away, played: !!m.played, score: m.score ? [...m.score] : null
      }))
    });
  }

  function advanceKnockout(comp, title, winPrize) {
    if (!comp || comp.champion) return;
    if (!comp.bracket.every(m => m.played)) return;
    pushCompHistory(comp, comp.round);
    const winners = comp.bracket.map(m => m.score[0] > m.score[1] ? m.home : m.away);
    const playerIn = winners.includes(state.clubId);
    const playerWas = (comp.bracket || []).some(m => m.home === state.clubId || m.away === state.clubId);

    if (winners.length === 1) {
      comp.champion = winners[0];
      comp.round = 'Чемпион';
      const champ = clubById(winners[0]);
      state.news.unshift({ id: D().uid('n'), title, body: `Победитель: ${champ?.name}`, at: Date.now() });
      if (title.includes('ЛЧ')) state.lastUclChampion = winners[0];
      if (winners[0] === state.clubId) {
        adjustBudget(winPrize, title + ' — трофей');
        state.inbox.unshift({
          id: D().uid('m'), type: 'cup', title: title + ' — чемпион!',
          body: `Вы выиграли турнир. Призовые ${money(winPrize)}.`,
          read: false, at: Date.now()
        });
      } else if (playerWas) {
        state.inbox.unshift({
          id: D().uid('m'), type: 'cup', title: title + ' — итог',
          body: `Трофей у «${champ?.name || 'соперника'}». Ваш путь: ${comp.best || state.uclBest || state.cupBest || 'сетка'}.`,
          read: false, at: Date.now()
        });
      }
      return;
    }

    const next = [];
    for (let i = 0; i < winners.length; i += 2) {
      next.push({ home: winners[i], away: winners[i + 1], played: false, score: null });
    }
    const prevRound = comp.round;
    comp.bracket = next;
    comp.round = next.length === 4 ? '1/4' : next.length === 2 ? '1/2' : next.length === 1 ? 'Финал' : '1/' + (next.length * 2);

    if (playerWas && !playerIn) {
      state.inbox.unshift({
        id: D().uid('m'), type: 'cup',
        title: `${title}: вылет`,
        body: `Вы выбыли на стадии «${prevRound}». Турнир продолжается без вас (${comp.round}).`,
        read: false, at: Date.now()
      });
      state.news.unshift({
        id: D().uid('n'), title: `${title}: вылет`,
        body: `Ваш клуб завершил путь на стадии ${prevRound}.`,
        at: Date.now()
      });
    } else if (playerIn) {
      state.inbox.unshift({
        id: D().uid('m'), type: 'cup',
        title: `${title}: проход`,
        body: `Вы в следующей стадии — «${comp.round}».`,
        read: false, at: Date.now()
      });
    } else {
      state.news.unshift({
        id: D().uid('n'), title: `${title}: ${comp.round}`,
        body: `Сетка обновлена после стадии ${prevRound}.`,
        at: Date.now()
      });
    }
  }

  function resolveCompAI(comp, exceptMatch) {
    if (!comp || comp.champion) return;
    (comp.bracket || []).forEach(m => {
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

  function applyGroupResult(table, match) {
    const [hg, ag] = match.score;
    applyToAnyTable(table, match.home, match.away, [hg, ag]);
  }

  function sortedGroupTable(table) {
    return Object.values(table || {}).sort((a, b) =>
      b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf
    );
  }

  function resolveCwcGroupMatchdayAI(exceptMatch) {
    const cwc = state.cwc;
    if (!cwc || cwc.phase !== 'groups') return;
    const md = cwc.groupMatchday || 0;
    Object.values(cwc.groups).forEach(g => {
      const day = (g.matchdays || [])[md];
      if (!day) return;
      day.forEach(m => {
        if (m.played) return;
        if (exceptMatch && m.home === exceptMatch.home && m.away === exceptMatch.away) return;
        if (m.home === state.clubId || m.away === state.clubId) return;
        const home = clubById(m.home);
        const away = clubById(m.away);
        if (!home || !away) { m.played = true; m.score = [1, 0]; applyGroupResult(g.table, m); return; }
        const res = simulateAIMatch(home, away);
        m.played = true;
        m.score = res.score;
        applyGroupResult(g.table, m);
      });
    });
  }

  function advanceCwcFromGroups() {
    const cwc = state.cwc;
    if (!cwc || cwc.phase !== 'groups') return;
    const md = cwc.groupMatchday || 0;
    const daysDone = Object.values(cwc.groups).every(g =>
      ((g.matchdays || [])[md] || []).every(m => m.played)
    );
    if (!daysDone) return;

    if (md < 2) {
      cwc.groupMatchday = md + 1;
      state.news.unshift({
        id: D().uid('n'), title: 'Клубный ЧМ',
        body: `Завершён тур групп ${md + 1}. Следующий — ${md + 2}.`,
        at: Date.now()
      });
      return;
    }

    // Build semis: A1 vs B2, B1 vs A2
    const a = sortedGroupTable(cwc.groups.A.table);
    const b = sortedGroupTable(cwc.groups.B.table);
    const semis = [
      { home: a[0]?.id, away: b[1]?.id, played: false, score: null },
      { home: b[0]?.id, away: a[1]?.id, played: false, score: null }
    ].filter(m => m.home && m.away);
    cwc.phase = 'ko';
    cwc.round = '1/2';
    cwc.bracket = semis;
    cwc.history = cwc.history || [];
    cwc.history.push({ round: 'Группы', groups: JSON.parse(JSON.stringify(cwc.groups)) });
    const meIn = semis.some(m => m.home === state.clubId || m.away === state.clubId);
    const wasInGroups = Object.values(cwc.groups || {}).some(g => (g.clubs || []).includes(state.clubId));
    if (wasInGroups) {
      state.cwcBest = meIn ? '1/2' : 'Группы';
      cwc.best = state.cwcBest;
    }
    state.inbox.unshift({
      id: D().uid('m'), type: 'cwc',
      title: meIn ? 'Клубный ЧМ: плей-офф' : 'Клубный ЧМ: вне сетки',
      body: meIn
        ? 'Вы вышли из группы. Впереди полуфинал (тур 13) и при победе — финал (тур 15).'
        : 'Групповой этап завершён — ваш клуб не прошёл в полуфинал.',
      read: false, at: Date.now()
    });
  }

  function maybePlayCwcAiWeek() {
    const cwc = state.cwc;
    if (!cwc || cwc.champion) return;
    const pending = playerCwcMatch();
    const week = state.week;
    if (cwc.phase === 'groups') {
      if (!CWC_WEEKS_GROUPS.includes(week)) return;
      resolveCwcGroupMatchdayAI(pending || null);
      if (!pending) advanceCwcFromGroups();
      return;
    }
    if (week !== CWC_WEEK_SEMI && week !== CWC_WEEK_FINAL) return;
    resolveCompAI(cwc, pending || null);
    if (!pending) {
      advanceKnockout(cwc, 'Клубный ЧМ', 1800000);
      if (cwc.champion === state.clubId) state.cwcBest = 'Чемпион';
    }
  }

  function resolveCupRoundAI(exceptMatch) {
    resolveCompAI(state.cup, exceptMatch);
    maybeAdvanceCup();
  }

  function maybeAdvanceCup() {
    advanceKnockout(state.cup, 'Кубок EYE', 800000);
    if (state.cup?.champion === state.clubId) state.cupBest = 'Чемпион';
  }

  function maybePlayCupAiWeek() {
    if (!state.cup || state.cup.champion) return;
    if (state.week % 3 !== 0) return;
    const pending = playerCupMatch();
    // Even if player has a pending tie, resolve the rest of the round for AI clubs
    resolveCompAI(state.cup, pending || null);
    if (!pending) {
      advanceKnockout(state.cup, 'Кубок EYE', 800000);
      if (state.cup?.champion === state.clubId) state.cupBest = 'Чемпион';
    }
  }

  function maybePlayUclAiWeek() {
    if (!state.ucl || state.ucl.champion) return;
    if (state.week % 5 !== 1) return;
    const pending = playerUclMatch();
    resolveCompAI(state.ucl, pending || null);
    if (!pending) {
      advanceKnockout(state.ucl, 'ЛЧ EYE', 2500000);
      if (state.ucl?.champion === state.clubId) state.uclBest = 'Чемпион';
    }
  }

  function recordCupMatch(match, result) {
    return recordKnockoutMatch(match, result, 'cup', 'Кубок EYE', 180000);
  }

  function recordUclMatch(match, result) {
    return recordKnockoutMatch(match, result, 'ucl', 'Лига чемпионов EYE', 350000);
  }

  function recordCwcMatch(match, result) {
    return recordKnockoutMatch(match, result, 'cwc', 'Клубный чемпионат мира', 400000);
  }

  function noteKnockoutProgress(kind, won, roundLabel) {
    const key = kind === 'ucl' ? 'uclBest' : kind === 'cwc' ? 'cwcBest' : 'cupBest';
    // В группах ЧМ путь остаётся «Группы», пока не будет выхода в плей-офф
    let reached;
    if (kind === 'cwc' && state.cwc?.phase === 'groups') {
      reached = 'Группы';
    } else {
      reached = won ? nextKoStage(roundLabel) : roundLabel;
    }
    const cur = state[key] || '';
    if (KO_ORDER.indexOf(reached) >= KO_ORDER.indexOf(cur) || !cur) {
      state[key] = reached || roundLabel;
    }
    const comp = kind === 'ucl' ? state.ucl : kind === 'cwc' ? state.cwc : state.cup;
    if (comp) comp.best = state[key];
  }

  function finishForcedKoScore(result) {
    let score = result.score;
    if (score[0] === score[1]) {
      score = Math.random() < 0.5 ? [score[0] + 1, score[1]] : [score[0], score[1] + 1];
      result.score = score;
      result.koDecided = 'et';
      result.events = result.events || [];
      result.events.push({
        minute: 105, type: 'goal', side: score[0] > score[1] ? 'home' : 'away',
        text: 'Победа в дополнительное время!', score
      });
    }
    return score;
  }

  function recordKnockoutMatch(match, result, kind, label, prizeWin) {
    const me = club();
    const isHome = match.home === me.id;
    let score = result.score;
    const allowDraw = kind === 'cwc' && state.cwc?.phase === 'groups';

    if (!allowDraw) score = finishForcedKoScore(result);
    match.played = true;
    match.score = score;
    trackStats(result);

    let roundBefore = '1/8';
    if (kind === 'cup') {
      roundBefore = state.cup?.round;
      resolveCupRoundAI(match);
      maybeAdvanceCup();
    } else if (kind === 'ucl') {
      roundBefore = state.ucl?.round;
      resolveCompAI(state.ucl, match);
      advanceKnockout(state.ucl, 'ЛЧ EYE', 2500000);
      if (state.ucl?.champion === me.id) state.uclBest = 'Чемпион';
    } else if (kind === 'cwc') {
      roundBefore = state.cwc?.round || 'Группы';
      if (state.cwc.phase === 'groups') {
        const g = Object.values(state.cwc.groups).find(gr => {
          const md = state.cwc.groupMatchday || 0;
          return ((gr.matchdays || [])[md] || []).some(x =>
            x === match || (x.home === match.home && x.away === match.away)
          );
        });
        if (g && !match._tableApplied) {
          applyGroupResult(g.table, match);
          match._tableApplied = true;
        }
        resolveCwcGroupMatchdayAI(match);
        advanceCwcFromGroups();
      } else {
        resolveCompAI(state.cwc, match);
        advanceKnockout(state.cwc, 'Клубный ЧМ', 1800000);
        if (state.cwc?.champion === me.id) state.cwcBest = 'Чемпион';
      }
    }

    const myGoals = isHome ? score[0] : score[1];
    const oppGoals = isHome ? score[1] : score[0];
    const won = myGoals > oppGoals;
    const drew = myGoals === oppGoals;
    noteKnockoutProgress(kind, won && !drew, roundBefore);
    const prize = won ? prizeWin : (drew ? 80000 : 50000);
    adjustBudget(prize, won ? `${label}: победа` : drew ? `${label}: ничья` : `${label}: участие`);
    me.morale = Math.min(100, me.morale + (won ? 5 : drew ? 1 : -2));
    if (state.board) B().applyMatchConfidence(state.board, won, drew, true);
    state.lastResult = {
      ...result, prize, income: 0, competition: label,
      derby: result.derby || null, highlights: extractHighlights(result)
    };
    applyMatchAwards(result);
    applyMatchDevelopment(won, drew);
    state.history.unshift({
      at: Date.now(), season: state.season, week: state.week,
      cup: kind === 'cup', ucl: kind === 'ucl', cwc: kind === 'cwc',
      home: result.home, away: result.away, score,
      motm: result.motm ? { id: result.motm.id, name: result.motm.name, rating: result.motm.rating } : null
    });
    state.news.unshift({
      id: D().uid('n'),
      title: won ? `${label}: победа` : drew ? `${label}: ничья` : `${label}: поражение`,
      body: `${result.home} ${score[0]}:${score[1]} ${result.away}`,
      at: Date.now()
    });
    queuePressConference(won, drew, label);
    markKnockoutPlayed(kind);
    save();
  }

  function scoutPlayer(entryId) {
    const me = club();
    const item = state.transferList.find(e => e.id === entryId);
    if (!item) return { ok: false, msg: 'Нет на рынке' };
    const cost = Math.max(10000, 80000 - me.facilities.scout * 10000 - (me.staff?.scoutDir || 1) * 8000);
    const gate = canAfford(cost, 'scout');
    if (!gate.ok) return { ok: false, msg: gate.msg };
    adjustBudget(-cost, `Скаут: ${item.player.name}`);
    const p = item.player;
    const noise = Math.max(0, 6 - me.facilities.scout - Math.floor((me.staff?.scoutDir || 1) / 2));
    const report = {
      id: p.id,
      name: p.name,
      pot: Math.max(40, Math.min(95, p.pot + D().rnd(-noise, noise))),
      age: p.age,
      injuryRisk: D().hasTrait(p, 'injury_prone') ? 'высокий' : D().hasTrait(p, 'iron') ? 'низкий' : (p.age > 30 ? 'высокий' : p.stamina < 65 ? 'средний' : 'низкий'),
      hiddenForm: Math.max(30, Math.min(95, (p.form || 60) + D().rnd(-noise, noise))),
      traits: (p.traits || []).map(id => D().traitInfo(id).name),
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
    const old = club();
    if (old) old.isPlayer = false;
    const next = state.clubs.find(c => c.id === clubId);
    if (!next) return { ok: false, msg: 'Нет клуба' };
    next.isPlayer = true;
    state.clubId = next.id;
    state.leagueId = next.leagueId;
    state.leagueName = next.leagueName;
    state.sacked = false;
    state.season = (state.season || 1) + 1;
    state.board = B().createBoard(next);
    const lc = leagueClubs();
    state.table = emptySeasonTable(lc);
    state.fixtures = buildFixtures(lc.map(c => c.id));
    state.otherLeagues = buildOtherLeagues(state.clubs, next.leagueId);
    state.week = 1;
    state.day = 1;
    state.phase = 'season';
    state.cup = createCup(lc, next.id);
    state.ucl = createUcl(state.clubs, next.id, { forcePlayer: false });
    state.cwc = createCwc(state.clubs, next.id);
    state.cupBest = '';
    state.uclBest = '';
    state.cwcBest = '';
    state.stats = { scorers: {}, assisters: {}, motm: {} };
    state.lastResult = null;
    state.pendingPress = null;
    state.pendingCounters = {};
    state.pendingWage = {};
    state.transferOffers = [];
    state.knockoutPlayedWeek = null;
    state.koPlayed = null;
    state.sponsor = null;
    state.finance = {
      debtWeeks: 0,
      wageArrears: 0,
      embargo: false,
      emergencyLoanSeason: 0,
      lastStatus: 'healthy',
      unpaidStreak: 0
    };
    ensureClubExtras(next);
    pickSponsor(next);
    refillYouth(next, true);
    autoLineup();
    state.inbox.unshift({
      id: D().uid('m'), type: 'welcome', title: 'Новый контракт',
      body: `Вы возглавили «${next.name}». Сезон ${state.season}. Цель: ${state.board.targetLabel}.`,
      read: false, at: Date.now()
    });
    refreshTransferMarket();
    save();
    return { ok: true, msg: `Контракт с «${next.name}» · сезон ${state.season}` };
  }

  function storeCounter(entryId, counter) {
    state.pendingCounters = state.pendingCounters || {};
    state.pendingCounters[entryId] = counter;
    save();
  }

  return {
    KEY, money, moneyHint, getCurrency, setCurrency, currencyInfo,
    createCareer, get, club, clubById, leagueClubs, save, load, clear,
    currentFixture, playerMatch, nextMatch, playerCupMatch, playerUclMatch, playerCwcMatch,
    recordPlayerMatch, recordCupMatch, recordUclMatch, recordCwcMatch, sortedTable, topScorers,
    train, buyPlayer, makeOffer, sellPlayer, respondOffer, filterMarket, refreshTransferMarket,
    storeCounter, pendingCounters: () => state?.pendingCounters || {},
    pendingWage: () => state?.pendingWage || {},
    upgradeFacility, promoteYouth, setTactics, setLineup, autoLineup, ensureLineup, swapIntoXi,
    renewContract, negotiateContract, setDevFocus, financeSummary, financeStatus, canAfford, creditLimit,
    resolveCupRoundAI, scoutPlayer, takeNewJob,
    hireStaff, answerPress, refillYouth, releaseYouth, runYouthIntake, pendingPress: () => state?.pendingPress || null,
    xiStatus, fixXi, matchRivalry, transferWindowOpen, transferWindowInfo, listLeagueTables,
    resolvePlayerRequest, seasonLog: () => state?.seasonLog || [], avgSeasonRating,
    squadReadiness, prematchSquadBoard, opponentBrief, boardProgress, isClubInCwc, isClubInUcl: isClubInUclBracket,
    teamDevSummary, refreshClubLevel, youthPromoteCost
  };
})();
