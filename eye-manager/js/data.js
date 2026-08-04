/* EYE Manager — data helpers + club/player factories on top of EYE_WORLD */
window.EYE_DATA = (() => {
  const W = () => window.EYE_WORLD;

  const FORMATIONS = {
    '4-4-2':  { slots:['GK','RB','CB','CB','LB','RM','CM','CM','LM','ST','ST'] },
    '4-3-3':  { slots:['GK','RB','CB','CB','LB','CM','CM','CM','RW','ST','LW'] },
    '3-5-2':  { slots:['GK','CB','CB','CB','RWB','CM','CM','CM','LWB','ST','ST'] },
    '4-2-3-1':{ slots:['GK','RB','CB','CB','LB','CDM','CDM','RAM','CAM','LAM','ST'] },
    '5-3-2':  { slots:['GK','RWB','CB','CB','CB','LWB','CM','CM','CM','ST','ST'] },
    '4-1-4-1':{ slots:['GK','RB','CB','CB','LB','CDM','RM','CM','CM','LM','ST'] },
    '3-4-3':  { slots:['GK','CB','CB','CB','RWB','CM','CM','LWB','RW','ST','LW'] },
    '3-4-2-1':{ slots:['GK','CB','CB','CB','RWB','CM','CM','LWB','CAM','CAM','ST'] },
    '4-2-2-2':{ slots:['GK','RB','CB','CB','LB','CDM','CDM','CAM','CAM','ST','ST'] }
  };
  const POS_GROUP = {
    GK:'GK', RB:'DEF', LB:'DEF', CB:'DEF', RWB:'DEF', LWB:'DEF',
    CM:'MID', CDM:'MID', CAM:'MID', RM:'MID', LM:'MID', RAM:'MID', LAM:'MID',
    ST:'ATT', RW:'ATT', LW:'ATT'
  };
  const POS_LABEL = {
    GK:'ВР', RB:'ПЗ', LB:'ЛЗ', CB:'ЦЗ', RWB:'ПП', LWB:'ЛП',
    CM:'ЦП', CDM:'ОП', CAM:'АП', RM:'ПП', LM:'ЛП', RAM:'ПА', LAM:'ЛА',
    ST:'НАП', RW:'ПВ', LW:'ЛВ'
  };
  const STYLES = [
    { id:'attack', name:'Атака', desc:'Высокий прессинг, риск' },
    { id:'balance', name:'Баланс', desc:'Контроль и структура' },
    { id:'defend', name:'Оборона', desc:'Низкий блок, контратаки' },
    { id:'possession', name:'Владение', desc:'Короткий пас, терпение' },
    { id:'counter', name:'Контратака', desc:'Глубоко + вертикаль' }
  ];
  const TRAINING = [
    { id:'fitness', name:'Фитнес', focus:'stamina', boost:3 },
    { id:'tactics', name:'Тактика', focus:'iq', boost:3 },
    { id:'shooting', name:'Удары', focus:'attack', boost:3 },
    { id:'defense', name:'Оборона', focus:'defense', boost:3 },
    { id:'tech', name:'Техника', focus:'tech', boost:3 },
    { id:'pace', name:'Скорость', focus:'pace', boost:3 },
    { id:'recovery', name:'Восстановление', focus:'condition', boost:8 }
  ];
  const FACILITIES = [
    { id:'stadium', name:'Стадион', max:5, base:4e5, effect:'income' },
    { id:'training', name:'База', max:5, base:2.5e5, effect:'training' },
    { id:'youth', name:'Академия', max:5, base:3e5, effect:'youth' },
    { id:'medical', name:'Медицина', max:5, base:2e5, effect:'injury' },
    { id:'scout', name:'Скаутинг', max:5, base:1.8e5, effect:'scout' }
  ];
  const STAFF_ROLES = [
    { id: 'coach', name: 'Ассистент', max: 5, base: 90000, effect: 'training' },
    { id: 'physio', name: 'Врач', max: 5, base: 75000, effect: 'injury' },
    { id: 'scoutDir', name: 'Главный скаут', max: 5, base: 80000, effect: 'scout' }
  ];
  const PRESS_OPTIONS = [
    { id: 'confident', label: 'Мы заслужили победу', morale: 3, board: 2, risk: 0 },
    { id: 'humble', label: 'Уважаем соперника', morale: 1, board: 1, risk: 0 },
    { id: 'attack_board', label: 'Совет давит лишнее', morale: 2, board: -6, risk: 1 },
    { id: 'defend_squad', label: 'Игроки выложились', morale: 4, board: 0, risk: 0 },
    { id: 'promise', label: 'Обещаю исправить', morale: -1, board: 3, risk: 0 },
    { id: 'silent', label: 'Без комментариев', morale: 0, board: -1, risk: 0 }
  ];
  const TRAITS = [
    { id: 'finisher', name: 'Снайпер', desc: 'Чаще завершает моменты', groups: ['ATT'] },
    { id: 'playmaker', name: 'Плеймейкер', desc: 'Острее пас и ассисты', groups: ['MID', 'ATT'] },
    { id: 'leader', name: 'Лидер', desc: 'Поднимает мораль XI', groups: ['GK', 'DEF', 'MID', 'ATT'] },
    { id: 'pacey', name: 'Спринтер', desc: 'Темп усиливает атаки', groups: ['ATT', 'MID', 'DEF'] },
    { id: 'tank', name: 'Танк', desc: 'Мощнее в обороне', groups: ['DEF', 'MID'] },
    { id: 'engine', name: 'Мотор', desc: 'Держит midfield', groups: ['MID', 'DEF'] },
    { id: 'iron', name: 'Железо', desc: 'Реже травмируется', groups: ['GK', 'DEF', 'MID', 'ATT'] },
    { id: 'injury_prone', name: 'Хрупкий', desc: 'Выше риск травм', groups: ['GK', 'DEF', 'MID', 'ATT'] }
  ];
  const DEV_FOCUS = [
    { id: 'attack', name: 'Удар', attr: 'attack' },
    { id: 'defense', name: 'Оборона', attr: 'defense' },
    { id: 'tech', name: 'Техника', attr: 'tech' },
    { id: 'pace', name: 'Скорость', attr: 'pace' },
    { id: 'pass', name: 'Пас', attr: 'pass' },
    { id: 'iq', name: 'Видение', attr: 'iq' },
    { id: 'stamina', name: 'Выносливость', attr: 'stamina' }
  ];

  function hasTrait(p, id) {
    return !!(p && (p.traits || []).includes(id));
  }

  function traitInfo(id) {
    return TRAITS.find(t => t.id === id) || { id, name: id, desc: '' };
  }

  function rollTraits(pos, ovr, age) {
    const g = POS_GROUP[pos] || 'MID';
    const pool = TRAITS.filter(t => (t.groups || []).includes(g));
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const want = ovr >= 84 ? 2 : 1;
    const out = [];
    for (const t of shuffled) {
      if (out.length >= want) break;
      if (t.id === 'injury_prone' && (age < 23 || Math.random() < 0.55)) continue;
      if (t.id === 'iron' && Math.random() < 0.45) continue;
      if (out.length === 0 || Math.random() < 0.62) out.push(t.id);
    }
    if (!out.length && shuffled[0]) out.push(shuffled[0].id);
    return out;
  }

  function ensureTraits(p) {
    if (!p) return;
    if (!Array.isArray(p.traits) || !p.traits.length) {
      p.traits = rollTraits(p.pos, p.ovr || 70, p.age || 24);
    }
    if (p.devFocus === undefined) p.devFocus = null;
  }
  const RIVALRIES = [
    { a: 'rma', b: 'bar', name: 'Эль Класико' },
    { a: 'int', b: 'mil', name: 'Дерби Милана' },
    { a: 'liv', b: 'mun', name: 'Северо-западное дерби' },
    { a: 'ars', b: 'tot', name: 'Северное Лондонское дерби' },
    { a: 'mci', b: 'mun', name: 'Манчестерское дерби' },
    { a: 'bay', b: 'bvb', name: 'Der Klassiker' },
    { a: 'psg', b: 'om', name: 'Le Classique' },
    { a: 'rom', b: 'laz', name: 'Дерби Рима' },
    { a: 'atm', b: 'rma', name: 'Мадридское дерби' },
    { a: 'zen', b: 'spm', name: 'Дерби двух столиц' },
    { a: 'spm', b: 'csk', name: 'Главное московское дерби' },
    { a: 'csk', b: 'dyn', name: 'Дерби Москвы' },
    { a: 'spm', b: 'lok', name: 'Дерби Москвы' },
    { a: 'juv', b: 'int', name: 'Дерби Италии' },
    { a: 'juv', b: 'mil', name: 'Дерби Италии' }
  ];

  function findRivalry(idA, idB) {
    return RIVALRIES.find(r => (r.a === idA && r.b === idB) || (r.a === idB && r.b === idA)) || null;
  }

  const FILL_SLOTS = ['GK','RB','CB','CB','LB','CDM','CM','CM','CAM','RW','ST','LW','GK','CB','CM','ST','RB','LB'];

  function rnd(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
  function pick(arr) { return arr[rnd(0, arr.length - 1)]; }
  function uid(prefix='id') { return prefix + '_' + Math.random().toString(36).slice(2, 10); }

  const FILL_FIRST = ['Алекс','Марко','Лука','Иван','Педро','Карлос','Юнас','Ноа','Леон','Давид','Саша','Тимур','Эрик','Фабио','Милан','Оливье','Хорхе','Нико','Рафа','Кирилл'];
  const FILL_LAST = ['Сильва','Сантос','Мюллер','Росси','Берг','Новак','Ковач','Петров','Андерсон','Мора','Фернандес','Ким','Пак','Орtega','Бланко','Риччи','Шмидт','Ларссон','Оливейра','Кузнецов'];

  function genName() { return pick(FILL_FIRST) + ' ' + pick(FILL_LAST); }

  function attrsFromOvr(pos, ovr, age) {
    const spread = (base, j = 8) => Math.max(30, Math.min(99, base + rnd(-j, j)));
    const g = POS_GROUP[pos] || 'MID';
    let attack = ovr, defense = ovr, tech = ovr, stamina = ovr, iq = ovr, pace = ovr, pass = ovr, physical = ovr;
    if (g === 'GK') {
      attack = spread(ovr - 28); defense = spread(ovr + 6); tech = spread(ovr); pace = spread(ovr - 18);
      pass = spread(ovr - 5); physical = spread(ovr + 2);
    } else if (g === 'DEF') {
      attack = spread(ovr - 14); defense = spread(ovr + 6); tech = spread(ovr - 2); pace = spread(ovr - 2);
      pass = spread(ovr - 4); physical = spread(ovr + 4);
    } else if (g === 'MID') {
      attack = spread(ovr); defense = spread(ovr - 2); tech = spread(ovr + 3); pace = spread(ovr);
      pass = spread(ovr + 5); physical = spread(ovr);
    } else {
      attack = spread(ovr + 6); defense = spread(ovr - 16); tech = spread(ovr + 2); pace = spread(ovr + 5);
      pass = spread(ovr); physical = spread(ovr + 1);
    }
    if (age < 23) { stamina = spread(ovr + 4); pace = Math.min(99, pace + 2); }
    if (age > 30) { stamina = spread(ovr - 4); pace = Math.max(40, pace - 3); iq = Math.min(99, iq + 2); }
    iq = spread(ovr + (age > 27 ? 3 : -1));
    return { attack, defense, tech, stamina, iq, pace, pass, physical };
  }

  function valueOf(ovr, pot, age) {
    return Math.round(Math.pow(ovr / 10, 3.15) * (pot / Math.max(ovr, 1)) * Math.max(4, 36 - age) * 1800);
  }

  function makePlayer({ name, pos, age, ovr, nation, real, clubId }) {
    const pot = Math.min(95, ovr + (age < 22 ? rnd(5, 14) : age < 26 ? rnd(1, 7) : rnd(0, 2)));
    const a = attrsFromOvr(pos, ovr, age);
    const value = valueOf(ovr, pot, age);
    return {
      id: uid('p'), name, pos, age, ovr, pot, ...a,
      condition: rnd(78, 100), morale: rnd(55, 90),
      form: rnd(48, 88), energy: rnd(70, 100),
      goals: 0, assists: 0, apps: 0,
      seasonGoals: 0, seasonAssists: 0, seasonApps: 0,
      careerGoals: real ? rnd(0, Math.max(0, (34 - age) * 8)) : 0,
      careerAssists: real ? rnd(0, Math.max(0, (34 - age) * 5)) : 0,
      injured: 0, yellow: 0, red: 0, suspended: 0, seasonYellows: 0, matchYellows: 0,
      nation: typeof nation === 'string' && nation.length <= 3 ? (W().nationName(nation) || nation) : (nation || '—'),
      nationCode: typeof nation === 'string' && nation.length <= 3 ? nation : '',
      value, wage: Math.round(value / 160),
      contract: rnd(1, 4),
      real: !!real,
      listed: false, ask: 0,
      clubId: clubId || null,
      traits: rollTraits(pos, ovr, age),
      devFocus: null
    };
  }

  function genPlayer(pos, overallBias = 70, ageBias = null, clubId = null) {
    const age = ageBias ?? rnd(17, 34);
    const peak = age < 24 ? overallBias - 4 : age > 30 ? overallBias - 3 : overallBias;
    const ovr = Math.max(45, Math.min(90, peak + rnd(-6, 6)));
    const codes = Object.keys(W().NATIONS);
    return makePlayer({
      name: genName(), pos, age, ovr,
      nation: pick(codes), real: false, clubId
    });
  }

  function starToPlayer(star, clubId) {
    const [name, pos, age, ovr, nation] = star;
    return makePlayer({ name, pos, age, ovr, nation, real: true, clubId });
  }

  function buildSquadFromTemplate(tpl) {
    const usedPos = {};
    const squad = (tpl.stars || []).map(s => {
      const p = starToPlayer(s, tpl.id);
      usedPos[p.pos] = (usedPos[p.pos] || 0) + 1;
      return p;
    });
    const target = 20;
    let i = 0;
    while (squad.length < target) {
      const pos = FILL_SLOTS[i % FILL_SLOTS.length];
      i++;
      const bias = tpl.rep - 8 - rnd(0, 10);
      squad.push(genPlayer(pos, bias, null, tpl.id));
    }
    return squad;
  }

  function instantiateClub(tpl, overrides = {}) {
    const league = W().leagueById(tpl.leagueId);
    const ru = window.EYE_I18N?.clubRu(tpl.id, tpl.name, tpl.stadium) || { name: tpl.name, stadium: tpl.stadium };
    const leagueRu = window.EYE_I18N?.leagueRu(tpl.leagueId, league) || { name: league?.name };
    const squad = buildSquadFromTemplate(tpl);
    const avg = Math.round(squad.reduce((s, p) => s + p.ovr, 0) / squad.length);
    return {
      id: tpl.id,
      templateId: tpl.id,
      name: ru.name,
      nameEn: tpl.name,
      short: tpl.short,
      color: tpl.color,
      leagueId: tpl.leagueId,
      leagueName: leagueRu.name || league?.name || tpl.leagueId,
      stadium: ru.stadium,
      formation: overrides.formation || tpl.formation || '4-3-3',
      style: overrides.style || 'balance',
      squad,
      lineup: null,
      budget: overrides.budget ?? tpl.budget,
      reputation: tpl.rep,
      facilities: { stadium: Math.min(5, Math.round(tpl.rep / 20)), training: 2, youth: 2, medical: 2, scout: 2 },
      staff: { coach: 1, physio: 1, scoutDir: 1 },
      youth: [],
      fans: tpl.fans,
      morale: 65,
      isPlayer: false,
      avgOvr: avg
    };
  }

  function buildWorldClubs() {
    return W().CLUBS.map(tpl => instantiateClub(tpl));
  }

  function pitchCoords(formation) {
    const slots = FORMATIONS[formation]?.slots || FORMATIONS['4-3-3'].slots;
    const depth = {
      GK: 8, CB: 22, RB: 28, LB: 28, RWB: 34, LWB: 34,
      CDM: 40, CM: 50, RM: 52, LM: 52, CAM: 62, RAM: 64, LAM: 64,
      RW: 75, LW: 75, ST: 86
    };
    const byLine = {};
    slots.forEach((pos, idx) => {
      const y = depth[pos] ?? 50;
      byLine[y] = byLine[y] || [];
      byLine[y].push({ pos, idx });
    });
    const coords = new Array(slots.length);
    Object.keys(byLine).map(Number).sort((a, b) => a - b).forEach(y => {
      const line = byLine[y];
      line.forEach((item, i) => {
        const x = ((i + 1) / (line.length + 1)) * 100;
        coords[item.idx] = { x, y, pos: item.pos };
      });
    });
    return coords;
  }

  // Legacy aliases used by older code paths
  const LEAGUES = () => W().LEAGUES;

  return {
    FORMATIONS, POS_GROUP, POS_LABEL, STYLES, TRAINING, FACILITIES, STAFF_ROLES, PRESS_OPTIONS, RIVALRIES,
    TRAITS, DEV_FOCUS,
    get LEAGUES() { return W().LEAGUES; },
    rnd, pick, uid, genName, genPlayer, makePlayer, starToPlayer,
    buildSquadFromTemplate, instantiateClub, buildWorldClubs, pitchCoords,
    valueOf, attrsFromOvr, findRivalry, hasTrait, traitInfo, rollTraits, ensureTraits
  };
})();
